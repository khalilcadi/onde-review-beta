# Investigation — 13 leads `invited` avec M1 généré le 2026-04-17

Date : 2026-04-17
Utilisateur : Khalil (`14a0eedc-b156-45ab-b2c0-47eb990f4c84`)

---

## TL;DR

- **Aucun lead n'est desync côté Unipile.** Les 13 leads sont bien en `SECOND_DEGREE` (invitation non acceptée), conformément à leur stage DB `invited`.
- **Cause racine = mauvaise config de séquence**, pas un bug de sync. La séquence "Prospection Avril V2 — 27 leads" a **toutes ses conditions `null`**, donc le cron `generate-actions` génère le M1 sans vérifier que l'invitation a été acceptée.
- **Aucun UPDATE de `stage` nécessaire.** L'Étape 4 du plan initial est sans objet.
- **Fix à appliquer** : ajouter `{"type":"if_connected"}` sur le step 1 (invitation) de la séquence "Prospection Avril V2 — 27 leads".

---

## ÉTAPE 1 — Statut réel des 13 leads (Unipile vs DB)

Appel `GET /users/{identifier}?account_id=8bGZCi3mQw2LgAiGGuInqw` pour chaque lead (même endpoint que `syncAcceptedInvitations`).

| Lead | Entreprise | Stage DB | `network_distance` Unipile | `is_relationship` | Invitation envoyée | Verdict |
|------|------------|----------|----------------------------|-------------------|--------------------|---------|
| Joseph GONNACHON | 2CRSi | invited | SECOND_DEGREE | false | 2026-04-16 09:44 | **Truly invited** |
| Badre S. | I-SHANE | invited | SECOND_DEGREE | false | 2026-04-16 10:42 | **Truly invited** |
| Betty Rousseau | FIMATEC Ingénierie | invited | SECOND_DEGREE | false | 2026-04-16 10:18 | **Truly invited** |
| Eric Bazoin | Auximedia | invited | SECOND_DEGREE | false | 2026-04-16 09:50 | **Truly invited** |
| Yann-Yves Cova | K-LAGAN | invited | SECOND_DEGREE | false | 2026-04-16 13:20 | **Truly invited** |
| Sophie Guerin | KeyWe | invited | SECOND_DEGREE | false | 2026-04-16 11:14 | **Truly invited** |
| Sylvain Delahodde | Ippon Technologies | invited | SECOND_DEGREE | false | 2026-04-16 12:12 | **Truly invited** |
| Florent Ribaut | Klint | invited | SECOND_DEGREE | false | 2026-04-16 11:06 | **Truly invited** |
| Sébastien ROQUET | ARKETEAM | invited | SECOND_DEGREE | false | 2026-04-16 12:18 | **Truly invited** |
| Jean-Philippe LLOBERA | 2CRSi | invited | SECOND_DEGREE | false | 2026-04-16 11:22 | **Truly invited** |
| Rémy EMANUELE | Experteam | invited | SECOND_DEGREE | false | 2026-04-16 10:26 | **Truly invited** |
| ≡ Jean-Sylvain CHAVANNE | BZHunt | invited | SECOND_DEGREE | false | 2026-04-16 12:06 | **Truly invited** |
| Fabrice Rivet | DEODIS | invited | SECOND_DEGREE | false | 2026-04-16 13:14 | **Truly invited** |

**Résumé** :
- FIRST_DEGREE non synchronisés : **0**
- Truly invited : **13**
- Errors : **0**

---

## ÉTAPE 2 — Cause racine du desync apparent

### Comparaison des conditions entre séquences actives

```sql
SELECT s.name, ss.step_order, ss.step_type, ss.condition
FROM sequences s JOIN sequence_steps ss ON ss.sequence_id = s.id
WHERE s.user_id = '14a0eedc-…' AND s.status = 'active';
```

| Séquence | Step 1 (invitation) | Step 2 (M1) | Step 3 (M2) |
|----------|---------------------|-------------|-------------|
| **Prospection Avril V2 — 27 leads** | `condition = NULL` ❌ | `condition = NULL` | `condition = NULL` |
| V2 Invited — Attente Connexion | `{"type":"if_connected"}` ✅ | `{"type":"if_no_response"}` | `{"type":"if_no_response"}` |
| V2 Connected — M1 direct | *(pas de step invitation)* | `{"type":"if_no_response"}` | `{"type":"if_no_response"}` |

### Logique du cron

[app/api/crons/generate-actions/route.ts:207-221](app/api/crons/generate-actions/route.ts#L207-L221) :

```ts
// Check condition of the PREVIOUS step (the one just completed).
const previousStep = steps.find((s) => s.step_order === sl.current_step);
const conditionResult = await checkStepCondition(
  supabase,
  sl.lead_id,
  previousStep?.condition ?? null
);
if (conditionResult === "wait") { skipped++; continue; }
```

Et [checkStepCondition L552](app/api/crons/generate-actions/route.ts#L552) :

```ts
if (!conditionJson) return "run"; // ← Condition null = génération autorisée
```

**Enchaînement pour un lead en stage=invited (`current_step=1`) dans "Prospection Avril V2"** :
1. `previousStep` = step 1 (invitation), `condition = null`
2. `checkStepCondition(null)` → retourne `"run"` directement
3. Le cron génère le M1 **même si l'invitation n'a pas été acceptée**

### La sync Unipile a-t-elle été utile ?

[lib/unipile/sync-relations.ts](lib/unipile/sync-relations.ts#L48) ne sait pas rater ici : elle cherche les leads en `invited` et check Unipile. Pour ces 13 leads, elle aurait répondu correctement "toujours SECOND_DEGREE → pas de transition". Le problème est **en aval** : la condition null laisse passer la génération même quand le sync indique "toujours invited".

**La sync et la condition doivent être combinées** : la sync met à jour le stage, la condition protège la génération. Ici, la condition est absente → la sync est court-circuitée.

---

## ÉTAPE 3 — Hypothèses initiales : vérification

| # | Hypothèse | Vérifiée ? |
|---|-----------|------------|
| 1 | Le sync ne tourne que sur les leads de séquences actives | ❌ Faux — sync lit tous les leads `invited` du user (sync-relations.ts L56-63) |
| 2 | Rate limit Unipile skippe certains leads | ❌ Faux — `MAX_CHECKS_PER_USER = 20`, or seulement 13 candidats |
| 3 | Sync compare par provider_id | ❌ Faux — elle extrait l'identifier depuis `linkedin_url` (extractLinkedInIdentifier) |
| 4 | Sync skippe les leads importés après le début du cron | ❌ Faux — la sync tourne une seule fois par user en début de boucle |
| 5 | **La séquence "Prospection Avril V2" n'a pas de condition `if_connected`** | ✅ **VRAI — cause racine** |

---

## ÉTAPE 4 — Corrections appliquées

### Stages DB
**Aucun UPDATE nécessaire.** Les 13 leads sont vraiment `SECOND_DEGREE` côté Unipile → leur stage `invited` est correct.

### Config séquence (à appliquer, en attente confirmation)

```sql
UPDATE sequence_steps
SET condition = '{"type":"if_connected"}'
WHERE sequence_id IN (
  SELECT id FROM sequences
  WHERE name = 'Prospection Avril V2 — 27 leads'
    AND user_id = '14a0eedc-b156-45ab-b2c0-47eb990f4c84'
)
AND step_order = 1;
```

Sans ce fix, le cron de demain 6h **regénèrera à nouveau** 13 M1 pour ces leads encore `invited` — reproduisant exactement le problème qu'on vient de nettoyer.

---

## Conséquence immédiate pour le cron de demain (2026-04-18 06h)

Hypothèse : fix `if_connected` **NON appliqué**.

- Les 13 leads restent `invited`
- Le cron passera la condition (null → run)
- Re-génération de 13 M1 → même bug qu'aujourd'hui

Hypothèse : fix `if_connected` **appliqué**.

- Les 13 leads restent `invited`
- Le cron trouvera `previousStep.condition = if_connected` → `checkStepCondition` lit `stage=invited` → retourne `"wait"` → skip
- Aucun M1 généré pour eux tant que l'invitation n'est pas acceptée
- Seuls les 4 leads déjà `connected` (Lucas, Constant, Mathieu, Marieliesse) auront leur M1 regénéré

---

## Scripts utilisés

- [scripts/check-khalil-invited-sync.ts](scripts/check-khalil-invited-sync.ts) — script de vérification Unipile (13 leads, 0 desync trouvé)

## Fichiers code consultés

- [lib/unipile/sync-relations.ts](lib/unipile/sync-relations.ts)
- [app/api/crons/generate-actions/route.ts:207-221](app/api/crons/generate-actions/route.ts#L207-L221)
- [app/api/crons/generate-actions/route.ts:547-582](app/api/crons/generate-actions/route.ts#L547-L582)
