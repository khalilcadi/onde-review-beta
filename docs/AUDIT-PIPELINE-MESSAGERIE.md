# AUDIT COMPLET — Pipeline de messagerie LinkedIn

> Date : 2026-03-20
> Scope : Import leads → Enrichissement → Scoring → Contexte IA → Prompt → Message LinkedIn
> Methode : Lecture exhaustive du code source, zero supposition

---

## SCHEMA DU FLOW COMPLET

```
                         ┌─────────────────┐
                         │   SOURCES        │
                         │   D'IMPORT       │
                         └────────┬────────┘
                                  │
              ┌───────────┬───────┼───────┬──────────────┐
              │           │       │       │              │
         CSV Generic  Gojiberry  Manuel  Webhook     Enrichissement
         (pipeline)   (pipeline) (form)  (Unipile)   (pas d'import)
              │           │       │       │
              │     ┌─────┘       │       │
              │     │ signal +    │       │
              │     │ score auto  │       │
              └─────┴──────┬──────┘───────┘
                           │
                    ┌──────▼──────┐
                    │   TABLE     │
                    │   leads     │
                    │  (Supabase) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────────────────────────────────────┐
                    │   ENRICHISSEMENT (/api/ai/enrich)           │
                    │                                             │
                    │  Step 1  : Unipile profile + posts          │
                    │  Step 1b : Gojiberry intent post content    │
                    │  Step 1c : Website scraping + analyse       │
                    │  Step 2  : Perplexity web research          │
                    │  Step 3  : Signal classification (Claude)   │
                    │  Step 4  : Hook recommande (Claude)         │
                    │  Merge   : → enrichment_data (JSONB)        │
                    │  Scoring : → assignBucket() (code, 0 API)   │
                    └──────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ enrichment  │
                    │ _data       │
                    │ (JSONB)     │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────────────┐
       │                   │                           │
       ▼                   ▼                           ▼
  buildLeadSections()  buildRagContext()      buildUserPrompt()
  (runtime context)    (RAG blocs)           (user message)
       │                   │                           │
       ▼                   ▼                           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                  callAI() — service.ts                       │
  │                                                              │
  │  CLAUDE:                                                     │
  │  ┌─────────────────────────────────────────────────────┐     │
  │  │ System Block 1: Agent Prompt v9.0    [CACHED]       │     │
  │  │ System Block 2: RAG (icp + pain_points +/- use_cases│     │
  │  │ System Block 3: Runtime Context (lead sections)     │     │
  │  └─────────────────────────────────────────────────────┘     │
  │  ┌─────────────────────────────────────────────────────┐     │
  │  │ User Message: buildUserPrompt() output              │     │
  │  └─────────────────────────────────────────────────────┘     │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │ humanize    │
                          │ Message()   │
                          │ (40% split) │
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │  ACTION     │
                          │  (pending)  │
                          └─────────────┘
```

---

## ETAPE 1 — CARTOGRAPHIE DES SOURCES D'IMPORT

### 1.1 Import CSV Generique

**Fichiers** : `lib/actions/import.ts`, `app/(dashboard)/pipeline/pipeline-client.tsx`

**Champs importes** :

| Champ CSV (headers reconnus) | Champ leads table | Obligatoire |
|------------------------------|-------------------|-------------|
| firstname, first_name, prenom | `first_name` | Non |
| lastname, last_name, nom | `last_name` | Non |
| linkedinurl, linkedin_url, linkedin, url | `linkedin_url` | **OUI** |
| title, titre, poste | `title` | Non |
| company, entreprise, societe | `company` | Non |
| email, mail | `email` | Non |
| phone, telephone, tel | `phone` | Non |
| tags | `tags` (split sur virgules) | Non |

**Valeurs par defaut** : `score = 0`, `status = "cold"`, `stage = "to_invite"`

**Anti-doublon** : Verification `linkedin_url` unique (erreur si doublon).

**Donnees specifiques** : Aucune. Pas d'enrichment_data. Le lead arrive "nu".

**Exploite en aval** : Non — le lead devra etre enrichi manuellement ou auto-enrichi par le cron `generate-actions`.

---

### 1.2 Import Gojiberry (Third-party lead intelligence)

**Fichiers** : `lib/actions/import-gojiberry.ts`, `lib/gojiberry-parser.ts`, `lib/scoring-buckets.ts`

**Champs importes** :

| Champ Gojiberry CSV | Champ leads table | Storage |
|---------------------|-------------------|---------|
| firstName | `first_name` | Direct |
| lastName | `last_name` | Direct |
| profileUrl | `linkedin_url` | Normalise |
| jobTitle | `title` | Direct |
| company | `company` | Direct |
| email, email2, email3 | `email` | Premier non-vide |
| phone, phone2, phone3 | `phone` | Premier non-vide |
| intent (HTML) | `enrichment_data.signal` | Parse |
| totalScore | `enrichment_data.signal.gojiberry_score` | Direct |
| intentKeyword | `enrichment_data.signal.intent_keyword` | Direct |
| industry | `enrichment_data.company.industry` | Direct |
| location | `enrichment_data.company.location` | Direct |
| website | `enrichment_data.company.website` | Direct |
| importDate | `enrichment_data.signal.import_date` | Direct |

**Parsing du signal** (`parseGojiberryIntent()`) :

| Pattern dans intent HTML | Signal type |
|--------------------------|-------------|
| "Strategic Window: Just hired" | `NEW_ROLE` |
| "Top 5% most active" | `ICP_TOP_ACTIVE` |
| "Just engaged with" + keyword | `ENGAGEMENT_KEYWORD` |
| "Just engaged with" + expert URL | `ENGAGEMENT_EXPERT` |
| Concurrent detecte | `COMPETITOR_ENGAGEMENT` |
| Defaut | `SIGNAL_FAIBLE` |

**Structure enrichment_data creee** :

```json
{
  "signal": {
    "type": "ENGAGEMENT_KEYWORD",
    "detail": "A interagi avec du contenu sur 'Cold Email'",
    "source": "gojiberry",
    "gojiberry_score": 2,
    "intent_keyword": "Cold Email",
    "intent_post_url": "https://linkedin.com/feed/update/...",
    "intent_expert_url": null,
    "intent_post_content": null,
    "import_date": "2026-03-15",
    "smartai_interaction": false
  },
  "company": {
    "industry": "Marketing Digital",
    "location": "Paris, France",
    "website": "https://example.com"
  }
}
```

**Scoring auto a l'import** (via `assignBucket()`, zero API call) :

| Bucket | Score | Status | Condition |
|--------|-------|--------|-----------|
| PRIORITAIRE | 80 | hot | Signal fort OU (signal moyen + titre decideur) |
| STANDARD | 50 | warm | Signal moyen OU (Gojiberry + decideur) |
| A_VERIFIER | 20 | cold | Tout le reste |

**Tags auto** : `["gojiberry", "goji:keyword:cold-email"]` (ou `goji:expert`, `goji:new-role`, etc.)

**Create-or-Update** : Si `linkedin_url` existe deja → merge enrichment + union des tags.

**Exploite en aval** : **OUI** — Le signal est injecte dans le contexte de generation (section "Signal enrichissement"). Le `intent_keyword` et `intent_post_content` sont utilises. Le `intent_expert_url` n'est **jamais** injecte.

---

### 1.3 Creation manuelle (formulaire single lead)

**Fichier** : `app/(dashboard)/pipeline/pipeline-client.tsx`

**Champs** : firstName, lastName, linkedinUrl (obligatoire), title, company, email.

**Valeurs par defaut** : `score = 0`, `status = "cold"`, `stage = "to_invite"`.

**Donnees specifiques** : Aucune. Pas d'enrichment_data.

---

### 1.4 Webhooks Unipile (indirect)

**Fichier** : `app/api/webhooks/unipile/route.ts`

Ne cree **pas** de leads. Met a jour les leads existants :
- `message.received` → stage → "responded"
- `relation.created` → stage "invited" → "connected"

---

### 1.5 Auto-enrichissement cron

**Fichier** : `app/api/crons/generate-actions/route.ts` (lignes 220-255)

Le cron `generate-actions` auto-enrichit les leads **non enrichis** avant de generer un message :
- Condition : `enrichment_data` n'a pas de cle `company`
- Limite : max 10 enrichissements par execution cron
- Timeout : 30s par enrichissement
- En cas d'echec : generation "en mode degrade" (sans enrichissement)

---

### Tableau recapitulatif des sources

| Source | Cree lead | enrichment_data | Score auto | Exploite par prompt |
|--------|-----------|-----------------|------------|---------------------|
| CSV Generique | Oui | Vide | 0 (cold) | Non (lead nu) |
| Gojiberry | Oui/Update | signal + company partiel | 20/50/80 (buckets) | Oui (signal, keyword, post) |
| Manuel | Oui | Vide | 0 (cold) | Non (lead nu) |
| Webhook | Non | N/A | N/A | N/A |
| Auto-enrich (cron) | Non | Complet | Buckets | Oui |

---

## ETAPE 2 — PIPELINE D'ENRICHISSEMENT

### 2a. Donnees Unipile (LinkedIn)

**Route** : `POST /api/ai/enrich` — `stepUnipile()` (lignes 80-256)

**Methodes appelees** :
1. `getUserProfile(identifier, accountId, { linkedinSections: "*" })`
2. `getUserPostsByIdentifier(providerId, accountId, limit=10)`

**Tableau exhaustif des champs Unipile** :

| Champ Unipile | Stocke dans enrichment_data ? | Cle exacte en base | Utilise dans le prompt de generation ? |
|---------------|-------------------------------|---------------------|---------------------------------------|
| headline | Oui | `linkedin_profile.headline` | **OUI** — section Profil |
| about | Oui | `linkedin_profile.about` | **NON** — seulement pour Perplexity |
| profile_picture_url | Oui | `linkedin_profile.profile_picture_url` | Non |
| location | Oui | `linkedin_profile.location` | Non (duplique company.location) |
| connections_count | Oui | `linkedin_profile.connections_count` | Non |
| follower_count | Oui | `linkedin_profile.follower_count` | **OUI** — si > 1000 |
| is_premium | Oui | `linkedin_profile.is_premium` | Non |
| is_open_profile | Oui | `linkedin_profile.is_open_profile` | **OUI** — flag "InMail possible" |
| is_creator | Oui | `linkedin_profile.is_creator` | **OUI** — flag "Createur contenu" |
| network_distance | Oui | `linkedin_profile.network_distance` | **NON** — auto-correction stage seulement |
| skills | Oui | `linkedin_profile.skills[]` | **OUI** — top 3 |
| languages | Oui | `linkedin_profile.languages[]` | Non |
| websites | Oui | `linkedin_profile.websites[]` | Non |
| contact_info | Oui | `linkedin_profile.contact_info` | Non |
| education | Oui | `linkedin_profile.education[]` | **OUI** — max 2 (fallback Perplexity) |
| shared_connections_count | Oui | `linkedin_profile.shared_connections_count` | **OUI** — si > 0 |
| posts (< 30j) | Oui | `linkedin_posts[]` (raw) + `person.recentPosts[]` (resumes) | **OUI** — section Posts recents |
| experience (via profil) | Non direct | Stocke via Perplexity `person.experience[]` | **OUI** — max 3 |
| certifications | Non | Non stocke | Non |
| volunteer | Non | Non stocke | Non |
| honors | Non | Non stocke | Non |
| recommendations | Non | Non stocke | Non |
| publications | Non | Non stocke | Non |

**Posts** : Filtres sur les 30 derniers jours. Chaque post est **resume par Claude Sonnet** (pas Perplexity) :
- `sujet` : theme en 5 mots max
- `tension` : pain business detecte ou null
- `ton` : corporate / decontracte / expert / vulnerable

---

### 2b. Donnees Perplexity

**Prompt envoye** (`buildEnrichmentUserPrompt()` — `lib/ai/lead-context.ts:356-374`) :

```
Recherche web pour : {firstName} {lastName}, {title} chez {company}
Profil LinkedIn : {linkedinUrl}
[Site web entreprise : {website} — analyser pour l'offre et le positionnement]

Trouve uniquement les informations PUBLIQUES verifiables :
- Actualites de l'entreprise (3 derniers mois) : recrutements, levees, lancements, partenariats
- CA / revenus estimes si donnees publiques disponibles
- Financement : montant + date si public
- Contexte sectoriel ou reglementaire impactant leur activite

Retourne le resultat au format JSON d'enrichissement defini dans tes instructions systeme.
```

**Donnees extraites** :

```json
{
  "company": {
    "size": "10-50 personnes",
    "industry": "SaaS B2B",
    "funding": "Series A 2M EUR (2024)",
    "revenue": "100k-500k EUR",
    "location": "Paris, France",
    "news": ["Recrute 3 commerciaux", "Partenariat avec X"]
  },
  "person": {
    "anciennete_poste_mois": 24,
    "interests": ["Growth", "Sales automation"],
    "experience": ["Head of Sales — Acme Corp (2022-present)"],
    "education": ["HEC Paris — Master (2018)"],
    "publicSpeaking": ["Speaker SaaStr Europe 2025"]
  },
  "confidence": "high",
  "sources": ["https://..."],
  "summary": "Deux phrases: profil + contexte entreprise."
}
```

**Regle stricte** : "Zero inference — null si la donnee n'est pas trouvee".

---

### 2c. Website Analysis

**Declencheur** : URL website disponible dans company data.

**Traitement** : Scraping HTML (10s timeout, 3000 chars max) → Claude Haiku analyse.

**Output** :
```json
{
  "offering": "Plateforme de gestion de leads B2B",
  "target_market": "PME B2B 10-50 personnes",
  "differentiators": "IA proprietaire + integration CRM native",
  "team_visible": "15 personnes"
}
```

---

### 2d. Classification du signal

**Declencheur** : Toujours (sauf si signal Gojiberry deja classifie).

**Modele** : Claude Sonnet, temp=0, max_tokens=200.

**Types de signal possibles** :

| Signal | Description | Origine |
|--------|-------------|---------|
| INBOUND | Interaction Smart.AI | Manuelle/future |
| POST_DOULEUR | Pain business dans les posts | Enrichissement |
| POST_SUJET | Posts sur sujet pertinent | Enrichissement |
| ACTUALITE | News entreprise = opportunite | Enrichissement |
| SIGNAL_FAIBLE | Indices indirects | Enrichissement |
| FROID | Rien d'exploitable | Enrichissement |
| ENGAGEMENT_KEYWORD | Keyword trigger | Gojiberry |
| ENGAGEMENT_EXPERT | Expert engagement | Gojiberry |
| NEW_ROLE | Nouveau poste (<90j) | Gojiberry |
| COMPETITOR_ENGAGEMENT | Engage avec concurrent | Gojiberry |
| ICP_TOP_ACTIVE | Top 5% actif LinkedIn | Gojiberry |

---

### 2e. Hook Recommande

**Modele** : Claude Sonnet, temp=0.3, max_tokens=300.

**Output** :
```json
{
  "angle": "Recrutement commercial = besoin systeme acquisition",
  "fait_concret": "Recrute 3 commerciaux (LinkedIn)",
  "tension_icp": "Pipeline depend du fondateur, pas du systeme",
  "niveau_contexte": "fort"
}
```

---

### 2f. Scoring

**Deux chemins** :

| Chemin | Declencheur | Logique | Cout API |
|--------|------------|---------|----------|
| **Buckets** (`assignBucket()`) | Apres enrichissement, a l'import Gojiberry | Code pur : signal type + titre decideur → 20/50/80 | Zero |
| **AI Scoring** (`/api/ai/score`) | Manuel, optionnel | Claude Sonnet temp=0.3, 3 axes (fit 0-40 + intent 0-30 + timing 0-30) | ~0.01$ |

Le scoring n'est **PAS chaine automatiquement** a l'enrichissement. Le bucket scoring est applique a la fin de l'enrichissement. Le scoring IA complet est declenche manuellement.

---

## ETAPE 3 — LE "DERNIER KILOMETRE" : enrichment_data → Prompt

### 3a. Construction du contexte lead

**Fichier** : `lib/ai/lead-context.ts` — `buildLeadSections()` (lignes 120-278)

**Structure du contexte genere** :

```
## Lead
- Nom : {firstName} {lastName}
- Titre : {title}
- Entreprise : {company}
- LinkedIn : {linkedinUrl}
- Score : {score} ({status})
- Stage : {stage}
- Tags : {tags}
- Notes : {notes}

## Entreprise
- Taille : {size}
- Secteur : {industry}
- CA estime : {revenue}
- Financement : {funding}
- Localisation : {location}
- News recentes :
  - {news[0]}
  - {news[1]}

## Offre (analyse site web)
- Offre : {offering}
- Cible : {target_market}
- Differenciateurs : {differentiators}
- Equipe visible : {team_visible}

## Profil
- Headline : {headline}
- Anciennete poste actuel : {n} mois
- Experience :
  - {title} — {company} ({dates})  [max 3]
- Competences : {skill1}, {skill2}, {skill3}
- Createur de contenu LinkedIn
- Profil ouvert (InMail possible)
- Followers : {count}
- {n} connexions en commun
- Interets : {interest1}, {interest2}
- Formation : {school} — {degree}  [max 2]

## Signal enrichissement
- Type : {type}
- Detail : {detail}
- Interaction Smart.AI : oui
[SI GOJIBERRY:]
- Score Gojiberry : {score}/3
- Mot-cle declencheur : {keyword}
- Contenu du post engage : {post_content}
- Date de detection : {date}

## Posts recents
- {sujet} | Tension: {tension} ({ton}, {reactions}r/{comments}c — {date})

## Resume enrichissement
{summary}
```

**Champs disponibles mais IGNORES** (pas injectes dans le contexte de generation) :

| Champ | Ou il est stocke | Pourquoi ignore |
|-------|------------------|-----------------|
| `linkedin_profile.about` | enrichment_data | Utilise seulement pour Perplexity |
| `linkedin_profile.network_distance` | enrichment_data | Seulement pour auto-correction stage |
| `linkedin_profile.connections_count` | enrichment_data | Pas de valeur pour le message |
| `linkedin_profile.is_premium` | enrichment_data | Pas de valeur pour le message |
| `linkedin_profile.languages` | enrichment_data | Pas de valeur pour le message |
| `linkedin_profile.websites` | enrichment_data | Pas de valeur pour le message |
| `linkedin_profile.contact_info` | enrichment_data | Pas de valeur pour le message |
| `linkedin_profile.location` | enrichment_data | Deja couvert par company.location |
| `company.website` | enrichment_data | Seulement pour Perplexity |
| `company.description` | enrichment_data | Non stocke en pratique |
| `signal.intent_expert_url` | enrichment_data | **BUG/OUBLI** — stocke mais jamais injecte |
| `scoring_detail.fit_score` | enrichment_data | Utilise pour routing RAG seulement |
| `scoring_detail.intent_score` | enrichment_data | Non injecte |
| `scoring_detail.timing_score` | enrichment_data | Non injecte |
| `scoring_detail.categorie` | enrichment_data | Non injecte |
| `scoring_detail.confidence` | enrichment_data | Non injecte |
| `scoring_detail.justification` | enrichment_data | Non injecte |
| `scoring_detail.cas_limite` | enrichment_data | Non injecte |
| `scoring_detail.ajustement_ia` | enrichment_data | Non injecte |
| `hook_recommande.tension_icp` | enrichment_data | Non injecte (metadata seulement) |
| `hook_recommande.niveau_contexte` | enrichment_data | Non injecte (metadata seulement) |

**Pas de "N/A" ou fallbacks generiques** : Les champs absents sont simplement omis du contexte. Aucun placeholder.

---

### 3b. RAG injecte

**Fichiers** : `lib/rag/mapping.ts`, `lib/rag/context.ts`

**Blocs pour l'agent prospection** :

| Segment ICP | Blocs injectes | Nb blocs |
|-------------|----------------|----------|
| A (Early) | icp, pain_points | 2 |
| B (Growth) | icp, pain_points, use_cases | 3 |
| C (Scale) | icp, pain_points, use_cases | 3 |
| HORS_ICP / inconnu | icp, pain_points | 2 |

**Detail des blocs** :

| Bloc | Fichier | Taille approx. | Contenu cle | Utilite pour message 1-2 phrases |
|------|---------|-----------------|-------------|----------------------------------|
| **icp** | `knowledge/icp.json` | ~1,850 chars / ~460 tokens | Cible B2B 2-50 pers, 3 segments, criteres bon/mauvais prospect | **CRITIQUE** — definit qui on vise |
| **pain_points** | `knowledge/pain_points.json` | ~1,900 chars / ~475 tokens | 5 douleurs PME B2B (acquisition irreguliere, dependance fondateur, pipeline invisible, reseau epuise, outils sans resultat) | **CRITIQUE** — langue miroir pour cold outreach |
| **use_cases** | `knowledge/use_cases.json` | ~2,200 chars / ~550 tokens | 4 scenarios concrets (structurer acquisition, pipeline previsible, independance fondateur, pilotage data) | **MOYEN** — utile pour personnaliser Growth/Scale |

**Estimation tokens RAG** :
- Segment A/HORS_ICP : ~935 tokens
- Segment B/C : ~1,485 tokens

**Format d'injection** :
```
---

## BASE DE CONNAISSANCES (RAG)

### ICP — PME B2B

**Cible**
Entreprise B2B (services, SaaS, conseil...)
...

---

### Pain Points — PME B2B

**Acquisition irreguliere**
...

---
Fin de la base de connaissances.
```

**Blocs NON injectes en prospection** (par design) :

| Bloc | Raison de l'exclusion |
|------|----------------------|
| positionnement | Trop corporate pour cold message |
| offres | Premature en premier contact |
| messaging | Regles deja dans le system prompt v9.0 |
| objections | Pour relances/objections, pas cold |
| regles_decisionnelles | Pour scoring, pas generation |
| benchmark_marche | Contexte marche, pas pertinent pour message |
| benchmark_concurrents | Idem |
| pricing | Premature |
| operating_rules | Regles internes systeme |
| onboarding | Post-vente |
| architecture_core | Technique interne |
| framework_arc | Trop detaille pour premier contact |
| manifesto | Hooks prets a l'emploi mais risque copy-paste RAG |
| profil_fondateur | Pour sequences longues |

---

### 3c. User Prompt

**Fichier** : `lib/ai/lead-context.ts` — `buildUserPrompt()` (lignes 381-455)

**Adaptation dynamique selon le contexte disponible** :

| Condition | Directive envoyee |
|-----------|-------------------|
| Notes presentes | `CONTEXTE RICHE : Notes disponibles, ecris depuis la relation.` |
| Signal fort + enrichissement | `CONTEXTE FORT : signal {type}, enrichissement dispo. Personnalise avec un fait concret.` |
| Signal OU enrichissement | `CONTEXTE PARTIEL : un element de contexte max, utilise implicitement.` |
| Rien | `CONTEXTE FAIBLE : peu de donnees. Tension ICP plausible + question ouverte. 2-3 phrases max.` |

**Note** : La directive se base sur la **presence de donnees**, pas sur le score numerique. Un lead score 80 sans enrichment_data.company ni enrichment_data.person sera traite comme "CONTEXTE FAIBLE".

**Hooks de personnalisation extraits** (ajoutes a la directive si presents) :
- `hook_recommande.fait_concret` → "Fait concret : Recrute 3 commerciaux"
- `signal.intent_keyword` → "Sujet d'interet : Cold Email"
- `website_analysis.offering` → "Offre entreprise : Plateforme de gestion..."

**Exemple — lead enrichi (score 75, Gojiberry ENGAGEMENT_KEYWORD)** :

```
Ecris un message LinkedIn pour Julie Martin (CEO @ AgenceDigitale).

CONTEXTE FORT : signal ENGAGEMENT_KEYWORD, enrichissement dispo. Personnalise avec un fait concret.

Elements de personnalisation disponibles :
- Fait concret : Recrute 2 account managers (LinkedIn)
- Sujet d'interet : Cold Email
- Offre entreprise : Agence SEO et content marketing pour PME B2B

MAX 300 caracteres. Texte brut uniquement.
```

**Exemple — lead non enrichi (score 0)** :

```
Ecris un message LinkedIn pour Thomas Durand (Fondateur @ SaasCo).

CONTEXTE FAIBLE : peu de donnees. Tension ICP plausible + question ouverte. 2-3 phrases max.

MAX 300 caracteres. Texte brut uniquement.
```

**Exemple — regeneration avec feedback** :

```
Regenere un message LinkedIn pour Julie Martin (CEO @ AgenceDigitale).

CONTEXTE FORT : signal ENGAGEMENT_KEYWORD, enrichissement dispo. Personnalise avec un fait concret.

Elements de personnalisation disponibles :
- Fait concret : Recrute 2 account managers
- Sujet d'interet : Cold Email

Feedback : "trop commercial, plus decontracte"

Message actuel : "Julie, tu recrutes des AM — t'as un systeme d'acquisition a leur confier ?"

MAX 300 caracteres. Texte brut uniquement.
```

**Relances** : Le `sequenceStep` (current/total + previousMessages) est injecte dans le runtime context ET dans le user prompt avec le label "Etape X/Y (relance)".

---

### 3d. System Prompt

**Fichier** : `lib/ai/prompts/defaults.ts` — `PROMPTS_DEFAULTS.prospection` (lignes 38-356)

**Version** : v9.0

**Taille** : 318 lignes, ~12,000 caracteres, ~3,000 tokens

**Structure** :

| Section | Lignes | Contenu | Tokens approx. |
|---------|--------|---------|-----------------|
| PRINCIPE | 45-51 | Fondateur-a-fondateur, court, direct, humain | ~50 |
| REGLES SOFT | 54-61 | SMS, specifique, une question, zero commercial, zero ! | ~80 |
| FORMAT | 64-71 | 2-3 phrases, 300 chars, prenom, tutoiement | ~60 |
| SCORE → AMBITION | 74-94 | 3 brackets (0-49/50-69/70-100) | ~200 |
| STAGE | 97-109 | connected vs replied | ~100 |
| STRATEGIE RELANCE | 112-141 | 4 etapes progressives + regles absolues | ~300 |
| ICP | 144-158 | A/B/C/HORS_ICP angles | ~120 |
| SIGNALS GOJIBERRY | 161-193 | 5 types avec regles specifiques | ~350 |
| HIERARCHIE SOURCES | 196-203 | Notes > Signal > Bio > RAG | ~80 |
| PERSONNALISATION | 207-222 | Autorise vs Interdit (12 regles) | ~200 |
| LA QUESTION | 225-240 | 3 types (situation/probleme/CTA) + interdits | ~150 |
| EXEMPLES | 244-331 | 8 bons + 3 mauvais (dont 1 anti-RAG copy-paste) | ~900 |
| REGENERATION | 334-338 | Feedback prioritaire, changer angle | ~50 |
| CONTEXTE FAIBLE | 342-349 | Failsafe si pas d'enrichissement | ~80 |
| RAPPEL | 352-356 | Test : si replace prenom et ca marche → trop generique | ~40 |

---

## ETAPE 4 — ANALYSE DES MESSAGES GENERES

Les messages generes sont logges dans `ai_usage.output_text`. Sans acces direct a la DB de production, l'analyse se base sur les **exemples du prompt v9.0** qui representent la qualite cible :

### Exemples du prompt (cible qualite)

**Exemple 1 — Score haut (75), fait business concret** :
> Thomas,
>
> Tu recrutes un commercial pour l'agence. Question honnete : t'as un systeme d'acquisition a lui confier, ou il va devoir improviser ?

- Personnalisation : fait concret (recrutement)
- Question : probleme
- 197 chars — bien sous la limite
- **Verdict** : Specifique, une seule question, zero pitch. Bon.

**Exemple 2 — Score bas (35), lead froid** :
> Marie,
>
> Fondatrice agence growth B2B — le pipeline depend encore du reseau du fondateur chez toi, ou t'as reussi a structurer ca ?

- Personnalisation : zero (juste titre + secteur)
- Question : situation avec off-ramp
- 178 chars
- **Verdict** : Tension ICP plausible, pas de fausse personnalisation. Correct pour le score.

**Exemple 3 — Signal Gojiberry ENGAGEMENT_KEYWORD** :
> Julie,
>
> CEO boite B2B, 6 personnes — t'as un process d'acquisition outbound structure ou c'est encore au feeling ?

- Personnalisation : zero visible (le keyword "Cold Email" est utilise thematiquement, pas cite)
- 149 chars
- **Verdict** : Ultra court, bon ton, le keyword guide l'angle sans etre mentionne.

**Exemple mauvais — Copy-paste RAG** :
> Thomas,
>
> Le probleme des agences c'est pas les leads, c'est l'absence d'infrastructure revenue. Ton pipeline est previsible aujourd'hui ?

- **Diagnostic** : Recopie directe du bloc `manifesto.json`. Sonne comme un slogan, pas une conversation.

---

## ETAPE 5 — DIAGNOSTIC ET RECOMMANDATIONS

### 5a. Donnees sous-exploitees

| Donnee disponible | Source | Impact potentiel | Action recommandee |
|-------------------|--------|------------------|-------------------|
| `linkedin_profile.about` | Unipile | Fort — resume personnel du lead, intentions, valeurs | **Injecter dans buildLeadSections()** comme "Bio LinkedIn". Le prompt v9.0 interdit de le citer directement mais l'utilise pour comprendre le niveau et adapter le ton. |
| `signal.intent_expert_url` | Gojiberry | Faible — l'URL de l'expert suivi | Injecter si utilise pour deduire le topic d'interet. Sinon, supprimable. |
| `hook_recommande.tension_icp` | Enrichissement | Fort — la tension business la plus plausible pour ce lead | **Injecter dans buildLeadSections()** dans la section Signal ou Hook. L'agent peut s'en servir pour calibrer la question. |
| `hook_recommande.niveau_contexte` | Enrichissement | Moyen — indique la qualite du contexte disponible | Pourrait remplacer/complementer la logique `hasSignal && hasEnrichment` dans `buildUserPrompt()`. |
| `scoring_detail.justification` | Scoring | Moyen — explication textuelle du score | Pourrait aider l'agent a comprendre POURQUOI le lead est score haut/bas. |
| `scoring_detail.segment_icp` | Scoring | Deja utilise pour RAG dynamique mais **non visible par l'agent**. L'agent ne sait pas quel segment ICP le lead est. | **Injecter dans la section Lead** : "- Segment ICP : B (Growth)". Le prompt v9.0 a deja des regles par segment. |
| `person.publicSpeaking` | Perplexity | Faible — conferences/talks | Non critique pour un message de 300 chars. |

**Recommandation prioritaire** : Les 3 champs `about`, `tension_icp` et `segment_icp` sont les plus impactants. Ils sont deja dans enrichment_data mais n'arrivent pas au prompt.

---

### 5b. Bruit inutile

| Element | Cout tokens | Valeur pour ecrire 1-2 phrases | Recommandation |
|---------|-------------|-------------------------------|----------------|
| URL LinkedIn dans le contexte lead | ~30 tokens | Zero — l'agent n'a pas besoin de l'URL pour ecrire un message | Supprimer de `buildLeadSections()`. Garder dans les autres contexts (scoring, enrichissement). |
| Section "Tags" dans le contexte lead | ~20 tokens | Faible — "gojiberry, goji:keyword:cold-email" n'aide pas a ecrire | Supprimer du contexte de generation sauf si tag specifique ("VIP", "urgent"). |
| RAG bloc `use_cases` pour segments B/C | ~550 tokens | Faible — les use cases sont trop detailles pour un message de 300 chars. L'agent ne les utilise pas en pratique. | Retirer du mapping prospection. Les pain_points suffisent. |
| Prompt section EXEMPLES (8 bons + 3 mauvais) | ~900 tokens | Discutable — les exemples aident a calibrer mais 11 exemples est beaucoup pour un prompt de generation court | Reduire a 4-5 exemples essentiels (1 par bracket de score + 1 mauvais). |
| Prompt section STRATEGIE RELANCE | ~300 tokens | Faible pour premier contact (etape 1). Utile seulement pour etapes 2+. | Conditionner : injecter seulement si `sequenceStep.current > 1`. Mais ca casse le cache prompt. Trade-off a evaluer. |

**Estimation de tokens economisables** : ~600-900 tokens par generation si on nettoie les elements a faible valeur.

---

### 5c. Complexite du prompt

**Constat** : Le system prompt v9.0 fait **~3,000 tokens** pour generer 1-2 phrases de 300 caracteres max.

**Points positifs** :
- Structure claire par sections
- Score-adaptive (3 brackets)
- Regles "autorise vs interdit" explicites
- Bons exemples (surtout les mauvais qui empechent les patterns IA courants)
- Section Gojiberry bien calibree
- Anti-RAG copy-paste explicitee

**Points de vigilance** :
- **11 exemples** representent ~30% du prompt. C'est beaucoup. Les LLMs ont tendance a graviter vers les exemples plutot que les regles abstraites — c'est un atout ICI car les exemples sont bons.
- La section **STRATEGIE RELANCE** est pertinente pour les etapes 2+ mais prend de la place pour les premiers contacts. Pas un vrai probleme grace au cache.
- Le prompt couvre bien **tous les cas** (score bas/moyen/haut, connected/replied, relance 1-4, Gojiberry, regeneration, contexte faible). C'est complet.

**Verdict** : Le prompt n'est **pas excessivement complexe** pour la tache. Il est dense mais bien structure. La longueur est justifiee par la variete des cas couverts et l'importance de prevenir les patterns IA generiques. Le cache Claude amortit le cout.

---

### 5d. Recommandations concretes

#### PRIORITE 1 — Impact fort, effort faible

| # | Recommandation | Fichier | Effort |
|---|----------------|---------|--------|
| R1 | **Injecter `linkedin_profile.about`** dans `buildLeadSections()` comme "- Bio : {about}" (tronquer a 200 chars). Le prompt v9.0 dit deja "Bio / headline / parcours — pour comprendre le niveau et adapter le ton, jamais citer". L'about est la meilleure source de contexte personnel. | `lib/ai/lead-context.ts` lignes 165-228 | 5 min |
| R2 | **Injecter `scoring_detail.segment_icp`** dans la section Lead : "- Segment ICP : {segment}". Le prompt v9.0 a des regles par segment (A/B/C) mais l'agent ne sait actuellement pas quel segment le lead est. Il devine via les donnees company. | `lib/ai/lead-context.ts` lignes 120-130 | 3 min |
| R3 | **Injecter `hook_recommande.tension_icp`** dans la section Signal ou comme champ separe. C'est la tension business la plus plausible — exactement ce dont l'agent a besoin pour le message. | `lib/ai/lead-context.ts` lignes 230-248 | 3 min |

#### PRIORITE 2 — Nettoyage / reduction bruit

| # | Recommandation | Fichier | Effort |
|---|----------------|---------|--------|
| R4 | **Supprimer l'URL LinkedIn** du contexte de generation (`buildLeadSections()`). L'agent n'en a pas besoin pour ecrire un message. Garder dans scoring/enrichissement contexts. | `lib/ai/lead-context.ts` ligne 125 | 2 min |
| R5 | **Supprimer les tags techniques** du contexte (gojiberry, goji:keyword:*). Filtrer pour ne garder que les tags "humains" (VIP, urgent, etc.). | `lib/ai/lead-context.ts` ligne 128 | 5 min |
| R6 | **Retirer `use_cases` du RAG prospection** (mapping B/C). Les pain_points suffisent pour un message de 300 chars. Les use_cases ajoutent ~550 tokens de bruit. | `lib/rag/mapping.ts` lignes 40-46 | 2 min |

#### PRIORITE 3 — Optimisation prompt (a evaluer)

| # | Recommandation | Fichier | Effort |
|---|----------------|---------|--------|
| R7 | **Reduire les exemples** de 11 a 5-6 (1 par bracket + 1 Gojiberry + 1 relance + 1-2 mauvais). Economie ~400 tokens. A tester car les exemples calibrent bien le ton. | `lib/ai/prompts/defaults.ts` lignes 244-331 | 15 min |
| R8 | **Aligner la directive de contexte sur `niveau_contexte`** au lieu de la logique `hasSignal && hasEnrichment`. Le hook_recommande calcule deja le niveau de contexte (fort/partiel/faible). | `lib/ai/lead-context.ts` lignes 393-409 | 10 min |
| R9 | **Exploiter `scoring_detail.justification`** comme contexte supplementaire quand le score est > 60. Ajouter dans le runtime context : "- Raison du score : {justification}". | `lib/ai/lead-context.ts` | 5 min |

---

## ANNEXE — ESTIMATION TOKENS PAR GENERATION

| Composant | Tokens (approx.) | Cache Claude | Variable |
|-----------|-------------------|--------------|----------|
| System prompt v9.0 | ~3,000 | **Oui** (ephemeral) | Non |
| RAG (icp + pain_points) | ~935 | Non | Par segment ICP |
| RAG (+use_cases si B/C) | +~550 | Non | Conditionnel |
| Runtime context (lead enrichi) | ~500-1,200 | Non | Par lead |
| Runtime context (lead nu) | ~100-200 | Non | Par lead |
| User prompt | ~50-150 | Non | Par lead |
| **Total (lead enrichi)** | **~4,685-5,835** | ~3,000 caches | — |
| **Total (lead nu)** | **~4,085-4,285** | ~3,000 caches | — |
| **Tokens factures (apres cache)** | **~1,685-2,835** | — | — |

Output : ~50-100 tokens (message court).

---

*Audit realise le 2026-03-20 par Claude Code — base sur le code source uniquement*
