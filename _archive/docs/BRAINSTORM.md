# PROSPECTOR - Brainstorm & Audit Technique

> Audit complet du projet + questions techniques + plan d'action
> Date : 2026-02-09

---

## 1. ETAT DES LIEUX

### Pages UI

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Dashboard | `/` | ✅ Complète | KPIs perso, vue equipe, leaderboard, charts Recharts, funnel pipeline |
| Daily Actions | `/actions` | ✅ Complète | Cards validation, editer/regenerer/annuler/reporter, quotas, bulk operations |
| Pipeline | `/pipeline` | ✅ Complète | Table 8 leads, filtres (statut/stage/score/tags), tri, recherche live |
| Lead Detail | `/pipeline/[id]` | ✅ Complète | Enrichissement, timeline, notes, score, tags |
| Sequences liste | `/sequences` | ✅ Complète | Liste 3 sequences, stats, statut toggle |
| Sequence builder | `/sequences/[id]` | ✅ Complète | Steps editables (type/delai/condition/template), stats sidebar |
| Listes | `/lists` | 🔶 Partielle | Shell UI fonctionnel, CRUD mock, pas d'import CSV/LinkedIn |
| Inbox | `/inbox` | 🔶 Partielle | UI conversations + thread + suggestions reponse mock. Pas de sync LinkedIn reelle |
| Cockpit IA | `/cockpit` | 🔶 Partielle | Chat UI fonctionnel, appel API Claude reel (`/api/ai/chat`), mais contexte pipeline hardcode (pas de donnees reelles) |
| Settings General | `/settings` | ✅ Complète | Quotas, horaires, jours actifs, timezone |
| Settings API Keys | `/settings/api-keys` | ✅ Complète | 3 cles (Unipile/Claude/Perplexity), bouton test connexion, etats loading/success/error |
| Settings Prompts | `/settings/prompts` | ✅ Complète | 4 onglets agents, editeur avec variables cliquables |
| Settings Team | `/settings/team` | ✅ Complète | 3 members, stats individuelles |
| Login | `/login` | ✅ Complète | Email + Google OAuth button, design Apple-like |
| Signup | `/signup` | ✅ Complète | Validation password temps reel (8 chars, maj, chiffre), confirmation |

**Bilan : 15/15 pages compilent. 12 completes, 3 partielles (Lists, Inbox, Cockpit).**

### API Routes (decouverte - pas dans CLAUDE.md)

| Route | Status | Detail |
|-------|--------|--------|
| `POST /api/ai/generate` | ✅ Fonctionnel | Generation messages LinkedIn via Claude Sonnet. Supporte generation + regeneration. Contexte lead injecte. |
| `POST /api/ai/chat` | ✅ Fonctionnel | Chat Cockpit via Claude Sonnet. Contexte pipeline hardcode (faux chiffres). |
| `POST /api/ai/suggest` | ✅ Fonctionnel | Suggestion reponse dans Inbox via Claude Sonnet. Historique conversation injecte. |

**Observation importante** : Ces 3 routes existent et fonctionnent avec `@anthropic-ai/sdk`, mais CLAUDE.md dit "Aucune route API n'existe encore". A mettre a jour.

### Integrations Backend

| Integration | Status | Detail |
|-------------|--------|--------|
| Supabase Auth | ❌ Non commence | `middleware.ts` = pass-through, `lib/supabase/` = placeholders, `supabase/migrations/` vide |
| Supabase DB | ❌ Non commence | Schema SQL defini dans CLAUDE.md (13 tables) mais aucune migration creee |
| Claude API | 🟡 Partiellement fait | 3 routes API fonctionnelles. Mais `lib/ai/claude.ts` = placeholder inutilise. Prompts simplifies vs V3.2 complets dans `prompts/` |
| Perplexity API | ❌ Non commence | `lib/ai/perplexity.ts` = placeholder |
| Unipile (LinkedIn) | ❌ Non commence | `lib/unipile/client.ts` = placeholder, types definis dans `lib/unipile/types.ts` |

### Ressources RAG disponibles (non connectees)

| Source | Fichiers | Contenu |
|--------|----------|---------|
| `knowledge/` | 4 JSON | company.json (basique), personas.json, offers.json, protocols.json (placeholders) |
| `RAG JSON/` | 14 JSON | Blocs business detailles : positionnement, offres, use cases, objections, pricing, messaging, concurrents, onboarding, rules |
| `RAG DOCX/` | ? DOCX | Sources originales des RAG JSON |
| `prompts/` | 7 JSON + 7 MD | Prompts V3.2 complets (prospection, scoring, enrichissement, conversational, orchestrator, validators) |

**Ecart critique** : Les routes API utilisent des prompts simplifies (`lib/ai/prompts/defaults.ts` = 46 lignes) alors que les prompts V3.2 complets existent dans `prompts/` (bien plus riches). Les RAG JSON ne sont charges nulle part.

---

## 2. CE QUI RESTE A FAIRE

### Priorite 1 - Fondations Backend (bloquant pour tout le reste)

1. **Setup Supabase** : Creer le projet, appliquer les migrations SQL (schema 13 tables), generer les types TypeScript
2. **Auth reelle** : Brancher Supabase Auth sur login/signup, middleware de protection des routes dashboard, session management
3. **Migration mock → DB** : Remplacer `lib/mock-data.ts` par des queries Supabase dans les hooks

### Priorite 2 - Service IA complet

4. **Service prompts** : Charger prompts depuis DB (user_prompts) avec fallback sur defaults, injection RAG dynamique
5. **Charger les RAG JSON** : Construire le contexte RAG a partir de `RAG JSON/` + `knowledge/` + `user_rag_data` en DB
6. **Upgrader les prompts** : Remplacer les defaults simplifies par les prompts V3.2 complets de `prompts/`
7. **Scoring IA** : Route API pour qualifier les leads (Claude Haiku, criteres ponderes)
8. **Enrichissement** : Route API pour enrichir les leads via Perplexity

### Priorite 3 - Integration LinkedIn (Unipile)

9. **Connexion compte LinkedIn** : Hosted Auth Unipile, stockage mapping user <-> compte LinkedIn
10. **Envoi messages/invitations** : Via Unipile API, avec respect des quotas et intervalles aleatoires
11. **Sync conversations** : Recuperer les messages reçus, alimenter l'Inbox
12. **Webhooks** : `new_message` et `new_relation` pour les notifications temps reel
13. **Visite de profil** : Automatiser les visites avant invitation

### Priorite 4 - Orchestration & Automatisation

14. **Generation actions quotidiennes** : Cron qui genere les actions du jour selon les sequences actives
15. **Envoi programme** : Systeme d'envoi avec intervalles aleatoires (2-8 min), respect horaires
16. **Tracking sequence** : Suivre le statut d'un lead dans une sequence (step actuel, conditions, transitions)
17. **Import leads** : CSV et/ou scraping LinkedIn

### Priorite 5 - Polish & Production

18. **Chiffrement reel** : Remplacer Base64 par AES-GCM pour les cles API
19. **Notifications** : Toast/badge quand nouvelle reponse, action echouee, etc.
20. **Tests** : Au minimum les routes API et les hooks critiques
21. **Monitoring** : Logs structures, error tracking
22. **npm audit** : Corriger les vulnerabilites connues

---

## 3. QUESTIONS TECHNIQUES A TRANCHER

### 3.1 Architecture API : Route Handlers vs Server Actions

**Contexte** : Next.js 14 offre deux paradigmes pour les operations serveur. Les 3 routes API existantes utilisent des Route Handlers (`app/api/`).

**Options** :
- **A) Route Handlers (`app/api/`)** : API REST classique, endpoints explicites, facile a tester avec curl/Postman
- **B) Server Actions** : Appels directs depuis les composants, moins de boilerplate, typage end-to-end
- **C) Hybride** : Server Actions pour les mutations simples (CRUD leads, settings), Route Handlers pour les operations longues (generation IA, webhooks)

**Ma recommandation** : **C) Hybride**
- Les 3 routes IA existantes restent en Route Handlers (streaming futur, timeout long, testabilite)
- CRUD Supabase (leads, settings, prompts) → Server Actions (plus simple, type-safe)
- Webhooks Unipile → Route Handlers (endpoints publics)

**Impact si mauvais choix** : Si tout en Server Actions, on perd la possibilite de tester les endpoints IA independamment et le streaming futur. Si tout en Route Handlers, beaucoup de boilerplate pour des operations CRUD simples.

---

### 3.2 Stockage et chiffrement des cles API utilisateurs

**Contexte** : Chaque user a 3 cles API (Unipile, Claude, Perplexity). Actuellement `lib/crypto.ts` utilise du Base64 (zero securite).

**Options** :
- **A) Chiffrement cote serveur (AES-256-GCM)** : Une `ENCRYPTION_KEY` en env var, chiffrement/dechiffrement dans les Route Handlers
- **B) Supabase Vault** : Utiliser le vault natif de Supabase pour stocker les secrets
- **C) Chiffrement cote client + stockage chiffre en DB** : La cle ne transite jamais en clair sur le serveur

**Ma recommandation** : **A) AES-256-GCM cote serveur**
- Simple a implementer (Node.js `crypto` natif)
- Une seule `ENCRYPTION_KEY` dans les env vars Vercel
- Dechiffrement uniquement dans les Server Actions / Route Handlers (jamais cote client)
- Supabase Vault est overkill pour 3 users

**Impact si mauvais choix** : Si on garde le Base64 en prod, les cles API sont lisibles en clair en DB. Si on complexifie trop (Vault), on ajoute de la maintenance pour 3 users.

---

### 3.3 Prompts : Hardcodes vs DB

**Contexte** : Actuellement les prompts sont dans `lib/ai/prompts/defaults.ts` (version simplifiee). Les prompts V3.2 complets sont dans `prompts/` (7 fichiers JSON). La page Settings > Prompts permet d'editer les prompts par agent.

**Options** :
- **A) Defaults dans le code, overrides en DB** : `PROMPTS_DEFAULTS` comme fallback, `user_prompts` en DB pour les personnalisations
- **B) Tout en DB** : Seed initial depuis les fichiers `prompts/`, puis tout gere via DB
- **C) Fichiers JSON charges au runtime** : Lire `prompts/*.json` directement, overrides user en DB

**Ma recommandation** : **A) Defaults dans le code, overrides en DB**
- Les defaults V3.2 sont importes dans `PROMPTS_DEFAULTS` (upgrader le fichier actuel avec les contenus de `prompts/*.json`)
- La table `user_prompts` stocke les edits utilisateur
- Hierarchie : `user_prompts[userId][agentId]` → `PROMPTS_DEFAULTS[agentId]` → `''`
- C'est deja le design prevu dans CLAUDE.md

**Impact si mauvais choix** : Si tout en DB sans fallback, un seed rate = IA cassee. Si fichiers JSON au runtime, pas de personnalisation user possible sans couche supplementaire.

---

### 3.4 RAG : Chargement du contexte

**Contexte** : 3 sources de donnees RAG existent mais aucune n'est connectee :
- `knowledge/` : 4 JSON basiques (placeholders)
- `RAG JSON/` : 14 blocs business detailles (positionnement, pricing, objections, etc.)
- `user_rag_data` (table prevue) : Donnees RAG personnalisees par user

Actuellement, les routes API ont le contexte JARVIS hardcode en string dans chaque fichier.

**Options** :
- **A) Charger les RAG JSON au build time** : `import` statique des fichiers, concatenation au system prompt
- **B) Charger a la demande** : `fs.readFile` dans chaque route API, selection contextuelle des blocs pertinents
- **C) Tout en DB** : Migrer les RAG JSON dans `user_rag_data`, charger depuis Supabase
- **D) Hybride** : Defaults depuis fichiers (`knowledge/` + `RAG JSON/`), overrides user en DB

**Ma recommandation** : **D) Hybride**
- Fusionner `knowledge/` et `RAG JSON/` en un seul dossier `knowledge/` bien structure
- Charger au runtime via `buildRagContext()` (deja prevu dans `lib/rag/context.ts`)
- Overrides user depuis `user_rag_data` en DB
- Selection contextuelle : l'agent prospection ne recoit pas les 14 blocs, seulement ceux pertinents (positionnement, offres, messaging, objections)

**Impact si mauvais choix** : Si on injecte tout le RAG dans chaque prompt, on explose les tokens (et le cout). Si on ne selectionne pas, les messages generes seront generiques.

---

### 3.5 Versioning des prompts

**Contexte** : Les prompts V3.2 vont evoluer. Si un user edite un prompt, il faut pouvoir rollback.

**Options** :
- **A) Pas de versioning** : On ecrase, c'est tout (simple, 3 users)
- **B) Soft versioning** : Colonne `version` dans `user_prompts` + historique via `updated_at`
- **C) Full versioning** : Table `prompt_versions` avec historique complet

**Ma recommandation** : **A) Pas de versioning pour le moment**
- 3 utilisateurs internes, on peut toujours restaurer depuis le code
- Les defaults V3.2 sont dans le code, donc jamais perdus
- Si besoin plus tard, on ajoute un `previous_content` dans `user_prompts`

**Impact** : Negligeable. On peut toujours "Reset to default" depuis le code.

---

### 3.6 Webhooks Unipile

**Contexte** : Unipile envoie des webhooks (`new_message`, `new_relation`) quand un lead repond ou accepte une invitation. Il faut un endpoint public pour les recevoir.

**Options** :
- **A) Route Handler Next.js** : `app/api/webhooks/unipile/route.ts`, verification signature, traitement synchrone
- **B) Route Handler + queue** : Recevoir le webhook, mettre en queue (Vercel KV ou Supabase), traiter en async
- **C) Supabase Edge Function** : Webhook directement vers Supabase, trigger DB

**Ma recommandation** : **A) Route Handler Next.js simple**
- Pour 3 users, le volume de webhooks sera faible (<100/jour)
- Pas besoin de queue : recevoir, verifier, upsert en DB, notifier
- Si scaling necessaire plus tard, on ajoute une queue

**Impact si mauvais choix** : Si on over-engineer avec une queue, complexite inutile. Si le webhook handler est trop lent, Unipile peut timeout (mais peu probable avec 3 users).

---

### 3.7 Rate limits LinkedIn et envoi espace

**Contexte** : LinkedIn detecte les comportements automatises. Il faut espacer les actions (2-8 min aleatoire) et respecter les quotas journaliers (15 invitations, 50 messages, 30 visites).

**Options** :
- **A) Cron Vercel (1 min)** : Un cron qui verifie chaque minute s'il y a une action a envoyer, avec jitter aleatoire
- **B) setTimeout cote serveur** : Apres chaque envoi, programmer le suivant avec un delai aleatoire
- **C) Queue avec delai** : Supabase/Vercel KV comme queue, chaque action a un `scheduled_at` precis

**Ma recommandation** : **C) Queue basee sur `scheduled_at`**
- La table `actions` a deja un champ `scheduled_at`
- Un cron Vercel (toutes les 1-2 min) verifie : "y a-t-il une action avec `status = 'validated'` et `scheduled_at <= NOW()` ?"
- Si oui, envoyer via Unipile, marquer `status = 'sent'`
- Le scheduling avec jitter aleatoire se fait au moment de la validation (pas a l'envoi)

**Impact si mauvais choix** : Si setTimeout cote serveur, on perd les actions programmees si le serveur redemarrer (serverless = pas de state). Le cron + `scheduled_at` est resilient.

---

### 3.8 Generation quotidienne des actions

**Contexte** : Chaque matin (ex: 8h), le systeme doit generer les actions du jour pour chaque user selon ses sequences actives.

**Options** :
- **A) Cron Vercel** : `vercel.json` avec schedule, appel a une route API qui genere
- **B) Supabase Edge Function + pg_cron** : Trigger directement en DB
- **C) Manuel** : Le user clique un bouton "Generer mes actions du jour" dans le dashboard

**Ma recommandation** : **A) Cron Vercel + bouton manuel en fallback**
- Cron a 8h00 Europe/Paris → `/api/crons/generate-actions`
- Bouton "Regenerer" dans Daily Actions pour forcer manuellement
- Le cron parcourt les sequences actives, identifie les leads au bon step/delai, genere via Claude

**Impact si mauvais choix** : Si seulement manuel, les users oublient et la prospection s'arrete. Si seulement cron sans fallback, pas de flexibilite.

---

### 3.9 Tracking du lead dans une sequence

**Contexte** : Un lead entre dans une sequence et progresse step par step. Il faut tracker : step actuel, conditions de passage, sorties (reponse, desabonnement).

**Options** :
- **A) Table `sequence_leads`** (deja prevue) : `current_step`, `status`, transitions gerees par le cron
- **B) Event sourcing** : Table d'evenements pour chaque transition, etat calcule
- **C) Champ JSON dans `leads`** : `sequence_state: { sequenceId, currentStep, ... }`

**Ma recommandation** : **A) Table `sequence_leads`** (design actuel)
- `current_step` (int) + `status` (active/paused/completed/exited)
- Le cron verifie les conditions (`step.condition`) avant de passer au step suivant
- Si le lead repond → `status = 'exited'` (ou transition vers une autre sequence)
- Simple, requetable, correspond au schema deja defini

**Impact** : Le design est deja bon dans le schema SQL. Pas de changement necessaire.

---

### 3.10 Multi-user : Leads partages ou isoles ?

**Contexte** : 3 utilisateurs internes (Khalil + 2 associes). Est-ce que chacun a son pool de leads ou un pool partage ?

**Options** :
- **A) Leads isoles par user** : Chaque user a ses propres leads (`leads.user_id` = filtre strict). Pas de chevauchement.
- **B) Pool partage** : Tous les leads sont visibles par tous, mais les actions sont assignees a un user
- **C) Pool partage avec ownership** : Un lead a un `owner_id` (responsable principal), mais tous peuvent le voir

**Ma recommandation** : **C) Pool partage avec ownership**
- `leads.user_id` = owner (celui qui prospecte ce lead)
- Tous les users voient tous les leads dans le Pipeline (evite les doublons de prospection)
- Les actions sont liees au owner du lead
- Le dashboard "equipe" montre les stats de chacun
- Anti-doublon : empecher d'inviter un lead deja dans le pool d'un collegue

**Impact si mauvais choix** : Si leads isoles, risque que 2 associes prospectent la meme personne sur LinkedIn (tres mauvais pour l'image). Le pool partage resout ce probleme.

---

## 4. DECISIONS DEJA PRISES

Extraites du code, des specs et du schema SQL :

| Decision | Source | Detail |
|----------|--------|--------|
| Stack | `package.json` | Next.js 14 App Router + React 18 + TypeScript strict + Tailwind + shadcn/ui |
| Design system | `globals.css` | Apple-like, noir/blanc/bleu, Geist font, glassmorphism leger |
| 4 agents IA | `lib/ai/prompts/defaults.ts` | prospection, scoring, enrichissement, conversational |
| Schema DB | CLAUDE.md | 13 tables PostgreSQL (Supabase), RLS prevu |
| Quotas par defaut | `lib/constants.ts` | 15 invitations, 50 messages, 30 visites/jour, intervalles 2-8 min |
| Horaires actifs | `lib/constants.ts` | Lun-Ven, 9h-19h, Europe/Paris |
| Modele IA | `lib/constants.ts` + routes | claude-sonnet-4-5-20250929, temp 0.7 |
| Crypto future | CLAUDE.md | AES-GCM prevu (actuellement Base64 placeholder) |
| Hierarchie prompts | CLAUDE.md | user_prompts → PROMPTS_DEFAULTS → '' |
| Hosting | CLAUDE.md | Vercel |
| Cles API par user | Schema SQL | Table `user_api_keys`, chiffrees en DB (pas en env vars) |
| SDK Claude | `package.json` | `@anthropic-ai/sdk` v0.73.0 deja installe |
| Sonner | `package.json` | Librairie toast deja installee (pour notifications futures) |
| mammoth | `package.json` | Parseur DOCX deja installe (pour import RAG) |

---

## 5. PLAN D'ACTION PROPOSE

Si je devais finir l'outil, voici l'ordre optimal :

### Phase 3A - Fondations Backend

| # | Tache | Description | Estimation |
|---|-------|-------------|------------|
| 1 | **Setup Supabase** | Creer projet, appliquer les 13 tables du schema SQL, configurer RLS basique, generer types TS | 2-3h |
| 2 | **Auth reelle** | Brancher Supabase Auth (email + Google OAuth), middleware protection routes dashboard, session dans les layouts | 2-3h |
| 3 | **Chiffrement cles API** | Remplacer Base64 par AES-256-GCM dans `lib/crypto.ts`, cle dans env var | 1h |
| 4 | **CRUD Supabase** | Remplacer mock data par queries reelles dans les hooks (`use-leads`, `use-actions`, `use-sequences`, `use-settings`) | 3-4h |
| 5 | **Seed data** | Script pour peupler la DB avec les donnees de test (basees sur mock-data.ts) | 1h |

### Phase 3B - Service IA complet

| # | Tache | Description | Estimation |
|---|-------|-------------|------------|
| 6 | **Upgrader prompts** | Importer les prompts V3.2 complets dans `lib/ai/prompts/defaults.ts` depuis `prompts/*.json` | 1-2h |
| 7 | **Service RAG** | Implementer `buildRagContext()` : charger `RAG JSON/`, selection contextuelle par agent, overrides user | 2-3h |
| 8 | **Refactor routes IA** | Les 3 routes existantes utilisent le nouveau service prompts + RAG au lieu du contexte hardcode | 1-2h |
| 9 | **Route scoring** | `POST /api/ai/score` avec Claude Haiku, retour JSON score + breakdown | 1-2h |
| 10 | **Route enrichissement** | `POST /api/ai/enrich` avec Perplexity API | 2-3h |

### Phase 3C - Integration LinkedIn (Unipile)

| # | Tache | Description | Estimation |
|---|-------|-------------|------------|
| 11 | **Connexion Unipile** | Hosted Auth, stockage compte LinkedIn en DB | 2-3h |
| 12 | **Envoi messages** | `POST /api/linkedin/send` via Unipile, respect quotas | 2-3h |
| 13 | **Sync conversations** | Recuperer messages recus, upsert conversations + messages en DB | 2-3h |
| 14 | **Webhook handler** | `POST /api/webhooks/unipile` pour new_message et new_relation | 1-2h |
| 15 | **Inbox fonctionnel** | Remplacer mock par vraies conversations depuis DB | 2h |

### Phase 3D - Orchestration

| # | Tache | Description | Estimation |
|---|-------|-------------|------------|
| 16 | **Cron generation** | Route `/api/crons/generate-actions`, config Vercel cron 8h00 | 3-4h |
| 17 | **Cron envoi** | Route `/api/crons/send-actions`, check `scheduled_at`, envoi via Unipile | 2-3h |
| 18 | **Scheduling intelligent** | Au moment de la validation, calculer `scheduled_at` avec jitter aleatoire | 1h |
| 19 | **Cockpit reel** | Remplacer le contexte pipeline hardcode par des queries DB reelles | 2h |

### Phase 4 - Polish

| # | Tache | Description | Estimation |
|---|-------|-------------|------------|
| 20 | **Notifications** | Toasts Sonner (deja installe) pour nouvelles reponses, erreurs, quotas atteints | 1-2h |
| 21 | **Import leads** | Upload CSV, parsing, deduplication | 2-3h |
| 22 | **Tests critiques** | Routes API + hooks + crypto | 2-3h |
| 23 | **Monitoring** | Structured logging, error boundaries | 1-2h |
| 24 | **Mettre a jour CLAUDE.md** | Refleter les API routes existantes, nouveau RAG, etc. | 30min |

**Estimation totale : ~45-60h de dev**

### Chemin critique (MVP fonctionnel minimum)

Si on veut un outil **utilisable** le plus vite possible, le chemin critique est :

```
Supabase (3h) → Auth (3h) → CRUD (4h) → Upgrader prompts + RAG (4h)
→ Unipile connexion (3h) → Envoi messages (3h) → Cron envoi (3h)
= ~23h pour un MVP qui envoie de vrais messages LinkedIn avec l'IA
```

Tout le reste (enrichissement, scoring, import CSV, webhooks, notifications) peut venir apres.

---

*En attente de tes decisions sur les questions techniques avant de commencer a coder.*
