# Enrichissement Lead - Documentation Technique Complète

> Document de reprise pour continuer le travail sur l'enrichissement lead.
> Dernière mise à jour : 2026-02-28

---

## Table des matières

1. [Vue d'ensemble du flux](#1-vue-densemble-du-flux)
2. [Ce qu'Unipile renvoie (données brutes)](#2-ce-quunipile-renvoie-données-brutes)
3. [Ce qu'on stocke et comment](#3-ce-quon-stocke-et-comment)
4. [Ce qui est affiché dans l'UI](#4-ce-qui-est-affiché-dans-lui)
5. [Ce qui est envoyé à l'IA](#5-ce-qui-est-envoyé-à-lia)
6. [Problèmes connus et limitations](#6-problèmes-connus-et-limitations)
7. [Pièges techniques rencontrés](#7-pièges-techniques-rencontrés)
8. [Prochaines étapes possibles](#8-prochaines-étapes-possibles)
9. [Fichiers clés](#9-fichiers-clés)
10. [Script d'exploration](#10-script-dexploration)

---

## 1. Vue d'ensemble du flux

```
Bouton "Enrichir" (fiche lead)
    │
    ▼
POST /api/ai/enrich (app/api/ai/enrich/route.ts)
    │
    ├── 1. Fetch profil LinkedIn via Unipile (linkedin_sections=*)
    │       → getUserProfile(identifier, accountId, { linkedinSections: "*" })
    │
    ├── 2. Fetch posts du lead via Unipile (ÉCHOUE — limitation Unipile)
    │       → getUserPostsByIdentifier(identifier, accountId, 5)
    │
    ├── 3. Build context avec données Unipile brutes
    │       → buildEnrichmentContext(lead, unipileData)
    │
    ├── 4. Appel Perplexity (sonar-pro) pour enrichissement web
    │       → callPerplexity({ agentId: "enrichissement", ... })
    │       → Perplexity reçoit les données Unipile + son propre prompt de recherche
    │       → Retourne un JSON structuré (company, person, signal, etc.)
    │
    ├── 5. Merge dans enrichment_data (JSONB en DB)
    │       → existing enrichment_data (préserve scoring_detail)
    │       → + résultat Perplexity (company, person, signal)
    │       → + linkedin_profile (données Unipile directes)
    │
    └── 6. Auto-correction stage si 1er degré détecté
            → to_invite/invited → connected
```

---

## 2. Ce qu'Unipile renvoie (données brutes)

### API appelée
```
GET https://{UNIPILE_DSN}/users/{identifier}
  ?account_id={accountId}
  &linkedin_sections=*
```

Le paramètre `linkedin_sections=*` débloque les champs enrichis (skills, languages, certifications, education, work_experience, summary).

### Champs scalaires

| Champ | Type | Disponibilité | Exemple |
|-------|------|--------------|---------|
| `id` | string | Toujours | `"abc123"` |
| `provider` | string | Toujours | `"LINKEDIN"` |
| `provider_id` / `member_urn` | string | Toujours | URN LinkedIn |
| `first_name` / `last_name` | string | Toujours | Nom complet |
| **`headline`** | string | Quasi-toujours | `"CEO @ Acme"` |
| `public_identifier` | string | Toujours | `"john-doe-123"` |
| `profile_url` | string | Toujours | URL LinkedIn complète |
| **`profile_picture_url`** | string | Quasi-toujours | URL photo (petite) |
| **`profile_picture_url_large`** | string | Souvent | URL photo (grande) |
| `background_picture_url` | string | Parfois | Bannière |
| **`location`** | string | Quasi-toujours | `"Paris, France"` |
| **`summary`** | string | Souvent | Texte long (= `about` en mode sections=*) |
| `about` | string | Mode basique seulement | Absent avec `sections=*` |
| `company` | string | Souvent | Entreprise actuelle |
| **`connections_count`** | number | Quasi-toujours | `500` |
| **`follower_count`** / `followers_count` | number | Quasi-toujours | Followers |
| `shared_connections_count` | number | Parfois | Connexions communes |
| **`network_distance`** | string | Toujours | `"FIRST"`, `"SECOND"`, `"THIRD"` |
| **`is_open_profile`** | boolean | Souvent | `true/false` |
| **`is_premium`** | boolean | Souvent | `true/false` |
| `is_influencer` / **`is_creator`** | boolean | Souvent | `true/false` |
| `is_relationship` / `is_self` | boolean | Toujours | `true/false` |
| `primary_locale` | object | Parfois | `{country, language}` |

### Champs tableaux (avec `linkedin_sections=*`)

| Champ | Structure | Disponibilité |
|-------|-----------|--------------|
| **`work_experience`** | `[{title, company_name, start_date, end_date, description, location}]` | Quasi-toujours |
| **`education`** | `[{school_name, degree, field_of_study, start_date, end_date}]` | Souvent |
| **`skills`** | `[{name, endorsement_count}]` | Souvent |
| **`languages`** | `[{name, proficiency}]` | Souvent |
| `certifications` | `[{name, authority, start_date, end_date}]` | Parfois |
| `volunteering_experience` | `[...]` | Rare |
| `projects` | `[...]` | Rare |
| `hashtags` | `["marketing", ...]` | Rare |
| **`websites`** | `["https://..."]` | Parfois |
| `recommendations` | `{given_total_count, given: [...]}` | Parfois |

### Champs bonus

| Champ | Structure |
|-------|-----------|
| **`contact_info`** | `{emails: [...], phones: [...]}` |
| **`creator_website`** | `{url, description}` |

### IMPORTANT : Noms de champs différents avec `linkedin_sections=*`

Quand on utilise `linkedin_sections=*`, Unipile renvoie des noms DIFFÉRENTS pour certains champs :

| Mode basique | Mode `sections=*` | Comment on gère |
|-------------|-------------------|-----------------|
| `about` | `summary` | `profile?.summary \|\| profile?.about` |
| `experience` | `work_experience` | `profile?.work_experience \|\| profile?.experience` |

C'est géré dans `enrich/route.ts` lignes 65-66.

### Posts (`GET /users/{identifier}/posts`)

**NE FONCTIONNE PAS.** L'endpoint renvoie systématiquement "Recipient cannot be reached" pour tous les profils testés (y compris son propre profil et des connexions 1er degré). C'est une limitation Unipile. Les posts viennent de Perplexity à la place.

L'endpoint `GET /users/posts` (sans identifier) fonctionne et renvoie nos propres posts.

---

## 3. Ce qu'on stocke et comment

### Schéma DB

```sql
-- Table leads, colonne enrichment_data (JSONB)
-- Contient TOUT l'enrichissement dans un seul champ
leads.enrichment_data → JSONB
```

### Structure du JSONB `enrichment_data`

Le champ `enrichment_data` est un objet JSON avec 4 sous-objets principaux, alimentés par des sources différentes et à des moments différents :

```typescript
interface LeadEnrichment {
  // ─── Source : Perplexity (via prompt enrichissement) ───
  company?: {
    size?: string;           // "20-50 employés"
    industry?: string;       // "EdTech"
    funding?: string;        // "Série A, 2M€ (2025)"
    revenue?: string;        // "~1.5M€"
    location?: string;       // "Lyon, France"
    website?: string;        // "acme.com"
    description?: string;    // Description courte
    news?: string[];         // ["Lancement produit janvier 2026"]
  };

  // ─── Source : Perplexity (structuré par prompt) ───
  person?: {
    experience?: WorkExperience[];   // [{title, company, startDate, endDate}]
    education?: Education[];         // [{school, degree, field}]
    interests?: string[];            // ["growth", "IA"]
    recentPosts?: string[];          // ["Post sur le scaling commercial"]
    anciennete_poste_mois?: number;  // 14
  };

  // ─── Source : Perplexity (classifié par prompt) ───
  signal?: {
    type?: SignalType;               // "POST_DOULEUR" | "INBOUND" | etc.
    detail?: string;                 // "Post du 15/02 sur la difficulté..."
    smartai_interaction?: boolean;   // false (pas encore implémenté)
  };

  // ─── Source : /api/ai/score (scoring IA) ───
  scoring_detail?: {
    fit_score?: number;       // /40
    intent_score?: number;    // /40
    timing_score?: number;    // /20
    categorie?: string;       // "HOT" | "WARM" | "COLD" | "NO_GO"
    confidence?: string;      // "high" | "medium" | "low"
    justification?: string;   // Phrase factuelle
    cas_limite?: boolean;
    ajustement_ia?: string;   // "+5" | "0" | "-5" | null
  };

  // ─── Source : Unipile (stocké directement, pas via Perplexity) ───
  linkedin_profile?: {
    headline?: string;
    about?: string;                    // summary/about
    profile_picture_url?: string;
    profile_picture_url_large?: string;
    location?: string;
    connections_count?: number;
    follower_count?: number;
    is_premium?: boolean;
    is_open_profile?: boolean;
    is_creator?: boolean;
    network_distance?: string;         // "FIRST" | "SECOND" | "THIRD"
    skills?: { name: string; endorsement_count?: number }[];
    languages?: { name: string; proficiency?: string }[];
    websites?: string[];
    contact_info?: { emails?: string[]; phones?: string[] };
    creator_website?: { url?: string; description?: string } | null;
  };
}
```

### Logique de merge (enrich/route.ts)

```
1. Fetch existing enrichment_data depuis DB (pour préserver scoring_detail)
2. Perplexity retourne un JSON structuré → enrichmentResult
3. On ajoute linkedin_profile (données Unipile directes) à enrichmentResult
4. On merge : { ...existingEnrichmentData, ...enrichmentResult }
   → scoring_detail préservé (existant)
   → company, person, signal écrasés (nouvelles données)
   → linkedin_profile ajouté/mis à jour
```

### Typage TypeScript

- `types/leads.ts` → `LeadEnrichment` interface complète
- `types/leads.ts` → `SignalType` type union
- `lib/mappers.ts` → `mapDbLeadToLead()` → cast `enrichment_data` en `LeadEnrichment`

---

## 4. Ce qui est affiché dans l'UI

### Fiche lead (`lead-detail-client.tsx`)

| Donnée | Affiché où | Source dans enrichmentData |
|--------|-----------|---------------------------|
| Photo profil | Avatar header | `linkedin_profile.profile_picture_url` |
| Headline LinkedIn | Sous le nom (remplace title/company) | `linkedin_profile.headline` |
| Badge Premium | A côté du nom | `linkedin_profile.is_premium` |
| Network distance | Badge 1er/2e/3e degré | `linkedin_profile.network_distance` |
| Company size, location, website | Card "Entreprise" | `company.*` |
| Industry, funding, revenue | Card "Entreprise" | `company.*` |
| Company news | Card "Entreprise" (bas) | `company.news[]` |
| Company description | Card "Entreprise" | `company.description` |
| Signal type + detail | Card "Signal" (nouvelle) | `signal.type`, `signal.detail` |
| About/Summary | Card "Profil LinkedIn" | `linkedin_profile.about` |
| Skills (max 12) | Card "Profil LinkedIn" | `linkedin_profile.skills[]` |
| Languages | Card "Profil LinkedIn" | `linkedin_profile.languages[]` |
| Websites | Card "Profil LinkedIn" | `linkedin_profile.websites[]` |
| Connections + followers | Card "Profil LinkedIn" (header) | `linkedin_profile.connections_count/follower_count` |
| Ancienneté poste | Card "Parcours" (haut) | `person.anciennete_poste_mois` |
| Experience timeline | Card "Parcours" | `person.experience[]` |
| Education | Card "Parcours" | `person.education[]` |
| Interests | Card "Centres d'intérêt" | `person.interests[]` |
| Recent posts | Card "Centres d'intérêt" | `person.recentPosts[]` |
| Scoring breakdown | Card collapsible "Détail du scoring" | `scoring_detail.*` |

### Inbox (`inbox-client.tsx`)

| Donnée | Affiché où | Source |
|--------|-----------|--------|
| Photo profil | Avatar dans la liste conversations | `lead.enrichment_data.linkedin_profile.profile_picture_url` |
| Photo profil | Avatar dans le header conversation | idem |

### Comment les photos arrivent dans l'inbox
- `lib/actions/conversations.ts` → query leads avec `enrichment_data`
- `ConversationWithMessages` a un champ `leadProfilePictureUrl`
- Mappé depuis `lead.enrichment_data?.linkedin_profile?.profile_picture_url`

---

## 5. Ce qui est envoyé à l'IA

### Pour la PROSPECTION (génération de messages)
`lib/ai/lead-context.ts` → `buildLeadContext()` / `buildLeadSections()`

Envoyé au prompt :
```
## Lead
- Nom, Titre, Entreprise, LinkedIn, Score, Stage, Tags, Notes

## Entreprise (si enrichi)
- Taille, Secteur, CA estimé, Financement, Localisation, News

## Personne (si enrichi)
- Ancienneté poste (mois), Intérêts, Posts récents

## Signal enrichissement (si enrichi)
- Type, Détail, Interaction Smart.AI
```

**linkedin_profile N'EST PAS envoyé** à l'agent prospection. Seules les données structurées par Perplexity sont envoyées.

### Pour le SCORING
Même structure que prospection (via `buildScoringContext()` qui appelle `buildLeadSections()`).

### Pour l'ENRICHISSEMENT
`buildEnrichmentContext()` envoie les données Unipile BRUTES :
```
## Données Unipile (LinkedIn)
Profil complet : {JSON.stringify(unipileData.profile)}
Posts récents : {JSON.stringify(unipileData.recentPosts)}
Expériences : {JSON.stringify(unipileData.experience)}
Date prise de poste : {currentJobStartDate}
```

Puis Perplexity est appelé séparément et les résultats des deux sont fusionnés par le prompt enrichissement.

---

## 6. Problèmes connus et limitations

### Données en double
`linkedin_profile` stocke des infos que Perplexity met aussi dans `company`/`person` :
- `linkedin_profile.location` vs `company.location`
- `linkedin_profile.about` contient des infos que Perplexity résume dans `person.interests`

### Champs Unipile non stockés
Ces champs sont disponibles dans le profil Unipile mais pas stockés dans `linkedin_profile` :
- `work_experience[]` (données structurées, pas les résumés texte de Perplexity)
- `education[]` (idem)
- `certifications[]`
- `hashtags[]`
- `recommendations`
- `volunteering_experience[]`
- `projects[]`

### Données pas encore affichées dans l'UI
- `contact_info.emails[]` et `contact_info.phones[]` → pas dans la card Contact
- `creator_website` → pas affiché
- `certifications` → pas stocké ni affiché

### Posts Unipile
L'endpoint `GET /users/{identifier}/posts` ne fonctionne pas (erreur "Recipient cannot be reached"). Testé sur :
- Son propre profil (khalil-cadi-marketing-digital)
- Un lead 1er degré (thomas-coquillet-coach-de-dirigeants)
→ Les deux échouent. C'est une limitation côté Unipile.

### linkedin_profile conditionné par about
La card "Profil LinkedIn" ne s'affiche que si `linkedin_profile.about` existe :
```tsx
{lead.enrichmentData?.linkedin_profile?.about && (
  <div>... Profil LinkedIn ...</div>
)}
```
→ Si un profil n'a pas de section "about", on perd les skills, languages, etc.

---

## 7. Pièges techniques rencontrés

### 1. ESM Import Hoisting (script explore)
**Problème** : Le script `explore-unipile-profile.ts` avait des "invalid credentials".
**Cause** : ESM hoiste les imports. `UNIPILE_BASE_URL` (const module-level dans `client.ts`) était évalué AVANT `dotenv.config()`, donc `UNIPILE_DSN` était undefined et le client pointait vers `api1.unipile.com` au lieu de `api30.unipile.com`.
**Fix** : Import dynamique dans le script :
```typescript
async function main() {
  const { getUnipileClient } = await import("../lib/unipile/client");
  // ...
}
```

### 2. Noms de champs Unipile avec linkedin_sections=*
**Problème** : `about` absent, `experience` absent après enrichissement.
**Cause** : Avec `linkedin_sections=*`, Unipile renvoie `summary` au lieu de `about` et `work_experience` au lieu de `experience`.
**Fix** :
```typescript
const experience = profile?.work_experience || profile?.experience || [];
const aboutText = profile?.summary || profile?.about || null;
```

### 3. Merge enrichment_data écrase scoring_detail
**Problème** : Enrichir un lead effaçait le scoring précédent.
**Cause** : Le spread `{ ...enrichmentResult }` écrasait tout.
**Fix** : Fetch existing `enrichment_data` depuis DB, merge avec `{ ...existing, ...new }`.

### 4. network_distance inconsistant
**Cause** : Unipile renvoie `"FIRST"`, `"SECOND"`, `"THIRD"` (pas `"FIRST_DEGREE"`).
**Fix** : Fonction `isFirstDegreeConnection()` qui normalise toutes les variantes.

---

## 8. Prochaines étapes possibles

### Restructuration données (à décider)
- Stocker `work_experience` Unipile structuré au lieu de laisser Perplexity résumer
- Intégrer `contact_info`, `certifications`, `education` Unipile dans `linkedin_profile`
- Dédupliquer `location` entre `linkedin_profile` et `company`

### Amélioration UI
- Afficher `contact_info` (emails/phones) dans la card Contact si disponible
- Card "Profil LinkedIn" : ne pas conditionner sur `about`, afficher skills/languages même sans about
- Afficher les certifications si disponibles

### Amélioration IA
- Passer les données `linkedin_profile` (headline, about, skills) au prompt prospection
  → Actuellement seul le résumé Perplexity est envoyé, pas les données directes
- Exploiter `is_premium`, `is_open_profile`, `network_distance` dans le scoring

### Enrichissement batch
- Enrichir tous les leads d'une liste en un clic (le batch mode existe déjà dans la route)
- Progress bar / notifications pour le batch

---

## 9. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `app/api/ai/enrich/route.ts` | Route enrichissement (Unipile + Perplexity + merge + auto-stage) |
| `lib/unipile/client.ts` | Client HTTP Unipile (48 méthodes, singleton) |
| `lib/unipile/types.ts` | Types Unipile complets (46 interfaces) |
| `lib/ai/lead-context.ts` | Builders de contexte pour tous les agents IA |
| `lib/ai/prompts/defaults.ts` | Prompts V4 des 4 agents |
| `lib/ai/service.ts` | Service IA unifié (callAI, callPerplexity) |
| `types/leads.ts` | Types Lead + LeadEnrichment + SignalType |
| `lib/mappers.ts` | Mapping DB → App (snake_case → camelCase) |
| `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` | UI fiche lead complète |
| `app/(dashboard)/inbox/inbox-client.tsx` | UI inbox avec photos |
| `lib/actions/conversations.ts` | Server action conversations (photo lead) |
| `scripts/explore-unipile-profile.ts` | Script d'exploration données Unipile |

---

## 10. Script d'exploration

Pour tester ce qu'Unipile renvoie pour un profil donné :

```bash
npx tsx scripts/explore-unipile-profile.ts \
  "https://www.linkedin.com/in/john-doe/" \
  "OXFh3tVsRV2rB9AebpNTYA"
```

**Prérequis** : `.env.local` avec `UNIPILE_API_KEY` et `UNIPILE_DSN`.

Le script teste :
1. Profil basique (sans `linkedin_sections`)
2. Profil complet (avec `linkedin_sections=*`) → compare les clés
3. Inventaire complet de tous les champs + présence
4. Posts via `/users/{identifier}/posts` (ne marche pas actuellement)
5. Comparaison avec `getUserPosts` (nos propres posts)
6. Résumé de ce qui est disponible

**Valeur du account_id** : `OXFh3tVsRV2rB9AebpNTYA` (le compte Unipile LinkedIn connecté).

---

## Historique des commits liés

```
10828aa Feat: migration prompts V4 (prospection, enrichissement, scoring, conversational)
3dec3d7 Feat: affichage complet données enrichies V4 sur fiche lead
96115f6 Fix: enrichissement préserve scoring_detail + affiche toutes les données V4
6925b50 Feat: Unipile enrichi — profil complet, posts par lead, photos UI
2fa2152 Fix: Unipile field mapping (summary vs about, work_experience vs experience)
3294ed1 Fix: scoring fit aligné sur ICP RAG (solopreneur B2B) au lieu de PME 20-100
7783bf1 Rule: interdire tiret cadratin (em dash) dans les messages générés
ce12b45 Feat: auto-correction stage 1er degré + dropdown changement stage manuel
5967b55 Fix: Unipile cookie auth — response type mismatch (account_id vs id)
96a4c8e Audit coherence: 6 fixes critiques + cleanup + DB constraints
676f7b8 Feat: vue Timeline dans Daily Actions — vérification scheduling anti-détection
dadf4e1 Audit UI/UX: P0 accessibilité + P1 cohérence visuelle + design system
971e890 Feat: modal leads inscrits dans séquence + retrait lead
```

---

*Document de reprise - Enrichissement Lead PROSPECTOR*
*Créé le 2026-02-28*
