# 06 — Flows utilisateurs

> Tous les chemins utilisateur qui déclenchent les agents prospection et enrichissement, avec le détail technique de chaque flow.

---

## Vue d'ensemble

```
                 AGENT PROSPECTION                    AGENT ENRICHISSEMENT
                        │                                      │
          ┌─────────────┼──────────────┐                      │
          │             │              │                       │
          ▼             ▼              ▼                       ▼
    [Flow 1]       [Flow 2]       [Flow 3]              [Flow 4 & 5]
  Cron 6h00      Régénération   Batch post             Fiche lead
  (automatique)  Daily Actions  import CSV             ou batch pipeline
```

---

## Flow 1 — Cron quotidien 6h00 (principal, automatique)

**Déclencheur :** Vercel Cron `GET /api/crons/generate-actions` → tous les jours ouvrés à 6h00 Paris

**Qui déclenche :** Personne — automatique

**Résultat :** Toutes les actions du jour créées en statut `pending`, prêtes à être validées dans Daily Actions

### Étapes détaillées

```
1. Authentification
   → Vérification header "Authorization: Bearer {CRON_SECRET}"

2. Récupération des utilisateurs actifs
   → SELECT user_id FROM linkedin_accounts WHERE status = 'active'
   → Déduplique → liste des userIds

3. Pour chaque utilisateur
   a. Charger ses settings (jours actifs, timezone)
   b. Vérifier si aujourd'hui est un jour actif (isActiveDay())
      → Si non : skip user
   c. Charger les quotas d'aujourd'hui (invitations/messages/visites envoyées)
   d. Récupérer ses séquences actives (status = 'active')

4. Pour chaque séquence
   a. Charger les steps (sequence_steps ORDER BY step_order)
   b. Charger les sequence_leads actifs (status = 'active')

5. Pour chaque sequence_lead (lead dans la séquence)
   a. Déterminer le prochain step (current_step + 1)
      → Si aucun step suivant → marquer completed, next
   b. Vérifier le délai (delay_days depuis entered_at ou dernier sent_at)
      → Si pas encore le moment → next
   c. Vérifier la condition du step :
      - always          → run (générer)
      - if_connected    → run si lead stage = 'connected', wait sinon
      - if_no_response  → run si aucun message reçu depuis connexion
      - if_responded    → run si lead a répondu
      - skip si condition définitivement non remplie → avancer step sans générer
   d. Idempotence : vérifier qu'aucune action pending/validated/sent
      n'existe déjà pour ce lead + step → next si trouvé
   e. Quota : vérifier que le quota du type d'action n'est pas épuisé
      → invitations (max 15/j), messages (max 50/j), visites (max 30/j)

6. Génération du message (pour types : message, invitation, inmail)
   a. Charger le lead complet depuis DB (avec enrichment_data)
   b. Si step.template et mode template :
      → Interpoler {{firstName}}, {{lastName}}, {{company}}, {{title}}
      → Pas d'appel IA
   c. Sinon :
      → buildLeadContext(lead, actionType) → runtime context
      → buildUserPrompt(lead, actionType) → user message
      → callAI("prospection", { runtimeContext, messages, supabaseOverride })
         = buildSystemPrompt("prospection", userId)
           = getPrompt("prospection", userId)  ← DB ou code
           + buildRagContext("prospection", userId)  ← 7 blocs RAG
         + runtimeContext (lead data, non caché)
         + Appel Anthropic/OpenAI API
      → humanizeMessage() ← split éventuel en fragments

7. Insertion de l'action
   → INSERT INTO actions { user_id, lead_id, sequence_id, step_id,
                            action_type, status: 'pending',
                            generated_message }
   → Incrémenter le compteur quota
```

### Ce que voit l'utilisateur

Le lendemain matin (ou le jour même après 6h) : ses actions apparaissent dans Daily Actions avec le statut `pending`.

---

## Flow 2 — Régénération dans Daily Actions

**Déclencheur :** Bouton "Régénérer" sur une action card dans `/actions`

**Qui déclenche :** Utilisateur (Khalil ou un associé)

**Résultat :** Le message de l'action est remplacé par une nouvelle version avec un angle différent

### Étapes

```
1. UI : clic "Régénérer" sur une action card
   → Le message actuel est visible dans la card

2. Appel POST /api/ai/generate
   Body: {
     lead: { id, firstName, lastName, title, company, linkedinUrl,
             score, status, stage, enrichmentData },
     actionType: action.action_type,
     currentMessage: action.generated_message  ← passage du message actuel
   }

3. Route /api/ai/generate
   a. Auth check
   b. buildLeadContext(lead, actionType, currentMessage) → runtime context
      → Inclut une section "Message précédent (à régénérer...)"
   c. buildUserPrompt(lead, actionType, currentMessage) → user message
      → "Régénère ce message LinkedIn pour X Y...
         Message actuel : [message]
         Génère une NOUVELLE version différente (angle, structure et accroche différents)."
   d. callAI("prospection", { runtimeContext, messages })
   e. humanizeMessage() sur le résultat

4. Response : { message: string }

5. UI : server action updateActionMessage(actionId, newMessage)
   → UPDATE actions SET generated_message = ? WHERE id = ?
   → Re-affichage de la card avec le nouveau message
```

### Note importante

L'agent reçoit le **message précédent** dans son contexte. Cela lui permet (selon les instructions du prompt) de générer une version avec un **angle, une structure et une accroche différents** — pas juste une reformulation.

---

## Flow 3 — Génération batch après import CSV

**Déclencheur :** Import CSV de leads depuis `/pipeline` + génération batch

**Qui déclenche :** Utilisateur

**Résultat :** Messages générés pour un lot de leads, sans passer par les séquences

### Étapes

```
1. UI : upload CSV dans /pipeline → lib/actions/import.ts
   → Validation colonnes, anti-doublon via linkedin_url
   → INSERT leads (status: cold, enrichment_data: null)

2. (Optionnel mais recommandé) Enrichissement batch
   → Sélection des leads importés
   → POST /api/ai/enrich avec leads[] (batch)
   → Voir Flow 5

3. Génération batch
   → Sélection des leads
   → POST /api/ai/generate avec leads[] et actionType
   Body: {
     leads: [{ id, firstName, lastName, ... }],
     actionType: "invitation"
   }

4. Route /api/ai/generate (mode batch)
   → Pour chaque lead en parallèle :
     a. buildLeadContext(lead, actionType)
     b. buildUserPrompt(lead, actionType)
     c. callAI("prospection", ...)
     d. humanizeMessage()
   → Response: { messages: string[] }
```

---

## Flow 4 — Enrichissement depuis la fiche lead

**Déclencheur :** Bouton "Enrichir" sur `/pipeline/[id]`

**Qui déclenche :** Utilisateur (au cas par cas)

**Résultat :** `leads.enrichment_data` mis à jour avec les données Perplexity

### Étapes

```
1. UI : fiche lead → bouton "Enrichir"

2. POST /api/ai/enrich
   Body: { lead: { id, firstName, lastName, title, company, linkedinUrl } }

3. Route /api/ai/enrich
   a. Auth check
   b. buildEnrichmentContext(lead) → runtime context minimal
      ## Lead à enrichir
      Nom : X Y
      Titre : ...
      Entreprise : ...
      LinkedIn : https://...
   c. buildEnrichmentUserPrompt(lead) → user message
      "Qui est X Y, title chez company ?
      Son profil LinkedIn : [url]
      Trouve toutes les informations..."
   d. callPerplexity("enrichissement", {
        runtimeContext, messages,
        maxTokens: 2048,
        temperature: 0.3
      })
      = buildSystemPrompt("enrichissement", userId)
        = prompt enrichissement + 2 blocs RAG (positionnement + icp)
      + Appel Perplexity sonar-pro API
   e. Parse JSON (strip balises markdown si nécessaire)
   f. UPDATE leads SET enrichment_data = {parsed JSON} WHERE id = lead.id

4. Response : { company, person, confidence, sources, summary, usage }

5. UI : re-affichage fiche lead avec les données enrichies
   + Bouton "Scorer" disponible (scoring IA)
```

### Impact sur la prospection

Une fois enrichi, le lead dispose de `enrichment_data`. Lors du prochain appel à l'agent prospection (cron ou régénération), les sections `## Entreprise` et `## Personne` seront incluses dans le runtime context.

---

## Flow 5 — Enrichissement batch depuis le pipeline

**Déclencheur :** Sélection multiple de leads dans `/pipeline` → action "Enrichir"

**Qui déclenche :** Utilisateur (traitement de masse)

**Résultat :** Plusieurs leads enrichis en une seule opération

### Étapes

```
1. UI : pipeline → sélection checkbox plusieurs leads → "Enrichir la sélection"

2. POST /api/ai/enrich
   Body: { leads: [{ id, firstName, lastName, title, company, linkedinUrl }, ...] }

3. Route /api/ai/enrich (mode batch)
   → Pour chaque lead (séquentiellement ou par petits lots) :
     → Mêmes étapes que Flow 4
     → Erreur sur un lead → continue les autres
   → Response: {
       results: [
         { leadId, success: true, data: {...} },
         { leadId, success: false, error: "..." },
         ...
       ]
     }

4. UI : toast de résumé ("8/10 leads enrichis avec succès")
```

---

## Tableau récapitulatif

| Flow | Agent | Déclencheur | Batch ? | Route / Action |
|------|-------|-------------|---------|----------------|
| 1 — Cron 6h00 | Prospection | Automatique | Oui (tous les leads actifs) | `GET /api/crons/generate-actions` |
| 2 — Régénération | Prospection | User (bouton) | Non (1 action) | `POST /api/ai/generate` |
| 3 — Batch post-import | Prospection | User (sélection) | Oui | `POST /api/ai/generate` |
| 4 — Fiche lead | Enrichissement | User (bouton) | Non (1 lead) | `POST /api/ai/enrich` |
| 5 — Batch pipeline | Enrichissement | User (sélection) | Oui | `POST /api/ai/enrich` |

---

## Dépendance clé : Enrichissement → Prospection

```
Flow 4 ou 5 (enrichissement)
        │
        ▼
leads.enrichment_data rempli
        │
        ▼
Flow 1, 2, ou 3 (génération)
        │
        ▼
buildLeadContext() inclut ## Entreprise + ## Personne
        │
        ▼
Message LinkedIn plus ciblé et personnalisé
```

**Recommandation de workflow :**
Enrichir un lead avant qu'il entre dans une séquence → les messages générés par le cron 6h00 seront automatiquement plus personnalisés.
