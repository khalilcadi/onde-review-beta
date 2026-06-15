# 02 — Système de prompts

> Comment les prompts sont structurés, chargés, personnalisés, et comment le RAG est injecté.

---

## Les 4 agents disponibles

| Agent ID | Usage | Prompt |
|----------|-------|--------|
| `prospection` | Génération messages LinkedIn | ~650 lignes, règles détaillées par type/score |
| `scoring` | Qualification lead 0-100 | ~140 lignes, 6 critères + malus |
| `enrichissement` | Recherche web via Perplexity | ~100 lignes, output JSON strict |
| `conversational` | Chat Cockpit (reporting pipeline) | ~170 lignes, reporting + recommandations |

Tous les prompts sont définis dans [`lib/ai/prompts/defaults.ts`](../../lib/ai/prompts/defaults.ts) — objet `PROMPTS_DEFAULTS`.

---

## Hiérarchie de résolution du prompt

```
buildSystemPrompt(agentId, userId?)
        │
        ▼
   getPrompt(agentId, userId?)
        │
        ├─ Si userId → cherche dans DB : user_prompts WHERE user_id = ? AND agent_id = ?
        │      ├─ Trouvé → retourne le contenu personnalisé
        │      └─ Non trouvé / erreur → continue
        │
        └─ Retourne PROMPTS_DEFAULTS[agentId]
        │
        ▼
   buildRagContext(agentId, userId?)
        │
        └─ Retourne string RAG formaté (voir section RAG ci-dessous)
        │
        ▼
   System prompt final = prompt agent + "\n\n" + RAG context
```

**Règle :** La DB a toujours priorité sur le code. Le bouton "Reset to default" dans `/settings/prompts` supprime l'entrée DB pour revenir au code.

---

## Système RAG (Retrieval-Augmented Generation)

Le RAG enrichit le system prompt avec une base de connaissances sur JARVIS.

### Les 14 blocs de connaissances

Fichiers JSON dans `knowledge/` :

| ID | Fichier | Contenu |
|----|---------|---------|
| `positionnement` | `positionnement.json` | Vision JARVIS, promesse, rôle |
| `icp` | `icp.json` | ICP solopreneur 5-10k€/mois |
| `offres` | `offres.json` | Offre JARVIS Start (79€/mois + 500€ setup) |
| `use_cases` | `use_cases.json` | 7 cas d'usage (pilotage, prospection...) |
| `objections` | `objections.json` | 10 objections + réponses |
| `regles_decisionnelles` | `regles_decisionnelles.json` | Moteur décisionnel |
| `pain_points` | `pain_points.json` | 4 familles de douleurs |
| `benchmark_marche` | `benchmark_marche.json` | Réalités marché solopreneurs |
| `benchmark_concurrents` | `benchmark_concurrents.json` | Concurrents (Zapier, Dust, Lemlist...) |
| `pricing` | `pricing.json` | Stratégie pricing |
| `messaging` | `messaging.json` | 5 angles de messaging |
| `operating_rules` | `operating_rules.json` | JOS (Jarvis Operating System) |
| `onboarding` | `onboarding.json` | Onboarding progressif |
| `architecture_core` | `architecture_core.json` | Méta-consolidation blocs 1-6 |

### Mapping blocs par agent

Défini dans [`lib/rag/mapping.ts`](../../lib/rag/mapping.ts) :

| Agent | Blocs RAG | Raison |
|-------|-----------|--------|
| `prospection` | positionnement, icp, offres, messaging, objections, use_cases, pain_points (7 blocs) | Personnalisation psycho (icp) + cibler les douleurs + angles de messaging |
| `scoring` | positionnement, icp, pain_points, regles_decisionnelles (4 blocs) | Matrice moment×énergie pour scoring intelligent |
| `enrichissement` | positionnement, icp (2 blocs) | Recherche factuelle, 2 blocs suffisent |
| `conversational` | **TOUS** (14 blocs) | Cockpit doit pouvoir répondre sur tout |

### Chargement et formatage

`buildRagContext(agentId, userId?)` dans [`lib/rag/context.ts`](../../lib/rag/context.ts) :

```
1. resolveAgentBlocs(agentId) → liste des bloc IDs
2. Si userId :
   → charger les overrides depuis user_rag_data (DB)
3. Pour chaque bloc (en parallèle) :
   → si override user → utiliser
   → sinon → charger knowledge/{blocId}.json (avec cache mémoire)
4. Formater chaque bloc en markdown :
   ### {bloc.title}
   **{section.heading}**
   {section.content...}
5. Joindre avec séparateurs :
   ---
   ## BASE DE CONNAISSANCES (RAG)
   [Bloc 1]
   ---
   [Bloc 2]
   ---
   Fin de la base de connaissances.
```

**Cache :** Les blocs sont mis en cache en mémoire (`Map`). Vidé au redémarrage du serveur ou via `clearRagCache()`.

---

## Personnalisation utilisateur

### Prompts personnalisés

Via l'UI `/settings/prompts` :
- L'utilisateur peut éditer le texte d'un prompt agent
- Sauvegardé dans `user_prompts` (DB) → prioritaire sur le code
- Bouton "Reset to default" → supprime l'entrée DB

### Blocs RAG personnalisés

Via l'UI `/settings/knowledge` :
- L'utilisateur peut éditer le contenu d'un bloc
- Sauvegardé dans `user_rag_data` (DB) → prioritaire sur le fichier JSON
- Bouton "Reset" → supprime l'entrée DB, revient au fichier JSON

---

## Format interne d'un bloc RAG

Structure TypeScript (`RagBloc`) :

```typescript
{
  title: string,           // Titre du bloc
  sections: Array<{
    heading: string,       // Sous-titre de section
    content: string[]      // Lignes de contenu
  }>
}
```

Exemple de rendu final dans le prompt :

```
### ICP — Profil client idéal

**Profil principal**
Solopreneur ou indépendant B2B
Génère 5-10k€/mois de CA
...

**Signaux d'achat**
Parle de saturation ou manque de temps
Lance ou vient de lancer son activité
...
```
