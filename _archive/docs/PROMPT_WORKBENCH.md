# PROSPECTOR - Prompt Workbench

> Guide pour réécrire les 4 prompts agents de PROSPECTOR.
> Pour chaque prompt : le contenu actuel, les requis techniques, et toutes les possibilités.

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble](#vue-densemble)
2. [Prompt 1 : PROSPECTION](#prompt-1--prospection)
3. [Prompt 2 : SCORING](#prompt-2--scoring)
4. [Prompt 3 : ENRICHISSEMENT](#prompt-3--enrichissement)
5. [Prompt 4 : CONVERSATIONAL](#prompt-4--conversational)
6. [Annexes](#annexes)

---

## VUE D'ENSEMBLE

### Ce que PROSPECTOR fait concrètement

PROSPECTOR est un outil interne (3 users) pour prospecter sur LinkedIn afin de vendre JARVIS. Le workflow quotidien :

```
06:00 → Cron génère les actions du jour (messages IA)
09:00 → L'user valide/édite les messages dans "Actions du jour"
09:00-19:00 → Envois automatiques via Unipile (délais anti-détection)
Toute la journée → Réponses traitées dans Inbox, Cockpit IA pour du reporting
```

### Les 4 prompts et où ils interviennent

| Prompt | Route API | Quand il est appelé | Output attendu |
|--------|-----------|-------------------|----------------|
| `prospection` | `POST /api/ai/generate` | Génération message LinkedIn pour un lead | Un message texte brut |
| `prospection` | `POST /api/ai/suggest` | Suggestion de réponse dans l'Inbox | Un message texte brut |
| `scoring` | *Pas encore de route* (prévu Phase 4) | Scoring automatique d'un lead | JSON `{ score, breakdown, reasoning }` |
| `enrichissement` | *Pas encore de route* (prévu Phase 4) | Enrichissement via Perplexity | Données structurées sur le lead |
| `conversational` | `POST /api/ai/chat` | Chat dans le Cockpit IA | Réponse texte markdown |

### Architecture d'injection

```
System prompt = PROMPTS_DEFAULTS[agentId]    ← Le prompt que tu rédiges
              + Contexte RAG (knowledge/*.json) ← Injecté automatiquement à la fin
              + Contexte spécifique à la route  ← Données du lead, pipeline, etc.
```

Le prompt que tu rédiges est le **system prompt** envoyé à Claude/OpenAI. Il ne contient PAS les données du lead — celles-ci sont injectées séparément par la route API.

---

## PROMPT 1 : PROSPECTION

### Utilisation actuelle

Ce prompt est utilisé dans **2 routes** :

**Route 1 : `/api/ai/generate`** — Génération de messages
- Appelé quand : Cron du matin (batch) OU clic "Régénérer" dans Daily Actions
- Le prompt est envoyé comme `system` dans l'appel Claude
- Le `user` message contient : "Génère un message LinkedIn pour {nom} ({titre} @ {entreprise})"

**Route 2 : `/api/ai/suggest`** — Suggestion de réponse Inbox
- Appelé quand : Clic "Suggérer une réponse" dans l'Inbox
- Le prompt est envoyé comme `system`
- Le `user` message contient : l'historique de conversation + "Suggère une réponse"

### Données disponibles au runtime

Voici TOUTES les données que la route injecte dans le contexte (en plus du system prompt) :

```
DONNÉES LEAD (toujours présentes) :
├── firstName, lastName         → "Marie Dubois"
├── title                       → "CEO"
├── company                     → "TechVision SAS"
├── score                       → 85/100
├── tags                        → ["saas", "decision-maker"]
├── notes                       → "Intéressée par l'automatisation"
├── status                      → "hot" | "warm" | "cold" | "converted" | "lost"
├── stage                       → "to_invite" | "invited" | "connected" | "in_sequence" | "responded" | "meeting" | "closed"
│
├── enrichmentData.company (si enrichi) :
│   ├── size                    → "50-200"
│   ├── industry                → "SaaS / Technology"
│   ├── funding                 → "Série A"
│   ├── revenue                 → "2-5M€"
│   ├── location                → "Paris"
│   └── news[]                  → ["Levée de fonds récente"]
│
└── enrichmentData.person (si enrichi) :
    ├── interests[]             → ["IA", "Sales automation"]
    ├── recentPosts[]           → ["Post sur les défis du scaling"]
    ├── experience[]            → [{ title, company, startDate, endDate }]
    └── education[]             → [{ school, degree, field }]

DONNÉES ACTION (contexte de la génération) :
├── actionType                  → "invitation" | "message" | "inmail" | "email"
├── currentMessage (si régénération) → Le message précédent à améliorer
├── sequenceStep (futur)        → Numéro de l'étape dans la séquence (1, 2, 3...)
└── sequenceTemplate (futur)    → Template de l'étape (ex: "Relance J+3")

DONNÉES CONVERSATION (route suggest uniquement) :
├── messages[]                  → Historique complet de la conversation
│   ├── direction               → "outbound" | "inbound"
│   └── content                 → Texte du message
└── lead (info basique)
```

### Blocs RAG injectés

Les blocs suivants sont automatiquement ajoutés à la fin du system prompt :

| Bloc | Contenu | Utilité pour ce prompt |
|------|---------|----------------------|
| `positionnement` | Identité JARVIS, proposition de valeur, mission | Permet de savoir quoi vendre |
| `offres` | JARVIS Start (79€/mois + 500€ setup), fonctionnalités | Détails de l'offre à promouvoir |
| `messaging` | 5 angles messaging (normalisation, clarté, anti-burnout, ROI, partenaire) | Angles d'approche possibles |
| `objections` | 10 objections courantes + réponses empathiques | Gérer les résistances en conversation |
| `use_cases` | 7 cas d'usage concrets solopreneurs | Exemples concrets à mentionner |

### Prompt actuel (V3.2)

Le prompt actuel est une **spec d'architecture JARVIS** héritée de la V3.2. Il contient :
- Des interfaces TypeScript (`ContextV32`)
- Des patterns Redis (`redis.setex(...)`)
- Un workflow en JavaScript (`queryRAG()`, `personalizeTemplate()`)
- Un format de sortie JSON complexe (campagne, metadata, conversation_id)

**Problème :** Ce prompt a été conçu pour un système multi-agents avec orchestrateur. PROSPECTOR est plus simple : une route API qui prend un lead et retourne un message texte.

### Requis obligatoires

| Requis | Détail |
|--------|--------|
| **Output** | Un message texte brut (pas de JSON, pas de metadata) |
| **Limite invitations** | Max 300 caractères (contrainte LinkedIn) |
| **Limite messages** | Max 1500 caractères (configurable) |
| **Langue** | Français |
| **Modèle** | claude-sonnet ou gpt-4o (choix user) |
| **Température** | 0.7 (configurable) |
| **Anti-spam** | Ne pas ressembler à un template, ne pas mentionner "IA" |
| **Tutoiement/Vouvoiement** | À définir (actuellement pas standardisé) |

### Possibilités et leviers

**1. Ton et style**
- [ ] Tutoiement vs vouvoiement (ou contextuel selon le lead ?)
- [ ] Formel vs casual vs "LinkedIn bro"
- [ ] Empathique/consultatif vs direct/commercial
- [ ] Court et punchy vs détaillé et contextualisé

**2. Structure du message (par type)**

Pour une **invitation** (max 300 chars) :
- Accroche personnalisée (référence profil/actualité/post)
- Raison de la connexion (pas de pitch)
- Question ouverte OU proposition de valeur subtile
- Exemples : "J'ai vu que...", "Votre approche de...", "On partage..."

Pour un **message** (première approche, lead connecté) :
- Hook personnalisé
- Proposition de valeur liée au contexte du lead
- Social proof subtil (optionnel)
- CTA engageant (question ouverte, pas "on s'appelle ?")

Pour une **relance** (message suivant dans séquence) :
- Référence au message précédent
- Valeur ajoutée (contenu, insight, actualité)
- CTA différent du précédent
- Exemples : partager un article, une stat, un use case

Pour une **réponse** (route suggest, le lead a répondu) :
- Accusé de réception empathique
- Réponse précise à ce que le lead a dit
- Next step concret (call 15 min, démo, ressource)
- Maintenir le ton de la conversation

**3. Personnalisation (quelles données utiliser)**
- [ ] Titre du lead (adapter l'angle : CEO vs CTO vs Ops)
- [ ] Industrie de l'entreprise
- [ ] Taille de l'entreprise
- [ ] Posts récents LinkedIn
- [ ] Actualités de l'entreprise (levée de fonds, recrutement...)
- [ ] Intérêts professionnels
- [ ] Stage dans le pipeline (premier contact vs relance)
- [ ] Score du lead (adapter l'agressivité commerciale)

**4. Angles messaging disponibles (depuis le RAG)**
- **Normalisation** : "C'est normal de galérer, tout le monde..."
- **Clarté/pilotage** : "On t'aide à y voir clair dans..."
- **Anti-burnout** : "Automatiser pour souffler, pas pour..."
- **ROI/impact** : "X% de gain de temps sur..."
- **Partenaire business** : "Comme avoir un associé IA..."

**5. Ce que le prompt NE doit PAS faire**
- Mentionner l'IA ou que le message est généré
- Faire un pitch commercial au premier contact
- Utiliser des formulations spam ("offre exceptionnelle", "sans engagement")
- Dépasser les limites de caractères
- Inventer des infos sur le lead (hallucinations)
- Mentionner des prix dans le premier message

---

## PROMPT 2 : SCORING

### Utilisation actuelle

**Pas encore de route API.** Ce prompt sera utilisé dans une future route `/api/ai/score` (Phase 4). Pour l'instant, les scores sont manuels dans les mock data.

### Données disponibles au runtime

```
DONNÉES LEAD :
├── firstName, lastName
├── title                       → "CEO", "CTO", "Head of Ops"...
├── company
├── score (actuel)              → Score existant (à recalculer)
├── status                      → "cold" | "warm" | "hot"
├── stage                       → Position dans le funnel
├── tags[]
├── notes
│
├── enrichmentData.company :
│   ├── size                    → Taille entreprise
│   ├── industry                → Secteur
│   ├── funding                 → Phase de financement
│   ├── revenue                 → CA estimé
│   └── news[]                  → Actualités
│
└── enrichmentData.person :
    ├── interests[]
    ├── recentPosts[]
    ├── experience[]
    └── education[]

DONNÉES ENGAGEMENT (futures) :
├── hasAcceptedInvitation        → boolean
├── responseCount                → Nombre de réponses
├── lastResponseDate             → Date dernière réponse
├── profileVisitsReceived        → Le lead a visité notre profil ?
└── contentEngagement            → Likes/comments sur nos posts
```

### Blocs RAG injectés

| Bloc | Contenu | Utilité pour ce prompt |
|------|---------|----------------------|
| `positionnement` | Identité JARVIS, proposition de valeur | Contexte business pour évaluer le fit |
| `icp` | Profil ICP solopreneur (5-10k€/mois, saturé mentalement, en quête de structure) | Critères de qualification |
| `pain_points` | 4 familles de douleurs (mental, business, organisationnel, identitaire) | Signaux à détecter |

### Prompt actuel (V3.2)

Le prompt actuel décrit un système de scoring avec :
- 3 scores composés : fit (40%) + intent (30%) + budget (30%)
- Catégorisation HOT/WARM/COLD
- Interface TypeScript d'input
- Format output JSON
- Stockage Redis

**Problème :** Même souci que le prompt prospection — c'est une spec archi, pas un system prompt pour le LLM.

### Requis obligatoires

| Requis | Détail |
|--------|--------|
| **Output** | JSON strict : `{ "score": 0-100, "breakdown": {...}, "reasoning": "..." }` |
| **Score** | Entier de 0 à 100 |
| **Catégorisation** | HOT (>= 80) / WARM (>= 60) / COLD (< 60) |
| **Modèle** | claude-haiku ou gpt-4o-mini (rapide et pas cher) |
| **Température** | 0.3 (déterministe) |
| **Reproductible** | Même lead = même score (± 5 points) |

### Possibilités et leviers

**1. Critères de scoring (quoi pondérer ?)**

| Critère | Description | Poids possible |
|---------|-------------|----------------|
| Adéquation titre/fonction | CEO/CTO/Ops = ICP cible ? | 0-30 pts |
| Taille entreprise | PME/ETI en croissance ? | 0-20 pts |
| Industrie/secteur | Tech/SaaS/B2B = idéal | 0-15 pts |
| Signaux d'engagement | A répondu, a visité le profil, like/comment | 0-20 pts |
| Timing/urgence | Levée de fonds, recrutement, croissance | 0-15 pts |
| Budget potentiel | CA, funding, taille → capacité à payer | 0-15 pts |
| Match avec pain points | Douleurs détectées dans les posts/bio | 0-15 pts |

- [ ] Quels critères garder ? Quels poids ?
- [ ] Ajouter des critères négatifs (malus) ? Ex: concurrent, freelance, étudiant
- [ ] Score basé sur les données enrichies vs juste le profil basique ?

**2. Format du breakdown**

Option A — Par critère :
```json
{
  "score": 82,
  "category": "HOT",
  "breakdown": {
    "titre_adequation": { "score": 25, "max": 30, "reason": "CEO = décideur clé" },
    "taille_entreprise": { "score": 18, "max": 20, "reason": "PME 50-200, cible idéale" },
    "engagement": { "score": 15, "max": 20, "reason": "A accepté l'invitation" },
    "timing": { "score": 12, "max": 15, "reason": "Levée récente" },
    "budget": { "score": 12, "max": 15, "reason": "CA estimé 2-5M€" }
  },
  "reasoning": "Lead très qualifié : CEO d'une PME tech en croissance post-levée."
}
```

Option B — Simplifié :
```json
{
  "score": 82,
  "category": "HOT",
  "reasoning": "CEO d'une PME tech en croissance post-levée. Décideur clé avec budget."
}
```

- [ ] Option A (détaillé) ou Option B (simple) ?
- [ ] Le reasoning doit être en français ? Quelle longueur ?

**3. Ce que le prompt NE doit PAS faire**
- Donner un score sans justification
- Scorer au-dessus de 80 sans signaux d'engagement forts
- Inventer des données d'enrichissement
- Être influencé par le score existant (scorer from scratch)

---

## PROMPT 3 : ENRICHISSEMENT

### Utilisation actuelle

**Pas encore de route API.** Ce prompt sera utilisé dans une future route `/api/ai/enrich` (Phase 4) qui appellera **Perplexity** (pas Claude) pour chercher des infos web sur un lead.

### Données disponibles au runtime

```
DONNÉES LEAD (en entrée) :
├── firstName, lastName
├── title
├── company
├── linkedinUrl                 → URL du profil LinkedIn
├── email (si connu)
└── (tout le reste est à chercher)

DONNÉES ATTENDUES EN SORTIE :
├── company.size
├── company.industry
├── company.funding
├── company.revenue
├── company.news[]
├── company.location
├── person.interests[]
├── person.recentPosts[]
├── person.experience[]
└── person.education[]
```

### Blocs RAG injectés

| Bloc | Contenu | Utilité pour ce prompt |
|------|---------|----------------------|
| `positionnement` | Identité JARVIS | Pour savoir quoi chercher (contexte B2B) |
| `icp` | Profil ICP solopreneur | Pour savoir quelles infos sont pertinentes |

### Prompt actuel (V3.2)

Le prompt actuel décrit un workflow complet :
- Recherche LinkedIn Sales Navigator
- Enrichissement Apollo.io
- Validation Hunter.io
- Enrichissement Clearbit
- Calcul fit ICP
- Retry logic, fallbacks, Redis storage

**Problème :** PROSPECTOR n'utilise pas Apollo, Hunter ou Clearbit. Il utilise **Perplexity** pour l'enrichissement web et **Unipile** pour les données LinkedIn. Le prompt V3.2 est hors contexte.

### Requis obligatoires

| Requis | Détail |
|--------|--------|
| **Output** | JSON structuré conforme au type `LeadEnrichment` |
| **Source** | Perplexity API (recherche web) |
| **Langue** | Français |
| **Modèle** | Perplexity (pas Claude) |
| **Infos à chercher** | Entreprise (taille, industrie, CA, news) + Personne (parcours, posts, intérêts) |
| **Fiabilité** | Ne PAS inventer d'infos — dire "N/A" si pas trouvé |

### Possibilités et leviers

**1. Quelles infos chercher ?**

Infos entreprise :
- [ ] Taille (nombre d'employés)
- [ ] Industrie/secteur
- [ ] CA estimé
- [ ] Phase de financement (seed, série A, etc.)
- [ ] Actualités récentes (levée, acquisition, lancement produit)
- [ ] Localisation (siège)
- [ ] Stack technique (si pertinent)
- [ ] Clients notables

Infos personne :
- [ ] Parcours professionnel (postes précédents)
- [ ] Formation
- [ ] Publications/posts LinkedIn récents
- [ ] Centres d'intérêt professionnels
- [ ] Prises de parole (conférences, podcasts, articles)
- [ ] Taille du réseau LinkedIn

**2. Format de sortie**

```json
{
  "company": {
    "size": "50-200 employés",
    "industry": "SaaS / B2B",
    "funding": "Série A (5M€, 2025)",
    "revenue": "2-5M€ estimé",
    "location": "Paris, France",
    "news": [
      "Levée de 5M€ en mars 2025",
      "Lancement nouveau produit Q4 2025"
    ]
  },
  "person": {
    "interests": ["IA", "Sales automation", "Growth"],
    "recentPosts": [
      "Post sur les défis du scaling en SaaS",
      "Partage d'un article sur l'IA en B2B"
    ],
    "experience": [
      { "title": "CEO", "company": "TechVision SAS", "startDate": "2022" },
      { "title": "VP Sales", "company": "PrevCorp", "startDate": "2018", "endDate": "2022" }
    ],
    "education": [
      { "school": "HEC Paris", "degree": "Master", "field": "Digital Business" }
    ]
  },
  "confidence": "high",
  "sources": ["linkedin.com", "societe.com", "crunchbase.com"]
}
```

- [ ] Ajouter un champ `confidence` (high/medium/low) ?
- [ ] Lister les sources utilisées ?
- [ ] Ajouter un résumé textuel en plus du JSON ?

**3. Ce que le prompt NE doit PAS faire**
- Inventer des données (revenue, funding) si pas trouvées
- Confondre des homonymes
- Chercher des données personnelles (adresse, vie privée)
- Retourner des infos non vérifiables

---

## PROMPT 4 : CONVERSATIONAL

### Utilisation actuelle

**Route : `POST /api/ai/chat`** — Chat dans le Cockpit IA
- Appelé quand : L'user envoie un message dans le Cockpit
- Le prompt est envoyé comme `system`
- Les `messages` sont l'historique de conversation (multi-turn)
- Le contexte pipeline est injecté dans le system prompt

### Données disponibles au runtime

```
DONNÉES PIPELINE (injectées dans le system prompt) :
├── leads_total                 → 156
├── leads_hot                   → 5 (score >= 70)
├── en_sequence                 → 22
├── taux_reponse_semaine        → 32%
├── taux_reponse_mois           → 28%
├── rdv_planifies               → 8
│
├── quotas_aujourdhui :
│   ├── invitations             → 8/15
│   ├── messages                → 23/50
│   └── visites                 → 12/30
│
├── top_leads_chauds[] :        → Top 5 avec nom, score, contexte
│
├── funnel_pipeline :
│   ├── a_inviter               → 45
│   ├── invite                  → 38
│   ├── connecte                → 28
│   ├── en_sequence             → 22
│   ├── a_repondu               → 15
│   └── rdv                     → 8
│
├── sequences_actives[] :       → Nom, leads actifs, taux réponse, conversion
│
└── equipe[] :                  → Nom, actions, taux réponse, RDV (par user)
```

**Note :** Actuellement ces données sont hardcodées. En Phase 3F (CRUD Supabase), elles seront des vraies queries DB.

### Blocs RAG injectés

**TOUS les 14 blocs** (mapping = `'*'`), car le Cockpit doit pouvoir répondre à n'importe quelle question sur JARVIS, le marché, les offres, etc.

### Prompt actuel (V3.2)

Le prompt actuel décrit un système complexe :
- 2 branches (A: questions 80%, B: actions 20%)
- Self-validation 4 checks
- Payload structuré pour un Orchestrator
- Détection client type (enterprise vs solopreneur)
- Formats JSON pour chaque branche

**Problème :** PROSPECTOR n'a pas d'orchestrateur, pas de validators, pas de branches A/B. Le Cockpit est un simple chat qui répond à des questions sur le pipeline et fait du reporting.

### Requis obligatoires

| Requis | Détail |
|--------|--------|
| **Output** | Texte markdown (pas de JSON) |
| **Langue** | Français |
| **Modèle** | claude-sonnet ou gpt-4o |
| **Température** | 0.7 |
| **Multi-turn** | Oui, historique de conversation complet |
| **Données** | Baser les réponses sur les vraies données pipeline |
| **Ton** | Concis, actionnable, professionnel mais accessible |

### Possibilités et leviers

**1. Personnalité et ton**
- [ ] Nom : "JARVIS" ? "Prospector" ? Pas de nom ?
- [ ] Tutoiement vs vouvoiement
- [ ] Emoji dans les réponses ? (actuellement oui dans le V3.2)
- [ ] Longueur des réponses : bullet points concis vs paragraphes détaillés

**2. Capacités (que peut-il faire ?)**

Reporting/Analytics :
- [ ] Résumé quotidien automatique
- [ ] Analyse des taux (réponse, conversion, par séquence)
- [ ] Comparaison entre users de l'équipe
- [ ] Évolution dans le temps (semaine, mois)
- [ ] Identification des leads les plus chauds
- [ ] Performance par persona/séquence

Recommandations :
- [ ] Leads à prioriser aujourd'hui
- [ ] Relances à faire (leads silencieux depuis X jours)
- [ ] Séquences à optimiser (taux bas)
- [ ] Quotas et pacing de la journée
- [ ] Suggestions de prochaines actions

Questions business :
- [ ] "C'est quoi notre offre ?" → Répond via RAG
- [ ] "Quelles objections je risque ?" → Répond via RAG
- [ ] "Comment aborder un CEO tech ?" → Répond via RAG + données pipeline

**3. Format des réponses**
- [ ] Utiliser du markdown (gras, listes, titres) ?
- [ ] Inclure des chiffres précis du pipeline ?
- [ ] Proposer une action concrète à la fin de chaque réponse ?
- [ ] Ajouter des emojis pour la lisibilité ?

**4. Ce que le prompt NE doit PAS faire**
- Inventer des chiffres (utiliser uniquement les données pipeline fournies)
- Donner des conseils génériques sans s'appuyer sur les données réelles
- Proposer des actions impossibles (ex: envoyer un email si pas d'adresse email)
- Être trop verbeux (les users veulent de l'actionnable)

---

## ANNEXES

### A. Les 14 blocs RAG disponibles

| # | Bloc ID | Titre | Résumé |
|---|---------|-------|--------|
| 1 | `positionnement` | Positionnement Smart | Identité JARVIS, cerveau IA central, proposition de valeur, mission |
| 2 | `icp` | ICP Solopreneur | Profil cible : solopreneur 5-10k€/mois, saturé mentalement, cherche structure |
| 3 | `offres` | Offre JARVIS Start | 79€/mois + 500€ setup, partenaire IA managed, Sales & Marketing |
| 4 | `use_cases` | Catalogue Use Cases | 7 cas d'usage : pilotage quotidien, prospection, relances, marketing, mental |
| 5 | `objections` | Objections & Réponses | 10 objections (temps, ChatGPT, prix, complexité) + réponses empathiques |
| 6 | `regles_decisionnelles` | Règles Décisionnelles | Moteur de décision : variables (moment, énergie, objectif), scoring pondéré |
| 7 | `pain_points` | Pain Points Framework | 4 familles de douleurs (mental, business, organisationnel, identitaire) + signaux |
| 8 | `benchmark_marche` | Benchmark Marché | Réalités du marché solopreneur, contraintes structurelles, mythes |
| 9 | `benchmark_concurrents` | Benchmark Concurrents | 4 catégories de concurrents, positionnement JARVIS comme couche d'orchestration |
| 10 | `pricing` | Pricing Strategy | Justification par équivalence partenaire business (2-5k€ humain), pas de négo |
| 11 | `messaging` | Messaging Angles | 5 angles (normalisation, clarté, anti-burnout, ROI, partenaire) déployés contextuellement |
| 12 | `operating_rules` | Operating Rules | Règles d'exécution JARVIS : sobriété (1 objectif max), seuils d'activation, refus |
| 13 | `onboarding` | Onboarding Flow | 4 phases progressives, 4 piliers RAG (offre, ICP, preuve, contraintes) |
| 14 | `architecture_core` | Architecture Core | Blocs 1-6 = pensée, Blocs 7-11+ = intelligence marché |

### B. Mapping RAG → Agents (actuel)

| Agent | Blocs injectés |
|-------|---------------|
| `prospection` | positionnement, offres, messaging, objections, use_cases |
| `scoring` | positionnement, icp, pain_points |
| `enrichissement` | positionnement, icp |
| `conversational` | **TOUS** (les 14) |

> Ce mapping est modifiable dans `lib/rag/mapping.ts`.

### C. Types TypeScript de référence

**Lead :**
```typescript
interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  title?: string;
  company?: string;
  linkedinUrl: string;
  email?: string;
  phone?: string;
  score: number;                    // 0-100
  status: "cold" | "warm" | "hot" | "converted" | "lost";
  stage: "to_invite" | "invited" | "connected" | "in_sequence" | "responded" | "meeting" | "closed";
  tags: string[];
  notes?: string;
  enrichmentData?: LeadEnrichment;
}
```

**Action :**
```typescript
interface Action {
  id: string;
  leadId: string;
  actionType: "visit" | "invitation" | "message" | "inmail" | "whatsapp" | "email";
  status: "pending" | "validated" | "sent" | "failed" | "cancelled";
  generatedMessage?: string;        // Message IA
  finalMessage?: string;            // Message après édition user
  scheduledAt?: Date;
}
```

**Séquence :**
```typescript
interface SequenceStep {
  stepType: "visit" | "invitation" | "message" | "inmail";
  delayDays: number;                // Jours d'attente après l'étape précédente
  template?: string;                // Template du message
  condition?: "if_connected" | "if_no_response" | "if_responded" | "always";
}
```

### D. Contraintes LinkedIn

| Contrainte | Valeur | Impact prompt |
|-----------|--------|--------------|
| Invitation : max caractères | 300 | Le prompt DOIT respecter cette limite |
| Messages/jour | 50 (configurable) | Pas d'impact direct sur le prompt |
| Invitations/jour | 15 (configurable) | Pas d'impact direct |
| Délai entre messages | 15 min minimum | Pas d'impact direct |
| Heures actives | 9h-19h lun-ven | Pas d'impact direct |

### E. Modèles IA disponibles

| Usage | Option 1 | Option 2 | Recommandé |
|-------|----------|----------|-----------|
| Messages (prospection) | claude-sonnet | gpt-4o | claude-sonnet |
| Scoring | claude-haiku | gpt-4o-mini | claude-haiku (rapide, pas cher) |
| Enrichissement | perplexity | - | perplexity (seule option) |
| Chat cockpit | claude-sonnet | gpt-4o | claude-sonnet |

---

## CHECKLIST POUR RÉÉCRIRE CHAQUE PROMPT

Pour chaque prompt, passe par ces étapes :

1. **Définir le rôle** : Qui est l'agent ? Quel est son job en une phrase ?
2. **Définir le ton** : Tutoiement/vouvoiement, formel/casual, empathique/direct
3. **Définir l'output** : Texte brut ? JSON ? Markdown ? Quelle structure exacte ?
4. **Lister les règles** : Ce qu'il doit faire, ce qu'il ne doit PAS faire
5. **Donner des exemples** : 2-3 exemples concrets d'input → output attendu
6. **Tester** : Envoyer le prompt à Claude avec des cas réels et itérer

---

*Document généré le 2026-02-10*
*Fichier : PROMPT_WORKBENCH.md*
