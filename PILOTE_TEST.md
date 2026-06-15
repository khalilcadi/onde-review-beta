# PILOTE TEST — Séquences V2 Connected + V2 Invited

> Exécution : 2026-04-16 18:00 UTC
> User cible : `14a0eedc-b156-45ab-b2c0-47eb990f4c84` (Khalil)
> Objectif : valider le mécanisme `current_step=1` sur 2 pilotes avant import massif.

---

## 1. Séquences créées

### Séquence 1 — `V2 Connected — M1 direct`
- **ID** : `3ec5fa58-c80e-4eb8-b176-8fcdfebc9217`
- **Statut** : `active`
- **Cible** : leads déjà connected hors V2

| step | type | delay_days | generation_mode | condition |
|:----:|------|:----------:|:---------------:|-----------|
| 1 | message (M1) | 0 | ai | `{"type":"if_no_response"}` |
| 2 | message (M2) | 3 | ai | `{"type":"if_no_response"}` |
| 3 | message (M3) | 3 | ai | — |

> Note : la condition sur step 1 n'est jamais évaluée (pas de previousStep). Conservée pour uniformité.

### Séquence 2 — `V2 Invited — Attente Connexion`
- **ID** : `3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73`
- **Statut** : `active`
- **Cible** : leads déjà invités, en attente d'acceptation

| step | type | delay_days | generation_mode | condition |
|:----:|------|:----------:|:---------------:|-----------|
| 1 | invitation | 0 | ai | `{"type":"if_connected"}` |
| 2 | message (M1) | 0 | ai | `{"type":"if_no_response"}` |
| 3 | message (M2) | 3 | ai | `{"type":"if_no_response"}` |
| 4 | message (M3) | 3 | ai | — |

> **Mécanisme clé** : les leads seront insérés avec `current_step=1`, ce qui fait croire au cron que le step "invitation" est déjà accompli. Le cron va donc chercher nextStep=2 (M1) et évaluer previousStep=1 (`if_connected`) pour décider d'envoyer ou d'attendre.

---

## 2. Leads dans Séquence 1

| Lead | Entreprise | Stage | current_step | Segment | Signal |
|------|------------|:-----:|:------------:|:-------:|--------|
| Marieliesse Gouilliard | Autoplay | **connected** | 0 | A | ICP_TOP_ACTIVE |

- `sequence_leads.id` : `e94aa423-e3df-4f5a-a4cd-5712bb4f2b46`
- `entered_at` : 2026-04-16 18:01 UTC

---

## 3. Leads pilotes Séquence 2 — critères & choix

### Critères appliqués
1. Invitation envoyée il y a **> 10 jours** (plus de chances d'avoir accepté)
2. Segment **A ou B**
3. Signal **ENGAGEMENT_EXPERT** ou **ENGAGEMENT_KEYWORD** (engagement LinkedIn actif)

### Pilotes choisis

| Pilote | Entreprise | Segment | Signal | Invitation | Âge invit | Raison choix |
|--------|------------|:-------:|--------|------------|:---------:|--------------|
| **Thomas Ebrard** | Katalyz | B | ENGAGEMENT_KEYWORD | 2026-03-27 | **20 jours** | La plus ancienne invitation parmi les signaux engagement → maximise la chance d'acceptation déjà survenue |
| **Aiché Y.** | LEADFLOW PARTENAIRES | **A** | ENGAGEMENT_EXPERT | 2026-04-03 | 13 jours | Segment A (top ICP) + signal fort + invitation ancienne |

### Identifiants
- Thomas : `lead_id=8cfd3b95-8ca7-4eb5-9eb9-86cb45b9f38b`, `sequence_lead_id=c3a6ffe7-44ed-4b47-977b-8cf766e87381`
- Aiché : `lead_id=825c4408-b1ae-415b-b4dd-e8c76ace0694`, `sequence_lead_id=7c480cbb-6edb-4102-a557-b9206bcb5a41`

### État inséré
- `current_step=1` (step invitation virtuellement fait)
- `status='active'`
- `entered_at=2026-04-16 18:01 UTC`
- **Stage actuel des 2 leads** : `invited` (invitation pas encore synchronisée côté Prospector)

---

## 4. Ce que le cron va faire au prochain run

Le prochain run automatique est prévu demain matin (2026-04-17) vers **06h00-07h00 Paris** (cron `0 4,5 * * 1-5` UTC).

### Flow cron pour chaque pilote

**Étape A — `syncAcceptedInvitations()`** (ligne 113-131 du cron) :
- Interroge Unipile pour récupérer les dernières relations
- Transitionne le stage `invited → connected` si l'invitation a été acceptée
- **Scénarios possibles :**
  - Thomas a accepté entre le 2026-03-27 et maintenant → stage passe à `connected`
  - Thomas n'a pas accepté → stage reste `invited`
  - Même logique pour Aiché (invité depuis 2026-04-03)

**Étape B — Boucle sur sequence_leads :**
- Pour chaque pilote : `current_step=1`, donc `nextStep=step_order=2` (= message M1)
- `previousStep=step_order=1` (= invitation avec condition `if_connected`)
- Appel `checkStepCondition(lead_id, '{"type":"if_connected"}')` :
  - Si `stage IN ('connected', 'in_sequence', 'responded', 'meeting', 'closed')` → **`"run"`** → génère M1
  - Sinon (stage=`invited` notamment) → **`"wait"`** → skip ce cycle

**Étape C — Si "run" :**
- Vérifie delay_days=0 (OK)
- Vérifie idempotence (pas d'action déjà existante pour ce step) → OK
- Vérifie quota messages (15/jour)
- Enrichissement auto si lead pas encore enrichi (limite 10/cron)
- Appelle `callAI()` avec l'agent `prospection`, prompt M1, signal `ENGAGEMENT_KEYWORD`/`ENGAGEMENT_EXPERT`, segment `B`/`A`
- Applique `humanizeMessage()` (40% chance de fragmenter)
- Insert action `status='pending'` dans `actions`

**Étape D — Si "wait" :**
- Rien. `current_step` reste à 1, le lead reste actif. Au prochain cron (ou dès que l'invitation est acceptée), la condition sera ré-évaluée.

### Tableau des issues possibles demain matin

| Pilote | Stage après sync | Comportement cron | Action générée |
|--------|:----------------:|-------------------|:--------------:|
| Thomas | `connected` | Génère M1 (agent prospection, segment B, ENGAGEMENT_KEYWORD) | ✅ pending |
| Thomas | `invited` | Skip, wait | ❌ rien |
| Aiché | `connected` | Génère M1 (agent prospection, segment A, ENGAGEMENT_EXPERT) | ✅ pending |
| Aiché | `invited` | Skip, wait | ❌ rien |
| Marieliesse | `connected` (déjà) | Génère M1 direct (pas de previousStep) | ✅ pending |

### Comportement attendu idéal
**Marieliesse** : M1 généré dès le premier cron (pas de dépendance sync).
**Thomas/Aiché** : dépend du retour de `syncAcceptedInvitations`. Si l'un a déjà accepté, son M1 partira. Sinon, il attendra tranquillement.

---

## 5. Instructions pour vérifier demain matin

### Vérif 1 — Actions générées par le cron
```sql
-- Actions pending créées dans les dernières 24h pour Khalil
SELECT a.id, a.action_type, a.status, a.created_at,
       l.first_name, l.last_name, l.company,
       s.name as sequence_name,
       LEFT(a.generated_message, 120) as message_preview
FROM actions a
JOIN leads l ON l.id = a.lead_id
JOIN sequences s ON s.id = a.sequence_id
WHERE a.user_id = '14a0eedc-b156-45ab-b2c0-47eb990f4c84'
  AND a.created_at > NOW() - INTERVAL '24 hours'
  AND s.id IN ('3ec5fa58-c80e-4eb8-b176-8fcdfebc9217', '3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73')
ORDER BY a.created_at DESC;
```

**Résultats attendus :**
- 1 action pour Marieliesse (M1)
- 0, 1 ou 2 actions pour Thomas/Aiché selon sync

### Vérif 2 — Stage des pilotes après sync
```sql
SELECT l.first_name, l.last_name, l.stage, l.updated_at,
       sl.current_step, sl.status as sl_status
FROM leads l
JOIN sequence_leads sl ON sl.lead_id = l.id
WHERE sl.sequence_id IN ('3ec5fa58-c80e-4eb8-b176-8fcdfebc9217', '3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73');
```

**À observer :**
- Thomas et Aiché : stage passé à `connected` ? Si oui → sync OK.
- Marieliesse : toujours `connected`.

### Vérif 3 — Logs cron (si besoin)
```sql
-- AI usage dans les dernières 24h
SELECT created_at, agent_id, model_id, input_tokens, output_tokens, estimated_cost,
       metadata->>'leadId' as lead_id, metadata->>'sequenceId' as seq_id
FROM ai_usage
WHERE user_id = '14a0eedc-b156-45ab-b2c0-47eb990f4c84'
  AND created_at > NOW() - INTERVAL '24 hours'
  AND metadata->>'cron' = 'generate-actions'
ORDER BY created_at DESC;
```

### Vérif 4 — Page Daily Actions
- Ouvrir `/actions` dans l'app
- Vérifier que les 1-3 actions générées s'affichent avec :
  - Nom du lead
  - Séquence d'origine (`V2 Connected — M1 direct` ou `V2 Invited — Attente Connexion`)
  - Message M1 généré avec 2 variantes (format M1 response)
  - Bouton Valider / Éditer / Regénérer

---

## 6. Critères de validation du pilote

Le test est **validé** si :
- [x] Les 2 séquences sont créées avec les bons steps et conditions
- [x] Marieliesse (S1) est active en `current_step=0`, stage `connected`
- [x] Thomas + Aiché (S2) sont actifs en `current_step=1`, stage `invited` au moment de l'insertion
- [ ] **Demain matin** : M1 généré pour Marieliesse (garanti)
- [ ] **Demain matin** : pas d'invitation re-envoyée pour Thomas/Aiché (garanti par `current_step=1`)
- [ ] **Demain matin** : si Thomas ou Aiché est passé à `connected` via sync → M1 généré ; sinon → pas d'action mais pas d'erreur

### Critères de bascule vers import massif (41 leads)
Si les 3 conditions ✅ ci-dessus sont remplies :
- Procéder à l'insertion massive des 39 leads A/B/D1 restants dans Séquence 2 (exclure les 4 HORS_ICP)
- Même mécanisme `current_step=1`

### Critères de rollback
Si l'un de ces cas se produit :
- ❌ Une invitation a été re-envoyée pour Thomas ou Aiché → le mécanisme `current_step=1` est cassé, stop tout
- ❌ Le cron a généré un message alors que le lead est `invited` → la condition `if_connected` n'est pas évaluée correctement
- ❌ Erreur de génération IA (crash, pas de message)

**Action rollback :**
```sql
-- Suspendre S2 pour éviter propagation
UPDATE sequences SET status = 'paused' WHERE id = '3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73';
-- Cancel les actions pending auto-générées
UPDATE actions SET status = 'cancelled'
WHERE sequence_id = '3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73' AND status = 'pending';
```

---

## 7. Récapitulatif IDs

| Ressource | ID |
|-----------|-----|
| Séquence 1 (Connected) | `3ec5fa58-c80e-4eb8-b176-8fcdfebc9217` |
| Séquence 2 (Invited) | `3b7ff4cc-af58-4baf-a9fb-62cd0c54cd73` |
| Lead Marieliesse | `5b006649-1fe7-4258-936f-5c662065f33f` |
| Lead Thomas Ebrard | `8cfd3b95-8ca7-4eb5-9eb9-86cb45b9f38b` |
| Lead Aiché Y. | `825c4408-b1ae-415b-b4dd-e8c76ace0694` |
| sequence_lead Marieliesse | `e94aa423-e3df-4f5a-a4cd-5712bb4f2b46` |
| sequence_lead Thomas | `c3a6ffe7-44ed-4b47-977b-8cf766e87381` |
| sequence_lead Aiché | `7c480cbb-6edb-4102-a557-b9206bcb5a41` |
