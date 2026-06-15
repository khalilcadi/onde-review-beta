# PROSPECTOR - Décisions Techniques

> Toutes les décisions d'architecture validées le 2026-02-09
> Ce document fait référence pour Claude Code

---

## 📋 CONTEXTE GLOBAL

- **Scope** : Outil interne uniquement, pour prospecter JARVIS
- **Users** : 3 utilisateurs (Khalil + 2 associés)
- **Objectif** : MVP fonctionnel qui envoie de vrais messages LinkedIn avec l'IA

---

## ✅ DÉCISIONS VALIDÉES

### 3.1 Architecture API : Hybride

| Type d'opération | Approche | Exemples |
|------------------|----------|----------|
| CRUD simple | Server Actions | Sauvegarder settings, éditer prompt, modifier lead |
| Opérations IA | Route Handlers | `/api/ai/generate`, `/api/ai/chat`, `/api/ai/suggest` |
| Webhooks | Route Handlers | `/api/webhooks/unipile` |
| Batch génération | Route Handler | Génération des 10 messages du matin avec prompt caching |

---

### 3.2 Stockage des clés API

| Service | Stockage | Chiffrement |
|---------|----------|-------------|
| **Unipile** | Env var Vercel | Non (1 compte partagé pour 3 LinkedIn) |
| **Claude** | DB par user | AES-256-GCM |
| **OpenAI** | DB par user | AES-256-GCM |
| **Perplexity** | DB par user | AES-256-GCM |

**Variables d'environnement requises :**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=                # Pour AES-256-GCM
UNIPILE_API_KEY=               # Compte partagé
```

---

### 3.3 Prompts : Defaults code + overrides DB

- **Prompts V3.2 complets** obligatoires (upgrader `lib/ai/prompts/defaults.ts`)
- Si user édite → sauvé en `user_prompts` (DB)
- Hiérarchie : `user_prompts[userId][agentId]` → `PROMPTS_DEFAULTS[agentId]` → `''`
- Bouton "Reset to default" → supprime l'override, revient au code

---

### 3.4 RAG : Hybride + mapping éditable (admin)

**Sources RAG :**
1. `RAG JSON/` (14 fichiers) = baseline dans le code
2. `user_rag_data` (DB) = overrides par user

**Éditabilité :**
- Interface Settings > Base de connaissances
- Liste des 14 blocs avec bouton [Éditer] chacun
- Admin only pour le mapping par agent

**Mapping par agent (défaut, éditable) :**

| Agent | Blocs RAG |
|-------|-----------|
| `prospection` (Message Writer) | positionnement, offres, messaging, objections, use_cases |
| `scoring` (Lead Scorer) | positionnement, personas, icp |
| `enrichissement` | positionnement, personas |
| `conversational` (Cockpit) | TOUS les blocs |

**Interface mapping (admin) :**
```
Settings > Mapping RAG (Admin only)

Agent: Message Writer
☑ Positionnement
☑ Offres
☑ Messaging
☐ Pricing
...
```

**Action requise :** Session dédiée pour définir le mapping initial avec Khalil

---

### 3.5 Versioning prompts : Non

- Pas de versioning pour 3 users internes
- "Reset to default" suffit
- Si besoin → copier dans un Google Doc avant d'éditer

---

### 3.6 Webhooks Unipile : Route Handler simple

- Route : `POST /api/webhooks/unipile`
- Volume faible (~150 webhooks/jour max)
- Pas besoin de queue
- Flow : recevoir → vérifier signature → upsert DB → notifier

---

### 3.7 Délais anti-détection LinkedIn

**Règles de délais minimum entre actions :**

| Enchaînement | Délai minimum | Raison |
|--------------|---------------|--------|
| Message → Message | 15 min | Protégé |
| Message → Visite | 15 min | Protégé |
| Message → Invitation | 15 min | Protégé |
| Visite → Message | 15 min | Protégé |
| Invitation → Message | 15 min | Protégé |
| **Visite → Invitation** | **1-3 min** | Naturel (tu visites puis tu invites) |
| **Invitation → Visite** | **1-3 min** | OK |
| **Visite → Visite** | **15 min** | Même type |

**Résumé :** Les messages sont toujours "protégés" (15 min avant/après). Visites et invitations peuvent s'enchaîner rapidement entre elles.

**Distribution sur la journée :**
- Non-uniforme (pas régulier)
- Exemple : 2 messages sur 1h, puis rien sur 3h, puis 2 messages, etc.
- Plage : 9h-19h (configurable)
- `scheduled_at` calculé au moment de la validation avec jitter aléatoire

**Implémentation :**
- Table `actions` avec champ `scheduled_at`
- Cron Vercel toutes les 1-2 min
- Check : `status = 'validated' AND scheduled_at <= NOW()`
- Respecter les règles de délais par type

---

### 3.8 Génération quotidienne : Cron 6h + manuel

- **Cron Vercel à 6h00** Europe/Paris → `/api/crons/generate-actions`
- Génération batch (10 messages d'un coup) avec **prompt caching** Claude/OpenAI
- Bouton "Régénérer" dans Daily Actions pour forcer manuellement
- **Choix modèle** : User peut choisir Claude ou OpenAI dans ses settings

---

### 3.9 Tracking séquence : Table sequence_leads

- `current_step` (int) : step actuel
- `status` : `active` | `paused` | `completed` | `replied` | `opted_out`
- Transitions gérées par le cron
- Si lead répond → `status = 'replied'` → sort automatiquement

---

### 3.10 Multi-user : Pool partagé + ownership strict

**Tous les leads visibles par tous, mais permissions strictes :**

| Action | Owner | Autres users |
|--------|-------|--------------|
| Voir dans Pipeline | ✅ | ✅ |
| Voir fiche détaillée | ✅ | ✅ |
| Éditer (notes, tags, statut) | ✅ | ❌ |
| Ajouter à séquence | ✅ | ❌ |
| Envoyer message | ✅ | ❌ |
| Valider action | ✅ | ❌ |
| Supprimer | ✅ | ❌ |
| Transférer ownership | ✅ | ❌ |

**Anti-doublon :** Si User 2 importe un lead déjà dans le pool → alerte "Ce lead est déjà géré par [User 1]"

**Colonne Pipeline :** Ajouter colonne "Owner" pour voir qui gère chaque lead

---

## 🔧 CHOIX MODÈLE IA

**Par user dans Settings :**
- Choix entre Claude et OpenAI pour la génération de messages
- Perplexity uniquement pour l'enrichissement (pas d'alternative)

**Modèles :**
| Usage | Claude | OpenAI |
|-------|--------|--------|
| Messages | claude-sonnet-4-5-20250929 | gpt-4o |
| Scoring | claude-haiku | gpt-4o-mini |

---

## 📦 ROUTES API EXISTANTES

### Structure des fichiers

```
app/api/
├── ai/
│   ├── generate/route.ts   (POST)
│   ├── chat/route.ts       (POST)
│   └── suggest/route.ts    (POST)
└── auth/
    └── callback/route.ts   (GET)
```

### Détail des routes

| Route | Méthode | Description | Status |
|-------|---------|-------------|--------|
| `/api/ai/generate` | POST | Génération messages LinkedIn | ✅ Fonctionnel |
| `/api/ai/chat` | POST | Chat Cockpit | ✅ Fonctionnel (contexte hardcodé) |
| `/api/ai/suggest` | POST | Suggestion réponse Inbox | ✅ Fonctionnel |
| `/api/auth/callback` | GET | OAuth callback Supabase | ✅ Fonctionnel |

### Implémentation

**`POST /api/ai/generate`** — Génération messages LinkedIn
- Reçoit `lead`, `actionType`, et optionnel `currentMessage`
- Détecte invitation (max 300 chars) vs message classique
- Détecte régénération (amélioration) vs nouvelle génération
- Utilise Claude Sonnet 4.5 avec le prompt `prospection` de `PROMPTS_DEFAULTS`
- Construit le contexte lead enrichi (company, signaux personne)
- Retourne le texte du message uniquement

**`POST /api/ai/chat`** — Chat Cockpit
- Reçoit `messages[]` (historique conversation)
- Utilise Claude Sonnet 4.5 avec le prompt `conversational` de `PROMPTS_DEFAULTS`
- Injecte un contexte pipeline hardcodé (leads, quotas, top leads chauds, séquences, team stats)
- Supporte la conversation multi-turn avec formatage markdown
- Retourne la réponse assistant

**`POST /api/ai/suggest`** — Suggestion réponse Inbox
- Reçoit `conversation` (avec historique messages) et `lead`
- Utilise Claude Sonnet 4.5 avec le prompt `prospection` de `PROMPTS_DEFAULTS`
- Reconstruit l'historique conversation en format naturel
- Applique le protocole réponse LinkedIn (remercier, répondre, proposer next step)
- Retourne le texte de la réponse suggérée uniquement

**`GET /api/auth/callback`** — OAuth callback
- Reçoit le code d'autorisation de Google OAuth
- Échange le code pour une session via `exchangeCodeForSession()`
- Succès → redirige vers `/` (dashboard)
- Échec → redirige vers `/login?error=auth_callback_failed`

**À faire (Session G) :** Refactorer les 3 routes IA pour utiliser `buildRagContext()` + service prompts au lieu du contexte hardcodé

---

## 🧠 STRUCTURE RAG (Implémentation)

### Base de connaissances : 14 blocs JSON

Tous les blocs suivent une structure standardisée :
```json
{
  "source_file": "document_source.docx",
  "bloc_id": "identifiant_unique",
  "title": "Titre lisible",
  "sections": [{ "heading": "...", "content": ["..."] }],
  "metadata": { "converted_at": "...", "total_sections": N, "total_paragraphs": N }
}
```

**Inventaire complet :**

| # | Fichier | bloc_id | Contenu |
|---|---------|---------|---------|
| 1 | `positionnement.json` | positionnement | Vision, promesse, rôle Jarvis (17 sections, 106 §) |
| 2 | `icp.json` | icp | ICP solopreneur 5-10k€ (32 sections, 127 §) |
| 3 | `offres.json` | offres | Offre Jarvis Start (79€ + 500€ setup) |
| 4 | `use_cases.json` | use_cases | 7 use cases solopreneurs |
| 5 | `objections.json` | objections | 10 objections + réponses contextuelles |
| 6 | `regles_decisionnelles.json` | regles_decisionnelles | Moteur décisionnel |
| 7 | `pain_points.json` | pain_points | 4 familles de douleurs |
| 8 | `benchmark_marche.json` | benchmark_marche | Réalités marché solopreneurs |
| 9 | `benchmark_concurrents.json` | benchmark_concurrents | Concurrents (Zapier, Dust, Lemlist...) |
| 10 | `pricing.json` | pricing | Stratégie pricing |
| 11 | `messaging.json` | messaging | 5 angles de messaging |
| 12 | `operating_rules.json` | operating_rules | JOS (Jarvis Operating System) |
| 13 | `onboarding.json` | onboarding | Onboarding progressif 4 phases |
| 14 | `architecture_core.json` | architecture_core | Méta-consolidation blocs 1-6 |

### Service RAG (`lib/rag/`)

```
lib/rag/
├── types.ts     → RagBloc, RagSection, RagDocument
├── mapping.ts   → RAG_BLOC_IDS, RAG_AGENT_MAPPING, resolveAgentBlocs()
└── context.ts   → buildRagContext(), clearRagCache(), listAvailableBlocs()
```

**Mapping par agent (implémenté dans `mapping.ts`) :**

| Agent | Blocs injectés |
|-------|---------------|
| `prospection` | positionnement, offres, messaging, objections, use_cases |
| `scoring` | positionnement, icp, pain_points |
| `enrichissement` | positionnement, icp |
| `conversational` | **TOUS** (14 blocs) |

**Fonctions principales :**
- `buildRagContext(agentId, userId?)` → string markdown prêt pour injection prompt
- `resolveAgentBlocs(agentId)` → `RagBlocId[]` pour un agent
- `clearRagCache()` → invalide le cache mémoire (Map)
- `listAvailableBlocs()` → `Array<{ id, title, sectionCount }>` pour l'UI Settings

**Cache :** In-memory (Map). Se vide au redémarrage serveur ou via `clearRagCache()`.

**État :** Les 3 routes IA n'utilisent pas encore `buildRagContext()` — contexte hardcodé. Le branchement est prévu en Session G.

---

## 🔐 AUTH (Implémentation)

### Flow complet

```
1. User accède à une route protégée
2. middleware.ts → updateSession() → supabase.auth.getUser()
3. Si pas de session → redirect /login
4. Si session valide → continue vers la page
```

### Routes publiques (pas de guard)
- `/login`, `/signup`
- `/api/webhooks/*`, `/api/auth/*`

### Login (email + password)
1. User entre email + password
2. `supabase.auth.signInWithPassword({ email, password })`
3. Succès → redirect `/` (dashboard)
4. Erreur → affiche message d'erreur

### Login (Google OAuth)
1. User clique "Continuer avec Google"
2. `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '/api/auth/callback' })`
3. Google consent screen → retour avec code
4. `/api/auth/callback` → `exchangeCodeForSession(code)`
5. Session stockée dans cookies → redirect `/`

### Signup
1. User entre : nom, email, mot de passe, confirmation
2. Validation client : 8+ chars, 1 majuscule, 1 chiffre, passwords match
3. `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
4. Succès → écran "Vérifiez votre email"
5. Trigger PostgreSQL `handle_new_user()` → crée automatiquement le row `profiles`

### Clients Supabase
- **Browser** (`lib/supabase/client.ts`) : `createBrowserClient()` avec anon key
- **Server** (`lib/supabase/server.ts`) : `createServerClient()` avec cookie adapter
- **Middleware** (`lib/supabase/middleware.ts`) : refresh session + auth guard

### Seed users (3 utilisateurs internes)
Script : `npx tsx scripts/seed-users.ts`

| Email | Password | Nom |
|-------|----------|-----|
| `khalil@prospector.app` | `Prospector2026!` | Khalil |
| `associe1@prospector.app` | `Prospector2026!` | Associé 1 |
| `associe2@prospector.app` | `Prospector2026!` | Associé 2 |

Créés via `supabase.auth.admin.createUser()` (service role), `email_confirm: true` pour skip vérification.

---

## 🗄 TABLES SUPABASE (15 tables confirmées)

Migration : `supabase/migrations/001_initial_schema.sql`

### Tables utilisateur

| Table | PK | Description |
|-------|----|-------------|
| `profiles` | `id` (FK auth.users) | Nom, avatar. Auto-créé par trigger `handle_new_user()` |
| `user_api_keys` | `user_id` (FK auth.users) | Clés Claude/OpenAI/Perplexity chiffrées AES-256-GCM |
| `user_settings` | `user_id` (FK auth.users) | Settings JSONB (quotas, horaires, modèle IA) |
| `user_prompts` | `id` UUID | Override prompts par user+agent. UNIQUE(user_id, agent_id) |
| `user_rag_data` | `id` UUID | Override RAG par user+data_type. UNIQUE(user_id, data_type) |

### Tables LinkedIn

| Table | PK | Description |
|-------|----|-------------|
| `linkedin_accounts` | `id` UUID | Comptes LinkedIn connectés via Unipile Hosted Auth |

### Tables leads & listes

| Table | PK | Description |
|-------|----|-------------|
| `leads` | `id` UUID | Prospects : nom, titre, company, linkedin_url, score 0-100, status, stage, tags[], enrichment_data JSONB |
| `lists` | `id` UUID | Listes de leads (ex: "Solopreneurs France 2026") |
| `list_leads` | `(list_id, lead_id)` | Junction table many-to-many |

### Tables séquences

| Table | PK | Description |
|-------|----|-------------|
| `sequences` | `id` UUID | Séquences multi-step (nom, persona, status, stats JSONB) |
| `sequence_steps` | `id` UUID | Steps dans une séquence (type, delay, template, condition, order) |
| `sequence_leads` | `id` UUID | Tracking lead dans séquence (current_step, status) |

### Tables actions & conversations

| Table | PK | Description |
|-------|----|-------------|
| `actions` | `id` UUID | Actions quotidiennes : type, status, generated_message, final_message, scheduled_at, sent_at |
| `conversations` | `id` UUID | Threads LinkedIn (channel, unipile_chat_id, status) |
| `messages` | `id` UUID | Messages individuels (direction, content, attachments, timestamp) |

### RLS (Row Level Security)

| Table | SELECT | INSERT/UPDATE/DELETE |
|-------|--------|---------------------|
| `profiles` | Tous les users authentifiés | Owner uniquement |
| `user_api_keys` | Owner uniquement | Owner uniquement |
| `user_settings` | Owner uniquement | Owner uniquement |
| `user_prompts` | Owner uniquement | Owner uniquement |
| `user_rag_data` | Owner uniquement | Owner uniquement |
| `linkedin_accounts` | Owner uniquement | Owner uniquement |
| **`leads`** | **Tous les users** (pool partagé) | **Owner uniquement** |
| `lists` | Owner uniquement | Owner uniquement |
| `list_leads` | Owner de la liste | Owner de la liste |
| `sequences` | Owner uniquement | Owner uniquement |
| `sequence_steps` | Owner de la séquence | Owner de la séquence |
| `sequence_leads` | Owner de la séquence | Owner de la séquence |
| `actions` | Owner uniquement | Owner uniquement |
| `conversations` | Owner uniquement | Owner uniquement |
| `messages` | Owner de la conversation | Owner de la conversation |

### Index

| Table | Index | Colonnes |
|-------|-------|----------|
| `leads` | `idx_leads_user` | `user_id` |
| `leads` | `idx_leads_status` | `status` |
| `leads` | `idx_leads_score` | `score DESC` |
| `leads` | `idx_leads_linkedin_url` | `linkedin_url` |
| `actions` | `idx_actions_user_status` | `(user_id, status)` |
| `actions` | `idx_actions_scheduled` | `scheduled_at` WHERE validated |
| `actions` | `idx_actions_lead` | `lead_id` |
| `conversations` | `idx_conversations_user` | `user_id` |
| `conversations` | `idx_conversations_status` | `status` |
| `messages` | `idx_messages_conversation` | `conversation_id` |
| `sequence_leads` | `idx_sequence_leads_status` | `status` |
| `sequence_leads` | `idx_sequence_leads_sequence` | `sequence_id` |
| `sequence_steps` | `idx_sequence_steps_order` | `(sequence_id, step_order)` |

### Triggers auto

| Table | Trigger | Action |
|-------|---------|--------|
| `auth.users` | `on_auth_user_created` | `handle_new_user()` → crée row `profiles` |
| `user_api_keys` | `set_updated_at` | Met à jour `updated_at` |
| `user_settings` | `set_updated_at` | Met à jour `updated_at` |
| `user_prompts` | `set_updated_at` | Met à jour `updated_at` |
| `user_rag_data` | `set_updated_at` | Met à jour `updated_at` |
| `leads` | `set_updated_at` | Met à jour `updated_at` |
| `conversations` | `set_updated_at` | Met à jour `updated_at` |

---

## 📋 PHASES DE DÉVELOPPEMENT

### Parallélisable (4 sessions simultanées possibles)

| Session | Scope | Fichiers | Dépendances |
|---------|-------|----------|-------------|
| A | Supabase setup | `supabase/`, `types/database.ts` | Aucune |
| B | Chiffrement AES | `lib/crypto.ts` | Aucune |
| C | Prompts V3.2 | `lib/ai/prompts/defaults.ts` | Aucune |
| D | Service RAG | `lib/rag/` | Aucune |

### Séquentiel (après les sessions parallèles)

| Session | Scope | Dépendances |
|---------|-------|-------------|
| E | Auth réelle | A (Supabase) |
| F | CRUD Supabase | A + E |
| G | Refactor routes IA | C + D |
| H | Unipile | F |
| I | Crons | F + G + H |

---

*Document validé le 2026-02-09*
*Référence pour toutes les sessions Claude Code*
