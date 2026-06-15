# 01 — Architecture du service IA

> Comment le service IA est construit, quels providers sont supportés, comment fonctionne le prompt caching, et comment les appels sont tracés.

---

## Service unifié : `callAI()`

Toutes les routes IA passent par une seule fonction : `callAI()` dans [`lib/ai/service.ts`](../../lib/ai/service.ts).

Cette fonction est le point d'entrée unique pour tout appel IA dans Prospector. Elle gère :
- La résolution du provider et du modèle (selon les settings user)
- La récupération et décryptage de la clé API
- La construction du system prompt (prompt agent + RAG)
- L'appel à l'API externe (Anthropic, OpenAI, ou Perplexity)
- Le logging de l'usage en base

```
callAI({
  userId,           // pour charger les settings et la clé API
  agentId,          // "prospection" | "scoring" | "enrichissement" | "conversational"
  runtimeContext,   // données dynamiques (lead, pipeline...) — string formatée
  messages,         // [{ role: "user", content: "..." }]
  maxTokens?,       // défaut selon l'agent
  temperature?,     // override de la temp user settings
  metadata?,        // pour le logging (lead_id, action_id, action_type...)
  supabaseOverride? // client Supabase alternatif (utilisé par les crons)
})
→ Promise<AIResponse>
```

`AIResponse` retourne : `{ text: string, usage: { inputTokens, outputTokens, cachedTokens, estimatedCostUsd } }`

---

## Providers supportés

| Provider | SDK | Modèles | Usage dans Prospector |
|----------|-----|---------|----------------------|
| **Anthropic (Claude)** | `@anthropic-ai/sdk` | Opus 4.6, Sonnet 4.6, Haiku 4.5 | Génération messages, scoring, chat cockpit |
| **OpenAI** | `openai` | GPT-5.2, GPT-5, GPT-5 Mini, GPT-4o, GPT-4o Mini | Alternative pour tous les agents |
| **Perplexity** | `openai` (baseURL custom) | sonar-pro, sonar | Enrichissement (web search) — toujours utilisé pour l'agent enrichissement |

Le provider et le modèle sont configurables par utilisateur dans `/settings/api-keys`. Les clés API sont stockées chiffrées en DB (`user_api_keys`, AES-256-GCM).

**Exception enrichissement :** L'agent `enrichissement` appelle toujours `callPerplexity()` (wrapper de `callAI` avec provider forcé à Perplexity), quel que soit le provider configuré par l'user.

---

## Configuration utilisateur (`getUserAIConfig`)

Au début de chaque appel, la config user est résolue :

```
1. Charger user_settings.settings JSON depuis DB
   → extraire : ai_provider, ai_model, temperature
   → fallback : DEFAULT_SETTINGS (claude-sonnet-4-6, temp 0.7)

2. Décrypter la clé API depuis user_api_keys
   → type "claude" ou "openai" selon le provider
   → fallback env var ANTHROPIC_API_KEY (dev uniquement)

3. Si aucune clé trouvée → throw Error
```

---

## Prompt caching (Claude uniquement)

Claude supporte le **prompt caching** via `cache_control: ephemeral`. Prospector l'utilise pour réduire les coûts sur les appels batch (cron 6h00).

### Principe

Le system prompt est divisé en 2 blocs :

```
Bloc 1 (CACHÉ) :
  texte statique = prompt agent (~650 tokens) + blocs RAG (~1500 tokens)
  → marqué cache_control: { type: "ephemeral" }
  → reusable pendant ~5 minutes sur le même modèle

Bloc 2 (NON CACHÉ) :
  runtimeContext = données du lead (change à chaque appel)
  → jamais caché
```

### Impact en pratique

Sur le cron 6h00 qui génère 20-30 actions en batch :
- Premier appel : 2150 tokens input → facturés en plein
- Appels suivants (même 5min) : 2150 tokens → lus depuis le cache (~10x moins cher)

Pour OpenAI : le basePrompt et le runtimeContext sont concaténés en un seul string (pas de séparation explicite). Le caching OpenAI est automatique (côté serveur OpenAI).

---

## Usage tracking

Chaque appel `callAI()` loggue automatiquement dans la table `ai_usage` (fire & forget, erreurs silencieuses) :

```sql
ai_usage {
  user_id,
  agent_id,          -- "prospection", "enrichissement", etc.
  provider,          -- "anthropic", "openai", "perplexity"
  model,             -- "claude-sonnet-4-6", "gpt-4o", etc.
  input_tokens,
  output_tokens,
  cached_tokens,     -- tokens lus depuis le cache (économisés)
  estimated_cost_usd,
  input_text,        -- runtimeContext + messages user (PAS le system prompt)
  output_text,       -- réponse complète de l'IA
  metadata           -- { lead_id?, action_id?, action_type?, ... }
}
```

L'interface de suivi est accessible dans `/settings/usage` : KPIs globaux + breakdowns par agent et par modèle.

---

## Coût estimé par agent

Calculé via `estimateCost()` depuis [`lib/ai/models.ts`](../../lib/ai/models.ts) :

| Agent | Tokens typiques | Coût estimé / appel (Sonnet) |
|-------|-----------------|------------------------------|
| Prospection | ~2200 in / ~80 out | ~$0.003 (ou ~$0.0003 si caché) |
| Enrichissement | ~1500 in / ~500 out | ~$0.005 (Perplexity sonar-pro) |
| Scoring | ~1800 in / ~200 out | ~$0.003 |
| Conversational | ~3500 in / ~400 out | ~$0.006 |

---

## Sécurité

- Clés API : chiffrées AES-256-GCM dans `user_api_keys` (voir `lib/crypto.ts`)
- Clé de chiffrement : env var `ENCRYPTION_KEY` (32 bytes = 64 hex chars)
- Format stocké : `iv:authTag:ciphertext` (base64)
- Crons : client Supabase `service_role` (bypass RLS) via `supabaseOverride`
- Routes API : client Supabase `server` (vérifie session cookie)
