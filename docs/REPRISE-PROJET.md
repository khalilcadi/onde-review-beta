# PROSPECTOR - Guide de Reprise Projet

> Ce document permet de reprendre le projet sur une nouvelle machine.
> Dernière mise à jour : 2026-02-28

---

## 1. Setup rapide nouvelle machine

```bash
# 1. Cloner le repo
git clone https://github.com/khalilcadi/jarvisprospector.git
cd jarvisprospector

# 2. Installer les dépendances
npm install

# 3. Créer .env.local avec les variables (voir section 2)

# 4. Vérifier que tout compile
npm run build

# 5. Lancer en dev
npm run dev
```

---

## 2. Variables d'environnement (.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Chiffrement (32 bytes = 64 hex chars)
ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Unipile (LinkedIn)
UNIPILE_API_KEY=xxx
UNIPILE_DSN=api30.unipile.com:16030

# Crons Vercel
CRON_SECRET=xxx

# (Optionnel, dev fallback) Clé Anthropic directe
ANTHROPIC_API_KEY=sk-ant-...
```

**IMPORTANT** : `UNIPILE_DSN` est `api30.unipile.com:16030` (PAS `api1.unipile.com:13111` qui est le default).

---

## 3. État du projet au 2026-02-28

### Ce qui est TERMINÉ (MVP complet)

- **Phase 1-2** : UI complète (16 routes, toutes compilent)
- **Phase 3** : Backend complet (Supabase, Auth, CRUD, Routes IA, Unipile, Crons)
- **Phase 4** : Polish (Toasts, Import CSV, Enrichissement, Scoring, RAG UI, Tests, Seed)

### Travail récent (post-MVP)

En ordre chronologique inversé :

| Commit | Description |
|--------|-------------|
| `971e890` | Modal leads inscrits dans séquence + retrait lead |
| `0258d1c` | Fix: pass authenticated supabase client to saveLinkedInAccount |
| `7817ae4` | Fix: saveLinkedInAccount replace upsert with check+insert/update |
| `dadf4e1` | Audit UI/UX: P0 accessibilité + P1 cohérence visuelle + design system |
| `676f7b8` | Feat: vue Timeline dans Daily Actions + vérification scheduling |
| `96a4c8e` | Audit cohérence: 6 fixes critiques + cleanup + DB constraints |
| `5967b55` | Fix: Unipile cookie auth response type mismatch |
| `ce12b45` | Feat: auto-correction stage 1er degré + dropdown changement stage |
| `3294ed1` | Fix: scoring fit aligné sur ICP RAG (solopreneur) au lieu de PME |
| `7783bf1` | Rule: interdire tiret cadratin dans messages générés |
| `2fa2152` | Fix: Unipile field mapping (summary vs about, work_experience vs experience) |
| `6925b50` | Feat: Unipile enrichi, profil complet, posts par lead, photos UI |
| `96115f6` | Fix: enrichissement préserve scoring_detail + affiche données V4 |
| `3dec3d7` | Feat: affichage complet données enrichies V4 sur fiche lead |
| `10828aa` | Feat: migration prompts V4 |

### Changements utilisateur récents (non committés)

L'utilisateur a modifié manuellement :
1. **`lib/ai/prompts/defaults.ts`** :
   - Ajout règle "Ne jamais utiliser de tiret cadratin" dans agents prospection et conversational
   - Scoring fit réaligné sur ICP RAG (solopreneur B2B) au lieu de PME 20-100
2. **`types/leads.ts`** : Ajout du type `SignalType` union
3. **`lead-detail-client.tsx`** : Card "Signal" ajoutée dans la fiche lead

---

## 4. Sujet en cours : Enrichissement Lead

**Dernier travail** : Session sur l'intégration Unipile enrichie.

**Documentation détaillée** : voir `docs/ENRICHISSEMENT-DATA.md`

**Résumé rapide** :
- Le profil LinkedIn complet est fetchable via `linkedin_sections=*`
- Les posts par lead (endpoint `/users/{identifier}/posts`) ne fonctionnent PAS (limitation Unipile)
- Le profil Unipile est stocké dans `enrichment_data.linkedin_profile`
- Les données structurées (company, person, signal) viennent de Perplexity
- Il y a de la duplication entre linkedin_profile et les données Perplexity
- Les posts LinkedIn sont maintenant récupérables via `provider_id` (pas le slug)
- Les posts bruts sont stockés dans `enrichment_data.linkedin_posts`
- La prochaine étape serait de restructurer tout ça proprement

**Account ID Unipile** : `8bGZCi3mQw2LgAiGGuInqw` (auto-détectable via `GET /accounts`)
> L'ancien ID `OXFh3tVsRV2rB9AebpNTYA` n'est plus valide.

---

## 5. Infos clés par domaine

### Authentification
- Supabase Auth (email + Google OAuth)
- Middleware protège toutes les routes dashboard
- 3 users seed : voir `scripts/seed-users.ts`
- OAuth callback : `/api/auth/callback`

### Unipile (LinkedIn)
- Client complet : `lib/unipile/client.ts` (48 méthodes)
- Hosted Auth pour connexion compte LinkedIn
- DSN spécifique : `api30.unipile.com:16030`
- Webhook : `POST /api/webhooks/unipile` (message.received, relation.created)

### IA
- 4 agents : prospection, scoring, enrichissement, conversational
- Prompts V4 dans `lib/ai/prompts/defaults.ts`
- Service unifié multi-provider : `lib/ai/service.ts`
- 10 modèles supportés (Claude + OpenAI + Perplexity)
- RAG : 14 blocs dans `knowledge/`, injection automatique par agent
- Usage tracking : table `ai_usage`, page Settings > Usage

### Crons
- `GET /api/crons/generate-actions` : 6h00 Paris, génère les actions du jour
- `GET /api/crons/send-actions` : toutes les 2min (9h-19h), envoie les actions validées
- Anti-détection : 15min entre messages, 1-3min visite → invitation
- Config : `vercel.json`

### Scheduling
- `lib/scheduling.ts` : distribution non-uniforme (bursts de 2-3 + gaps)
- Quotas dans `lib/constants.ts` : 15 invitations/j, 10 messages/j, 30 visites/j

---

## 6. Commandes utiles

```bash
# Build + vérification complète
npm run build

# Tests (82 tests)
npm run test

# Seed (3 users + données démo)
npm run seed

# Explorer ce qu'Unipile renvoie pour un profil
npx tsx scripts/explore-unipile-profile.ts \
  "https://www.linkedin.com/in/john-doe/" \
  "OXFh3tVsRV2rB9AebpNTYA"
```

---

## 7. Fichiers de documentation

| Fichier | Contenu |
|---------|---------|
| `CLAUDE.md` | Instructions complètes pour Claude Code (stack, architecture, conventions) |
| `DECISIONS.md` | Toutes les décisions d'architecture |
| `tasks/todo.md` | Plan de travail (phases 1-4 terminées) |
| `tasks/lessons.md` | Erreurs & leçons apprises |
| `docs/ENRICHISSEMENT-DATA.md` | **Doc technique enrichissement complète** |
| `docs/REPRISE-PROJET.md` | **Ce fichier** (guide de reprise) |
| `docs/appel-api-generate-complet.md` | Détail de l'appel API generate |
| `knowledge/README.md` | Documentation structure RAG |
| `_archive/ARCHIVE_README.md` | Index des fichiers archivés |

---

## 8. Points d'attention

1. **Windows + npm** : Si npm ne produit pas d'output, utiliser `"/c/Program Files/nodejs/npm.cmd"` à la place
2. **UNIPILE_DSN** : DOIT être `api30.unipile.com:16030`, sinon "invalid credentials"
3. **ESM hoisting** : Dans les scripts standalone, importer dynamiquement le client Unipile (voir script explore)
4. **Unipile field names** : `summary` vs `about`, `work_experience` vs `experience` avec `linkedin_sections=*`
5. **Merge enrichment_data** : Toujours préserver `scoring_detail` existant lors d'un enrichissement

---

*Guide de reprise PROSPECTOR*
*Créé le 2026-02-28*
