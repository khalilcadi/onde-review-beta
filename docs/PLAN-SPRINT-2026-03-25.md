# Sprint Plan - 25 mars 2026

> Post-lancement: fixes critiques + warm-up + features sequences
> Objectif: ne jamais se faire bloquer par LinkedIn

---

## Vue d'ensemble

| # | Type | Titre | Priorite | Fichiers impactes |
|---|------|-------|----------|-------------------|
| 1 | ~~Bug fix~~ | ~~Retry erreurs transitoires (Disconnected/Rate limited)~~ | ~~CRITIQUE~~ | ~~`app/api/crons/send-actions/route.ts`~~ ✅ |
| 2 | ~~Bug fix~~ | ~~Webhook crash sur events inconnus~~ | ~~HAUTE~~ | ~~`app/api/webhooks/unipile/route.ts`~~ ✅ |
| 3 | ~~Bug fix~~ | ~~cache_control sur blocs system vides~~ | ~~MOYENNE~~ | ~~`lib/ai/service.ts`~~ ✅ |
| 4 | ~~Data fix~~ | ~~Reschedule 10 actions echouees pour demain~~ | ~~CRITIQUE~~ | ~~Script one-time~~ ✅ |
| 5 | ~~Feature~~ | ~~Warm-up automatique (montee progressive quotas)~~ | ~~CRITIQUE~~ | ~~`lib/constants.ts`, `lib/scheduling.ts`, `supabase/migrations/011_warmup_start_date.sql`~~ ✅ |
| 6 | Feature | ~~Vue "data" dans sequences (compteurs par step)~~ | ✅ DONE | `app/(dashboard)/sequences/[id]/sequence-detail-client.tsx`, `lib/actions/sequences.ts` |
| 7 | ~~Feature~~ | ~~Verification quotidienne acceptation invitations~~ | ~~HAUTE~~ | ~~`app/api/crons/check-invitations/route.ts`, `vercel.json`~~ ✅ |

---

## Parallelisation

```
PARALLELE (sessions independantes) :
  Session A : Fix 1 + Fix 4 (retry cron + reschedule failed actions)
  Session B : Fix 2 + Fix 3 (webhook + cache_control)
  Session C : Feature 6 (vue data sequences - UI pure, pas de dependance)

SEQUENTIEL (apres A+B) :
  Session D : Feature 5 (warm-up - touche scheduling + constants + migration)
  Session E : Feature 7 (cron check invitations - depend du warm-up pour les quotas)

ORDRE OBLIGATOIRE :
  A avant D (le retry doit etre en place avant de changer les quotas)
  D avant E (le warm-up definit les vrais quotas que le cron utilise)
```

---

## Fix 1 : Retry erreurs transitoires

**Probleme**: Le cron `send-actions` marque les actions comme `failed` de maniere permanente quand Unipile renvoie une erreur transitoire (Disconnected, 5xx apres retries). Les actions ne sont jamais retentees.

**Constat**: Le 24 mars, 10 actions ont echoue entre 08:15 et 09:55 UTC a cause d'un probleme temporaire de connectivite Unipile. Les actions schedulees apres 09:57 ont reussi sans intervention. Le marquage permanent a empeche le retry automatique.

**Fichier**: [app/api/crons/send-actions/route.ts](app/api/crons/send-actions/route.ts)

### Solution

Introduire un systeme de `retry_count` + `max_retries` pour distinguer les erreurs transitoires des erreurs permanentes.

**Changement 1 - Migration DB** : Ajouter colonne `retry_count` sur la table `actions`

```sql
-- supabase/migrations/010_retry_count.sql
ALTER TABLE actions ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
```

**Changement 2 - Cron send-actions** : Au lieu de `markActionFailed()` direct, implementer une logique de retry :

```
SI httpStatus === 429 → INCREMENT retry_count, REVERT status a "validated", BREAK (stop user)
SI httpStatus === 422 → markActionFailed permanent (erreur metier, pas de retry)
SI httpStatus >= 500 OU erreur contient "Disconnected" OU "ECONNRESET" OU "ETIMEDOUT":
  SI retry_count < 3 → INCREMENT retry_count, REVERT status a "validated" (sera retente au prochain cron)
  SINON → markActionFailed permanent (3 tentatives echouees)
SI httpStatus 400/401/403/404 → markActionFailed permanent
```

**Changement 3 - Unlock safety** : Le bloc de fin qui revert `processing` → `validated` gere deja le cas ou une action skippee reste en processing. Verifier qu'il fonctionne aussi pour les actions en retry.

### Verification
- `npm run build` passe
- Simuler une erreur 500 : l'action doit rester `validated` avec `retry_count=1`
- Apres 3 echecs : l'action passe `failed` avec `retry_count=3`

---

## Fix 2 : Webhook crash sur events inconnus

**Probleme**: Le webhook Unipile crash avec `TypeError: Cannot read properties of undefined (reading 'account_id')` quand un event inconnu est recu. Le `data` object peut ne pas contenir `account_id` pour certains types d'events.

**Fichier**: [app/api/webhooks/unipile/route.ts](app/api/webhooks/unipile/route.ts)

### Solution

Ajouter un guard sur `data.account_id` AVANT de l'utiliser dans le log et dans `findUserByAccountId`.

**Ligne 21-23** — Remplacer :
```typescript
console.log(`[Webhook Unipile] Event: ${event}`, {
  accountId: data.account_id,
  chatId: data.chat_id,
});
```

Par :
```typescript
console.log(`[Webhook Unipile] Event: ${event}`, {
  accountId: data?.account_id ?? "N/A",
  chatId: data?.chat_id ?? "N/A",
});
```

**Ligne 29-31** — Ajouter guard :
```typescript
if (!data?.account_id) {
  console.warn(`[Webhook Unipile] No account_id in payload for event: ${event}`);
  return NextResponse.json({ received: true });
}
```

### Verification
- `npm run build` passe
- Le webhook ne crash plus sur des events inattendus
- Les events valides (message.received, relation.created, account.status_changed) continuent de fonctionner

---

## Fix 3 : cache_control sur blocs system vides

**Probleme**: L'API Claude rejette `cache_control` sur un `TextBlockParam` dont le `text` est vide (`""`). Ca arrive quand l'`agentPrompt` est une chaine vide (rare mais possible si le prompt DB est vide et le fallback echoue).

**Fichier**: [lib/ai/service.ts](lib/ai/service.ts) — fonction `callClaude` (ligne ~207)

### Solution

Guard le texte avant d'ajouter `cache_control` :

```typescript
const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];

if (agentPrompt) {
  systemBlocks.push({
    type: "text",
    text: agentPrompt,
    cache_control: { type: "ephemeral" },
  });
}

if (ragContext) {
  systemBlocks.push({
    type: "text",
    text: ragContext,
  });
}

if (runtimeContext) {
  systemBlocks.push({
    type: "text",
    text: runtimeContext,
  });
}

// Fallback: si aucun bloc, ajouter un bloc minimal
if (systemBlocks.length === 0) {
  systemBlocks.push({ type: "text", text: "You are a helpful assistant." });
}
```

### Verification
- `npm run build` passe
- `npm run test:routes` passe (verifie les tests existants sur le service IA)

---

## Fix 4 : Reschedule 10 actions echouees

**Probleme**: 10 actions ont echoue le 24 mars a cause d'erreurs transitoires Unipile. Elles sont marquees `failed` et ne seront jamais retentees.

### Solution

Script SQL one-time (a executer dans Supabase SQL Editor ou via un script tsx) :

```sql
-- Identifier les actions failed du 24 mars avec erreur Disconnected/SERVER_ERROR
SELECT id, user_id, lead_id, action_type, error_message, created_at
FROM actions
WHERE status = 'failed'
  AND created_at >= '2026-03-24T00:00:00Z'
  AND created_at < '2026-03-25T00:00:00Z'
  AND (error_message ILIKE '%Disconnected%' OR error_message ILIKE '%SERVER_ERROR%');

-- Les repasser en pending pour demain matin
UPDATE actions
SET status = 'pending',
    error_message = NULL,
    scheduled_at = NULL,
    validated_at = NULL
WHERE status = 'failed'
  AND created_at >= '2026-03-24T00:00:00Z'
  AND created_at < '2026-03-25T00:00:00Z'
  AND (error_message ILIKE '%Disconnected%' OR error_message ILIKE '%SERVER_ERROR%');
```

**Alternative**: Creer `scripts/fix-failed-actions-2026-03.ts` et executer via `npx tsx scripts/fix-failed-actions-2026-03.ts`.

### Verification
- Verifier dans Supabase que les 10 actions sont repassees en `pending`
- Le lendemain matin, le cron generate-actions les verra (ou non — voir Note ci-dessous)

**Note importante**: Les actions remises en `pending` n'ont pas de `scheduled_at`. Elles devront etre validees manuellement dans Daily Actions OU on les met directement en `validated` avec un `scheduled_at` demain matin :

```sql
UPDATE actions
SET status = 'validated',
    error_message = NULL,
    scheduled_at = '2026-03-26T07:30:00Z',  -- 09:30 Paris
    validated_at = NOW()
WHERE status = 'failed'
  AND created_at >= '2026-03-24T00:00:00Z'
  AND created_at < '2026-03-25T00:00:00Z'
  AND (error_message ILIKE '%Disconnected%' OR error_message ILIKE '%SERVER_ERROR%');
```

Cette approche est preferable car les actions seront envoyees automatiquement sans intervention.

---

## Feature 5 : Warm-up automatique

**Objectif**: Monter progressivement les quotas LinkedIn pour les nouveaux comptes Unipile, afin d'eviter la detection.

**Quotas cibles (steady state)** :
- Invitations : **18/jour**
- Messages : **25/jour**
- Visites : **25/jour**

**Logique warm-up** : Sur les 5 premiers jours d'un compte, les quotas sont plafonnes :

| Jour | Invitations | Messages | Visites |
|------|-------------|----------|---------|
| 1-2 | 5 | 8 | 10 |
| 3-5 | 10 | 15 | 18 |
| 6+ | 18 (plein) | 25 (plein) | 25 (plein) |

### Fichiers impactes

**1. Migration DB** : `supabase/migrations/011_warmup.sql`

```sql
-- Ajouter created_at sur linkedin_accounts si absent (sert de date de debut warm-up)
-- La colonne existe deja dans 001_initial_schema.sql
-- Rien a migrer, on utilise linkedin_accounts.created_at comme reference
```

**2. Constants** : [lib/constants.ts](lib/constants.ts)

Ajouter les paliers de warm-up + mettre a jour les DEFAULT_SETTINGS :

```typescript
export const WARMUP_SCHEDULE = [
  { maxDay: 2,  invitations: 5,  messages: 8,  visits: 10 },
  { maxDay: 5,  invitations: 10, messages: 15, visits: 18 },
] as const;

// Mettre a jour DEFAULT_SETTINGS :
daily_invitations_limit: 18,  // etait 15
daily_messages_limit: 25,     // etait 10
daily_visits_limit: 25,       // etait 30 (on baisse pour etre safe)
```

**3. Scheduling** : [lib/scheduling.ts](lib/scheduling.ts)

Modifier `loadUserSchedulingSettings()` pour appliquer le warm-up :

```typescript
export async function loadUserSchedulingSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserSchedulingSettings> {
  // ... code existant pour charger settings ...

  // Appliquer warm-up si le compte LinkedIn est recent
  const { data: linkedinAccount } = await supabase
    .from("linkedin_accounts")
    .select("created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (linkedinAccount?.created_at) {
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(linkedinAccount.created_at).getTime()) / (24 * 60 * 60 * 1000)
    );

    const warmupTier = WARMUP_SCHEDULE.find(t => accountAgeDays <= t.maxDay);
    if (warmupTier) {
      settings.dailyInvitationsLimit = Math.min(settings.dailyInvitationsLimit, warmupTier.invitations);
      settings.dailyMessagesLimit = Math.min(settings.dailyMessagesLimit, warmupTier.messages);
      settings.dailyVisitsLimit = Math.min(settings.dailyVisitsLimit, warmupTier.visits);
    }
  }

  return settings;
}
```

**4. UI Settings** (optionnel): Afficher le warm-up status dans Settings > General ou Dashboard.

### Verification
- `npm run build` passe
- Pour un compte cree il y a 1 jour : `dailyInvitationsLimit` = 5
- Pour un compte cree il y a 4 jours : `dailyInvitationsLimit` = 10
- Pour un compte cree il y a 6 jours : `dailyInvitationsLimit` = 18
- Le cron `generate-actions` respecte les nouveaux quotas
- Le cron `send-actions` respecte les nouveaux quotas (via `getTodayQuotaCounts`)

### Note sur les comptes existants
Khalil et Ludwig ont leurs comptes `linkedin_accounts` crees le ~24 mars 2026. Si on deploie le warm-up aujourd'hui (25 mars = jour 2), ils seront en palier 1 (5 invitations/jour). **Pour eviter de bloquer la production**, on peut :
- Option A : Mettre une date de reference plus ancienne (ex: `created_at - 15 jours`) pour bypass le warm-up sur les comptes existants
- Option B : Ajouter un champ `warmup_start_date` nullable sur `linkedin_accounts` — si null, pas de warm-up (comptes existants)
- **Option recommandee (B)** : Plus propre, permet de re-trigger le warm-up manuellement si besoin

---

## Feature 6 : Vue "data" dans sequences

**Objectif**: Voir combien de prospects se trouvent a chaque etape de la sequence, pour comprendre l'avancement du funnel.

### Design

Ajouter un onglet ou toggle "Data" dans la page sequence detail, qui montre :

```
Step 1: Visite profil       → 37 prospects (12 en attente, 25 completes)
Step 2: Invitation           → 25 prospects (25 en attente, 0 completes)
Step 3: Message 1            → 0 prospects
Step 4: Message 2            → 0 prospects
Step 5: Message 3            → 0 prospects
                              ─────────────
                              Termines: 0 | Droppes: 0
```

### Fichiers impactes

**1. Server Action** : [lib/actions/sequences.ts](lib/actions/sequences.ts)

Ajouter `getSequenceStepStats(sequenceId)` :

```typescript
export async function getSequenceStepStats(
  sequenceId: string
): Promise<ActionResult<StepStat[]>> {
  const { supabase } = await getAuthUser();

  // Charger les steps
  const { data: steps } = await supabase
    .from("sequence_steps")
    .select("id, step_type, step_order, condition")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });

  // Charger les sequence_leads
  const { data: seqLeads } = await supabase
    .from("sequence_leads")
    .select("current_step, status")
    .eq("sequence_id", sequenceId);

  // Compter par step
  const stats = (steps ?? []).map(step => {
    const atStep = (seqLeads ?? []).filter(sl =>
      sl.status === "active" && sl.current_step === step.step_order - 1
      // current_step = step_order du dernier step COMPLETE, donc current_step = N-1 signifie "en attente du step N"
    );
    const completedStep = (seqLeads ?? []).filter(sl =>
      sl.current_step >= step.step_order
    );
    return {
      stepId: step.id,
      stepOrder: step.step_order,
      stepType: step.step_type,
      waiting: atStep.length,
      completed: completedStep.length,
    };
  });

  const completed = (seqLeads ?? []).filter(sl => sl.status === "completed").length;
  const responded = (seqLeads ?? []).filter(sl => sl.status === "responded").length;

  return { success: true, data: stats };
}
```

**2. UI** : [app/(dashboard)/sequences/[id]/sequence-detail-client.tsx](app/(dashboard)/sequences/[id]/sequence-detail-client.tsx)

- Ajouter un onglet `<Tabs>` : "Builder" | "Data"
- Dans "Data" : barre horizontale par step avec compteur
- Composant simple, pas de chart library necessaire (barres CSS avec `bg-blue-600` + width percentage)

### Verification
- La vue montre le bon nombre de prospects par step
- Le total correspond au nombre de `sequence_leads` actifs

---

## Feature 7 : Verification quotidienne acceptation invitations

**Objectif**: Quand une sequence a un step `invitation` suivi d'un step `message` avec condition `invitation_accepted`, il faut verifier quotidiennement si l'invitation a ete acceptee, SANS attendre un webhook `relation.created` (qui peut ne pas arriver).

**Probleme actuel**: Le cron `generate-actions` verifie la condition `invitation_accepted` via le stage du lead en DB. Le stage passe a `connected` uniquement quand le webhook `relation.created` arrive. Mais ce webhook n'est pas garanti (Unipile peut rater l'event).

### Solution

Creer un nouveau cron `check-invitations` qui :
1. Trouve les `sequence_leads` actifs dont le step en cours a une condition `invitation_accepted` et dont le lead est encore en stage `invited`
2. Pour chaque lead, appelle Unipile pour verifier le statut de la relation
3. Si connecte : met a jour le stage du lead → `connected`

### Fichiers impactes

**1. Nouveau cron** : `app/api/crons/check-invitations/route.ts`

```typescript
// GET /api/crons/check-invitations
// Schedule: "0 8 * * 1-5" (8h UTC = 10h Paris, 1x/jour en semaine)
// Logique:
//   1. Pour chaque user avec un compte LinkedIn actif
//   2. Trouver les leads en stage "invited" qui sont dans une sequence active
//   3. Verifier via Unipile si la relation existe (getUserProfile → network_distance)
//   4. Si connecte → update lead.stage = "connected"
//   5. Le cron generate-actions du lendemain generera le message
```

**2. Unipile client** : Utiliser `client.getUserProfile(identifier, accountId)` qui retourne `network_distance`. Si `network_distance === "FIRST"` → le lead est connecte.

**3. Vercel config** : [vercel.json](vercel.json)

Ajouter le cron :
```json
{
  "path": "/api/crons/check-invitations",
  "schedule": "0 8 * * 1-5"
}
```

**4. Rate limiting** : Limiter a **20 verifications par execution** pour ne pas surcharger Unipile. Les verifications se font dans l'ordre `entered_at ASC` (les plus anciens d'abord).

### Verification
- Un lead en stage `invited` depuis 3 jours, qui a accepte l'invitation sur LinkedIn, passe en `connected` apres le cron
- Le cron generate-actions du lendemain genere le message pour ce lead
- Pas plus de 20 appels Unipile par execution

---

## Recapitulatif execution

```
=== JOUR 1 (aujourd'hui) ===

Matin:
  [Session A] Fix 1 (retry transitoire) + Fix 4 (reschedule 10 actions)  ~30min
  [Session B] Fix 2 (webhook crash) + Fix 3 (cache_control)              ~15min
  [Session C] Feature 6 (vue data sequences)                              ~45min
  → Les 3 sessions en parallele

Apres-midi:
  [Session D] Feature 5 (warm-up)                                         ~1h
  → Depend de Fix 1 (retry en place avant de toucher les quotas)

=== JOUR 2 ===

Matin:
  [Session E] Feature 7 (cron check invitations)                          ~1h
  → Depend de Feature 5 (quotas warm-up en place)

Apres-midi:
  Tests end-to-end + monitoring Vercel logs
```

---

## Checklist pre-deploy

Pour chaque session :
- [x] `npm run build` passe sans erreur (Session A)
- [ ] `npm run lint` passe
- [ ] Pas de regression sur les fonctionnalites existantes
- [ ] Commit + push
- [ ] Verifier les logs Vercel apres deploy

---

## Quotas finaux (steady state)

| Metrique | Avant | Apres |
|----------|-------|-------|
| Invitations/jour | 15 | **18** |
| Messages/jour | 10 | **25** |
| Visites/jour | 30 | **25** (baisse volontaire) |
| Warm-up jours 1-2 | N/A | 5 inv / 8 msg / 10 vis |
| Warm-up jours 3-5 | N/A | 10 inv / 15 msg / 18 vis |
| Retry max par action | 0 | **3** |
| Check invitations | jamais | **1x/jour 10h** |
