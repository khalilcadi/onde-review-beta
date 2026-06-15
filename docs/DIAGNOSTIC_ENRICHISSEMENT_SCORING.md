# DIAGNOSTIC ENRICHISSEMENT & SCORING

> Analyse complete du code reel -- 2026-03-07
> Auteur : Claude Code (Opus 4.6)

---

## 1. ENRICHISSEMENT (Agent Enrichissement)

### 1a. Code reel -- Fonctions et fichiers

| Fichier | Role |
|---------|------|
| `app/api/ai/enrich/route.ts` | Endpoint POST principal, orchestre Unipile + Perplexity |
| `lib/ai/lead-context.ts` | `buildEnrichmentContext()`, `buildEnrichmentUserPrompt()` |
| `lib/ai/prompts/defaults.ts` | Prompt agent `enrichissement` v4.3 |
| `lib/ai/service.ts` | `callPerplexity()` -- appel Perplexity via OpenAI SDK |
| `lib/unipile/client.ts` | `getUserProfile()`, `getUserPostsByIdentifier()`, `extractLinkedInIdentifier()` |
| `app/(dashboard)/pipeline/[id]/lead-detail-client.tsx` | Bouton "Enrichir" + affichage sections enrichies |

**Fonction principale : `enrichSingleLead(lead, userId, supabase)`** dans `app/api/ai/enrich/route.ts`

Pipeline d'execution :
```
1. Fetch linkedin_accounts (user_id + status=active) -> unipile_account_id
2. extractLinkedInIdentifier(linkedinUrl) -> slug LinkedIn
3. Unipile: getUserProfile(slug, accountId, { linkedinSections: "*" })
   -> profile complet (headline, about, skills, network_distance, experience...)
4. Unipile: getUserPostsByIdentifier(provider_id, accountId, 5)
   -> 5 derniers posts (REQUIERT provider_id du profil, pas le slug)
5. buildEnrichmentContext(lead, unipileData) -> runtime context pour Perplexity
6. buildEnrichmentUserPrompt(lead) -> prompt utilisateur
7. callPerplexity(enrichissement agent, temp 0.3, maxTokens 2048)
   -> JSON structure: { company, person, signal, confidence }
8. Merge linkedin_profile + linkedin_posts dans le resultat
9. DB UPDATE: merge avec enrichment_data existant (preserve scoring_detail)
10. Auto-correction stage: si network_distance=FIRST + stage in [to_invite, invited] -> connected
```

### 1b. Sources de donnees

**Source 1 : Unipile (LinkedIn API)**
```typescript
// lib/unipile/client.ts
const profile = await client.getUserProfile(identifier, accountId, {
  linkedinSections: "*",  // retourne work_experience, skills, languages, certifications
});
```

Donnees extraites :
- `headline`, `about` (ou `summary` avec sections=*)
- `profile_picture_url`, `location`
- `connections_count`, `follower_count`
- `network_distance` (FIRST/SECOND/THIRD/OUT_OF_NETWORK)
- `is_premium`, `is_open_profile`, `is_creator`
- `skills[]`, `languages[]`, `websites[]`
- `work_experience[]` (ou `experience[]` sans sections=*)
- Posts recents via `getUserPostsByIdentifier(provider_id, accountId, 5)`

**Source 2 : Perplexity API (recherche web)**
```typescript
// app/api/ai/enrich/route.ts:114
const response = await callPerplexity({
  userId: user.id,
  agentId: "enrichissement",
  runtimeContext,  // contient les donnees Unipile brutes
  messages: [{ role: "user", content: userPrompt }],
  maxTokens: 2048,
  temperature: 0.3,
});
```

Modele : `sonar-pro` via OpenAI SDK (baseURL Perplexity)

Donnees demandees (via prompt) :
- Actualites entreprise (< 3 mois)
- Financement (montant + date si < 18 mois)
- CA estime (si public)
- Contexte sectoriel/reglementaire
- Taille entreprise, secteur

**Aucun autre service** : pas de Clearbit, pas d'Apollo, pas de Hunter, pas de scraping direct. Uniquement Unipile + Perplexity.

### 1c. Trigger d'enrichissement

| Trigger | Implemente ? | Detail |
|---------|-------------|--------|
| Bouton manuel "Enrichir" sur fiche lead | OUI | `lead-detail-client.tsx` -- bouton visible uniquement par le owner |
| A l'import du lead | NON | `importLeadsFromCSV` ne declenche aucun enrichissement |
| En batch automatique | NON | Pas de cron d'enrichissement |
| Avant generation de message | NON | Le cron `generate-actions` ne pre-enrichit pas |
| Webhook (nouveau lead) | NON | Aucun trigger automatique |

**Conclusion : l'enrichissement est 100% manuel.** Chaque lead doit etre enrichi individuellement par un clic sur "Enrichir" dans la fiche lead.

### 1d. Structure de stockage -- enrichment_data JSONB

**Structure attendue par le code** (apres enrichissement via API) :
```json
{
  "company": {
    "size": "50-200",
    "industry": "SaaS",
    "funding": "Series A, 5M EUR, 2025",
    "revenue": "2-5M EUR",
    "location": "Paris",
    "news": ["Levee de fonds annoncee", "Nouveau produit lance"]
  },
  "person": {
    "anciennete_poste_mois": 18,
    "interests": ["IA", "growth"],
    "recentPosts": ["Post sur l'automatisation..."],
    "experience": [{"title": "CEO", "company": "X"}],
    "education": []
  },
  "signal": {
    "type": "POST_DOULEUR",
    "detail": "Post parlant de difficultes de prospection",
    "smartai_interaction": false
  },
  "linkedin_profile": {
    "headline": "CEO @ X",
    "about": "...",
    "skills": [...],
    "network_distance": "SECOND"
  },
  "linkedin_posts": [
    { "social_id": "...", "text": "...", "reactions_count": 42 }
  ],
  "scoring_detail": {
    "fit_score": 35,
    "intent_score": 28,
    "timing_score": 12,
    "categorie": "WARM"
  }
}
```

**Note :** Le script `seed-data.ts` (donnees fictives) a ete supprime. En production, les leads sont enrichis via l'API `/api/ai/enrich` qui produit directement la structure imbriquee correcte (`company.size`, `person.interests`, etc.).

### 1f. Gestion d'erreurs

| Point d'erreur | Traitement | Risque |
|----------------|-----------|--------|
| Pas de `linkedin_accounts` actif | Skip Unipile, Perplexity seul | Enrichissement partiel (pas de profil LinkedIn) |
| `extractLinkedInIdentifier` echoue | Exception non catchee dans le flow | Erreur 500, tout l'enrichissement echoue |
| Unipile `getUserProfile` echoue | `.catch(() => null)` | Silencieux, Perplexity tourne quand meme |
| Unipile posts 422 (mauvais identifier) | `.catch(() => null)` | Silencieux, pas de posts |
| Cle Perplexity manquante | Exception dans `callPerplexity` | Erreur 500 |
| JSON parse Perplexity echoue | `catch` dans route -> 500 | Message "Erreur de parsing" |
| DB update echoue | `console.error()` seulement | **Enrichissement calcule mais pas persiste !** |
| Lead sans `linkedinUrl` | Condition `if (linkedinAccount && lead.linkedinUrl)` | Skip Unipile silencieusement |

**Risque principal** : Si `console.error("Failed to save enrichment to DB")` se declenche, l'enrichissement est calcule (et facture via Perplexity) mais jamais sauvegarde. Pas de retry, pas d'alerte.

---

## 2. SCORING

### 2a. Code reel -- Logique de scoring

**Fichier principal : `app/api/ai/score/route.ts`**

Pipeline :
```
1. Auth (getUser)
2. buildScoringContext(lead) -> runtime context (utilise buildLeadSections)
3. buildScoringUserPrompt(lead) -> "Score ce lead : X Y (Titre @ Entreprise)"
4. callAI(scoring agent, temp 0.3, maxTokens 1024)
5. Parse JSON response
6. Auto-sync: categorie -> status (HOT->hot, WARM->warm, COLD/NO_GO->cold)
7. DB UPDATE: leads.score + enrichment_data.scoring_detail (merge)
```

**Grille de scoring (prompt `scoring` v4.2, `lib/ai/prompts/defaults.ts`) :**

| Composante | Max | Criteres |
|-----------|-----|----------|
| **Fit Score** | 40 | Solopreneur/micro (10) + B2B service (10) + decideur autonome (10) + signaux maturite (10) |
| **Intent Score** | 40 | Signal de base (0-20) + Bonus si signal >= medium (email 5, posts 5, anciennete 6-24mo 5) + stage replied+notes positives (5) |
| **Timing Score** | 20 | Optimal: signal fort + anciennete 6-24mo + croissance (20) / Neutre (10) / Defavorable (0) |
| **Total** | **100** | |

**Categorisation :**
- Score >= 70 : **HOT** (contact sous 24h)
- Score >= 45 : **WARM** (contact cette semaine)
- Score >= 25 : **COLD** (nurturing)
- Score < 25 : **NO_GO** (archiver)

**Cas limites :** Si score entre 65-75 ou 20-30, l'IA peut appliquer un ajustement de +/-5 points avec justification.

**Modele utilise :** Claude (modele choisi par l'utilisateur dans ses settings, recommande haiku), temperature 0.3.

### 2b. Dependance enrichissement <-> scoring

**Le scoring depend FORTEMENT de l'enrichissement.**

`buildScoringContext(lead)` appelle `buildLeadSections(lead)` qui injecte :
```typescript
if (lead.enrichmentData?.company) {
  // Taille, Secteur, CA, Financement, Localisation, News
}
if (lead.enrichmentData?.person) {
  // Anciennete poste, Interets, Posts recents
}
if (lead.enrichmentData?.signal) {
  // Type signal, Detail, Interaction SmartAI
}
```

**Si le lead n'est pas enrichi (ou enrichi en format plat) :**
- Sections Entreprise, Personne, Signal : **absentes du prompt**
- Le scoring IA ne voit que : nom, titre, entreprise, linkedinUrl, score actuel, status, stage, tags, notes
- Fit Score : seul le titre/entreprise permet une estimation -> partiel
- Intent Score : signal absent -> 0 points de base (FROID), aucun bonus possible
- Timing Score : pas d'anciennete, pas de news -> 0 ou 10 max

**Score attendu pour un lead non enrichi : ~10-25 (COLD/NO_GO)**

### 2c. Utilisation du score dans le flow

| Utilisation | Fichier | Detail |
|------------|---------|--------|
| **Affichage Pipeline** | `pipeline-client.tsx` | Colonne score avec badge couleur, triable, filtrable (min/max) |
| **Fiche Lead** | `lead-detail-client.tsx` | Badge circulaire colore + bouton "Rescorer" + breakdown (fit/intent/timing) |
| **Dashboard KPIs** | `dashboard-client.tsx` | Score affiche sur cards "Leads chauds/tiedes" |
| **Daily Actions cards** | `actions-client.tsx` | Badge variant selon score (>=70 red, >=50 orange, else gray) |
| **Listes** | `lists-client.tsx` | Badge couleur score |
| **Tri par defaut** | `lib/actions/leads.ts` | `getLeads()` ordonne par `score DESC` |
| **Auto-sync status** | `app/api/ai/score/route.ts` | Categorie -> status lead (HOT->hot, WARM->warm, COLD/NO_GO->cold) |
| **Priorisation generation** | Cron `generate-actions` | Score est charge mais **pas utilise explicitement** pour prioriser |

**Le score n'est PAS utilise pour :**
- Choisir le CTA ou le template de message
- Router vers une sequence specifique
- Decider d'enrichir automatiquement
- Prioriser l'ordre d'envoi dans le cron

### 2d. Etat reel des scores

En production, un lead nouvellement cree a `score: 0` par defaut et ne sera score que si l'utilisateur clique "Rescorer" sur la fiche lead. Le scoring est calcule par l'agent IA (grille 40/40/20).

---

## 3. DOCS EXISTANTES

### 3a. Inventaire documents

| Document | Contenu enrichissement/scoring |
|----------|-------------------------------|
| `CLAUDE.md` | Reference complete : agents, RAG mapping, schema DB, API routes |
| `DECISIONS.md` | Decisions architecture : RAG blocs par agent, prompt strategy |
| `PROMPTS_ORCHESTRATOR.md` | Sessions G+J : implementation routes score/enrich |
| `promtp V4/02_ENRICHISSEMENT_v4_3.md` | Spec complete agent enrichissement |
| `promtp V4/03_SCORING_v4_2.md` | Spec complete agent scoring |
| `docs/ENRICHISSEMENT-DATA.md` | Pipeline enrichissement detaille, structure stockage, gotchas |
| `docs/DIAGNOSTIC_AGENT3.md` | Diagnostic Agent Prospection |
| `docs/brainstorm-agents/05-agent-enrichissement.md` | Design doc agent enrichissement |

### 3b. Comparaison doc vs code

| Document | Verdict | Detail |
|----------|---------|--------|
| `CLAUDE.md` | ✅ A jour | Reflete fidelement le code implemente |
| `DECISIONS.md` | ✅ A jour | Decisions d'architecture respectees dans le code |
| `PROMPTS_ORCHESTRATOR.md` | ✅ A jour | Sessions marquees comme completees, code correspond |
| `promtp V4/02_ENRICHISSEMENT_v4_3.md` | ✅ A jour | Prompt implemente dans `defaults.ts`, structure JSON conforme |
| `promtp V4/03_SCORING_v4_2.md` | ✅ A jour | Grille 40/40/20 implementee, categorisation conforme |
| `docs/ENRICHISSEMENT-DATA.md` | ⚠️ Partiellement obsolete | Mentionne des "next steps" (batch, restructuration) non implementes. La limitation posts Unipile notee peut avoir ete resolue via `provider_id`. Sinon fidele au code. |
| `docs/DIAGNOSTIC_AGENT3.md` | ✅ A jour | smartai_interaction toujours false |
| `docs/brainstorm-agents/05-agent-enrichissement.md` | ⚠️ Design doc | Doc de conception, pas de discrepance majeure mais ne reflete pas les details d'implementation (Unipile profile storage, auto-correction stage) |

---

## 4. GAP ANALYSIS

| Fonctionnalite | Decrit dans docs ? | Implemente dans code ? | Fonctionne en prod ? |
|----------------|-------------------|----------------------|---------------------|
| **Source Unipile (profil LinkedIn)** | ✅ | ✅ `getUserProfile()` | ✅ Si compte LinkedIn connecte |
| **Source Unipile (posts LinkedIn)** | ✅ | ✅ `getUserPostsByIdentifier()` | ⚠️ Necessite `provider_id` (obtenu via profil), `catch(() => null)` si echec |
| **Source Perplexity (recherche web)** | ✅ | ✅ `callPerplexity()` | ✅ Si cle Perplexity configuree |
| **Champ company.size** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ company.industry** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ company.funding** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ company.revenue** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ company.news** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ person.interests** | ✅ | ✅ Via Perplexity | ✅ Apres enrichissement API |
| **Champ person.recentPosts** | ✅ | ✅ Via Perplexity + Unipile | ✅ Apres enrichissement API |
| **Champ person.anciennete_poste_mois** | ✅ | ✅ Calcule depuis Unipile | ✅ Si experience presente dans profil |
| **Champ signal.type** | ✅ | ✅ 6 types classifies par Perplexity | ✅ Mais INBOUND toujours false (V1) |
| **Champ linkedin_profile (brut)** | ✅ | ✅ Stocke directement | ✅ Affiche dans UI |
| **Champ linkedin_posts (brut)** | ✅ | ✅ Stocke directement | ⚠️ Depend de l'endpoint Unipile posts |
| **Champ scoring_detail** | ✅ | ✅ Via `/api/ai/score` | ✅ Si scoring declenche manuellement |
| **smartai_interaction** | ✅ (decrit) | ❌ Toujours `false` | ❌ Fonctionnalite non implementee en V1 |
| **Trigger manuel enrichissement** | ✅ | ✅ Bouton "Enrichir" | ✅ |
| **Trigger auto enrichissement (import)** | ❌ | ❌ | ❌ Non implemente |
| **Trigger auto enrichissement (cron)** | ❌ | ❌ | ❌ Non implemente |
| **Trigger auto enrichissement (avant generation)** | ❌ | ❌ | ❌ Non implemente |
| **Trigger manuel scoring** | ✅ | ✅ Bouton "Rescorer" | ✅ |
| **Trigger auto scoring** | ❌ | ❌ | ❌ Non implemente |
| **Scoring sans enrichissement** | Implicite | ✅ (fonctionne mais degrade) | ⚠️ Score ~10-25, pas pertinent |
| **Fallback si enrichissement echoue** | ❌ Non documente | ⚠️ `console.error` seulement | ⚠️ Donnee calculee mais potentiellement non sauvegardee |
| **Seed data format correct** | ❌ (bug identifie dans DIAGNOSTIC_AGENT3) | ❌ Format plat, pas nested | ❌ Sections enrichissement invisibles pour l'IA |
| **Batch enrichissement** | ✅ (code) | ✅ Route accepte `{ leads: [...] }` | ⚠️ Pas d'UI pour le declencher |
| **Auto-correction stage** | ✅ | ✅ 1er degre -> connected | ✅ |
| **Merge preservant scoring_detail** | ✅ | ✅ Spread existant + nouveau | ✅ |

---

## 5. PROBLEMES IDENTIFIES

### P1 -- CRITIQUE : Enrichissement 100% manuel

**Impact :** Les leads arrivent a l'Agent Prospection SANS enrichissement. Le cron `generate-actions` genere des messages sans contexte entreprise, sans signal, sans anciennete.

**Cause :** Aucun trigger automatique. L'utilisateur doit aller sur chaque fiche lead et cliquer "Enrichir" un par un.

**Consequence :** Les messages generes sont generiques. Le scoring est degrade (score ~10-25). Le systeme ne peut pas differencier un lead HOT d'un lead COLD sans enrichissement.

### P2 -- CRITIQUE : Scoring 100% manuel

**Impact :** Le score reste a 0 (defaut) pour tout nouveau lead tant que l'utilisateur n'a pas clique "Rescorer".

**Cause :** Aucun trigger automatique apres enrichissement ou import.

**Consequence :** Le tri par score est inutile pour les nouveaux leads. L'auto-sync status (HOT/WARM/COLD) ne se declenche pas.

### P3 -- MOYEN : Pas de chainage enrichissement -> scoring

**Impact :** Apres un enrichissement, l'utilisateur doit retourner sur la fiche et cliquer "Rescorer" separement.

**Cause :** Les deux operations sont completement decouplee.

### P5 -- MOYEN : DB update echec silencieux

**Impact :** `console.error("Failed to save enrichment to DB")` -- l'enrichissement est facture (appel Perplexity) mais potentiellement pas sauvegarde.

**Cause :** Pas de retry, pas de notification utilisateur, la reponse API retourne quand meme les donnees (donc l'UI les affiche temporairement).

### P6 -- MINEUR : INBOUND signal mort en V1

**Impact :** Le template le plus personnalise (INBOUND) ne peut jamais etre declenche.

**Cause :** `smartAIInteractions: []` est hardcode. Pas de source de donnees pour detecter les interactions Smart.AI.

---

## 6. RECOMMANDATIONS

### Plan d'action priorite

#### Phase 1 -- Quick Wins (1-2 jours)

**1.1** Seed data fictives supprimees. Les leads reels sont enrichis via `/api/ai/enrich`.

**1.2 Chainage enrichissement -> scoring** (P4)
Apres un enrichissement reussi dans `lead-detail-client.tsx`, declencher automatiquement le scoring :
```typescript
// Apres enrichment success
const scoreRes = await fetch("/api/ai/score", {
  method: "POST",
  body: JSON.stringify({ lead: { ...lead, enrichmentData } })
});
```

#### Phase 2 -- Automatisation (3-5 jours)

**2.1 Enrichissement automatique a l'import CSV** (P1)
Dans `lib/actions/import.ts`, apres insertion des leads, declencher un enrichissement batch en background :
```typescript
// Option A : appel API interne
await fetch("/api/ai/enrich", { method: "POST", body: JSON.stringify({ leads }) });

// Option B : queue (si volume important)
// Utiliser un cron dedie ou Vercel background functions
```

**2.2 Cron enrichissement des leads non enrichis** (P1)
Nouveau cron : `GET /api/crons/enrich-leads`
- Schedule : 1x/jour a 5h (avant generate-actions a 6h)
- Logique : SELECT leads WHERE enrichment_data IS NULL OR enrichment_data->>'company' IS NULL, LIMIT 20
- Enrichir en batch via `enrichSingleLead()`
- Respecter les quotas Perplexity

**2.3 Scoring automatique post-enrichissement** (P2)
Dans la route `/api/ai/enrich`, apres DB update reussi, appeler `/api/ai/score` :
```typescript
// app/api/ai/enrich/route.ts -- apres le merge DB
if (!updateError) {
  // Fire-and-forget scoring
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/ai/score`, {
    method: "POST",
    body: JSON.stringify({ lead: { ...lead, enrichmentData: mergedData } })
  }).catch(console.error);
}
```

#### Phase 3 -- Robustesse (2-3 jours)

**3.1 Retry sur echec DB** (P5)
```typescript
// Retry 1 fois si DB update echoue
if (updateError) {
  console.error("DB save failed, retrying...", updateError.message);
  const { error: retryError } = await supabase.from("leads").update({...}).eq("id", lead.id);
  if (retryError) {
    // Cette fois, remonter l'erreur au client
    return { ...enrichmentResult, usage: response.usage, warning: "Enrichissement non sauvegarde" };
  }
}
```

**3.2 Pre-enrichissement dans generate-actions** (P1)
Dans le cron `generate-actions`, avant de generer un message, verifier si le lead est enrichi. Si non, enrichir d'abord :
```typescript
// app/api/crons/generate-actions/route.ts
if (!lead.enrichment_data?.company) {
  await enrichSingleLead(lead, userId, supabase);
  // Recharger le lead enrichi pour la generation
}
```

**3.3 Batch enrichissement UI** (nouveau)
Ajouter un bouton "Enrichir la selection" dans la vue Pipeline pour enrichir plusieurs leads d'un coup. L'API batch existe deja (`{ leads: [...] }`).

#### Phase 4 -- Ameliorations (optionnel)

**4.1 Detection INBOUND** (P6) -- Quand Smart.AI aura un produit live, implementer la detection d'interactions.

**4.2 Score auto-refresh** -- Re-scorer automatiquement les leads dont l'enrichissement a change depuis le dernier scoring.

**4.3 Alertes enrichissement** -- Notification quand un lead passe de FROID a POST_DOULEUR ou ACTUALITE.

---

## 7. RESUME EXECUTIF

| Aspect | Etat | Verdict |
|--------|------|---------|
| Code enrichissement | Complet et fonctionnel | ✅ Fonctionne quand declenche manuellement |
| Code scoring | Complet et fonctionnel | ✅ Fonctionne quand declenche manuellement |
| Sources de donnees | Unipile + Perplexity | ✅ Dual-source implementee |
| Trigger automatique | Aucun | ❌ 100% manuel, bloquant pour le workflow |
| Seed data | Format incorrect | ❌ Inutilisable par l'IA |
| Chainage enrichissement -> scoring | Absent | ❌ 2 clics separees |
| Documentation | Comprehensive et a jour | ✅ Docs fiables |
| Impact sur Agent Prospection | Leads non enrichis = messages generiques | ❌ Degradation majeure de la qualite |

**Le code est la. Les pipelines fonctionnent. Le probleme est l'orchestration : rien ne se declenche automatiquement.** Les leads arrivent a l'Agent Prospection sans enrichissement, donc sans contexte personnalise, et le scoring reste a 0.

**Action #1 la plus impactante** : Implementer un cron d'enrichissement automatique avant la generation quotidienne (Phase 2.2 + 2.3). Cela resout P1, P2, et P4 d'un coup.
