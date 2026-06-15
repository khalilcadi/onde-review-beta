# PROSPECTOR - Instructions Claude Code

> Plateforme de prospection LinkedIn semi-automatisee pour vendre JARVIS
> 3 utilisateurs internes (Khalil + 2 associes)

---

## DESCRIPTION DU PROJET

PROSPECTOR est un outil interne de prospection LinkedIn ou :
1. L'IA genere des messages personnalises bases sur le contexte du lead
2. L'utilisateur valide/edite avant envoi
3. Les envois sont espaces aleatoirement (anti-detection LinkedIn)
4. Tout est centralise : pipeline, sequences, inbox, analytics

**Workflow quotidien type :**
```
06:00 -> Generation auto des actions du jour (cron)
09:00 -> User valide les messages dans Daily Actions
09:00-19:00 -> Envois automatiques (delais anti-detection : 15min entre messages, 1-3min visite->invitation)
12:00 -> Notification nouvelle reponse -> traitement Inbox
18:00 -> Recap dashboard
```

---

## STACK & DEPENDANCES

| Layer | Techno | Version |
|-------|--------|---------|
| Framework | Next.js (App Router) | 14.2.35 |
| Runtime | React | 18.3.1 |
| Langage | TypeScript (strict) | 5.x |
| UI Components | shadcn/ui (Radix UI) | via @radix-ui/* |
| Styling | Tailwind CSS | 3.4.1 |
| Animations | tailwindcss-animate | 1.0.7 |
| Charts | Recharts | 2.12.0 |
| Icons | Lucide React | 0.312.0 |
| Fonts | Geist (Sans + Mono) | 1.2.2 |
| CSS Utils | clsx + tailwind-merge + class-variance-authority | latest |
| Notifications | Sonner (toasts) | 2.0.7 |
| Theme | next-themes | 0.4.6 |
| Auth | Supabase Auth | @supabase/ssr 0.8.0 |
| Database | Supabase PostgreSQL | @supabase/supabase-js 2.95.3 |
| API LinkedIn | Unipile | via REST client |
| IA Generation | Claude API (Anthropic) | @anthropic-ai/sdk 0.73.0 |
| IA Alternative | OpenAI | openai 6.21.0 |
| IA Enrichissement | Perplexity API | via openai SDK (baseURL) |
| Hosting | Vercel | vercel.json (crons) |

**Package manager** : `npm`

**Dev dependencies** : dotenv, mammoth, eslint, postcss, tailwindcss, typescript, @types/*

---

## SETUP & INSTALLATION

```bash
# 1. Cloner le repo
git clone <repo-url>
cd "JARVIS PROSPECTOR"

# 2. Installer les dependances
npm install

# 3. Lancer en developpement
npm run dev
# -> http://localhost:3000

# 4. Build production
npm run build && npm run start
```

**Base de donnees** : Supabase est configure (clients + types + migration). Creer un projet Supabase et configurer `.env.local` pour activer la DB (voir instructions dans la section Variables d'environnement). Seed des donnees de demo : `npm run seed`.

---

## VARIABLES D'ENVIRONNEMENT

**Variables requises** (creer `.env.local` a la racine) :

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service Supabase (server-side only, crons + webhooks) |
| `ENCRYPTION_KEY` | Cle de chiffrement AES-256-GCM (64 hex chars = 32 bytes). Generer avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `UNIPILE_API_KEY` | Cle Unipile partagee (1 compte pour 3 users LinkedIn) |
| `CRON_SECRET` | Secret pour authentification crons Vercel (`Authorization: Bearer <secret>`) |
| `ANTHROPIC_API_KEY` | (optionnel) Fallback Claude API pour dev local |

**Strategie de stockage des cles API** (cf. `DECISIONS.md` S3.2) :
- **Unipile** : env var Vercel (compte partage, pas de chiffrement)
- **Claude / OpenAI / Perplexity** : stockees **par utilisateur** en DB, chiffrees AES-256-GCM

Le `.gitignore` couvre `.env`, `.env*.local` et `*.pem`.

---

## SCRIPTS DISPONIBLES

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de developpement (hot reload) |
| `npm run build` | Build production (verifie TypeScript + ESLint) |
| `npm run start` | Lance le build de production |
| `npm run lint` | Lint ESLint (next/core-web-vitals) |
| `npm run seed:users` | Cree les 3 users initiaux dans Supabase (requiert `.env.local`) |
| `npm run seed` | Lance seed:users |
| `npm run test:crypto` | Lance les 11 tests du module crypto AES-256-GCM |
| `npm run test:routes` | Lance les 71 tests modules (context builders, models, RAG, scheduling, constants) |
| `npm run test` | Lance tous les tests (crypto + routes) |

---

## ARCHITECTURE DU PROJET

```
prospector/
|-- app/
|   |-- layout.tsx                  # Root layout (fonts Geist, metadata, ThemeProvider, Sonner)
|   |-- globals.css                 # Tailwind layers + CSS variables (theme HSL, scrollbar, shadows)
|   |-- (auth)/                     # Routes publiques (pas de sidebar)
|   |   |-- login/page.tsx          # Connexion (email + Google OAuth)
|   |   +-- signup/page.tsx         # Inscription (avec validation password)
|   |-- api/
|   |   |-- auth/
|   |   |   +-- callback/route.ts   # GET - OAuth callback (echange code -> session)
|   |   |-- ai/
|   |   |   |-- generate/route.ts   # POST - Generation messages LinkedIn (batch, prompt caching)
|   |   |   |-- chat/route.ts       # POST - Chat Cockpit (pipeline reel + tous blocs RAG)
|   |   |   |-- suggest/route.ts    # POST - Suggestion reponse Inbox
|   |   |   |-- score/route.ts      # POST - Scoring IA lead (Claude, temp 0.3, output JSON)
|   |   |   +-- enrich/route.ts     # POST - Enrichissement lead (Perplexity + Unipile profile/posts)
|   |   |-- linkedin/
|   |   |   |-- send/route.ts       # POST - Envoi action LinkedIn via Unipile (anti-detection)
|   |   |   +-- auth/callback/route.ts # GET - Hosted Auth callback (connexion LinkedIn)
|   |   |-- crons/
|   |   |   |-- generate-actions/route.ts # GET - Cron generation actions 6h00 (sequences actives -> pending)
|   |   |   +-- send-actions/route.ts     # GET - Cron envoi actions toutes les 2min (validated -> sent)
|   |   +-- webhooks/
|   |       +-- unipile/route.ts    # POST - Webhook Unipile (message.received, relation.created, account.status_changed)
|   +-- (dashboard)/                # Routes protegees (sidebar + header + mobile nav)
|       |-- layout.tsx              # Shell dashboard (sidebar + header + mobile nav + auth guard)
|       |-- page.tsx                # Dashboard -> DashboardClient (KPIs + equipe)
|       |-- dashboard-client.tsx    # Client component Dashboard
|       |-- actions/
|       |   |-- page.tsx            # Server component -> ActionsClient
|       |   |-- actions-client.tsx  # Client component Daily Actions (validation cards)
|       |   +-- timeline-view.tsx   # Composant timeline envois
|       |-- pipeline/
|       |   |-- page.tsx            # Server component -> PipelineClient (table + filtres)
|       |   |-- pipeline-client.tsx # Client component Pipeline
|       |   +-- [id]/
|       |       |-- page.tsx        # Server component -> LeadDetailClient
|       |       +-- lead-detail-client.tsx # Fiche lead (enrichissement, timeline, score)
|       |-- sequences/
|       |   |-- page.tsx            # Server component -> SequencesClient
|       |   |-- sequences-client.tsx # Client component liste sequences
|       |   +-- [id]/
|       |       |-- page.tsx        # Server component -> SequenceDetailClient
|       |       +-- sequence-detail-client.tsx # Sequence builder (steps, conditions)
|       |-- lists/
|       |   |-- page.tsx            # Server component -> ListsClient
|       |   +-- lists-client.tsx    # Client component gestion listes
|       |-- inbox/
|       |   |-- page.tsx            # Server component -> InboxClient
|       |   +-- inbox-client.tsx    # Client component inbox (conversations + suggest reply)
|       |-- cockpit/page.tsx        # Chat IA (reporting, pipeline reel)
|       |-- logs/
|       |   |-- page.tsx            # Server component -> LogsClient
|       |   +-- logs-client.tsx     # Client component logs IA (filterable table)
|       |-- system/
|       |   |-- page.tsx            # Server component -> SystemClient
|       |   +-- system-client.tsx   # Client component config systeme
|       +-- settings/
|           |-- page.tsx            # Reglages generaux
|           |-- settings-client.tsx # Client component settings generaux
|           |-- api-keys/
|           |   |-- page.tsx            # Server component -> ApiKeysClient
|           |   +-- api-keys-client.tsx # Client component (cles API + connexion LinkedIn)
|           |-- prompts/
|           |   |-- page.tsx            # Server component -> PromptsClient
|           |   +-- prompts-client.tsx  # Client component editeur prompts (4 agents)
|           |-- team/
|           |   |-- page.tsx            # Server component -> TeamClient
|           |   +-- team-client.tsx     # Client component vue equipe (3 users + stats)
|           |-- usage/
|           |   |-- page.tsx            # Server component -> UsageClient
|           |   +-- usage-client.tsx    # Client component Usage IA (KPIs + breakdowns)
|           |-- knowledge/
|           |   |-- page.tsx            # Server component -> KnowledgeClient
|           |   +-- knowledge-client.tsx # Client component RAG editor (tabs + mapping table)
|           +-- diagnostic/
|               |-- page.tsx            # Server component -> DiagnosticClient
|               +-- diagnostic-client.tsx # Client component diagnostics systeme
|-- components/
|   |-- theme-provider.tsx          # ThemeProvider (next-themes, wraps app)
|   |-- theme-toggle.tsx            # Toggle dark/light mode (dans header)
|   |-- ui/                         # Composants shadcn/ui (17 fichiers)
|   |   |-- avatar.tsx, badge.tsx, button.tsx, card.tsx
|   |   |-- dialog.tsx, dropdown-menu.tsx, empty-state.tsx, input.tsx
|   |   |-- label.tsx, progress.tsx, scroll-area.tsx, select.tsx
|   |   |-- separator.tsx, sheet.tsx, tabs.tsx, textarea.tsx, tooltip.tsx
|   +-- layout/
|       |-- sidebar.tsx             # Navigation laterale (7 items + settings dropdown)
|       |-- header.tsx              # Breadcrumbs + recherche Cmd+K + notifications + profil
|       +-- mobile-nav.tsx          # Menu hamburger (Sheet lateral)
|-- lib/
|   |-- utils.ts                    # cn() - merge classes Tailwind
|   |-- crypto.ts                   # Chiffrement cles API (AES-256-GCM, format iv:authTag:ciphertext)
|   |-- constants.ts                # DEFAULT_SETTINGS, statuts, stages, types, nav items, ANTI_DETECTION_DELAYS
|   |-- scheduling.ts               # Scheduling engine (calculateSchedule, quotas, isActiveDay, distribution non-uniforme)
|   |-- mappers.ts                  # Mapping DB->App : 6 fonctions (lead, action, sequence, step, snake_case->camelCase)
|   |-- humanize.ts                 # Anti-detection: fragmentation probabiliste messages (40% chance), transforms texte casual
|   |-- actions/                    # Server Actions (CRUD Supabase) - 14 fichiers
|   |   |-- types.ts                # ActionResult<T> type
|   |   |-- auth.ts                 # getAuthUser() helper
|   |   |-- leads.ts                # CRUD leads + anti-doublon linkedin_url + ownership
|   |   |-- actions.ts              # getTodayActions, validate (+ scheduling), cancel, regenerate, history
|   |   |-- sequences.ts            # CRUD sequences + steps + addLeadToSequence
|   |   |-- settings.ts             # Settings + API keys (encrypt/decrypt) + prompts + getDecryptedApiKey()
|   |   |-- conversations.ts        # Conversations + messages (+ envoi Unipile) + syncInbox
|   |   |-- linkedin.ts             # LinkedIn account CRUD + Hosted Auth + connectLinkedIn
|   |   |-- lists.ts                # CRUD lists + list_leads
|   |   |-- dashboard.ts            # Dashboard stats + team data (KPIs)
|   |   |-- ai-usage.ts             # getUsageStats(period) -- usage IA par agent/modele avec couts
|   |   |-- import.ts               # importLeadsFromCSV (anti-doublon via linkedin_url)
|   |   |-- rag.ts                  # getRagBlocs, getRagBlocContent, saveRagOverride, resetRagOverride
|   |   +-- diagnostic.ts           # Diagnostics systeme (env checks, connectivity)
|   |-- supabase/
|   |   |-- client.ts               # Browser client (@supabase/ssr createBrowserClient)
|   |   |-- server.ts               # Server client (@supabase/ssr createServerClient + cookies)
|   |   |-- service.ts              # Service role client (bypasses RLS, pour crons + webhooks)
|   |   +-- middleware.ts           # Session refresh + protection routes (auth guard + routes publiques)
|   |-- unipile/
|   |   |-- client.ts               # Client HTTP Unipile complet (48 methodes, singleton, retry logic, extractLinkedInIdentifier)
|   |   |-- execute.ts              # Logique d'execution LinkedIn partagee (executeLinkedInAction, markActionFailed, advanceSequenceStep)
|   |   +-- types.ts                # Types Unipile complets (46 interfaces : accounts, chats, messages, posts, LinkedIn, webhooks, email)
|   |-- ai/
|   |   |-- models.ts               # Catalogue 10 modeles IA (Claude + OpenAI + Perplexity) avec pricing
|   |   |-- service.ts              # Service IA unifie : callAI(), multi-provider, prompt caching, usage logging, supabaseOverride
|   |   |-- lead-context.ts         # Builders contexte lead (buildLeadContext, buildScoringContext, buildEnrichmentContext, buildUserPrompt)
|   |   +-- prompts/
|   |       |-- defaults.ts         # 4 prompts agents PROSPECTOR v1.1 (complets, avec JSDoc)
|   |       +-- service.ts          # Chargement prompt (user override DB -> default code) + injection RAG via buildSystemPrompt()
|   +-- rag/
|       |-- context.ts              # buildRagContext(agentId, userId?) + cache memoire + clearRagCache() + listAvailableBlocs()
|       |-- mapping.ts              # RAG_BLOC_IDS (14), RAG_AGENT_MAPPING (4 agents), resolveAgentBlocs()
|       +-- types.ts                # RagBloc, RagSection, RagDocument
|-- types/
|   |-- database.ts                 # Types Supabase (16 tables Row/Insert/Update + Database interface + helpers)
|   |-- leads.ts                    # Lead, LeadStatus, LeadStage, LeadFilters, LeadEnrichment, SignalType
|   |-- actions.ts                  # Action, ActionType, ActionStatus, ActionWithLead, QuotaUsage
|   +-- sequences.ts               # Sequence, SequenceStep, StepType, StepCondition, GenerationMode, SequenceLead
|-- knowledge/                      # Base de connaissances RAG (17 blocs Smart.AI JSON)
|   |-- README.md                   # Documentation structure, mapping, edition
|   |-- positionnement.json         # Bloc 1 -- Vision Smart.AI, infrastructure revenue, framework A.R.C.
|   |-- icp.json                    # Bloc 2 -- 3 segments ICP agences B2B (Early/Growth/Scale)
|   |-- offres.json                 # Bloc 3 -- Smart.AI Setup (6000 EUR) + Platform (200-1000 EUR/mois)
|   |-- use_cases.json              # Bloc 4 -- 4 use cases agences (acquisition, pipeline, dependance, pilotage)
|   |-- objections.json             # Bloc 5 -- 6 objections frequentes + reponses
|   |-- regles_decisionnelles.json  # Bloc 6 -- Qualification ICP 3 segments, handoff, cas limites
|   |-- pain_points.json            # Bloc 7 -- 5 pain points agences
|   |-- benchmark_marche.json       # Bloc 8 -- Analyse PESTEL marche agences B2B France
|   |-- benchmark_concurrents.json  # Bloc 9 -- Limova, Dust, agences SDR + analyse ERAC
|   |-- pricing.json                # Bloc 10 -- Setup 6000 EUR + Platform, logique de valeur
|   |-- messaging.json              # Bloc 11 -- 4 niveaux pitch, 5 angles commerciaux, vocabulaire
|   |-- operating_rules.json        # Bloc 12 -- 11 regles comportement agents
|   |-- onboarding.json             # Bloc 13 -- 5 etapes A.R.C. onboarding
|   |-- architecture_core.json      # Jarvis + 4 agents, flux, plateforme
|   |-- framework_arc.json          # Bloc 15 -- Framework A.R.C. detaille (Audit, Revenue Engine, Control Tower)
|   |-- manifesto.json              # Bloc 16 -- Territoire intellectuel, positions de rupture, accroches LinkedIn
|   +-- profil_fondateur.json       # Bloc 17 -- Ludwig Graham, parcours, credibilite, angles de message
|-- supabase/
|   +-- migrations/
|       |-- 001_initial_schema.sql  # 15 tables + RLS + indexes + triggers + profiles auto-create
|       |-- 002_ai_usage.sql        # Table ai_usage + RLS + indexes
|       |-- 003_ai_logs.sql         # Colonnes input_text, output_text sur ai_usage
|       |-- 003_unipile_indexes.sql # Index optimisation webhooks Unipile
|       |-- 004_generation_mode.sql # Toggle IA vs template sur sequence_steps
|       |-- 005_messages_dedup_constraint.sql # Contrainte unique pour idempotence webhooks
|       |-- 006_audit_constraints.sql # CHECK constraints + unique indexes
|       +-- 007_conversations_attendee_info.sql # Colonnes attendee name/profile URL
|-- scripts/
|   |-- seed-users.ts               # Creation 3 users initiaux (khalil@, ludwig@, samy@)
|   |-- test-crypto.ts              # 11 tests AES-256-GCM
|   |-- test-routes.ts              # 71 tests modules (JSON, CSV, context, models, RAG, scheduling)
|   |-- explore-unipile-profile.ts  # Debug: exploration profil Unipile
|   +-- test-unipile-posts.ts       # Debug: test endpoints posts Unipile
|-- tasks/
|   |-- todo.md                     # Sprint en cours
|   +-- lessons.md                  # Erreurs & lecons apprises (patterns a eviter)
|-- middleware.ts                   # Root middleware Next.js (auth guard via updateSession)
|-- vercel.json                     # Cron jobs Vercel (generate-actions 4-5h UTC, send-actions 2min 7-19h UTC)
|-- package.json                    # 31 dependencies + 7 devDependencies + 10 scripts
|-- tsconfig.json                   # Strict mode, paths: @/* -> ./, excludes: node_modules, _archive
|-- tailwind.config.ts              # Theme HSL + dark mode class + tailwindcss-animate + fonts Geist
|-- postcss.config.mjs
|-- next.config.mjs
|-- components.json                 # Config CLI shadcn/ui
|-- DECISIONS.md                    # Decisions d'architecture (S3.1-3.10)
|-- PROMPTS_ORCHESTRATOR.md         # Design prompts IA v4
|-- _archive/                       # Fichiers archives (voir _archive/ARCHIVE_README.md)
|-- .eslintrc.json                  # next/core-web-vitals
+-- .gitignore                      # .env*.local, node_modules, .next, *.pem, coverage, .vercel
```

---

## ETAT ACTUEL DU PROJET

### MVP COMPLET

Toutes les phases (1-4) sont terminees. Le projet est pret pour le deploiement production.

**Ce qui fonctionne** :

**UI Dashboard (20+ pages)** :
- Layout complet : sidebar, header avec breadcrumbs + recherche Cmd+K, mobile nav
- Dashboard avec KPIs individuels (actions, reponses, leads chauds, taux) + vue equipe (leaderboard, pie chart)
- Pipeline avec table, filtres avances (statut, stage, score, tags), tri, recherche live
- Fiche lead detaillee (enrichissement Perplexity + LinkedIn, timeline, score breakdown)
- Daily Actions avec cards de validation (valider, editer, regenerer, annuler) + timeline envois
- Sequence builder (steps, conditions, stats, generation_mode IA/template)
- Listes (CRUD + assignation leads)
- Inbox (conversations, messages, suggest reply IA)
- Cockpit IA (chat reporting avec donnees pipeline reelles)
- Logs IA (table filtrable des evenements systeme)
- System (configuration systeme)
- Settings complet : general, API keys (test connexion), prompts (editeur 4 agents), team, usage IA, knowledge RAG, diagnostic

**Routes API (11 endpoints)** :
- 5 routes IA : generate (batch + prompt caching), chat, suggest, score, enrich
- 2 routes LinkedIn : send (anti-detection), auth/callback (Hosted Auth)
- 2 routes cron : generate-actions (6h), send-actions (2min)
- 1 route webhook : Unipile (message.received, relation.created, account.status_changed)
- 1 route auth : OAuth callback Google

**Backend** :
- 16 tables Supabase avec RLS (pool leads + ownership strict)
- 14 Server Actions pour CRUD complet
- Chiffrement AES-256-GCM des cles API utilisateur
- Service IA unifie multi-provider (Claude, OpenAI, Perplexity)
- 10 modeles avec pricing et usage tracking
- Prompt caching Claude (cache_control ephemeral)
- Client Unipile complet (48 methodes)
- Scheduling engine non-uniforme avec anti-detection
- Humanisation messages (fragmentation probabiliste 40%)
- RAG injection automatique par agent (17 blocs)

**Tests** : 82 tests passent (11 crypto + 71 modules)

---

## DECISIONS TECHNIQUES

Toutes les decisions d'architecture sont documentees dans `DECISIONS.md` a la racine du projet.

| Decision | Choix | Reference |
|----------|-------|-----------|
| Architecture API | Hybride : Server Actions (CRUD) + Route Handlers (IA, webhooks, crons) | S3.1 |
| Cles API | Unipile en env var, Claude/OpenAI/Perplexity par user en DB (AES-256-GCM) | S3.2 |
| Prompts | V3.2 en code (`defaults.ts`) + overrides DB par user, bouton "Reset to default" | S3.3 |
| RAG | Hybride `knowledge/` (code) + `user_rag_data` (DB), mapping par agent editable admin | S3.4 |
| Versioning prompts | Non (3 users internes, "Reset to default" suffit) | S3.5 |
| Webhooks Unipile | Route Handler simple, pas de queue (~150/jour) | S3.6 |
| Anti-detection LinkedIn | Messages proteges 15min avant/apres, visite->invitation OK en 1-3min | S3.7 |
| Generation quotidienne | Cron 6h00 + prompt caching, batch 10 messages | S3.8 |
| Tracking sequence | Table `sequence_leads` avec `current_step` + `status`, transitions par cron | S3.9 |
| Multi-user | Pool leads partage (tous visibles) + ownership strict (actions reservees au owner) | S3.10 |
| Choix modele IA | Par user dans Settings : 10 modeles (Claude Opus/Sonnet/Haiku, GPT-5.2/5/5-Mini/4o/4o-Mini, Sonar Pro/Sonar) | S Choix Modele |
| Usage tracking | Table `ai_usage` avec cout estime, page `/settings/usage` avec KPIs et breakdowns | Session G |

---

## WORKFLOW ORCHESTRATION

### 1. Plan Mode Default
- Entre en plan mode pour TOUTE tache non-triviale (3+ etapes ou decisions d'architecture)
- Si quelque chose deraille, STOP et re-planifie immediatement
- Utilise le plan mode pour les etapes de verification, pas juste le build
- Ecris des specs detaillees en amont pour reduire l'ambiguite

### 2. Subagent Strategy
- Utilise les subagents librement pour garder la context window principale propre
- Delegue recherche, exploration et analyse parallele aux subagents
- Pour les problemes complexes, envoie plus de compute via subagents
- Une tache par subagent pour une execution focalisee

### 3. Self-Improvement Loop
- Apres TOUTE correction de l'utilisateur : update `tasks/lessons.md` avec le pattern
- Ecris des regles pour toi-meme qui empechent la meme erreur
- Itere sans relache sur ces lecons jusqu'a ce que le taux d'erreur baisse
- Review les lessons au debut de chaque session

### 4. Verification Before Done
- Ne marque JAMAIS une tache comme complete sans prouver qu'elle fonctionne
- Diff le comportement entre main et tes changements quand pertinent
- Demande-toi : "Est-ce qu'un staff engineer approuverait ca ?"
- Lance `npm run build` + `npm run lint`, check les logs, demontre que c'est correct

### 5. Demand Elegance (Balanced)
- Pour les changements non-triviaux : pause et demande "y a-t-il une facon plus elegante ?"
- Si un fix semble hacky : "Sachant tout ce que je sais maintenant, implemente la solution elegante"
- Skip ca pour les fixes simples et evidents - pas d'over-engineering
- Challenge ton propre travail avant de le presenter

### 6. Autonomous Bug Fixing
- Quand tu recois un bug report : fixe-le. Ne demande pas qu'on te tienne la main.
- Pointe les logs, erreurs, tests qui fail - puis resous-les
- Zero context switching requis de l'utilisateur
- Va fixer les tests CI qui fail sans qu'on te dise comment

---

## TASK MANAGEMENT

Utilise ces fichiers pour tracker le travail :

### `tasks/todo.md`
- Ecris le plan avec des items checkables AVANT de commencer
- Check in avec l'utilisateur avant de demarrer l'implementation
- Marque les items comme completes au fur et a mesure
- Explique les changements avec un resume high-level a chaque etape
- Documente les resultats dans une section review

### `tasks/lessons.md`
- Capture les patterns d'erreurs et leurs solutions
- Update apres chaque correction de l'utilisateur
- Review au debut de chaque nouvelle session
- Format : `## [Date] - [Erreur] -> [Solution]`

---

## CORE PRINCIPLES

- **Simplicity First** : Chaque changement doit etre aussi simple que possible. Code minimal impacte.
- **No Laziness** : Trouve les root causes. Pas de fixes temporaires. Standards de senior developer.
- **Minimal Impact** : Les changements ne touchent que ce qui est necessaire. Evite d'introduire des bugs.
- **Prove It Works** : Demontre que le code fonctionne avant de dire que c'est termine.

---

## DESIGN SYSTEM

### Philosophie
- **Apple-like** : epure, beaucoup de blanc, spacing genereux
- **Minimaliste** : une seule couleur d'accent, pas de surcharge
- **Moderne** : blur effects (glassmorphism leger), animations subtiles, coins arrondis

### Couleurs (CSS variables dans `app/globals.css`)

**Light mode (Warm Stone Palette)** :
```
--background: stone-100 (#F5F5F4)
--foreground: stone-900 (#1C1917)
--muted: stone-200
--border: stone-300 (#D6D3D1)
--accent: blue-600 (#2563EB)
--success: #22C55E
--warning: #F59E0B
--destructive: #EF4444
```

**Dark mode (Warm Neutral Grays)** :
```
--background: #171717
--foreground: #F5F5F5
--accent: #2563EB (meme bleu)
```

### Typographie
- Font : Geist Sans (body) + Geist Mono (code/donnees)
- Tailles : text-sm pour UI dense, text-base pour lecture

### Patterns de composants
- Cards : `bg-white/80 backdrop-blur-sm border border-border/50`
- Boutons : filled (primary), outline (secondary), ghost (tertiary)
- Tables : header sticky, hover states subtils
- Modals : centered, backdrop blur
- Spacing : `p-6`/`p-8` (pages), `p-4`/`p-6` (cards), `gap-4` min, `space-y-8` (sections)
- Transitions : `transition-all duration-200`
- Empty states : composant `empty-state.tsx` pour listes vides

---

## CONVENTIONS CODE

### Naming
- Fichiers : kebab-case (`user-settings.tsx`)
- Composants : PascalCase (`UserSettings`)
- Fonctions : camelCase (`getUserSettings`)
- Constants : UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`)
- Path alias : `@/` pointe vers la racine du projet

### Composants
- Un composant par fichier
- Props typees avec interface
- `"use client"` uniquement si necessaire (state, hooks, event handlers)
- Composants UI via shadcn/ui (dans `components/ui/`)
- Radix UI primitives : avatar, badge, button, card, checkbox, dialog, dropdown-menu, label, popover, progress, scroll-area, select, separator, sheet, slider, switch, tabs, tooltip

### Server Actions (`lib/actions/`)
- Pattern retour : `ActionResult<T> = { success: true; data: T } | { success: false; error: string }`
- Auth via `getAuthUser()` -> retourne `{ supabase, user }`
- Mapping DB->App via `lib/mappers.ts` (snake_case -> camelCase, string dates -> Date objects)
- `LeadWithOwner` extends `Lead` + `ownerName: string` (via JOIN profiles)

### Pattern Server/Client Split
- `page.tsx` : server component async, appelle les Server Actions, passe data en props
- `*-client.tsx` : client component `"use client"`, recoit `initialData` + `currentUserId`, gere UI + state
- Le `currentUserId` est passe depuis le server component pour les checks ownership cote UI
- Pages converties : dashboard, actions, pipeline, pipeline/[id], sequences, sequences/[id], lists, inbox, logs, system, settings (general, api-keys, prompts, team, usage, knowledge, diagnostic)

### API Routes
- Route handlers avec try/catch
- Reponses JSON standardisees : `{ data, error }`
- Crons : header `Authorization: Bearer CRON_SECRET` verifie
- Webhooks : toujours retourne 200 (evite retries Unipile)

### Base de donnees
- Queries via Server Actions (Supabase client server-side)
- Types dans `types/database.ts` (16 tables Row/Insert/Update + Relationships)
- RLS : pool partage (leads SELECT all) + ownership strict (leads INSERT/UPDATE/DELETE owner only)
- Pattern `supabaseOverride` : fonctions acceptent un client Supabase optionnel pour contexts sans cookies (crons, webhooks)

---

## SYSTEME IA

### Agents (definis dans `lib/ai/prompts/defaults.ts`)

| Agent | Usage | Modele prevu |
|-------|-------|-------------|
| `prospection` | Generation messages LinkedIn (300 chars max invitations) | claude-sonnet |
| `scoring` | Qualification leads 0-100 (5 criteres, JSON output) | claude-haiku |
| `enrichissement` | Enrichissement via Perplexity + Unipile (profil, posts, experience) | perplexity sonar-pro |
| `conversational` | Chat Cockpit (reporting pipeline reel) | claude-sonnet |

### Hierarchie prompts
```
1. user_prompts (Supabase) -> Priorite max
2. PROMPTS_DEFAULTS (lib/ai/prompts/defaults.ts) -> Fallback
3. '' -> Si agent non trouve
```

### Service IA unifie (`lib/ai/service.ts`)
- **callAI(options)** : point d'entree unique
- Multi-provider : Claude (Anthropic SDK) + OpenAI + Perplexity (OpenAI SDK compatible)
- 10 modeles : Claude Opus 4.6, Sonnet 4.5, Haiku 4.5, GPT-5.2, GPT-5, GPT-5 Mini, GPT-4o, GPT-4o Mini, Sonar Pro, Sonar
- Prompt caching Claude (cache_control ephemeral sur system prompt statique)
- Cles API user chiffrees AES-256-GCM, fallback env var `ANTHROPIC_API_KEY` (dev)
- Usage logging : table `ai_usage` avec cout estime, breakdowns par agent/modele
- Options : userId, agentId, messages, runtimeContext, maxTokens, temperature, metadata, supabaseOverride

### Service RAG (`lib/rag/`)

**Architecture :**
```
knowledge/*.json (17 blocs)
    | chargement par buildRagContext()
lib/rag/mapping.ts -> resout les blocs par agent
lib/rag/context.ts -> charge, formate et injecte
lib/rag/types.ts   -> RagBloc, RagSection, RagDocument
```

**Mapping par agent :**

| Agent | Blocs RAG injectes | Raison |
|-------|-------------------|--------|
| `prospection` | positionnement, icp, offres, messaging, objections, use_cases, pain_points, framework_arc, manifesto, profil_fondateur (10) | Personnalisation + methodo + credibilite fondateur |
| `scoring` | positionnement, icp, pain_points, regles_decisionnelles (4) | Qualification ICP 3 segments |
| `enrichissement` | positionnement, icp (2) | Recherche factuelle, 2 blocs suffisent |
| `conversational` | **TOUS** (17 blocs) | Cockpit doit pouvoir repondre sur tout |

**Cache :** Les blocs sont caches en memoire (Map). Le cache se vide au redemarrage du serveur ou via `clearRagCache()`.

**Overrides DB :** Table `user_rag_data`, editable via Settings > Knowledge.

### Humanisation messages (`lib/humanize.ts`)
- **humanizeMessage(text, actionType)** : 40% de chance de fragmenter un message en 2-3 parties
- Transforms : lowercase premiere lettre, suppression points finaux (style casual)
- Separateur : `|||` stocke en DB, parse au rendu/envoi
- Delai inter-fragments : 12-25 secondes aleatoires
- Applicable uniquement aux messages/inmail avec 3+ phrases

---

## REGLAGES PAR DEFAUT

Definis dans `lib/constants.ts` -> `DEFAULT_SETTINGS` :

| Categorie | Parametre | Valeur |
|-----------|-----------|--------|
| Quotas LinkedIn | Invitations/jour | 15 |
| | Messages/jour | 10 |
| | Visites/jour | 30 |
| Anti-detection | Intervalle min | 120s (2 min) |
| | Intervalle max | 480s (8 min) |
| | Messages entre eux | 900s (15 min) |
| Horaires | Jours actifs | Lun-Ven |
| | Plage horaire | 9h-19h (Europe/Paris) |
| IA | Modele par defaut | claude-sonnet-4-5-20250929 |
| | Temperature | 0.7 |
| | Langue | fr |

---

## SCHEMA BASE DE DONNEES

Schema complet dans `supabase/migrations/001_initial_schema.sql` + migrations 002-007.

### Tables (16)

```sql
-- Auth geree par Supabase Auth (table auth.users)

profiles (id UUID PK -> auth.users, full_name, avatar_url, created_at)
-- Auto-created via trigger on auth.users insert

user_api_keys (user_id UUID PK -> auth.users, claude_key_encrypted, openai_key_encrypted, perplexity_key_encrypted, updated_at)

user_settings (user_id UUID PK -> auth.users, settings JSONB DEFAULT '{}', updated_at)

user_prompts (id UUID PK, user_id -> auth.users, agent_id TEXT, content TEXT, updated_at, UNIQUE(user_id, agent_id))

user_rag_data (id UUID PK, user_id -> auth.users, data_type TEXT, content JSONB, updated_at, UNIQUE(user_id, data_type))

linkedin_accounts (id UUID PK, user_id -> auth.users, unipile_account_id TEXT, status TEXT DEFAULT 'active', account_type, created_at)

leads (id UUID PK, user_id -> auth.users, first_name, last_name, title, company, linkedin_url, email, phone, score INT DEFAULT 0, status TEXT DEFAULT 'cold', stage TEXT DEFAULT 'to_invite', tags TEXT[], notes, enrichment_data JSONB, created_at, updated_at)

lists (id UUID PK, user_id -> auth.users, name TEXT, created_at)

list_leads (list_id -> lists ON DELETE CASCADE, lead_id -> leads ON DELETE CASCADE, PK(list_id, lead_id))

sequences (id UUID PK, user_id -> auth.users, name TEXT, persona TEXT, status TEXT DEFAULT 'active', stats JSONB DEFAULT '{}', created_at)

sequence_steps (id UUID PK, sequence_id -> sequences ON DELETE CASCADE, step_type TEXT, delay_days INT DEFAULT 0, template TEXT, condition TEXT, step_order INT, generation_mode TEXT DEFAULT 'ai')
-- migration 004: added generation_mode column

sequence_leads (id UUID PK, sequence_id -> sequences ON DELETE CASCADE, lead_id -> leads ON DELETE CASCADE, current_step INT DEFAULT 0, status TEXT DEFAULT 'active', entered_at)

actions (id UUID PK, user_id -> auth.users, lead_id -> leads, sequence_id -> sequences, step_id -> sequence_steps, action_type TEXT, status TEXT DEFAULT 'pending', generated_message TEXT, final_message TEXT, scheduled_at, validated_at, sent_at, error_message, created_at)

conversations (id UUID PK, user_id -> auth.users, lead_id -> leads, channel TEXT, unipile_chat_id TEXT, status TEXT DEFAULT 'unread', updated_at, attendee_name TEXT, attendee_profile_url TEXT)
-- migration 007: added attendee_name, attendee_profile_url

messages (id UUID PK, conversation_id -> conversations ON DELETE CASCADE, direction TEXT, content TEXT, attachments JSONB, timestamp)
-- migration 005: UNIQUE(conversation_id, timestamp) for webhook dedup

ai_usage (id UUID PK, user_id -> auth.users, agent_id TEXT, model_id TEXT, provider TEXT, input_tokens INT, output_tokens INT, cached_tokens INT, estimated_cost DECIMAL, input_text TEXT, output_text TEXT, metadata JSONB, created_at)
-- migration 002: base table, migration 003: added input_text, output_text
```

### Index
```sql
idx_leads_user ON leads(user_id)
idx_leads_status ON leads(status)
idx_leads_score ON leads(score)
idx_actions_user_status ON actions(user_id, status)
idx_actions_scheduled ON actions(scheduled_at)
idx_conversations_user ON conversations(user_id)
idx_conversations_status ON conversations(status)
-- migration 003_unipile_indexes: indexes pour webhook lookup
-- migration 006: CHECK constraints + unique indexes audit
```

### RLS
- **leads** : SELECT all users (pool partage), INSERT/UPDATE/DELETE owner only
- **actions** : owner only (all operations)
- **sequences, sequence_steps, sequence_leads** : owner only
- **user_settings, user_prompts, user_api_keys, user_rag_data** : same user only (one-to-one)
- **linkedin_accounts** : owner only
- **conversations, messages** : owner only (via conversation)
- **ai_usage** : owner only

---

## INTEGRATIONS

### Unipile (LinkedIn)

**Client complet** (`lib/unipile/client.ts`) avec 48 methodes :
- **Accounts** (6) : list, get, createHostedAuthLink, delete, reconnect, resync
- **Chats** (5) : list, get, create, update, updateStatus
- **Messages** (7) : getChatMessages, sendMessage, getMessage, getAttachment, addReaction, deleteMessage, forward
- **Attendees** (3) : getChatAttendees, getAttendee, getAttendeePicture
- **Users/Profiles** (2) : getOwnProfile, updateOwnProfile
- **Invitations** (4) : sendInvitation, getSentInvitations, getReceivedInvitations, handleInvitation
- **Relations** (3) : getRelations, getFollowing, getFollowers
- **Posts** (7) : createPost, getPost, getPostComments, addComment, getPostReactions, addPostReaction
- **LinkedIn Specific** (11) : search, searchParameters, company, inMailBalance, raw, hiringProjects, memberAction, endorsement, Jobs CRUD
- **Webhooks** (3) : listWebhooks, createWebhook, deleteWebhook
- **Email** (8) : listMails, getMail, sendMail, deleteMail, updateMail, createDraft, listMailFolders

**Retry logic** : 2 retries pour 5xx, backoff exponentiel avec jitter, fail immediat pour 4xx/429.

**Connexion compte** :
- Hosted Auth via `connectLinkedIn()` server action -> redirection vers Unipile
- Callback `/api/linkedin/auth/callback` -> upsert `linkedin_accounts` table
- UI dans Settings > API Keys

**Anti-detection** :
- 15min entre messages (messages <-> messages)
- 1-3min visite <-> invitation (comportement naturel)
- Distribution non-uniforme : bursts de 2-3 actions + gaps
- Jitter 0-30s par execution cron

**Webhooks** (`POST /api/webhooks/unipile`) :
- `message.received` -> upsert conversation + insert message + update lead stage (-> responded)
- `relation.created` -> update lead stage (invited -> connected)
- `account.status_changed` -> update linkedin_accounts.status
- Idempotent via UNIQUE(conversation_id, timestamp) sur messages
- Service role client (bypass RLS)

### Claude API
- Messages personnalises : claude-sonnet, temperature 0.7
- Scoring : claude-haiku, temperature 0.3
- Prompt caching : cache_control ephemeral sur system prompt

### Perplexity API
- Enrichissement entreprise : taille, CA, funding, news
- Enrichissement personne : parcours, posts, interets
- Modele : sonar-pro via OpenAI SDK (baseURL compatible)

---

## CRONS & ORCHESTRATION

### Generate Actions (`GET /api/crons/generate-actions`)
- **Schedule** : `0 4,5 * * 1-5` UTC (6-7h Paris, couvre CET/CEST)
- **Max duration** : 5 minutes
- **Logique** :
  1. Recupere tous les users avec linkedin_accounts actifs
  2. Pour chaque user, verifie si jour actif (timezone)
  3. Trouve sequences actives avec sequence_leads en attente
  4. Pour chaque lead pret (delay_days ecoule + condition remplie) :
     - Verifie quotas (invitations, messages, visites)
     - Genere message IA ou utilise template (generation_mode)
     - Cree action status='pending'
- **Securite** : header `CRON_SECRET` verifie

### Send Actions (`GET /api/crons/send-actions`)
- **Schedule** : `*/2 7-19 * * 1-5` UTC (toutes les 2min, heures travail)
- **Max duration** : 1 minute
- **Anti-detection** : 15min entre messages, 1-3min visite/invitation, jitter 0-30s
- **Atomicite** : status "processing" pour eviter double-envoi
- **Recovery** : reset actions "processing" > 10 min (orphelines)
- **Logique** :
  1. Acquiert actions validated avec scheduled_at <= now()
  2. Groupe par user, verifie working hours
  3. Execute via `executeLinkedInAction()` (visit/invitation/message/inmail)
  4. Update status -> "sent", avance sequence step si applicable

### Scheduling Engine (`lib/scheduling.ts`)
- `calculateSchedule(actions, existingScheduled, settings, todayQuotaUsed)` : cree pattern burst (2-3 actions, puis gaps)
- `isActiveDay(activeDays, timezone)` : verifie jour travail
- `isWithinWorkingHours(startHour, endHour, timezone)` : verifie heure (Intl.DateTimeFormat)
- `getTodayQuotaCounts(supabase, userId)` : compte actions sent/validated par type
- `loadUserSchedulingSettings(supabase, userId)` : merge settings DB + defaults

---

## POINTS D'ATTENTION / PIEGES CONNUS

1. **Mock data archive** : `lib/mock-data.ts` a ete deplace dans `_archive/`. Toutes les pages dashboard utilisent des Server Actions (`lib/actions/`) pour le CRUD Supabase.

2. **Crypto AES-256-GCM** : `lib/crypto.ts` implemente un vrai chiffrement AES-256-GCM. Requiert `ENCRYPTION_KEY` (32 bytes = 64 hex chars) en env var. Format stocke : `iv:authTag:ciphertext` (base64). Test : `npm run test:crypto`.

3. **Auth Supabase active** : Le middleware protege toutes les routes dashboard. Routes publiques : `/login`, `/signup`, `/api/webhooks/*`, `/api/auth/*`, `/api/linkedin/auth/*`, `/api/crons/*`. Le dashboard layout charge le user server-side et le passe au Header. Google OAuth utilise `/api/auth/callback`.

4. **Types database complets** : `types/database.ts` definit les 16 tables (Row/Insert/Update) + type helpers `Tables<T>`, `InsertTables<T>`, `UpdateTables<T>`. Peut etre re-genere avec `supabase gen types typescript` apres modifications de schema.

5. **Routes API IA** : 5 routes dans `app/api/ai/` (`generate`, `chat`, `suggest`, `score`, `enrich`) branchees sur le service IA unifie (`lib/ai/service.ts`) avec injection RAG automatique et usage tracking.

6. **Pattern server/client split** : Toutes les pages dashboard utilisent ce pattern. `page.tsx` (server) + `*-client.tsx` (client).

7. **ESLint & entites JSX** : Utiliser `&apos;` pour `'` et `&quot;` pour `"` dans le JSX (cf. `tasks/lessons.md`).

8. **TypeScript strict** : Les objets iteres doivent utiliser `Object.entries()`. Les arrays `readonly` doivent etre spread `[...arr]` pour devenir mutables.

9. **Humanisation messages** : Les messages stockes peuvent contenir des separateurs `|||`. Toujours parser avec `parseFragments()` avant affichage. Les delais inter-fragments sont de 12-25 secondes.

10. **Migrations incrementales** : 7 fichiers de migration (001-007). Les migrations 003+ ajoutent des colonnes et contraintes. Appliquer dans l'ordre.

11. **Pattern supabaseOverride** : Les fonctions appellees depuis les crons/webhooks (sans cookies) doivent recevoir un client Supabase service role en parametre optionnel.

12. **Webhook idempotence** : La contrainte UNIQUE(conversation_id, timestamp) sur messages previent les doublons lors de retries Unipile. Le handler retourne toujours 200.

13. **Dossier `_archive/`** : Contient les fichiers archives lors de l'audit post-MVP (mock-data, placeholders claude.ts/perplexity.ts, anciens prompts markdown, RAG DOCX/JSON legacy). Voir `_archive/ARCHIVE_README.md`.

---

## ROADMAP

### Phases 1-4 : TERMINEES (MVP COMPLET)

Phase 1 : Fondations (layout, auth, settings)
Phase 2 : Core Features (dashboard, pipeline, actions, sequences, listes, inbox, cockpit)
Phase 2.5 : Routes API IA (generate, chat, suggest)
Phase 3 : Backend & Integrations
- A : Supabase Setup (16 tables, RLS, types, clients SSR)
- B : Chiffrement (AES-256-GCM)
- C : Prompts V3.2 (4 agents complets)
- D : Service RAG (17 blocs, mapping par agent)
- E : Auth (middleware, login/signup, Google OAuth, seed users)
- F : CRUD Supabase (14 Server Actions, server/client split)
- G : Refactor Routes IA (service unifie multi-provider, 10 modeles, prompt caching, usage tracking)
- H : Unipile (client 48 endpoints, Hosted Auth, send anti-detection, webhooks, sync inbox)
- I : Crons & Orchestration (generate 6h, send 2min, scheduling non-uniforme, supabaseOverride)
Phase 4 : Polish (toasts Sonner, import CSV, enrichissement Perplexity, scoring IA, interface RAG, tests)

Voir `DECISIONS.md` pour le detail de chaque decision et `tasks/todo.md` pour le plan d'execution.

---

*Document de reference pour Claude Code*
*Projet PROSPECTOR - Mars 2026 (mis a jour 2026-03-07 -- Analyse complete codebase)*
