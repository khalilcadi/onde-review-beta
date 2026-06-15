# DIAGNOSTIC AGENT 3 — Agent Prospection (Setter IA)

> Diagnostic complet du pipeline d'injection de donnees dans l'agent de prospection.
> Date : 2026-03-07

---

## 1. DATA FLOW COMPLET

```
Supabase (table leads)
    |
    | SELECT id, first_name, last_name, title, company, linkedin_url,
    |        score, status, stage, tags, notes, enrichment_data
    |
    v
loadLeadForGeneration()                    [crons/generate-actions/route.ts:464-492]
    | Mapping snake_case -> camelCase (LeadForGeneration)
    |
    +---> buildLeadContext(lead, actionType)   [lib/ai/lead-context.ts:129-149]
    |     | Produit le runtimeContext (string)
    |     | Template literals avec lead.*, enrichmentData.company.*, person.*, signal.*
    |     |
    +---> buildUserPrompt(lead, actionType)    [lib/ai/lead-context.ts:221-251]
    |     | Produit le user message (string)
    |     |
    v
callAI({                                   [lib/ai/service.ts:98-141]
  userId, agentId: "prospection",
  runtimeContext,                           <- buildLeadContext output
  messages: [{ role: "user", content }]     <- buildUserPrompt output
})
    |
    | 1. getUserAIConfig(userId)            -> provider, model, apiKey, temperature
    | 2. buildSystemPrompt("prospection")   -> prompt agent + RAG
    |     |
    |     +---> getPrompt("prospection")    [lib/ai/prompts/service.ts:16-36]
    |     |     | DB user_prompts override > PROMPTS_DEFAULTS.prospection
    |     |
    |     +---> buildRagContext("prospection") [lib/rag/context.ts:80-131]
    |           | resolveAgentBlocs("prospection")
    |           |   -> ['positionnement','icp','offres','messaging','objections','use_cases','pain_points']
    |           | Charge 7 fichiers knowledge/*.json
    |           | Charge overrides DB (user_rag_data)
    |           | Formate en texte markdown
    |
    | 3. Appel Claude/OpenAI
    |     system = [
    |       { text: basePrompt (agent + RAG), cache_control: ephemeral },  <- CACHE
    |       { text: runtimeContext }                                        <- DYNAMIQUE
    |     ]
    |     messages = [{ role: "user", content: userPrompt }]
    |
    v
response.text
    |
    v
humanizeMessage(text, actionType)          [lib/humanize.ts]
    | 40% chance de fragmenter en 2-3 parties (separateur |||)
    |
    v
Action inseree en DB (status: "pending", generated_message: result)
```

---

## 2. CONSTRUCTION DU PROMPT — CODE COMPLET

### 2.1 System Prompt = Agent Prompt + RAG

```typescript
// lib/ai/prompts/service.ts:46-59
export const buildSystemPrompt = async (agentId, userId?, supabaseOverride?) => {
  const prompt = await getPrompt(agentId, userId, supabaseOverride);
  // ^ DB override ou PROMPTS_DEFAULTS.prospection (294 lignes, ~4500 tokens)
  const ragContext = await buildRagContext(agentId, userId, supabaseOverride);
  // ^ 7 blocs JSON charges depuis knowledge/*.json, formates en markdown
  if (ragContext) {
    return `${prompt}\n\n${ragContext}`;
  }
  return prompt;
};
```

**Mecanisme d'injection** : simple concatenation `prompt + "\n\n" + ragContext`.

### 2.2 Runtime Context (donnees lead)

```typescript
// lib/ai/lead-context.ts:70-123 — buildLeadSections()
function buildLeadSections(lead: LeadForGeneration): string {
  let ctx = `## Lead
- Nom : ${lead.firstName} ${lead.lastName}
- Titre : ${lead.title || "N/A"}
- Entreprise : ${lead.company || "N/A"}
- LinkedIn : ${lead.linkedinUrl}
- Score : ${lead.score ?? "N/A"} (${lead.status || "N/A"})
- Stage : ${lead.stage || "N/A"}
- Tags : ${lead.tags?.join(", ") || "N/A"}
- Notes : ${lead.notes || "Aucune"}`;

  // Sections conditionnelles : Entreprise, Personne, Signal
  if (lead.enrichmentData?.company) { /* ... */ }
  if (lead.enrichmentData?.person)  { /* ... */ }
  if (lead.enrichmentData?.signal)  { /* ... */ }
  return ctx;
}
```

**Mecanisme d'injection** : template literals ES6. Chaque champ est insere avec `${variable}` et fallback `|| "N/A"` / `?? "N/A"`.

Les sections Entreprise, Personne, Signal sont conditionnelles : elles n'apparaissent que si `enrichmentData.company`, `.person`, `.signal` existent.

### 2.3 User Prompt

```typescript
// lib/ai/lead-context.ts:221-251
export function buildUserPrompt(lead, actionType, currentMessage?, feedback?) {
  // Regeneration : inclut le message precedent + feedback optionnel
  if (currentMessage) {
    return `Regenere ce message LinkedIn pour ${lead.firstName} ${lead.lastName}...`;
  }
  // Generation initiale :
  return `Genere un ${isInvitation ? "message d'invitation (MAX 300 chars)" : `message de type "${actionType}"`}
    pour ${lead.firstName} ${lead.lastName} (${lead.title} @ ${lead.company}).
    Retourne UNIQUEMENT le message, sans explication.`;
}
```

### 2.4 Structure finale envoyee a Claude

```
SYSTEM BLOCK 1 (cached) :
  [PROMPT AGENT PROSPECTION v4.3 — ~4500 tokens]
  [---]
  [BASE DE CONNAISSANCES (RAG) — 7 blocs, ~8000-12000 tokens]

SYSTEM BLOCK 2 (dynamique) :
  ## Lead
  - Nom : Sophie Martin
  - Titre : CEO & Fondatrice
  - Entreprise : DigitalBoost
  [... enrichment sections si presentes ...]
  ## Action
  - Type : invitation

USER MESSAGE :
  Genere un message d'invitation LinkedIn (MAX 300 caracteres)
  pour Sophie Martin (CEO & Fondatrice @ DigitalBoost).
  Retourne UNIQUEMENT le message, sans explication.
```

---

## 3. RAG — IMPLEMENTATION REELLE

### 3.1 Le RAG est implemente — mais ce n'est PAS un RAG vectoriel

**Il n'y a PAS** :
- d'embeddings
- de vector store
- de similarite cosine
- de query semantique
- de retrieval dynamique

**Ce qui existe** : un systeme de blocs JSON statiques charges depuis le filesystem.

### 3.2 Mecanisme reel

```typescript
// lib/rag/context.ts:80-131
export async function buildRagContext(agentId, userId?, supabaseOverride?) {
  // 1. Mapping statique agent -> blocs
  const blocIds = resolveAgentBlocs(agentId);
  // prospection -> ['positionnement','icp','offres','messaging','objections','use_cases','pain_points']

  // 2. Charge les overrides user depuis DB (user_rag_data)
  let userOverrides = new Map();
  if (userId) { userOverrides = await loadUserOverrides(userId, supabase); }

  // 3. Charge chaque bloc depuis knowledge/*.json (avec cache memoire)
  const blocs = await Promise.all(
    blocIds.map(async (blocId) => {
      const override = userOverrides.get(blocId);
      if (override) return override;      // Override DB prioritaire
      return loadBloc(blocId);            // Sinon fichier JSON
    })
  );

  // 4. Formate en texte markdown
  return `---\n\n## BASE DE CONNAISSANCES (RAG)\n\n${sections.join("\n\n---\n\n")}\n\n---`;
}
```

### 3.3 Blocs injectes pour l'agent prospection (7/14)

| Bloc | Fichier | Contenu |
|------|---------|---------|
| `positionnement` | positionnement.json | Vision, promesse, role Jarvis |
| `icp` | icp.json | Profil ICP solopreneur 5-10k/mois |
| `offres` | offres.json | Offre Jarvis Start (79 EUR + 500 EUR setup) |
| `messaging` | messaging.json | 5 angles de messaging |
| `objections` | objections.json | 10 objections + reponses |
| `use_cases` | use_cases.json | 7 use cases |
| `pain_points` | pain_points.json | 4 familles de douleurs |

### 3.4 Format des blocs

```typescript
// lib/rag/context.ts:60-75
function formatBlocAsText(bloc: RagBloc): string {
  // Convertit le JSON en markdown :
  // ### {bloc.title}
  // **{section.heading}**
  // {section.content.join("\n")}
}
```

### 3.5 Verdict RAG

Le terme "RAG" est utilise de maniere abusive. C'est en realite un **systeme de knowledge injection statique** :
- **Tous les blocs mappes a l'agent sont TOUJOURS injectes** — pas de selection basee sur la query
- **Pas de retrieval** — c'est du chargement pur de fichiers JSON
- **Pas d'embeddings** — pas de notion de pertinence semantique
- **L'override DB** (user_rag_data) permet de personnaliser le contenu mais pas la selection

Cela fonctionne car le corpus est petit (7 blocs, ~8-12k tokens) et tient dans le contexte Claude. Mais ce n'est pas scalable si le corpus grandit.

---

## 4. DONNEES REELLEMENT DISPONIBLES — Analyse du Seed Data

### 4.1 Leads avec enrichissement (5/8 en seed)

**Lead enrichi typique (Sophie Martin)** :
```json
{
  "enrichment_data": {
    "company_size": "5-10",
    "revenue_range": "8k-12k/mois",
    "funding": "bootstrapped",
    "recent_posts": [
      "Comment j'ai automatise 80% de ma prospection",
      "Les outils IA qui changent la donne pour les solopreneurs"
    ],
    "interests": ["IA", "automatisation", "growth hacking"]
  }
}
```

**Lead non enrichi typique (Marie Lefebvre)** :
```json
{
  "enrichment_data": null
}
```

### 4.2 Matrice des champs — Seed Data (8 leads)

| Lead | title | company | score | stage | tags | notes | enrichment |
|------|-------|---------|-------|-------|------|-------|------------|
| Sophie Martin | CEO & Fondatrice | DigitalBoost | 85 | connected | [3] | Oui | Partiel |
| Thomas Durand | Fondateur | ConsultPro | 45 | in_sequence | [3] | Oui | Partiel |
| Marie Lefebvre | Coach Business | M.L. Coaching | 30 | to_invite | [2] | null | null |
| Pierre Moreau | CEO | TechVision | 90 | responded | [3] | Oui | Partiel |
| Camille Bernard | Dir. Marketing | GrowthLab | 60 | connected | [3] | Oui | Partiel |
| Lucas Petit | Freelance Dev | L.P. Dev | 20 | invited | [2] | Oui | null |
| Julie Roux | Fondatrice & CEO | EcoStartup | 75 | in_sequence | [3] | Oui | Partiel |
| Antoine Garcia | Consultant Senior | G.&A. | 55 | responded | [3] | Oui | Partiel |

### 4.3 PROBLEME CRITIQUE : Structure enrichment_data incoherente

Le seed stocke les donnees d'enrichissement dans un format **DIFFERENT** de ce que `buildLeadSections()` attend :

**Ce que le seed stocke** :
```json
{
  "company_size": "5-10",
  "revenue_range": "8k-12k/mois",
  "funding": "bootstrapped",
  "recent_posts": ["..."],
  "interests": ["..."]
}
```

**Ce que buildLeadSections() attend** (via `LeadForGeneration.enrichmentData`) :
```typescript
enrichmentData: {
  company: {           // <-- OBJET IMBRIQUE
    size: string,
    industry: string,
    funding: string,
    revenue: string,
    location: string,
    news: string[]
  },
  person: {            // <-- OBJET IMBRIQUE
    interests: string[],
    recentPosts: string[],
    anciennete_poste_mois: number
  },
  signal: {            // <-- OBJET IMBRIQUE
    type: string,
    detail: string,
    smartai_interaction: boolean
  }
}
```

**Consequence** : pour les leads seed, `lead.enrichmentData?.company` est `undefined` (la structure plate n'a pas de cle `company`), donc les sections Entreprise, Personne et Signal ne sont **JAMAIS** injectees dans le prompt pour les leads crees via le seed.

Pour les leads enrichis via `/api/ai/enrich`, la structure retournee par Perplexity est stockee via `enrichmentResult` qui suit le format JSON du prompt enrichissement. Ce format contient bien `company`, `person`, `signal` — donc ces leads reels fonctionnent correctement. Mais les leads seed ne profitent d'aucun enrichissement dans le prompt de generation.

---

## 5. GAP ANALYSIS — Attendu vs Injecte

### 5.1 Ce que le prompt system v4.3 attend

Le prompt documente explicitement le "runtime context exact" qu'il recoit (defaults.ts:50-90).

### 5.2 Matrice de conformite

| Champ attendu par le prompt | Source code | Statut | Commentaire |
|---|---|---|---|
| **## Lead** | | | |
| `firstName` | `lead.firstName` | OK | Toujours present (requis) |
| `lastName` | `lead.lastName` | OK | Toujours present (requis) |
| `title` | `lead.title \|\| "N/A"` | OK | Rempli sur 8/8 leads seed |
| `company` | `lead.company \|\| "N/A"` | OK | Rempli sur 8/8 leads seed |
| `linkedinUrl` | `lead.linkedinUrl` | OK | Toujours present (requis) |
| `score` | `lead.score ?? "N/A"` | OK | Rempli sur 8/8 leads seed |
| `status` | `lead.status \|\| "N/A"` | OK | Rempli sur 8/8 leads seed |
| `stage` | `lead.stage \|\| "N/A"` | OK | Rempli sur 8/8 leads seed |
| `tags` | `lead.tags?.join(", ") \|\| "N/A"` | OK | Rempli sur 8/8 leads seed |
| `notes` | `lead.notes \|\| "Aucune"` | OK | 6/8 rempli, 2 fallback "Aucune" |
| **## Entreprise** | | | |
| `company.size` | `enrichmentData.company.size` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `company.industry` | `enrichmentData.company.industry` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `company.revenue` | `enrichmentData.company.revenue` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `company.funding` | `enrichmentData.company.funding` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `company.location` | `enrichmentData.company.location` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `company.news[]` | `enrichmentData.company.news` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| **## Personne** | | | |
| `person.anciennete_poste_mois` | `enrichmentData.person.anciennete_poste_mois` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `person.interests[]` | `enrichmentData.person.interests` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `person.recentPosts[]` | `enrichmentData.person.recentPosts` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| **## Signal enrichissement** | | | |
| `signal.type` | `enrichmentData.signal.type` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `signal.detail` | `enrichmentData.signal.detail` | PARTIEL | Fonctionne post-enrich API, absent dans seed |
| `signal.smartai_interaction` | `enrichmentData.signal.smartai_interaction` | PARTIEL | Toujours `false` (V1 — non implemente) |
| **## Action** | | | |
| `actionType` | `actionType \|\| "message"` | OK | Passe par le cron ou l'API |
| `currentMessage` | Conditionnel (regeneration) | OK | Present uniquement en mode regen |
| `feedback` | Conditionnel (regeneration) | OK | Present uniquement en mode regen |

### 5.3 Synthese des gaps

| Categorie | Statut | Explication |
|---|---|---|
| **Donnees lead de base** (nom, titre, company, score, stage, tags, notes) | OK | Toujours injectes, fallback "N/A" propre |
| **Enrichissement structure** (company, person, signal) | PARTIEL | Fonctionne UNIQUEMENT pour les leads passes par `/api/ai/enrich`. Les leads importes via CSV ou crees manuellement n'ont pas la bonne structure `enrichment_data` |
| **Signal type/detail** | PARTIEL | Depend de l'enrichissement Perplexity. Le prompt attend 6 types (INBOUND, POST_DOULEUR, etc.) mais le type n'est correct que si Perplexity l'a classifie correctement |
| **smartai_interaction** | ABSENT | Toujours `false`. Le code l'indique : `"Interactions avec contenu Smart.AI : aucune (non disponible en V1)"` (enrich/route.ts) |
| **RAG / Knowledge base** | OK | 7 blocs toujours injectes. Pas de retrieval dynamique mais le corpus est petit et pertinent |
| **Engagement data** (hasAcceptedInvitation, responseCount...) | ABSENT | L'interface `EngagementData` existe dans lead-context.ts:58-64 mais n'est **jamais utilisee** par buildLeadContext(). Seul buildScoringContext() l'accepte en parametre, et meme la, il est ignore (`_engagement`) |
| **Conversation history** (messages precedents avec le lead) | ABSENT | Le prompt conversational l'utilise mais l'agent prospection ne recoit JAMAIS l'historique des messages. Le cron et la route generate ne chargent pas les conversations |

---

## 6. PROBLEMES IDENTIFIES ET RECOMMANDATIONS

### P1 — Seed data non exploitable par l'agent (CRITIQUE pour le dev/demo)

Le format `enrichment_data` du seed (structure plate) ne correspond pas au format attendu (structure imbriquee `company/person/signal`). Les leads seed n'auront jamais de sections Entreprise/Personne/Signal dans le prompt.

**Fix** : le script `seed-data.ts` a ete supprime. Les leads reels sont enrichis via l'API `/api/ai/enrich` qui produit directement le bon format imbrique.

### P2 — smartai_interaction jamais disponible

Le champ `smartai_interaction` est toujours `false`. Cela signifie que le template INBOUND (le plus fort signal) ne peut **jamais** etre declenche par les donnees reelles. Le seul moyen de l'activer est via un enrichissement manuel (modifier le JSON en base).

**Impact** : Le template INBOUND est du dead code fonctionnel en V1.

### P3 — Pas d'historique conversationnel dans le prompt prospection

L'agent prospection ne sait pas si un message a deja ete envoye au lead, ni quelle a ete la reponse. Seul le champ `stage` ("connected", "replied") et les `notes` donnent un indice indirect.

**Impact** : En stage `replied`, l'agent genere un message de relance sans connaitre la conversation precedente. Le resultat depend entierement des notes manuelles.

### P4 — Le RAG n'est pas un "vrai" RAG

Pas d'embeddings, pas de retrieval. Tous les 7 blocs sont injectes systematiquement (~8-12k tokens). Cela fonctionne car le corpus est petit, mais c'est un terme impropre qui peut creer de fausses attentes.

### P5 — EngagementData defini mais jamais injecte

L'interface `EngagementData` (lead-context.ts:58-64) avec `hasAcceptedInvitation`, `responseCount`, `profileVisitsReceived` n'est utilisee nulle part dans le pipeline de generation. Les donnees d'engagement ne sont pas disponibles pour l'agent.

---

*Diagnostic realise le 2026-03-07 par analyse statique du code source.*
