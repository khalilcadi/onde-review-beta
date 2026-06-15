# PROSPECTOR - Todo List

> Plan de travail Phase 3 & 4. Mis à jour par Claude Code.
> Décisions d'architecture : voir `DECISIONS.md` à la racine.

---

## Complété

- [x] Phase 1 - Fondations (Next.js, shadcn, layout)
- [x] Phase 2 - Core Features (Dashboard, Pipeline, Actions, Séquences, Inbox, Cockpit, Settings)
- [x] Phase 2.5 - Routes API IA (`/api/ai/generate`, `/api/ai/chat`, `/api/ai/suggest`)

---

## Phase 3 - Backend & Intégrations ✅

### Sessions Parallèles (peuvent être lancées simultanément)

#### Session A - Supabase Setup ✅
- [x] Créer migration SQL 15 tables (`supabase/migrations/001_initial_schema.sql`)
- [x] Configurer RLS : pool partagé leads + ownership strict toutes tables
- [x] Types TypeScript complets (`types/database.ts` - 15 tables Row/Insert/Update)
- [x] Client browser (`lib/supabase/client.ts`) + server (`lib/supabase/server.ts`)
- [x] Middleware session refresh (`lib/supabase/middleware.ts`)
- [x] Packages `@supabase/supabase-js` + `@supabase/ssr` installés
- [x] **ACTION HUMAINE** : Créer projet Supabase + appliquer migration SQL + configurer `.env.local`

#### Session B - Chiffrement ✅
- [x] Implémenter AES-256-GCM dans `lib/crypto.ts`
- [x] Ajouter `ENCRYPTION_KEY` dans env vars
- [x] Script de test `scripts/test-crypto.ts` (11 tests passent)

#### Session C - Prompts V3.2 ✅
- [x] Upgrader `lib/ai/prompts/defaults.ts` avec prompts complets depuis `prompts/`
- [x] Documenter les variables de contexte (JSDoc en haut du fichier)

#### Session D - Service RAG ✅
- [x] Fusionner `knowledge/` et `RAG JSON/` → 14 blocs dans `knowledge/`
- [x] Implémenter `buildRagContext()` dans `lib/rag/context.ts`
- [x] Créer `lib/rag/mapping.ts` avec mapping par agent
- [x] Mettre à jour `lib/rag/types.ts` (RagBloc, RagSection)
- [x] Créer `knowledge/README.md` (documentation structure + édition)
- [x] Interface admin pour éditer le mapping (Session J)

#### Session D-bis - Mapping RAG ✅
- [x] Lister les 14 blocs RAG avec résumé
- [x] Proposer mapping par agent (prospection 7, scoring 4, enrichissement 2, conversational tous)
- [x] Validation Khalil (accepté tel quel)
- [x] Mettre à jour `lib/rag/mapping.ts` avec mapping validé

### Sessions Séquentielles

#### Session E - Auth (après A) ✅
- [x] Brancher Supabase Auth sur login/signup (signInWithPassword, signUp, signInWithOAuth)
- [x] Implémenter middleware protection routes dashboard
- [x] Gérer sessions dans layouts (server component async, userInfo → Header)
- [x] Callback route OAuth Google (`/api/auth/callback`)
- [x] Logout réel via supabase.auth.signOut()
- [x] Script seed users (`scripts/seed-users.ts`)

#### Session F - CRUD Supabase (après A + E) ✅
- [x] Créer fondations : `lib/actions/types.ts`, `lib/actions/auth.ts`, `lib/mappers.ts`
- [x] Créer 7 Server Actions : leads, actions, sequences, settings, conversations, lists, dashboard
- [x] Refactorer 8 pages en server/client split (suppression mock data)
- [x] Implémenter permissions ownership strict (RLS + UI disabled buttons)
- [x] Ajouter colonne "Owner" dans Pipeline (table + kanban)
- [x] Ajouter filtre "Mes leads" dans Pipeline
- [x] Implémenter anti-doublon à l'import (check linkedin_url)
- [x] Supprimer hooks inutilisés (use-leads, use-actions, use-sequences)

#### Session G - Refactor Routes IA (après C + D) ✅
- [x] Installer SDK OpenAI (`npm install openai`)
- [x] Créer catalogue modèles + pricing (`lib/ai/models.ts` — 10 modèles Claude + OpenAI + Perplexity)
- [x] Ajouter `ai_provider`/`ai_model` dans DEFAULT_SETTINGS
- [x] Créer migration `002_ai_usage.sql` + types dans `types/database.ts`
- [x] Ajouter `getDecryptedApiKey()` dans `lib/actions/settings.ts`
- [x] Activer prompt overrides user dans `lib/ai/prompts/service.ts`
- [x] Créer service IA unifié (`lib/ai/service.ts` — callAI, Claude + OpenAI, prompt caching, usage logging)
- [x] Refactorer 3 routes `/api/ai/*` avec service unifié
- [x] Créer Server Action usage (`lib/actions/ai-usage.ts` — getUsageStats)
- [x] Créer page Usage IA dans Settings (`app/(dashboard)/settings/usage/`)
- [x] Build + Lint OK

#### Session H - Unipile (après F) ✅
- [x] Types complets Unipile (`lib/unipile/types.ts` — 46 interfaces)
- [x] Client HTTP complet (`lib/unipile/client.ts` — 48 méthodes, singleton)
- [x] Anti-détection delays (`lib/constants.ts`)
- [x] Server Actions LinkedIn + Hosted Auth + webhooks
- [x] Route envoi `POST /api/linkedin/send` + Route webhooks `POST /api/webhooks/unipile`
- [x] Settings API Keys page server/client split
- [x] Build + Lint OK

#### Session I - Crons & Orchestration (après F + G + H) ✅
- [x] Cron génération actions 6h00 `/api/crons/generate-actions`
- [x] Cron envoi actions `/api/crons/send-actions`
- [x] Scheduling non-uniforme (`lib/scheduling.ts`)
- [x] Tracking séquence + supabaseOverride pattern
- [x] Config Vercel (`vercel.json`)
- [x] Build + Lint OK

---

## Phase 4 - Polish (Session J) ✅

- [x] npm audit fix (Next.js 14.2.20 → 14.2.35)
- [x] Audit env vars (7 env vars vérifiées)
- [x] Notifications Sonner toasts (6 client components)
- [x] updateLead enrichment_data + context builders scoring/enrichment
- [x] Route `/api/ai/score` (scoring IA Claude)
- [x] Intégration Perplexity + Route `/api/ai/enrich`
- [x] Boutons Score/Enrich dans lead-detail (avec breakdown scoring)
- [x] Import CSV leads avec anti-doublon
- [x] Interface RAG Settings > Connaissances + mapping
- [x] Tests critiques : 82/82 passent (11 crypto + 71 modules)
- [x] Documentation finale + npm run build OK (29 routes)

---

*Dernière mise à jour : 2026-02-11 (Session J terminée — MVP COMPLET)*
