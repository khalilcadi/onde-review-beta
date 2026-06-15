# Brainstorm Agents IA — Documentation de référence

> Documentation interne pour préparer le brainstorm sur les prompts des agents **prospection** et **enrichissement** de Prospector.

---

## Sommaire

| Fichier | Contenu |
|---------|---------|
| [01-architecture.md](./01-architecture.md) | Service IA unifié, providers, prompt caching, usage tracking |
| [02-systeme-prompts.md](./02-systeme-prompts.md) | Hiérarchie des prompts, système RAG, overrides utilisateur |
| [03-anatomie-appel-api.md](./03-anatomie-appel-api.md) | Composition exacte d'un appel API (prompt + RAG + contexte lead) |
| [04-agent-prospection.md](./04-agent-prospection.md) | Deep dive agent prospection — rôle, règles, output, données reçues |
| [05-agent-enrichissement.md](./05-agent-enrichissement.md) | Deep dive agent enrichissement — rôle, règles, output JSON |
| [06-user-flows.md](./06-user-flows.md) | Tous les flows utilisateurs qui déclenchent ces agents |

---

## Vue d'ensemble en 5 lignes

Prospector utilise 2 agents IA principaux pour la prospection commerciale LinkedIn :

1. **Agent prospection** — génère des messages LinkedIn personnalisés (invitations, messages, relances) à partir du profil du lead, de ses données d'enrichissement, et d'une base de connaissances sur JARVIS.
2. **Agent enrichissement** — utilise Perplexity (recherche web) pour structurer les données publiques d'un lead (entreprise + personne) dans un JSON normalisé, qui nourrit ensuite l'agent prospection.

Les deux agents s'appuient sur un **service IA unifié** (`lib/ai/service.ts`) qui gère multi-provider (Claude, OpenAI, Perplexity), prompt caching, usage tracking, et clés API chiffrées par user.

---

## Diagramme d'architecture globale

```
                        ┌─────────────────────────────────────────┐
                        │           PROSPECTOR SYSTEM              │
                        └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                        ENTRÉES (déclencheurs)                        │
  │                                                                       │
  │  [Cron 6h00]          [Daily Actions UI]         [Fiche lead UI]     │
  │  generate-actions      Régénérer message          Bouton "Enrichir"  │
  │        │                      │                         │            │
  └────────┼──────────────────────┼─────────────────────────┼────────────┘
           │                      │                         │
           ▼                      ▼                         ▼
  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
  │   /api/crons/   │   │  /api/ai/generate │   │   /api/ai/enrich     │
  │ generate-actions│   │  (POST)           │   │   (POST)             │
  └────────┬────────┘   └────────┬─────────┘   └──────────┬───────────┘
           │                     │                          │
           └──────────┬──────────┘                         │
                      │ agent: "prospection"                │ agent: "enrichissement"
                      ▼                                     ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │                    callAI() — lib/ai/service.ts                    │
  │                                                                     │
  │   1. getUserAIConfig() → provider, model, apiKey (décrypté)        │
  │   2. buildSystemPrompt() → prompt agent + blocs RAG                │
  │   3. Appel API (Anthropic / OpenAI / Perplexity)                   │
  │   4. logUsage() → table ai_usage                                   │
  └───────────────────────────────────────────────────────────────────┘
                      │                         │
                      ▼                         ▼
           ┌──────────────────┐      ┌──────────────────────┐
           │  Texte brut      │      │  JSON enrichissement  │
           │  (message        │      │  → leads.enrichment_ │
           │   LinkedIn)      │      │    data (DB)          │
           └──────────────────┘      └──────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                        SYSTEM PROMPT (Claude)                        │
  │                                                                       │
  │  ┌──────────────────────────────┐  ┌─────────────────────────────┐  │
  │  │  Prompt agent (texte statique│  │  Blocs RAG (knowledge/*.json│  │
  │  │  ~650 lignes prospection ou  │  │  7 blocs pour prospection,  │  │
  │  │  ~100 lignes enrichissement) │  │  2 blocs pour enrichissement│  │
  │  │  ← DB user_prompts ou code   │  │  ← filesystem + cache       │  │
  │  └──────────────────────────────┘  └─────────────────────────────┘  │
  │  ════════════ CACHÉS (cache_control: ephemeral sur Claude) ════════  │
  │                                                                       │
  │  ┌───────────────────────────────────────────────────────────────┐  │
  │  │  Runtime context (dynamique, non caché)                        │  │
  │  │  ## Lead : nom, titre, entreprise, score, stage, tags, notes   │  │
  │  │  ## Entreprise : taille, secteur, CA, news (si enrichi)        │  │
  │  │  ## Personne : intérêts, posts récents (si enrichi)            │  │
  │  │  ## Action : type (invitation/message/etc.)                    │  │
  │  └───────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Fichiers source clés

| Rôle | Fichier |
|------|---------|
| Prompts des 4 agents | `lib/ai/prompts/defaults.ts` |
| Chargement prompt (DB → code) | `lib/ai/prompts/service.ts` |
| Service IA unifié | `lib/ai/service.ts` |
| Builders contexte lead | `lib/ai/lead-context.ts` |
| Mapping blocs RAG par agent | `lib/rag/mapping.ts` |
| Chargement et formatage RAG | `lib/rag/context.ts` |
| Route génération messages | `app/api/ai/generate/route.ts` |
| Route enrichissement | `app/api/ai/enrich/route.ts` |
| Cron 6h00 (génération auto) | `app/api/crons/generate-actions/route.ts` |
