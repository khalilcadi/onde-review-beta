# Prompts Sprint - 25 mars 2026

> Copier-coller chaque prompt dans une session Claude Code separee.
> Les sessions A, B, C sont independantes et peuvent tourner en parallele.
> D attend que A soit fini. E attend que D soit fini.

---

## Session A : Fix retry transitoire + reschedule actions failed

```
Lis le plan dans docs/PLAN-SPRINT-2026-03-25.md, sections "Fix 1" et "Fix 4".

Ton travail :

1. **Fix 1 - Retry erreurs transitoires** :
   - Cree la migration supabase/migrations/010_retry_count.sql (ALTER TABLE actions ADD COLUMN retry_count INT DEFAULT 0)
   - Modifie app/api/crons/send-actions/route.ts : au lieu de markActionFailed direct sur les erreurs transitoires (5xx, Disconnected, ECONNRESET, ETIMEDOUT), incremente retry_count et revert le status a "validated" si retry_count < 3. Au-dela de 3, markActionFailed permanent. Pour 429 : increment retry_count + revert validated + BREAK. Pour 422 : markActionFailed permanent. Pour 400/401/403/404 : markActionFailed permanent.
   - Mets a jour le type Database dans types/database.ts pour inclure retry_count dans la table actions (Row, Insert, Update)

2. **Fix 4 - Reschedule 10 actions echouees** :
   - Cree scripts/fix-failed-actions-2026-03.ts qui : SELECT les actions failed du 24 mars avec error_message contenant "Disconnected" ou "SERVER_ERROR", puis les UPDATE en status="validated", error_message=NULL, scheduled_at=demain 07:30 UTC, validated_at=NOW()

3. Verification :
   - npm run build doit passer
   - Mets a jour le plan docs/PLAN-SPRINT-2026-03-25.md : coche les items Fix 1 et Fix 4 dans la checklist si tout passe

Ne touche a RIEN d'autre que les fichiers mentionnes.
```

---

## Session B : Fix webhook crash + cache_control

```
Lis le plan dans docs/PLAN-SPRINT-2026-03-25.md, sections "Fix 2" et "Fix 3".

Ton travail :

1. **Fix 2 - Webhook crash sur events inconnus** :
   - Modifie app/api/webhooks/unipile/route.ts :
     - Ligne 21-23 : utilise data?.account_id ?? "N/A" et data?.chat_id ?? "N/A" dans le console.log
     - Apres le log, ajoute un guard : si !data?.account_id, log un warning et return NextResponse.json({ received: true }) immediatement (avant le findUserByAccountId)

2. **Fix 3 - cache_control sur blocs system vides** :
   - Modifie lib/ai/service.ts, fonction callClaude (~ligne 207) :
     - Ne push le bloc agentPrompt avec cache_control QUE si agentPrompt est truthy (non vide)
     - Si aucun bloc system n'est ajoute (systemBlocks vide), push un fallback minimal { type: "text", text: "You are a helpful assistant." }

3. Verification :
   - npm run build doit passer
   - npm run test:routes doit passer
   - Mets a jour le plan docs/PLAN-SPRINT-2026-03-25.md : coche les items Fix 2 et Fix 3

Ne touche a RIEN d'autre que les fichiers mentionnes.
```

---

## Session C : Vue "data" dans sequences

```
Lis le plan dans docs/PLAN-SPRINT-2026-03-25.md, section "Feature 6".

Ton travail :

1. **Server Action** : dans lib/actions/sequences.ts, ajoute une fonction getSequenceStepStats(sequenceId: string) qui :
   - Charge les steps de la sequence (step_order, step_type, id)
   - Charge les sequence_leads (current_step, status)
   - Pour chaque step, compte combien de leads sont "en attente" (current_step = step_order - 1 et status = active) et combien ont "complete" ce step (current_step >= step_order)
   - Compte aussi les totaux : completed (status=completed), responded (status=responded)
   - Retourne un ActionResult avec ces stats

2. **UI** : dans app/(dashboard)/sequences/[id]/sequence-detail-client.tsx :
   - Ajoute un onglet ou toggle "Data" a cote du builder existant (utilise le composant Tabs de shadcn)
   - L'onglet Data affiche une liste des steps avec pour chacun : nom du step type, step_order, nombre en attente, nombre completes, avec une barre de progression simple (div CSS avec width en %, bg-blue-600)
   - En bas : total leads dans la sequence, termines, ayant repondu
   - Charge les stats via la server action au montage du composant (ou au clic sur l'onglet)

3. Verification :
   - npm run build doit passer
   - Mets a jour le plan docs/PLAN-SPRINT-2026-03-25.md : coche Feature 6

Respecte le design system du projet (Apple-like, minimaliste, stone palette). Regarde le style existant dans le fichier avant d'ajouter du code.
```

---

## Session D : Warm-up automatique (APRES Session A)

```
Lis le plan dans docs/PLAN-SPRINT-2026-03-25.md, section "Feature 5".

Ton travail :

1. **Constants** : dans lib/constants.ts :
   - Ajoute WARMUP_SCHEDULE (array de 2 paliers : jour 1-2 et 3-5 avec quotas invitations/messages/visites)
   - Mets a jour DEFAULT_SETTINGS : daily_invitations_limit=18, daily_messages_limit=25, daily_visits_limit=25

2. **Migration** : cree supabase/migrations/011_warmup_start_date.sql :
   - ALTER TABLE linkedin_accounts ADD COLUMN warmup_start_date TIMESTAMPTZ DEFAULT NULL
   - Les comptes existants gardent NULL = pas de warm-up

3. **Mets a jour types/database.ts** : ajoute warmup_start_date dans linkedin_accounts (Row, Insert, Update)

4. **Scheduling** : dans lib/scheduling.ts, modifie loadUserSchedulingSettings() :
   - Apres avoir charge les settings, query linkedin_accounts pour ce user (status=active)
   - Si warmup_start_date est non-null, calcule l'age en jours depuis warmup_start_date
   - Applique le palier WARMUP_SCHEDULE correspondant en prenant le MIN entre le quota user et le quota warm-up
   - Si warmup_start_date est NULL, pas de warm-up (quotas normaux)

5. **UI Settings** (optionnel si le temps le permet) : dans la page settings ou dashboard, afficher le statut warm-up du compte LinkedIn (jour X/14, quotas actuels)

6. Verification :
   - npm run build doit passer
   - npm run test:routes doit passer (les tests scheduling existants)
   - Mets a jour le plan docs/PLAN-SPRINT-2026-03-25.md : coche Feature 5

IMPORTANT : les comptes LinkedIn existants de Khalil et Ludwig ne doivent PAS etre affectes par le warm-up (warmup_start_date = NULL par defaut). Le warm-up ne s'active que quand on set explicitement warmup_start_date sur un compte.
```

---

## Session E : Cron check invitations (APRES Session D)

```
Lis le plan dans docs/PLAN-SPRINT-2026-03-25.md, section "Feature 7".

Ton travail :

1. **Nouveau cron** : cree app/api/crons/check-invitations/route.ts :
   - Meme pattern d'auth (verifyCronSecret) que les autres crons
   - maxDuration = 120 (2 min)
   - Pour chaque user avec un compte LinkedIn actif :
     a. Trouve les leads en stage "invited" qui sont dans une sequence_leads active
     b. Limite a 20 leads par execution (ORDER BY sequence_leads.entered_at ASC)
     c. Pour chaque lead, appelle getUnipileClient().getUserProfile(identifier, accountId) et check network_distance
     d. Si network_distance indique 1er degre (FIRST, DISTANCE_1, 1, 1ST) : update lead.stage = "connected"
     e. Log chaque transition
   - Retourne un JSON avec le nombre de leads verifies et le nombre de transitions

2. **Vercel config** : dans vercel.json, ajoute le cron :
   { "path": "/api/crons/check-invitations", "schedule": "0 8 * * 1-5" }

3. **Helper existant** : utilise la fonction isFirstDegreeConnection() qui existe deja dans app/api/ai/enrich/route.ts. Soit l'importer (si elle est exportee), soit la dupliquer dans le nouveau fichier.

4. Verification :
   - npm run build doit passer
   - Mets a jour le plan docs/PLAN-SPRINT-2026-03-25.md : coche Feature 7

Le cron doit etre defensif : try/catch par lead, continuer meme si un appel Unipile echoue. Ne jamais crash le cron entier.
```

---

## Ordre d'execution

```
PARALLELE : Session A + Session B + Session C
            ↓
SEQUENTIEL : Session D (apres A)
            ↓
SEQUENTIEL : Session E (apres D)
```
