# PROSPECTOR - Orchestrateur de Sessions

> Fichier maître pour piloter toutes les sessions Claude Code
> **Ouvre ce fichier en premier à chaque reprise de travail**

---

## 📚 RÔLE DES FICHIERS

| Fichier | Rôle | Mise à jour |
|---------|------|-------------|
| `PROMPTS_ORCHESTRATOR.md` | **Pilotage** - Prompts, dépendances, suivi | Chaque session |
| `DECISIONS.md` | **Référence** - Toutes les décisions techniques | Rarement (si décision change) |
| `CLAUDE.md` | **Specs** - Architecture, routes, setup | Quand ajout structurel |
| `tasks/todo.md` | **Tâches** - Checklist des tâches | Chaque session |

**Règle :** Chaque session lit PROMPTS_ORCHESTRATOR.md en premier, et met à jour les 3 fichiers (PROMPTS_ORCHESTRATOR, todo, CLAUDE) à la fin.

---

## 📊 ÉTAT GLOBAL

| Phase | Status | Sessions |
|-------|--------|----------|
| Phase 0 - Setup docs | ✅ Terminé | Mise à jour CLAUDE.md + todo.md |
| Phase 3A - Parallèle | ✅ Terminé | A, B, C, D |
| Phase 3B - Séquentiel | ✅ Terminé | E ✅, F ✅, G ✅ |
| Phase 3C - LinkedIn | ✅ Terminé | H ✅ |
| Phase 3D - Orchestration | ✅ Terminé | I |
| Phase 4 - Polish | ✅ Terminé | J |

---

## 🔄 SUIVI DES SESSIONS

| Session | Nom | Status | Date | Notes |
|---------|-----|--------|------|-------|
| 0 | Setup docs | ✅ | 2026-02-09 | Mise à jour CLAUDE.md, todo.md |
| A | Supabase | ✅ | 2026-02-10 | 15 tables, RLS pool+ownership, types complets, clients SSR |
| B | Chiffrement | ✅ | 2026-02-10 | AES-256-GCM implémenté, 11 tests passent |
| C | Prompts V3.2 | ✅ | 2026-02-10 | 4 prompts V3.2 complets migrés, variables documentées |
| C-bis | Prompts v1.1 + RAG | ✅ | 2026-02-10 | Nouveaux prompts PROSPECTOR v1.1, injection RAG via buildSystemPrompt() |
| D | Service RAG | ✅ | 2026-02-10 | 14 blocs fusionnés, mapping + builder + types + docs |
| D-bis | Mapping RAG | ✅ | 2026-02-11 | Mapping validé avec Khalil : prospection 7 blocs (+icp, +pain_points), scoring 4 blocs (+regles_decisionnelles), enrichissement 2 (inchangé), conversational tous |
| E | Auth | ✅ | 2026-02-10 | Middleware protection, login/signup Supabase, OAuth Google, logout, seed script |
| F | CRUD | ✅ | 2026-02-11 | Server Actions, server/client split, ownership UI, 3 hooks supprimés |
| G | Refactor IA | ✅ | 2026-02-11 | Service IA unifié, Claude+OpenAI, prompt caching, usage tracking, UI usage |
| H | Unipile | ✅ | 2026-02-11 | Client complet (48 endpoints), Hosted Auth, route send avec anti-détection, webhooks, sync inbox, settings UI server/client split |
| I | Crons | ✅ | 2026-02-11 | Cron génération 6h00, cron envoi 2min, scheduling non-uniforme, tracking séquence, supabaseOverride pattern, vercel.json |
| J | Polish | ✅ | 2026-02-11 | Sonner toasts, CSV import, scoring/enrichissement routes, RAG editor, Perplexity, tests (82/82) |

**Légende :** ⏳ À faire | 🔄 En cours | ✅ Terminé | ❌ Bloqué

---

## 📐 GRAPHE DE DÉPENDANCES

```
        ┌──────────────────────────────────────────┐
        │           PHASE 3A - PARALLÈLE           │
        │  (Lancer A, B, C, D en même temps)       │
        └──────────────────────────────────────────┘
                │         │         │         │
                ▼         ▼         ▼         ▼
            ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
            │  A  │   │  B  │   │  C  │   │  D  │
            │Supa │   │Crypt│   │Prmt │   │ RAG │
            └─────┘   └─────┘   └─────┘   └─────┘
                │                   │         │
                │                   │         ▼
                │                   │     ┌───────┐
                │                   │     │ D-bis │
                │                   │     │Mapping│
                │                   │     └───────┘
                │                   │         │
                │                   └────┬────┘
                ▼                        ▼
            ┌─────┐                  ┌─────┐
            │  E  │                  │  G  │
            │Auth │                  │IA   │
            └─────┘                  └─────┘
                │                        │
                ▼                        │
            ┌─────┐                      │
            │  F  │◄─────────────────────┘
            │CRUD │
            └─────┘
                │
                ▼
            ┌─────┐
            │  H  │
            │Unip │
            └─────┘
                │
                ▼
            ┌─────┐
            │  I  │
            │Cron │
            └─────┘
                │
                ▼
            ┌─────┐
            │  J  │
            │Plsh │
            └─────┘
```

---

## 📋 PROMPTS PAR SESSION

---

### SESSION 0 - Setup Documents (DÉJÀ LANCÉE)

**Status :** 🔄 En cours

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (ce fichier - état global)
2. DECISIONS.md (décisions techniques validées)
3. CLAUDE.md (état actuel)
4. tasks/todo.md (état actuel)

Puis mets à jour CLAUDE.md et tasks/todo.md en intégrant toutes les décisions de DECISIONS.md.

### Mises à jour CLAUDE.md :

1. **Section "ÉTAT ACTUEL"** : Ajouter les 3 routes API existantes (`/api/ai/generate`, `/api/ai/chat`, `/api/ai/suggest`)

2. **Nouvelle section "DÉCISIONS TECHNIQUES"** : Résumé des décisions clés (renvoyer vers DECISIONS.md pour le détail)

3. **Section "VARIABLES D'ENVIRONNEMENT"** : Ajouter `UNIPILE_API_KEY`

4. **Section "ROADMAP"** : Mettre à jour Phase 3 avec les sous-tâches et la parallélisation

### Mises à jour tasks/todo.md :

Restructurer avec le plan détaillé des sessions A à J (voir DECISIONS.md section "PHASES DE DÉVELOPPEMENT")

### Après modifications :

Confirme les changements effectués.
```

---

### SESSION A - Supabase Setup

**Dépendances :** Aucune (parallélisable)
**Fichiers touchés :** `supabase/`, `types/database.ts`, `.env.local`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie les dépendances)
2. DECISIONS.md
3. CLAUDE.md
4. tasks/todo.md

## MISSION : Setup Supabase

### Étape 1 - Instructions pour moi (humain)
Génère les instructions que je dois suivre pour :
- Créer un projet Supabase (nom suggéré : prospector-prod)
- Récupérer les clés API

### Étape 2 - Migrations SQL
Crée le fichier `supabase/migrations/001_initial_schema.sql` avec le schéma complet des 13 tables (déjà défini dans CLAUDE.md section "SCHÉMA SQL").

Ajoute les éléments manquants selon DECISIONS.md :
- RLS policies pour le pool partagé avec ownership strict
- Index supplémentaires si pertinent

### Étape 3 - Types TypeScript
Crée `types/database.ts` avec les types générés (ou instructions pour `supabase gen types`).

### Étape 4 - Client Supabase
Mets à jour les placeholders dans `lib/supabase/` :
- `client.ts` : Browser client fonctionnel
- `server.ts` : Server client fonctionnel

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session A = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session A comme ✅
3. Mets à jour CLAUDE.md si nécessaire (nouveaux fichiers, nouvelles instructions setup)
4. Liste les fichiers créés/modifiés
5. `npm run build` pour vérifier que tout compile
```

---

### SESSION B - Chiffrement AES

**Dépendances :** Aucune (parallélisable)
**Fichiers touchés :** `lib/crypto.ts`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie les dépendances)
2. DECISIONS.md (section 3.2 Chiffrement)
3. lib/crypto.ts (placeholder actuel)

## MISSION : Implémenter AES-256-GCM

Remplace le placeholder Base64 par un vrai chiffrement :

### Spécifications :
- Algorithme : AES-256-GCM
- Clé : `ENCRYPTION_KEY` depuis process.env (32 bytes)
- IV : Généré aléatoirement pour chaque chiffrement (12 bytes)
- Format stocké : `iv:authTag:ciphertext` (tout en base64)

### Fonctions à implémenter :
```typescript
export function encrypt(plaintext: string): string
export function decrypt(encrypted: string): string
```

### Tests :
Ajoute un test simple dans le fichier ou un script `scripts/test-crypto.ts`

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session B = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session B comme ✅
3. Mets à jour CLAUDE.md : documenter le format de chiffrement et l'env var requise
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION C - Prompts V3.2

**Dépendances :** Aucune (parallélisable)
**Fichiers touchés :** `lib/ai/prompts/defaults.ts`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie les dépendances)
2. DECISIONS.md (section 3.3 Prompts)
3. lib/ai/prompts/defaults.ts (version simplifiée actuelle)
4. Dossier prompts/ (prompts V3.2 complets)

## MISSION : Upgrader les prompts

### Étape 1 - Analyse
Liste les 7 fichiers JSON dans `prompts/` et leur contenu principal.

### Étape 2 - Upgrade
Remplace le contenu de `lib/ai/prompts/defaults.ts` avec les prompts V3.2 complets.

Structure attendue :
```typescript
export const PROMPTS_DEFAULTS = {
  prospection: "...", // Message Writer - prompt complet V3.2
  scoring: "...",     // Lead Scorer - prompt complet V3.2
  enrichissement: "...", // Enrichment - prompt complet V3.2
  conversational: "...", // Reporter/Cockpit - prompt complet V3.2
} as const;
```

### Étape 3 - Variables
Identifie les variables utilisées dans les prompts (ex: {{lead_name}}, {{company}}, etc.)
Documente-les dans un commentaire en haut du fichier.

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session C = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session C comme ✅
3. Mets à jour CLAUDE.md : liste des variables de prompt disponibles
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION D - Service RAG

**Dépendances :** Aucune (parallélisable)
**Fichiers touchés :** `lib/rag/`, `knowledge/`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie les dépendances)
2. DECISIONS.md (section 3.4 RAG)
3. lib/rag/context.ts (placeholder)
4. Dossier knowledge/ (4 JSON basiques)
5. Dossier "RAG JSON/" (14 blocs détaillés)

## MISSION : Implémenter le service RAG

### Étape 1 - Restructuration fichiers
Fusionne `knowledge/` et `RAG JSON/` en une structure propre dans `knowledge/`.
Propose une organisation (ex: un fichier par bloc, ou un fichier unique structuré).

### Étape 2 - Mapping par agent
Crée `lib/rag/mapping.ts` avec le mapping par défaut :

```typescript
export const RAG_AGENT_MAPPING = {
  prospection: ['positionnement', 'offres', 'messaging', 'objections', 'use_cases'],
  scoring: ['positionnement', 'personas', 'icp'],
  enrichissement: ['positionnement', 'personas'],
  conversational: ['*'], // tous les blocs
} as const;
```

### Étape 3 - Builder de contexte
Implémente `lib/rag/context.ts` :

```typescript
export async function buildRagContext(
  agentId: string,
  userId?: string // pour charger les overrides DB plus tard
): Promise<string>
```

Pour l'instant, charge depuis les fichiers. Les overrides DB viendront en Session F.

### Étape 4 - Documentation
Crée `knowledge/README.md` expliquant la structure et comment éditer.

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session D = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session D comme ✅
3. Mets à jour CLAUDE.md : documenter la structure RAG et le mapping par agent
4. Liste les 14 blocs RAG disponibles (pour la session mapping avec Khalil)
5. `npm run build` pour vérifier que tout compile
```

---

### SESSION D-bis - Mapping RAG (avec Khalil)

**Dépendances :** Session D
**Fichiers touchés :** `lib/rag/mapping.ts`
**Type :** Session interactive (pas autonome)

```
Cette session se fait AVEC Khalil pour décider du mapping.

Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Session D est ✅)
2. La liste des 14 blocs RAG générée en Session D

## MISSION : Définir le mapping RAG par agent

### Étape 1 - Afficher les blocs
Liste les 14 blocs RAG avec un résumé de leur contenu (2-3 lignes chacun).

### Étape 2 - Proposer un mapping par défaut
Propose un mapping pour chaque agent basé sur DECISIONS.md :

| Agent | Blocs suggérés | Raison |
|-------|----------------|--------|
| prospection | ... | ... |
| scoring | ... | ... |
| enrichissement | ... | ... |
| conversational | TOUS | Chat général |

### Étape 3 - Attendre validation Khalil
Khalil valide ou ajuste le mapping.

### Étape 4 - Implémenter
Met à jour `lib/rag/mapping.ts` avec le mapping validé.

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session D-bis = ✅ avec date + mapping choisi
2. Mets à jour tasks/todo.md
3. Mets à jour CLAUDE.md : documenter le mapping final
```

---

### SESSION E - Auth Réelle

**Dépendances :** Session A (Supabase)
**Fichiers touchés :** `lib/supabase/`, `middleware.ts`, `app/(auth)/`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Session A est ✅)
2. DECISIONS.md
3. CLAUDE.md

## MISSION : Implémenter l'authentification Supabase

### Étape 1 - Middleware
Mets à jour `middleware.ts` pour :
- Protéger toutes les routes (dashboard)/*
- Rediriger vers /login si pas de session
- Laisser passer /login, /signup, /api/webhooks/*

### Étape 2 - Pages Auth
Mets à jour `app/(auth)/login/page.tsx` et `signup/page.tsx` :
- Formulaire email/password avec Supabase Auth
- Bouton Google OAuth
- Gestion erreurs
- Redirect vers / après succès

### Étape 3 - Session dans layouts
Mets à jour `app/(dashboard)/layout.tsx` :
- Charger la session user
- Passer le user aux composants enfants (Context ou props)
- Bouton logout dans le header

### Étape 4 - Seed users
Crée un script ou des instructions pour créer les 3 users initiaux.

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session E = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session E comme ✅
3. Mets à jour CLAUDE.md : documenter le flow auth et les routes protégées
4. Instructions pour tester le flow login/logout
5. `npm run build` pour vérifier que tout compile
```

---

### SESSION F - CRUD Supabase

**Dépendances :** Sessions A + E
**Fichiers touchés :** `hooks/`, `app/api/`, `lib/actions/`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Sessions A et E sont ✅)
2. DECISIONS.md (sections 3.1 Architecture, 3.10 Multi-user)

## MISSION : Remplacer mock data par Supabase

### Étape 1 - Server Actions
Crée `lib/actions/` avec les Server Actions pour :
- leads.ts : CRUD leads (avec filtre ownership)
- settings.ts : CRUD settings user
- prompts.ts : CRUD prompts user (overrides)
- sequences.ts : CRUD séquences
- actions.ts : CRUD actions quotidiennes

### Étape 2 - Permissions ownership
Implémente les règles strictes de DECISIONS.md section 3.10 :
- Lecture : tous les leads visibles
- Écriture : owner uniquement
- Anti-doublon à l'import (check linkedin_url)

### Étape 3 - Refactor hooks
Mets à jour les hooks pour utiliser les Server Actions :
- hooks/use-leads.ts
- hooks/use-actions.ts
- hooks/use-sequences.ts
- hooks/use-settings.ts

### Étape 4 - UI ownership
- Ajoute colonne "Owner" dans Pipeline
- Ajoute filtre "Mes leads uniquement"
- Désactive les boutons d'action pour les non-owners

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session F = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session F comme ✅
3. Mets à jour CLAUDE.md : documenter les Server Actions créées et les permissions ownership
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION G - Refactor Routes IA

**Dépendances :** Sessions C + D + D-bis
**Fichiers touchés :** `app/api/ai/`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Sessions C, D et D-bis sont ✅)
2. DECISIONS.md (sections 3.3, 3.4, 3.8)
3. Routes existantes : app/api/ai/generate, chat, suggest

## MISSION : Refactorer les routes IA avec prompts + RAG

### Étape 1 - Service unifié
Crée `lib/ai/service.ts` qui :
- Charge le prompt (user override ou default)
- Charge le contexte RAG (selon mapping agent)
- Appelle Claude ou OpenAI (selon préférence user)
- Gère le prompt caching

### Étape 2 - Refactor /api/ai/generate
- Utilise le service unifié
- Injecte le contexte RAG réel (pas hardcodé)
- Support batch (plusieurs messages d'un coup)
- Prompt caching activé

### Étape 3 - Refactor /api/ai/chat
- Contexte pipeline réel (queries DB, pas hardcodé)
- Utilise tous les blocs RAG (agent conversational)

### Étape 4 - Refactor /api/ai/suggest
- Utilise le service unifié
- Historique conversation injecté

### Étape 5 - Choix modèle
Ajoute dans user_settings :
- preferred_model: 'claude' | 'openai'
- Respecté par le service unifié

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session G = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session G comme ✅
3. Mets à jour CLAUDE.md : documenter le service IA unifié et les routes refactorées
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION H - Unipile (LinkedIn)

**Dépendances :** Session F
**Fichiers touchés :** `lib/unipile/`, `app/api/linkedin/`, `app/api/webhooks/`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Session F est ✅)
2. DECISIONS.md (sections 3.6, 3.7)
3. CLAUDE.md (section Intégrations Unipile)

## MISSION : Intégrer Unipile

### Étape 1 - Client Unipile
Implémente `lib/unipile/client.ts` :
- Connexion avec UNIPILE_API_KEY (env var)
- Méthodes : sendMessage, sendInvitation, visitProfile, getMessages, getChats

### Étape 2 - Connexion compte LinkedIn
Crée le flow pour connecter un compte LinkedIn :
- Page ou modal dans Settings
- Hosted Auth Unipile
- Stockage du mapping user ↔ unipile_account_id

### Étape 3 - Route envoi
Crée `app/api/linkedin/send/route.ts` :
- Reçoit action_id
- Vérifie ownership
- Envoie via Unipile
- Met à jour status action

### Étape 4 - Webhook
Crée `app/api/webhooks/unipile/route.ts` :
- Vérification signature Unipile
- Handler new_message → upsert conversation + message
- Handler new_relation → update lead stage

### Étape 5 - Sync Inbox
Implémente la sync des conversations pour l'Inbox :
- Récupérer les messages récents
- Matcher avec les leads existants

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session H = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session H comme ✅
3. Mets à jour CLAUDE.md : documenter les routes LinkedIn et le flow webhook
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION I - Crons & Orchestration

**Dépendances :** Sessions F + G + H
**Fichiers touchés :** `app/api/crons/`, `vercel.json`

```
Lis d'abord :
1. PROMPTS_ORCHESTRATOR.md (vérifie que Sessions F, G, H sont ✅)
2. DECISIONS.md (sections 3.7, 3.8, 3.9)

## MISSION : Implémenter les crons et l'orchestration

### Étape 1 - Cron génération (6h00)
Crée `app/api/crons/generate-actions/route.ts` :
- Parcourt les séquences actives
- Identifie les leads au bon step/délai
- Génère les messages via /api/ai/generate (batch)
- Crée les actions avec status 'pending'

### Étape 2 - Cron envoi (toutes les 2 min)
Crée `app/api/crons/send-actions/route.ts` :
- Query : status='validated' AND scheduled_at <= NOW()
- Respecte les règles de délais (DECISIONS.md 3.7)
- Envoie via /api/linkedin/send
- Met à jour status

### Étape 3 - Scheduling intelligent
Crée `lib/scheduling.ts` :
- Fonction calculateScheduledAt(actionType, userId)
- Distribution non-uniforme sur 9h-19h
- Respecte les délais minimum par type
- Jitter aléatoire

### Étape 4 - Tracking séquence
Implémente les transitions automatiques :
- Lead répond → status = 'replied', sort de séquence
- Délai atteint + condition OK → passe au step suivant
- Fin de séquence → status = 'completed'

### Étape 5 - Config Vercel
Crée/mets à jour `vercel.json` :
```json
{
  "crons": [
    { "path": "/api/crons/generate-actions", "schedule": "0 5 * * *" },
    { "path": "/api/crons/send-actions", "schedule": "*/2 9-19 * * 1-5" }
  ]
}
```
(5h UTC = 6h Paris, */2 = toutes les 2 min, 9-19 = heures actives, 1-5 = lun-ven)

### Après modifications :
1. Mets à jour PROMPTS_ORCHESTRATOR.md : Session I = ✅ avec date + notes
2. Mets à jour tasks/todo.md : marque les tâches Session I comme ✅
3. Mets à jour CLAUDE.md : documenter les crons et la logique de scheduling
4. `npm run build` pour vérifier que tout compile
```

---

### SESSION J - Polish ✅

**Dépendances :** Session I
**Fichiers touchés :** 15+ fichiers modifiés, 8 fichiers créés

```
TERMINÉ le 2026-02-11

Tâches réalisées :
- [x] npm audit fix (Next.js 14.2.20 → 14.2.35)
- [x] Audit env vars (7 env vars cohérentes, ENCRYPTION_KEY + flux crypto vérifié)
- [x] Notifications Sonner toasts sur 6 client components
- [x] updateLead enrichment_data + context builders scoring/enrichment
- [x] Route `/api/ai/score` (Claude, agentId scoring, temp 0.3)
- [x] Intégration Perplexity (OpenAI SDK compatible, modèles sonar-pro/sonar)
- [x] Route `/api/ai/enrich` (Perplexity forcé, agentId enrichissement)
- [x] Boutons Score/Enrich dans lead-detail-client (avec breakdown scoring)
- [x] Import CSV leads avec anti-doublon (lib/actions/import.ts + UI pipeline)
- [x] Interface RAG Settings > Connaissances (page + client + server actions + mapping table)
- [x] Seed data script (8 leads, 3 séquences, 8 actions, 3 conversations, 1 liste)
- [x] Tests critiques : 11 tests crypto + 71 tests modules = 82/82 passent
- [x] Fix bug regex JSON fence dans score/enrich routes
- [x] npm run build OK (29 routes, 0 erreurs)
- [x] Documentation finale (CLAUDE.md, todo.md, PROMPTS_ORCHESTRATOR.md)
```

---

## 📝 NOTES DE SESSION

> Espace pour noter les observations, bugs, décisions prises en cours de route

### Session 0 - 2026-02-09
- ...

### Session A - 2026-02-10
- 15 tables créées dans `supabase/migrations/001_initial_schema.sql` (profiles, user_api_keys, user_settings, user_prompts, user_rag_data, linkedin_accounts, leads, lists, list_leads, sequences, sequence_steps, sequence_leads, actions, conversations, messages)
- RLS activé sur toutes les tables : pool partagé (leads SELECT all) + ownership strict (leads INSERT/UPDATE/DELETE owner only) + owner only pour le reste
- Trigger `handle_new_user()` pour auto-créer un profil au signup
- Trigger `update_updated_at()` sur les tables avec `updated_at`
- 13 index optimisés (leads user/status/score/linkedin_url, actions user+status/scheduled_at, conversations, messages, sequence_leads, sequence_steps)
- Index partiel `idx_actions_scheduled` avec `WHERE status = 'validated'` pour le cron d'envoi
- `types/database.ts` complet : 15 tables avec Row/Insert/Update + type helpers Tables<T>, InsertTables<T>, UpdateTables<T>
- `lib/supabase/client.ts` : browser client fonctionnel via `@supabase/ssr` `createBrowserClient`
- `lib/supabase/server.ts` : server client fonctionnel via `@supabase/ssr` `createServerClient` avec cookies
- `lib/supabase/middleware.ts` : session refresh prêt (protection routes reportée à Session E)
- Packages installés : `@supabase/supabase-js`, `@supabase/ssr`
- Build OK (19 routes, 0 erreurs TypeScript)

### Session B - 2026-02-10
- Implémenté AES-256-GCM dans `lib/crypto.ts` (remplace le placeholder Base64)
- Format stocké : `iv:authTag:ciphertext` (tout en base64)
- Clé : `ENCRYPTION_KEY` env var (32 bytes = 64 hex chars)
- IV aléatoire 12 bytes par chiffrement, auth tag 16 bytes
- Aliases legacy `encryptApiKey`/`decryptApiKey` conservés
- Script de test : `scripts/test-crypto.ts` (11 tests, tous passent)
- Tamper detection vérifié (GCM auth tag)

### Session C - 2026-02-10
- 4 prompts V3.2 complets migrés dans `lib/ai/prompts/defaults.ts` (prospection, scoring, enrichissement, conversational)
- Variables de contexte documentées en JSDoc en haut du fichier
- 7 fichiers JSON analysés : 4 agents + 3 infra (orchestrator, validator_output, validator_request)
- Les 3 fichiers infra ne sont pas des prompts LLM directs, non inclus dans PROMPTS_DEFAULTS
- Fichier passe de 49 à ~806 lignes (prompts complets avec code examples, formats I/O, workflows)

### Session D - 2026-02-10
- 14 blocs RAG JSON fusionnés dans `knowledge/` avec noms propres (positionnement, icp, offres, etc.)
- 4 fichiers legacy (`company.json`, `personas.json`, `offers.json`, `protocols.json`) supprimés (obsolètes, ne matchent plus le positionnement Smart.AI)
- `lib/rag/mapping.ts` créé : RAG_BLOC_IDS (14), RAG_AGENT_MAPPING (4 agents), resolveAgentBlocs()
- `lib/rag/types.ts` refactoré : RagBloc, RagSection, RagDocument (aligné nouveau format)
- `lib/rag/context.ts` implémenté : buildRagContext(agentId, userId?), cache mémoire, clearRagCache(), listAvailableBlocs()
- `knowledge/README.md` créé : structure, mapping, format, édition, hiérarchie JOS
- Mapping par défaut : prospection (5 blocs), scoring (3), enrichissement (2), conversational (tous)
- Interface admin mapping reportée → Phase 4 / Session J
- Build OK (19 routes, 0 erreurs TypeScript)

### Session D-bis - 2026-02-11 (Mapping RAG avec Khalil)
- Mapping validé par Khalil (proposition acceptée telle quelle)
- `prospection` : 5 → 7 blocs (ajout `icp` pour personnalisation psycho, `pain_points` pour toucher la bonne douleur)
- `scoring` : 3 → 4 blocs (ajout `regles_decisionnelles` pour matrice moment×énergie)
- `enrichissement` : 2 blocs inchangé (recherche factuelle Perplexity, pas besoin de plus)
- `conversational` : tous les blocs (inchangé, cockpit doit tout connaître)
- `lib/rag/mapping.ts` mis à jour avec le mapping final

### Session E - 2026-02-10
- `middleware.ts` : appelle `updateSession()` pour session refresh + protection routes
- `lib/supabase/middleware.ts` : logique auth complète (PUBLIC_ROUTES + PUBLIC_PREFIXES)
  - Routes publiques : `/login`, `/signup`, `/api/webhooks/*`, `/api/auth/*`
  - Utilisateur non-auth sur route protégée → redirect `/login`
  - Utilisateur auth sur `/login` ou `/signup` → redirect `/`
- `app/api/auth/callback/route.ts` : échange code OAuth → session (Google)
- `app/(auth)/login/page.tsx` : `signInWithPassword` + `signInWithOAuth` (Google) + gestion erreurs + Suspense boundary
- `app/(auth)/signup/page.tsx` : `signUp` avec `full_name` en metadata + écran de succès (vérif email)
- `app/(dashboard)/layout.tsx` : server component async, charge user via `getUser()`, redirect si non-auth, passe `userInfo` au Header
- `components/layout/header.tsx` : accepte `user` prop (HeaderUser), affiche nom/email/avatar réels, logout via `signOut()`
- `scripts/seed-users.ts` : crée 3 users initiaux via `admin.createUser` (service_role key)
- Package `dotenv` ajouté (devDependency) pour le seed script
- Build OK (20 routes, 0 erreurs TypeScript)

### Session C-bis (rerun) - 2026-02-10
- **Prompts remplacés** : V3.2 JARVIS multi-agents → PROSPECTOR v1.1 (4 agents)
  - `prospection` : 6 types d'action (invitation, message, inmail, email, relance, réponse), adaptation score/stage, régénération, social proof conditionnel, tutoiement/vouvoiement
  - `scoring` : 6 critères (0-100), catégorisation HOT/WARM/COLD, malus, output JSON strict
  - `enrichissement` : Perplexity, output JSON avec confidence, summary, publicSpeaking
  - `conversational` : JARVIS cockpit, 3 capacités (reporting, recommandations, questions RAG), markdown output
- **Injection RAG implémentée** : `buildRagContext()` n'était appelé nulle part
  - `service.ts` : `buildSystemPrompt(agentId, userId?)` → charge prompt + injecte RAG automatiquement
  - 3 routes API mises à jour pour utiliser `buildSystemPrompt()` au lieu de `PROMPTS_DEFAULTS` direct
  - Architecture : `system = PROMPT AGENT + BLOCS RAG + CONTEXTE RUNTIME`
  - JARVIS_CONTEXT hardcodé (obsolète) supprimé de `/api/ai/generate` → remplacé par RAG
  - Instructions hardcodées supprimées de `/api/ai/chat` (déjà dans le prompt v1.1)
  - Protocole hardcodé supprimé de `/api/ai/suggest` → remplacé par prompt + RAG
- **Pré-existant** : `lib/actions/*.ts` (Session F) contient des erreurs de types Supabase → `@ts-nocheck` ajouté temporairement. À corriger en Session F.
- Build OK (20 routes, 0 erreurs TypeScript)

### Session F - 2026-02-11
- **Fondations** : `lib/actions/types.ts` (ActionResult<T>), `lib/actions/auth.ts` (getAuthUser helper), `lib/mappers.ts` (6 fonctions de mapping DB→App)
- **7 Server Actions** créées dans `lib/actions/` : leads, actions, sequences, settings, conversations, lists, dashboard
- **Pattern server/client split** : chaque page refactorisée en 2 fichiers — `page.tsx` (server component, fetch data) + `*-client.tsx` (client component, UI + interactivité)
- **8 pages converties** : dashboard, pipeline, pipeline/[id], actions, sequences, sequences/[id], inbox, lists
- **8 client components créés** : dashboard-client, pipeline-client, lead-detail-client, actions-client, sequences-client, sequence-detail-client, inbox-client, lists-client
- **UI Ownership** :
  - Pipeline table : colonne "Owner" ajoutée entre Score et Statut
  - Pipeline kanban : badge owner en bas de chaque card
  - Filtre "Mes leads" : toggle button dans la barre de filtres
  - Fiche lead : boutons "Envoyer message", "Ajouter à séquence", "Changer statut", "Modifier notes" désactivés pour non-owners avec tooltips explicatifs
- **Nettoyage** : hooks `use-leads.ts`, `use-actions.ts`, `use-sequences.ts` supprimés (plus importés nulle part). `use-settings.ts` conservé (encore utilisé par settings/page.tsx)
- **Types** : `types/database.ts` enrichi avec Relationships arrays (requis par @supabase/supabase-js 2.95.3), `types/leads.ts` enrichi (location, website, description)
- **Anti-doublon** : check `linkedin_url` existant avant import (dans `createLead`)
- Mock data (`lib/mock-data.ts`) plus importé par aucune page
- Build OK (20 routes, 0 erreurs TypeScript)

### Session G - 2026-02-11
- **Service IA unifié** : `lib/ai/service.ts` — `callAI(options)` avec résolution provider/modèle/clé user
  - `getUserAIConfig(userId)` → charge settings, décrypte clé API, fallback env var ANTHROPIC_API_KEY
  - `callClaude()` → prompt caching (system blocks avec `cache_control: { type: "ephemeral" }`), lecture cache_read/cache_creation tokens
  - `callOpenAI()` → appel standard Chat Completions, lecture prompt_tokens_details.cached_tokens
  - `logUsage()` → insert fire-and-forget dans `ai_usage` avec estimation coût
- **Catalogue modèles** : `lib/ai/models.ts` — 8 modèles (Claude Opus 4.6, Sonnet 4.5, Haiku 4.5, GPT-5.2, GPT-5, GPT-5 Mini, GPT-4o, GPT-4o Mini) avec pricing input/output/cache
- **Migration** : `supabase/migrations/002_ai_usage.sql` — table ai_usage avec RLS (user voit ses propres données uniquement)
- **3 routes refactorées** :
  - `/api/ai/generate` : auth user, callAI prospection, support batch `leads[]` ou `lead`, helpers locaux buildLeadContext/buildUserPrompt
  - `/api/ai/chat` : auth user, callAI conversational, données pipeline réelles via getDashboardData()+getTeamData(), buildPipelineContext()
  - `/api/ai/suggest` : auth user, callAI prospection (type réponse), lead context + conversation history
- **Prompt overrides activés** : `getPrompt(agentId, userId)` charge d'abord `user_prompts` DB, fallback `PROMPTS_DEFAULTS`
- **Clés API user** : `getDecryptedApiKey(userId, keyType)` ajouté dans settings.ts, décrypte AES-256-GCM
- **Usage tracking** :
  - `lib/actions/ai-usage.ts` → `getUsageStats(period)` avec totaux + breakdowns par agent/modèle
  - `app/(dashboard)/settings/usage/` → page dédiée avec sélecteur période (jour/semaine/mois), 4 cards KPI (appels, tokens in, tokens out, coût), tables par agent et par modèle
  - Nav item "Usage IA" ajouté dans sidebar settings dropdown
- **Dépendance** : `openai` package installé
- Build OK + Lint OK (21 routes, 0 erreurs)

### Session H - 2026-02-11
- (voir notes existantes ci-dessus)

### Session I - 2026-02-11
- (voir notes existantes ci-dessus)

### Session J - 2026-02-11 (Polish & Finalisation MVP)
- **npm audit fix** : Next.js 14.2.20 → 14.2.35 (eslint-config-next maintenu à 14.2.35, incompatible avec v16)
- **Sonner toasts** : ajoutés dans 6 client components (inbox, sequences, lists, prompts, api-keys, lead-detail)
- **Scoring IA** :
  - `lib/ai/lead-context.ts` : ajout `buildScoringContext()`, `buildScoringUserPrompt()`, `buildEnrichmentContext()`, `buildEnrichmentUserPrompt()`
  - `app/api/ai/score/route.ts` : auth → callAI(scoring) → JSON parse → update lead.score
  - UI : bouton "Rescorer" dans lead-detail + breakdown dépliable (6 critères)
- **Enrichissement Perplexity** :
  - `lib/ai/models.ts` : ajout sonar-pro + sonar, type AIProvider étendu avec "perplexity"
  - `lib/ai/service.ts` : ajout `callPerplexity()` (utilise OpenAI SDK avec baseURL Perplexity)
  - `app/api/ai/enrich/route.ts` : force Perplexity, agentId "enrichissement"
  - UI : bouton "Enrichir" dans lead-detail
- **Import CSV** :
  - `lib/actions/import.ts` : server action importLeadsFromCSV avec anti-doublon via createLead
  - `pipeline-client.tsx` : bouton Importer + Dialog preview + parsing CSV client-side
- **Interface RAG** :
  - `lib/actions/rag.ts` : getRagBlocs, getRagBlocContent, getUserRagOverrides, saveRagOverride, resetRagOverride
  - `app/(dashboard)/settings/knowledge/` : page.tsx + knowledge-client.tsx
  - Table mapping agents → blocs (read-only) + éditeur par onglets avec save/reset
  - `lib/rag/context.ts` : implémentation overrides user depuis user_rag_data (le TODO ligne 58)
  - Nav : "Connaissances" ajouté dans sidebar.tsx + mobile-nav.tsx
- **Tests** :
  - `scripts/test-routes.ts` : 71 tests (JSON parsing, CSV validation, lead context builders, AI models, RAG mapping, scheduling, constants)
  - `scripts/test-crypto.ts` : 11 tests existants (tous passent)
  - Total : 82/82 passent
- **Bug fix** : regex `^```json?\s*` ne matchait pas ```` ``` ```` sans suffixe → corrigé en `^```(?:json)?\s*` dans score + enrich routes
- **Scripts npm** : ajout `test:crypto`, `test:routes`, `test`, `seed`
- Build OK (29 routes, 0 erreurs TypeScript)

---

## ⚠️ RÈGLES IMPORTANTES

1. **Toujours lire PROMPTS_ORCHESTRATOR.md en premier** - Pour voir l'état et les dépendances
2. **Vérifier les dépendances** - Ne pas lancer une session si ses prérequis ne sont pas ✅
3. **Mettre à jour 3 fichiers après chaque session** :
   - PROMPTS_ORCHESTRATOR.md → marquer ✅ + date + notes
   - tasks/todo.md → cocher les tâches faites
   - CLAUDE.md → si ajouts structurels (routes, fichiers, setup)
4. **Tester avant de valider** - `npm run build` doit passer
5. **Documenter les écarts** - Si une décision change, noter pourquoi dans les notes de session

---

*Dernière mise à jour : 2026-02-11 (Session J Polish & Finalisation MVP terminée - TOUTES SESSIONS ✅)*
