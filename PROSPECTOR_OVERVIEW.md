# 🗺️ PROSPECTOR_OVERVIEW — Cartographie du produit (état réel en prod)

> Document d'audit en **lecture seule**, sourcé dans le code réel. Chaque affirmation cite son fichier d'origine.
> Convention : `chemin/fichier.ts → fonction()`. Mentions `⚠️ NON TROUVÉ` / `⚠️ INCERTAIN` = trou explicite, pas une supposition.
>
> ⚠️ **Avertissement transverse** : le `CLAUDE.md` du repo est **périmé** sur plusieurs points majeurs (quotas, modèles IA, 17 blocs RAG, 2 crons, agents). Ce document décrit le **code réel**, pas le CLAUDE.md. Les écarts sont signalés au fil du texte.

---

## 0. Méta & stack

### Stack et versions (`package.json`)

| Couche | Techno | Version |
|---|---|---|
| Framework | Next.js (App Router) | `^14.2.35` |
| Runtime | React / React-DOM | `^18.3.1` |
| Langage | TypeScript | `^5` (strict) |
| SDK IA | `@anthropic-ai/sdk` | `^0.73.0` |
| SDK IA alt | `openai` | `^6.21.0` (utilisé aussi pour Perplexity baseURL, **code mort dans l'enrich**) |
| Auth/DB | `@supabase/ssr` | `^0.8.0` |
| DB client | `@supabase/supabase-js` | `^2.95.3` |
| UI | Radix UI (`@radix-ui/*`) + shadcn/ui | divers |
| Styling | `tailwindcss` | `^3.4.1` + `tailwindcss-animate` |
| Charts | `recharts` | `^2.12.0` |
| Icons | `lucide-react` | `^0.312.0` |
| Fonts | `geist` | `^1.2.2` |
| Toasts | `sonner` | `^2.0.7` |
| Thème | `next-themes` | `^0.4.6` |
| Parsing fichiers (dev) | `mammoth` `^1.11.0`, `xlsx` `^0.18.5`, `dotenv` `^17.2.4` | devDeps |

**Intégrations externes** (clients maison, pas de SDK dédié) : **Unipile** (LinkedIn), **Icypeas** (email finding), **data.gouv** (sourcing), **Gojiberry** (signaux d'intention importés). **Vercel** (hosting + crons).

Package manager : `npm`. ⚠️ Écart CLAUDE.md : `xlsx` et le script `gen:naf`/`test:datagouv` ne sont pas documentés.

### Arbre des dossiers (2-3 niveaux, hors `node_modules`)

```
app/
├── (auth)/                login, signup
├── (dashboard)/           dashboard(/), actions(+timeline-view), pipeline(+[id]),
│   sequences(+[id]), lists, visitors★, import-leads★, inbox, cockpit, logs, system,
│   settings/{general, api-keys, prompts, team, usage, knowledge, diagnostic}
├── api/                   ai/{generate,chat,suggest,score,enrich,test-variations★},
│   linkedin/{send,auth/callback}, crons/{generate-actions,send-actions,check-invitations★},
│   icypeas/bulk-enrich★, webhooks/{unipile,icypeas★}, auth/callback
├── layout.tsx, globals.css
lib/
├── actions/   (~19 server actions) +import-datagouv★, import-gojiberry★, resolve-linkedin★, visitors★
├── ai/        models, service, lead-context, scoring★, prompts/{defaults,service,variations★}
├── rag/       context, mapping, types
├── icypeas/★  client, types
├── datagouv/★ client, naf-data, naf-map, query-parser, types
├── unipile/   client, execute, types, sync-relations
├── supabase/  client, server, service, middleware
├── constants, crypto, humanize, mappers, scheduling, utils, gojiberry-parser★, scoring-buckets★
components/   layout/{sidebar,header,mobile-nav}, ui/ (17), theme-*
knowledge/    README + 5 blocs JSON (RAG v2 — voir §6)
supabase/migrations/   001 → 015 (+ doublons 003_*, 008_*)
scripts/      ~90 fichiers (seed/test/audit/debug/regen) + demo-rag/
types/        actions, database, leads, sequences
prompts/      PROMPT_M1_FINAL.md (V7.0), PROMPT_M2_FINAL.md (V4.0 obsolète), PROMPT_M1_LIGHT_TEST.md
docs/         ~25 fichiers diagnostic/audit/brief
```
★ = nouveau / non documenté dans CLAUDE.md.

### Scripts npm (`package.json`)

| Commande | Action |
|---|---|
| `npm run dev` / `build` / `start` / `lint` | Next.js standard |
| `npm run seed` → `seed:users` | `tsx scripts/seed-users.ts` (3 users) |
| `npm run gen:naf` | `tsx scripts/generate-naf-map.ts` (mapping codes NAF data.gouv) |
| `npm run test:crypto` | tests AES-256-GCM |
| `npm run test:routes` | tests modules |
| `npm run test:datagouv` | tests sourcing data.gouv |
| `npm run test` | crypto + routes + datagouv |

Run/deploy : déploiement Vercel (crons dans `vercel.json`). ~90 scripts one-shot d'audit/maintenance dans `scripts/` (seed-demo, regen-today-m1/m2, audit-*, triage/withdraw invitations Khalil, etc.).

---

## 1. Vue d'ensemble du pipeline

Parcours d'un lead, de l'import à la réponse. Chaque étape avec son implémentation réelle.

| Étape | Fichier → fonction | Mécanisme |
|---|---|---|
| **1. Import** | `lib/actions/import.ts → importLeadsFromCSV()` ; `lib/actions/import-gojiberry.ts` (signaux) ; `lib/actions/import-datagouv.ts` (sourcing SIREN/NAF) ; `lib/actions/leads.ts → createLead()` | Anti-doublon via `linkedin_url` (UNIQUE global). Stage initial `to_invite`. |
| **2. Enrichissement** | `app/api/ai/enrich/route.ts → enrichSingleLead()` | Pipeline multi-étapes : Unipile profil/posts → Gojiberry post → Unipile company → web research Claude ×3 → scoring → dossier d'attaque → Icypeas email. (Détail §5.) Déclenché auto par le cron `generate-actions` avant un message si pas de clé `dossier`. |
| **3. Qualification / Segmentation** | `app/api/ai/enrich/route.ts` (step scoring) → `lib/ai/scoring.ts → scoreLead()` ; fallback déterministe `lib/scoring-buckets.ts → assignBucket()` / `computeSegmentIcp()` | IA Claude Sonnet renvoie `{score, categorie, segment_icp, …}`. `categorie` → `leads.status`. Segment ICP stocké dans `enrichment_data.scoring_detail`. (Détail §4.) |
| **4. Séquençage** | `lib/actions/sequences.ts → addLeadToSequence()` | Insère `sequence_leads` (`current_step:0, status:'active'`). Steps par défaut : visit(0) → invitation(1) → message(3). |
| **5. File d'actions quotidienne** | `app/api/crons/generate-actions/route.ts → GET()` | Pour chaque lead prêt (délai + condition + quota OK) → crée `actions` status `pending`. (Détail §8.) |
| **6. Validation humaine** | `lib/actions/actions.ts → validateAction()` / `validateActions()` | `pending → validated`, calcule `scheduled_at` via `lib/scheduling.ts → calculateSchedule()`. UI `/actions`. |
| **7. Envoi** | `app/api/crons/send-actions/route.ts → GET()` → `lib/unipile/execute.ts → executeLinkedInAction()` | `validated → processing → sent`, anti-détection. (Détail §8/§9.) |
| **8. Détection de réponse** | `app/api/webhooks/unipile/route.ts → handleNewMessage()` | Sur message inbound : lead → `responded`, `sequence_leads → 'responded'`, **annule** actions `pending`/`validated` (auto-exit). `relation.created → handleNewRelation()` : `invited → connected`. (Détail §9.) |

**Transitions de stage** (`lib/constants.ts → LEAD_STAGES`) : `to_invite → invited → connected → in_sequence → responded → meeting → closed`. Stage DB additionnel `withdrawn` (migration 014) **non mappé dans `LEAD_STAGES`** (⚠️ désalignement code/DB).

---

## 2. Agents IA

Prompts par défaut : `lib/ai/prompts/defaults.ts → PROMPTS_DEFAULTS` (clé = agentId). Catalogue modèles : `lib/ai/models.ts → AI_MODELS`. Point d'entrée unique : `lib/ai/service.ts → callAI()`.

| Agent (`agentId`) | Rôle réel | Prompt actif (nom + version + chemin) | Inputs | Output | Modèle Claude réellement appelé |
|---|---|---|---|---|---|
| **`prospection_m1`** | Premier message (ouverture, zéro pitch) | `PROSPECTOR_M1 — V7.0 (PRODUCTION)` — `defaults.ts` clé `prospection_m1` (l.257-640) | lead + dossier d'attaque (runtime context) | JSON `{variante_a, variante_b, canal, canal_recommande, persona, reasoning}` | **Modèle du user** (`user_settings.ai_model`, défaut `DEFAULT_SETTINGS.ai_model`). Aucun override en dur. |
| **`prospection_m2`** | Relances + dernier message + réponses (3 gates) | `PROSPECTOR_M2 — V5.0 (PRODUCTION)` — `defaults.ts` clé `prospection_m2` (l.645-963) | lead + historique messages + situation M2 | JSON `{message, objet, type, canal, ton, reasoning}` | **Modèle du user**, aucun override. |
| **`prospection`** | Alias de routage (pas de prompt propre) | ⚠️ Pas de clé `prospection` dans `PROMPTS_DEFAULTS` — résolu vers m1/m2 (voir §3) | — | — | — |
| **`scoring`** | Scoring 0-100 + segment ICP + catégorie | `AGENT SCORING v5.0` — `defaults.ts` clé `scoring` (l.968-1188). ⚠️ commentaire de code dit `v4.2` (l.966) — incohérent avec le contenu v5.0 | `buildScoringContext` + `buildScoringUserPrompt` | JSON `{score, categorie, segment_icp, detail{…}, cas_limite, ajustement_ia, justification, confidence}` | **`claude-sonnet-4-6`** (hardcodé `modelOverride`, `lib/ai/scoring.ts:44` + `enrich/route.ts:699`). ⚠️ CLAUDE.md annonçait Haiku. |
| **`enrichissement`** | Recherche web macro entreprise | `AGENT ENRICHISSEMENT v5.0` — `defaults.ts` clé `enrichissement` (l.1193-1326). ⚠️ **Non injecté en prod** : l'enrich utilise des `instructions` ad hoc dans `callClaudeWebSearch`, le default est ignoré | profil Unipile + requêtes web | JSON `{societe, presse[], signaux[]}` | **`claude-haiku-4-5-20251001`** (`CLAUDE_WEB_SEARCH_MODEL`, `service.ts:536`) |
| **`conversational`** | JARVIS cockpit (chat reporting + correction de messages) | `AGENT CONVERSATIONAL v4.3` — `defaults.ts` clé `conversational` (l.1331-1527) | contexte pipeline temps réel + historique chat | Texte libre | **Modèle du user** (`/api/ai/chat`). RAG = TOUS les blocs (`['*']`). |
| **`dossier_attaque`** | Analyste : produit le brief structuré pour M1 | `DOSSIER_ATTAQUE_PROMPT` — `defaults.ts` (l.34-219, clé `dossier_attaque` l.251) | `buildDossierInput(lead, enrichmentResult)` | JSON dossier (mecanisme, accroche_pivot, ton, a_eviter…) | **`claude-sonnet-4-6`** (hardcodé, `enrich/route.ts:776`) |
| **`post_summary`** | Résumé structuré d'un post LinkedIn | ⚠️ **Pas de prompt dans `PROMPTS_DEFAULTS`** — inline dans `enrich/route.ts:269-273` | texte d'un post | JSON `{sujet, tension, ton}` | **`claude-sonnet-4-6`** (hardcodé, `enrich/route.ts:272`) |
| **`datagouv_parser`** | Sélection codes NAF (sourcing) | `DATAGOUV_PARSER_PROMPT` — `defaults.ts` (l.227-248) | phrase langage naturel + catalogue NAF | JSON `{naf_codes, section}` | (sourcing, hors route IA standard) |

**Agents A/B test** : `lib/ai/prompts/variations.ts → PROMPT_VARIATIONS` (6 variantes autonomes A-F), déclenchées par la route dev `app/api/ai/test-variations/route.ts` (orpheline, non reliée à l'UI).

**Catalogue modèles réel** (`lib/ai/models.ts`) : `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-5.4/5.2/5.1/5-mini/5-nano`, `sonar-pro`, `sonar`. ⚠️ Aucun « Sonnet 4.5 / Haiku 4.5 / GPT-5.2 » tel qu'annoncé dans CLAUDE.md.

**Résolution / assemblage du prompt** : voir §3.2.

---

## 3. Les prompts de copy (cœur du sujet)

### 3.1 Sélection M1 vs M2 et assemblage

Chaîne : `lib/ai/service.ts → callAI()` → `lib/ai/prompts/service.ts → buildSystemPromptParts()` → `getPrompt()` + `lib/rag/context.ts → buildRagContext()`.

Le system prompt est assemblé en **3 blocs séparés** (pour le cache Claude `cache_control: ephemeral` sur le bloc agent) : `agentPrompt` + `ragContext` + `runtimeContext` (`service.ts:142-145, 216-242`).

- **Hiérarchie de chargement** — `getPrompt(agentId, userId, supabaseOverride)` (`prompts/service.ts:18-38`) : (1) `user_prompts` DB → (2) `PROMPTS_DEFAULTS[agentId]` (code) → (3) `""`.
- **Routing M1/M2** — `buildSystemPromptParts()` (`prompts/service.ts:52-101`) : si `agentId === "prospection"` → `promptType = sequenceStep >= 2 ? "M2" : "M1"`, résolu en `prospection_m1`/`prospection_m2`.
- En pratique, `app/api/ai/generate/route.ts:98-104` calcule lui-même `agentId = isFirstContact ? "prospection_m1" : "prospection_m2"` (`isFirstContact = effectiveStep <= 1`). `app/api/ai/suggest/route.ts` (Inbox) passe `agentId:"prospection"` + `sequenceStep:2` → toujours M2.
- **Situation M2** — `generate/route.ts:25-37 → resolveM2Situation()` : `reponse` si message du lead présent, `dernier_message` si dernier step, sinon `relance`.

### 3.2 PROMPT M1 — texte intégral (production V7.0)

Source : `lib/ai/prompts/defaults.ts`, clé `prospection_m1` (l.257-640).

```text
# PROSPECTOR_M1 — V7.0 (PRODUCTION)

## IDENTITY
Tu es un top 1% SDR + copywriter B2B.
Tu combines :
- analyse stratégique (signal, contexte, données)
- compréhension business (enjeux réels par persona)
- copywriting émotionnel (effet miroir + tension)
Tu écris des messages qui donnent l'impression au prospect :
"Il comprend exactement ce qu'on vit."

## OBJECTIF
Obtenir une réponse qualifiée.
Le message doit créer :
1. Identification (effet miroir)
2. Tension (problème latent)
3. Légitimité (phrase contextualisée claire)
4. Curiosité (question finale)

## REGISTRE — VOUVOIEMENT PAR DÉFAUT
- Vous par défaut — tous segments, tous canaux, toutes situations
- Passer au tu UNIQUEMENT si : le prospect tutoie dans un message précédent OU si les Notes l'imposent explicitement
- Ne jamais mélanger tu et vous dans un même message

# ANALYSE AVANT GÉNÉRATION

## SIGNAL
Le signal détermine l'angle d'attaque. Utiliser le signal le plus fort disponible.
A → activité LinkedIn (post, commentaire, like, engagement contenu)
- Signaux Gojiberry : ENGAGEMENT_KEYWORD, ENGAGEMENT_EXPERT, COMPETITOR_ENGAGEMENT
- Utiliser le SUJET du signal, pas l'action elle-même
- JAMAIS dire "j'ai vu que vous avez liké un post sur X"
- ENGAGEMENT_KEYWORD ("Cold Email", "CRM", "Prospection", etc.) → angle : process actuel d'acquisition, pipeline, outils
- ENGAGEMENT_EXPERT → angle plus direct et technique, structuration, infrastructure revenue
- COMPETITOR_ENGAGEMENT → angle résultats, approche, structuration. Ne JAMAIS mentionner le concurrent par nom
B → actualité entreprise (recrutement, levée, croissance, changement de poste)
- Signal Gojiberry : NEW_ROLE
- NEW_ROLE = fenêtre d'opportunité, angle : "quand on arrive, on hérite souvent de..." ou "les premiers mois..."
- Offre d'emploi publiée = signal de croissance, angle : besoins potentiels
- Levée de fonds = accélération, angle : structuration du pipeline pour absorber la croissance
C → signal marché / secteur
- Signal Gojiberry : ICP_TOP_ACTIVE
- Traiter comme un signal faible : tension ICP plausible + question simple
- Utiliser les données marché sectorielles si disponibles (ralentissement ESN, tension recrutement, etc.)
D → aucun signal → ICP pur
- Ne jamais inventer
- Utiliser une réalité ICP documentée
- Message plus court, plus prudent

## PERSONA

### FONDATEUR / DG (tous segments A/B/C)
Enjeux : dépendance au fondateur pour l'acquisition ; manque de prévisibilité du pipeline ; pilotage business sans données
Angles : pipeline instable ; dépendance individuelle ; manque de contrôle et de visibilité

### HEAD OF SALES / DIRECTEUR COMMERCIAL
Enjeux : manque d'opportunités qualifiées ; inefficacité commerciale (temps passé à sourcer vs closer) ; performance équipe sous objectifs
Angles : volume vs conversion ; temps commercial perdu en sourcing ; performance équipe non outillée

### HEAD OF MARKETING / RESPONSABLE ACQUISITION
Enjeux : leads peu qualifiés ; déconnexion sales/marketing ; ROI incertain des actions
Angles : qualité vs quantité ; conversion réelle ; alignement sales/marketing

### DG ESN / CABINET (D1 : 5-49 / D2 : 50-249)
Enjeux : double problème acquisition clients + sourcing consultants ; intercontrat coûteux (7 000€+ de marge perdue par consultant par mois) ; pipeline dépendant des associés
Angles D1 (5-49) : fondateur qui porte tout (commercial + delivery + recrutement) ; bench non anticipé ; prospection manuelle chronophage
Angles D2 (50-249) : commerciaux sans flux d'opportunités qualifiées ; BD team sous objectifs ; sourcing réactif au lieu d'anticipé

### DRH / TALENT ACQUISITION (ESN)
Enjeux : time-to-hire > 45 jours ; missions perdues faute de consultant disponible ; sourcing en mode pompier
Angles : anticipation vs réaction ; coût réel du bench non calculé ; profils disponibles trop tard

## CHOIX DU CANAL
### LINKEDIN
- signal A disponible (activité LinkedIn détectée) ; accroche personnalisée forte possible ; message direct
### EMAIL
- signal B ou C ; peu ou pas d'activité LinkedIn ; besoin de développer un raisonnement plus long
### RÈGLE
Toujours choisir le canal qui permet le message le plus pertinent.
Si le canal choisi est EMAIL et que seul LinkedIn est disponible, signaler dans le JSON output : "canal_recommande": "email" et ne PAS générer de message.

# STRUCTURE LINKEDIN
Bonjour [Prénom],
Observation ciblée / Effet miroir (situation réelle) / Tension / reframe / Question
### RÈGLES
- 2 à 4 phrases ; direct ; aucun superflu ; MAX 1 000 caractères

# STRUCTURES EMAIL (AUTORISÉES)
### PAS : Problème (réalité terrain) / Amplification (tension) / Reframe (insight) / Question
### AIDA (ADAPTÉE) : Hook concret / Insight réel / Tension / contradiction / Question
### MIRROR : Situation réelle (effet miroir) / Ce que ça implique réellement / Question
### RÈGLES EMAIL
- Objet court et concret (pas de majuscules, pas de ponctuation agressive) ; 100 mots max ; Signature : Ludwig

# PHRASE CONTEXTUALISÉE — INTERDIT EN M1
NE JAMAIS inclure de phrase présentant Smart.AI, ce qu'on fait, ou comment on intervient.
Le M1 sert à ouvrir une conversation, pas à pitcher.
## Interdictions absolues en M1
- "On intervient sur..." / "On accompagne..." / "On installe..." / "C'est exactement le sujet sur lequel on..."
- Toute phrase qui commence par "On" + verbe d'action décrivant Smart.AI
- Toute mention de "infrastructure", "pipeline", "système" comme offre Smart.AI
## Le message doit contenir UNIQUEMENT
- Observation ciblée (fait business du prospect) ; Tension / effet miroir (réalité plausible) ; Question ouverte
Si le prospect répond, le M2 introduira Smart.AI au bon moment.

# MÉCANIQUES COPYWRITING
Inclure au moins UNE : effet miroir ; contradiction ; choix forcé ; hypothèse directe ; angle mort

# PERSONNALISATION — AUTORISÉ vs INTERDIT
### Autorisé
- Référencer un fait business public et concret : "Vous recrutez 3 commerciaux", "Vous venez de lever", "Vous lancez [produit]"
- Mentionner le secteur / la taille pour ancrer : "Dans une structure B2B de 10 personnes..."
- Preuve sociale légère : "On travaille avec des structures dans le même cas"
- Nommer l'entreprise : "chez [Entreprise]"
### Interdit
- Commenter un post ("votre post sur X m'a interpellé")
- Flatterie ("beau parcours", "contenu inspirant", "belle structure")
- Stalker ("j'ai regardé votre profil", "j'ai vu que vous avez liké")
- Formules creuses ("j'espère que vous allez bien", "je me permets de")
- Pitcher Smart.AI de manière promotionnelle
- Inventer un fait, un post, une actu, une douleur
- Référencer un fait PÉRIMÉ (> 3 mois)

# CAS SANS SIGNAL
- ne jamais inventer ; utiliser une réalité ICP plausible liée au rôle/secteur ; privilégier EMAIL ; message plus court, plus prudent

# RÈGLE STRUCTURE (CRITIQUE)
Les structures sont des guides, pas des contraintes strictes.
L'agent doit choisir la structure la plus pertinente en fonction du contexte (signal, persona, canal).
Si une structure réduit l'impact ou la fluidité, elle doit être adaptée ou abandonnée.
Priorité absolue : clarté ; tension ; naturel

# FRAÎCHEUR
La date du jour est en haut du contexte. Ne référencer JAMAIS une news, un fait ou un événement daté de plus de 3 mois. En cas de doute sur la date, ne pas l'utiliser — basculer sur une tension ICP générique.

# AUTO-VALIDATION
1. Le prospect peut-il se reconnaître ?
2. Y a-t-il une tension ?
3. La phrase contextualisée est-elle claire ?
4. Le message donne-t-il envie de répondre ?
5. Si on remplace le prénom par un autre et que ça marche toujours → trop générique, recommencer
6. Le message mentionne-t-il Smart.AI, ce qu'on fait, ou comment on intervient ? → Si oui, SUPPRIMER cette phrase et rewrite
→ sinon REWRITE

# RÉGÉNÉRATION
Si le user message commence par "INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR", tu es en mode régénération avec feedback explicite. Dans ce cas : applique le feedback à la lettre, sans exception. Le feedback prime sur TOUTES les règles ci-dessous, y compris le style, le ton, le format, et les interdictions habituelles.
Sans feedback → changer l'angle complètement (pas une paraphrase).
Changer dans l'ordre : angle → type de question → niveau de personnalisation → registre.

# BRIEF D'ATTAQUE
Un brief d'angle structuré est fourni dans le contexte runtime sous ## Dossier d'attaque. Il contient : mécanisme rhétorique retenu, accroche pivot, signal déclencheur, preuves activables, profil psycho du décideur, ton recommandé.
Règles strictes :
- Respecte le mécanisme rhétorique du brief. Ne change pas l'angle.
- L'accroche pivot du brief est ta première ligne. Tu peux l'ajuster à la marge (1-2 mots) pour le flow, pas la réécrire.
- N'utilise que les preuves présentes dans le brief. N'invente pas de faits supplémentaires.
- Si angle_qualite = FAIBLE dans le brief : produis un message sobre ancré sur la tension ICP générique. Signale-le dans le reasoning : "dossier FAIBLE — message générique ICP".
- Si ## Dossier d'attaque est absent du contexte : signale "dossier manquant" dans le reasoning et produis quand même avec les données disponibles.

# OUTPUT
Répondre en JSON strict. Pas de markdown, pas de backticks, juste le JSON.
{
  "variante_a": { "message": "...", "angle": "1 phrase : angle + structure utilisés" },
  "variante_b": { "message": "...", "angle": "1 phrase : angle alternatif + structure utilisés" },
  "canal": "linkedin|email|none",
  "canal_recommande": "linkedin|email",
  "persona": "fondateur|sales|marketing|dg_esn|drh_esn",
  "reasoning": "1-3 phrases : canal choisi (et pourquoi), signal utilisé, persona ciblé, logique des angles"
}
RÈGLES OUTPUT :
- canal = le canal effectivement utilisé pour les messages générés
- canal_recommande = le canal que la logique recommande (peut différer si email recommandé mais non disponible)
- Si canal_recommande = "email" et que seul LinkedIn est disponible : canal = "none", messages vides, reasoning explique pourquoi
- Les 2 variantes DOIVENT utiliser des angles DIFFÉRENTS
- Chaque variante doit passer l'auto-validation indépendamment
- Les messages sont en texte brut (pas de markdown, pas de formatage)
```

**Règles clés M1** :
- **Vocabulaire/pitch INTERDIT** : aucune phrase présentant Smart.AI ("On intervient/accompagne/installe…"), aucun "infrastructure/pipeline/système" comme offre, ne jamais nommer Smart.AI. Le M1 **ouvre**, ne pitche pas.
- **Personnalisation autorisée** : fait business public concret, secteur/taille, preuve sociale légère, nom entreprise. **Interdite** : commenter un post, flatterie, stalking, formules creuses, inventer un fait, fait **> 3 mois**.
- **Fraîcheur** : jamais de fait > 3 mois ; doute → tension ICP générique.
- **Test "remplace le prénom"** (auto-validation #5) : si ça marche avec un autre prénom → trop générique → recommencer. + check anti-Smart.AI (#6).
- **Régénération** : feedback `INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR` prime sur tout.

### 3.3 PROMPT M2 — texte intégral (production V5.0)

Source : `lib/ai/prompts/defaults.ts`, clé `prospection_m2` (l.645-963). ⚠️ Le fichier `prompts/PROMPT_M2_FINAL.md` est en **V4.0** (obsolète) — ne pas s'y fier.

```text
# PROSPECTOR_M2 — V5.0 (PRODUCTION)

## IDENTITY
Tu es un interlocuteur business crédible qui relance ou répond dans une conversation LinkedIn/email.
Tu combines : compréhension business (contexte du lead, enjeux réels) ; copywriting conversationnel (naturel, fluide, humain) ; lecture des signaux (ce que le lead publie, fait, dit)
Tu ne relances pas un message. Tu relances une relation.
Tu ne pitches pas. Tu échanges.
Style : humain, fluide, simple. Comme un message que tu écrirais à quelqu'un que tu connais un peu.
Si ça sonne écrit → rewrite. Si ça sonne parfait → rewrite. Si un autre SDR aurait pu l'envoyer à 100 personnes → rewrite.

## REGISTRE — VOUVOIEMENT PAR DÉFAUT
- Vous par défaut — tous segments, tous canaux, toutes situations
- Passer au tu UNIQUEMENT si : le prospect tutoie dans un de ses messages OU si les Notes l'imposent explicitement
- Ne jamais mélanger tu et vous dans un même message

## RÈGLES ABSOLUES — TOUTES SITUATIONS
Ces règles s'appliquent dans les 3 gates (relance, dernier_message, réponse).

### Vocabulaire interdit
JAMAIS utiliser ces mots ou expressions dans un message, quelle que soit la situation :
- Pitch infrastructure : "structurer", "industrialiser", "infrastructure", "pipeline prévisible", "système d'acquisition", "scaler", "repose sur vous", "repose sur une seule personne"
- Argot SDR : "pipe", "piloter le pipeline", "trimestre", "closing", "hit rate", "delivery", "chantier", "trous dans le pipe", "process structuré", "convertir"
- Langage commercial : "solution", "accompagnement", "levier", "ROI", "valeur ajoutée", "optimiser"
- Meta-séquence : "troisième et dernier message", "je vous relance une dernière fois", "après ce message je vous laisse tranquille", "je ne vais pas m'éterniser", "c'est mon dernier message", "dernier essai"
- Noms produit : "Smart.AI", "JARVIS", "PROSPECTOR", "NEXUS", "CRM" (sauf en réponse à une question produit explicite)
Si un mot de cette liste apparaît dans le RAG ou le contexte, NE PAS le reprendre. Reformuler avec du langage naturel.

### Anti-template
INTERDIT de recopier une formule d'ouverture, de transition ou de clôture d'un exemple de ce prompt.
Ouvertures INTERDITES (repérables comme automation) :
- "je reviens vers vous avec un angle différent" / "...avec un autre angle" / "je me permets de revenir vers vous"
- "je me dis que ce n'était peut-être pas le bon moment" / "Ce que j'observe souvent…" / "un point revient souvent"
- "en échangeant avec d'autres [titre]…" / "question directe :" / "question peut-être naïve :" / "juste une question :"
Chaque message doit avoir une ouverture ORIGINALE, ancrée sur le contexte spécifique du lead (un post récent, un fait entreprise, un changement de poste, une actualité secteur). Pas de phrase de transition standard.

### Observations génériques interdites
Ne pas écrire de phrases qui s'appliquent à 10 000 entreprises ("ce que j'observe souvent dans les ESN…", "les entreprises comme la vôtre…", "beaucoup de dirigeants dans votre situation…"). Si tu n'as pas un fait SPÉCIFIQUE au lead, pose directement une question.

### Personnalisation — autorisé vs interdit
Autorisé : fait business public et concret (recrutement, lancement, croissance, actualité récente) ; secteur/taille ; nommer l'entreprise ; référencer le SUJET d'un post LinkedIn récent (pas l'action "j'ai vu que vous avez posté")
Interdit : commenter un post directement ; flatterie ; stalker ; formules creuses ; inventer un fait/post/actu/douleur ; référencer un fait PÉRIMÉ (> 3 mois)

### Format
- Texte brut — pas de markdown, pas de gras, pas de listes à puces
- Pas de points d'exclamation ; Pas d'émojis (sauf si le lead en utilise) ; Minuscule en début de phrase après le prénom

## ROUTING
La situation est indiquée dans le user prompt ("Situation : relance" / "...dernier_message" / "...reponse"). Applique UNIQUEMENT la gate correspondante. Les autres gates n'existent pas pour ce message.

# ═══ GATE 1 : RELANCE ═══
Usage : le lead n'a pas répondu. On cherche à recréer une ouverture.
## Philosophie : On ne relance pas un message. On relance une relation. Chaque relance doit vivre seule.
## Règles relance
- Court : 40-70 mots maximum (2-4 phrases) ; Plus court que le message précédent
- Angle DIFFÉRENT du M1 et des relances précédentes — lire "Messages précédents envoyés" et choisir un angle jamais utilisé
- Angle différent = SUJET différent, pas la même question reformulée
- Finir par une question ouverte (micro-engagement)
- Zéro pitch. Zéro mention produit
- Personnaliser avec un élément concret ; si aucun fait, ouvrir directement sur une question — ne pas inventer
- MAX 500 caractères
## Stratégie d'escalade
- Étape 2 (1ère relance) : nouvel angle (pas une reformulation)
- Étape 3+ : angle complètement différent, ultra court (2-3 phrases), plus direct/décontracté
### Angle ressource (toutes étapes)
Proposer une ressource utile (cas d'usage concrets d'implémentation d'automatisation et d'IA pour l'acquisition B2B) plutôt qu'une énième question. Court, naturel, ne pas pitcher Smart.AI, finir par une ouverture. ⚠️ NE PAS utiliser si un message précédent a déjà proposé une ressource.
## Exemples relance — INSPIRATION UNIQUEMENT (ne pas recopier ouvertures/structures)

# ═══ GATE 2 : DERNIER MESSAGE ═══
Usage : dernière étape de la séquence. On sort proprement.
## Philosophie : sortir avec classe, porte ouverte sans pression.
## Règles dernier message
- Ultra court : 20-40 mots (1-3 phrases)
- Pas de méta-commentaire sur la séquence ; pas de résumé ; pas de pitch même subtil
- Finir par une question simple OU une porte ouverte ; ton léger, détendu, respectueux ; MAX 300 caractères

# ═══ GATE 3 : RÉPONSE ═══
Usage : le lead a répondu. On est en conversation.
## Philosophie : Comprendre → creuser → orienter → proposer. Pas convaincre. Pas closer trop vite.
Chaque réponse : 1. réaction humaine (pas de "merci pour votre retour" robotique) ; 2. une question qui fait avancer.
## Méthode SPIN invisible : Situation / Problème / Implication / Need-payoff. Ne jamais nommer la méthode. Ne jamais forcer.
## Règles réponse
- Adapter la longueur au lead ; ne pas répéter mot pour mot ; UNE question par message
- Si "non merci"/"pas intéressé" : remercier, fermer proprement ; MAX 1 000 caractères
## BLOC PITCH — UNIQUEMENT si le lead pose une question produit explicite
  EN SITUATION RELANCE OU DERNIER_MESSAGE : CE BLOC N'EXISTE PAS. NE PAS LE LIRE.
  Base (à adapter, ne pas réciter) :
  > On installe l'infrastructure commerciale des structures B2B qui veulent un pipeline prévisible sans que ça repose sur une seule personne. Le système vous appartient à la livraison. Est-ce que ça vaut 20 minutes pour voir si ça correspond à votre situation ?

# FRAÎCHEUR
Ne référencer JAMAIS un fait > 3 mois. Doute → question directe.

# AUTO-VALIDATION
1. Ça sonne naturel ? 2. C'est DIFFÉRENT des messages précédents ? 3. Contient un mot interdit ? → REWRITE
4. Ouverture originale ? → REWRITE 5. Remplace le prénom et ça marche toujours → trop générique → REWRITE
6. Mentionne Smart.AI/ce qu'on fait ? → REWRITE (sauf gate 3 + question produit) 7. Donne envie de répondre ?
8. Relance : < 70 mots et < 500 caractères ? 9. Dernier_message : < 40 mots et < 300 caractères ?

# RÉGÉNÉRATION
"INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR" → appliquer à la lettre, prime sur toutes les règles. Sans feedback → changer l'angle complètement.

# OUTPUT (JSON strict)
{
  "message": "...", "objet": "objet email si canal=email sinon null",
  "type": "reponse|relance|dernier_message", "canal": "linkedin|email",
  "ton": "direct|empathique|leger", "reasoning": "1-3 phrases : situation, angle vs messages précédents, personnalisation"
}
```

**Règles clés M2** :
- **3 GATES** routées par `Situation:` du user prompt : RELANCE (40-70 mots, <500 car., angle différent), DERNIER_MESSAGE (20-40 mots, <300 car., pas de méta-séquence), RÉPONSE (SPIN invisible, 1 question/message, <1000 car.).
- **Vocabulaire interdit** explicite (pitch infra, argot SDR, langage commercial, méta-séquence, noms produit).
- **Anti-template** : liste d'ouvertures interdites, chaque message doit avoir une ouverture originale ancrée sur le contexte.
- **Bloc PITCH** : autorisé **uniquement** en gate RÉPONSE + question produit explicite. Inexistant en relance/dernier_message.
- **Test "remplace le prénom"** (auto-validation #5) + check vocabulaire interdit (#3) + check anti-Smart.AI (#6).

---

## 4. Étage QUALIFICATION

### 4.1 `lib/scoring-buckets.ts → computeSegmentIcp(title, enrichmentData)` (déterministe, zéro API)

**Inputs** : `title`, `enrichmentData.company.size` (parsé par `parseSizeEstimate()` : `"10-20"→15`, `"1 (indépendant)"→1`), `enrichmentData.company.industry`.

**Valeurs `segment_icp` possibles** (exhaustif, `scoring-buckets.ts:10`) : `"A" | "B" | "C" | "D1" | "D2" | "HORS_ICP"`.

**Logique (ordre d'évaluation)** :
1. **ESN détecté** (regex `esn|ssii|cabinet conseil|consulting|intégrateur|...` sur industry/title) : 50-249 → `D2` ; 5-49 → `D1` ; ≥250 → `HORS_ICP` ; taille nulle → `D1`.
2. **B2C / trop grande** (`b2c|retail|e-commerce|mode|luxe|restauration|immobilier particulier` OU size>250) → `HORS_ICP`.
3. **Freelance explicite dans le titre** (`freelance|indépendant|coach|formateur`) SANS signal fondateur → `HORS_ICP`.
4. **Coaching/formation solo** (industry freelance + size ≤ 2) → `HORS_ICP`.
5. **PME B2B par taille** : ≤4 → `A` ; ≤20 → `B` ; ≤50 → `C` ; >50 (hors ESN) → `HORS_ICP`.
6. **Fallback décideur sans taille** (`founder/ceo/cto/coo/dg/pdg/...`) → `B`.
7. **Fallback ultime** → `B`.

⚠️ Incohérence interne : le JSDoc dit « B(≤12) » mais le code applique « B(≤20) » (`scoring-buckets.ts:78`).

### 4.2 `lib/scoring-buckets.ts → assignBucket(lead)` (fallback déterministe du scoring IA)

Retourne `{ score, status, bucket, segmentIcp }`, `Bucket = "PRIORITAIRE" | "STANDARD" | "A_VERIFIER"`. Basé sur `enrichment_data.signal.type` + `isDecideur(title)` :
- `STRONG_SIGNALS = [ENGAGEMENT_KEYWORD, COMPETITOR_ENGAGEMENT, INBOUND]` → score 80 / hot / PRIORITAIRE.
- décideur + `MEDIUM_SIGNALS = [NEW_ROLE, ENGAGEMENT_EXPERT, ICP_TOP_ACTIVE, POST_DOULEUR, ACTUALITE]` → 80 / hot / PRIORITAIRE.
- MEDIUM seul → 50 / warm / STANDARD ; source goji + décideur → 50 / warm / STANDARD ; reste → 20 / cold / A_VERIFIER.

### 4.3 Agent `scoring` (IA) — `app/api/ai/score/route.ts` → `lib/ai/scoring.ts → scoreLead()`

- Appelle `callAI({ agentId:"scoring", modelOverride:"claude-sonnet-4-6", temperature:0.3, maxTokens:1024 })`.
- **Output JSON** (prompt v5.0) : `{ score, categorie: "HOT|WARM|COLD|NO_GO", segment_icp: "A|B|C|D1|D2|HORS_ICP", detail:{fit_score,intent_score,intent_signal_base,intent_bonus,intent_bonus_stage,timing_score}, cas_limite, ajustement_ia, justification, confidence: "high|medium|low" }`.
- **Stockage** (`scoring.ts:80-98`) : `leads.score` (colonne) ; `leads.status` (via mapping) ; tout le reste dans `leads.enrichment_data.scoring_detail` (JSONB). **`segment_icp` n'a pas de colonne dédiée** — uniquement `enrichment_data.scoring_detail.segment_icp` (lu p.ex. par `generate-actions/route.ts:359`).
- **Mapping `categoryToStatus`** (dupliqué `scoring.ts:71` et `enrich/route.ts:710`) : `HOT→hot`, `WARM→warm`, `COLD→cold`, `NO_GO→cold`.

**Grille de scoring v5.0** (100 pts, `defaults.ts:968-1188`) : **Fit max 40** (4 critères C1-C4 × +10 : type structure, taille cohérente, titre décideur, signaux maturité) ; **Intent max 40** (base signal fort 20 / moyen 10 / faible 5 + bonus email/posts/ancienneté) ; **Timing max 20** ; **Bonus stage max 5**. **Catégorisation** : ≥70 HOT / ≥45 WARM / ≥25 COLD / <25 NO_GO. Intervention IA (±5) uniquement zones limites 65-75 et 20-30.

**Contexte fourni au scorer** (`lib/ai/lead-context.ts → buildScoringContext()/buildScoringUserPrompt()`) : mêmes sections que la génération (identité, entreprise size/industry/news, personne/posts, signal).

### 4.4 Règle fit / no-fit

- **Aucune purge destructive en code.** ⚠️ `NON TROUVÉ` : aucun `.delete()` ni filtre excluant `HORS_ICP` sur la table leads. Le commit « purge HORS_ICP » (fcd907f) renforce la **classification** (prompt v5.0 + `computeSegmentIcp`), il ne supprime aucun lead.
- **Effets réels d'un HORS_ICP / NO_GO** : `enrich/route.ts:756` — si `categorie === "NO_GO"` → **skip du dossier d'attaque** (`dossier = null`), mais l'email Icypeas continue. Pas de suppression/archivage automatique (l'« archiver » du prompt est une intention textuelle, non automatisée).

---

## 5. Étage ENRICHISSEMENT

Fichier pivot : `app/api/ai/enrich/route.ts → enrichSingleLead()`. Pipeline **séquentiel** par lead (batch = N `enrichSingleLead` en parallèle). Constante `SONNET_MODEL = "claude-sonnet-4-6"`.

| Étape | Source | Récupère | Polling/webhook | Timeout/robustesse |
|---|---|---|---|---|
| **Step 1** | **Unipile** `client.getUserProfile(identifier, accountId, {linkedinSections:"*"})` + `getUserPostsByIdentifier(provider_id, accountId, 10)` | headline, about, photo, location, connections/followers, premium/open/creator, network_distance, skills, languages, websites, contact_info, education, work_experience + 10 posts | Synchrone REST | `.catch()→null`, step entier en try/catch |
| **Step 1 (sub)** | **Claude `post_summary`** (Sonnet, temp 0, 150 tok) | filtre posts < 30j, résume chacun en `{sujet, tension, ton}`, concurrence 5 | Synchrone | fallback texte tronqué |
| **Step 1b** | **Gojiberry** via Unipile `client.getPost(activityId)` | si signal goji + `intent_post_url` : `intent_post_content` (≤500 car.), écrit en DB immédiatement | Synchrone | non-bloquant |
| **Step 2** | **Unipile** `client.linkedinCompany(companyId, accountId)` | size (employee_count_range), industry, website, headquarters, description, followers, employee_count | Synchrone | `.catch()→warning`. `confidence` high/low |
| **Step 3** | **Claude web_search** `callClaudeWebSearch` ×3 (`Promise.allSettled`) | A société (effectif, ca, code_naf, date_creation) ; B presse[] ; C signaux[]. Parsing 3 niveaux | Synchrone | échec indépendant par requête |
| **Step 3.5** | **Claude `scoring`** (Sonnet, temp 0.3) | score complet (voir §4.3) | Synchrone | fallback `assignBucket()` |
| **Step 4** | **Claude `dossier_attaque`** (Sonnet, temp 0.3, **3000 tok**) | brief structuré M1 (voir §13). Skip si NO_GO ou ni profil ni company | Synchrone | parse fail → `dossier=null` |
| **Step 5** | **Icypeas** `searchAndPoll()` | email finding (+ phones, gender, saas) ; domaine depuis `company.website` | **Polling** 5×3s = 15s max | non-bloquant |

⚠️ **Perplexity & OpenAI web_search** : `callPerplexity()` (`service.ts:376`) et `callOpenAIWebSearch()` (`service.ts:455`) existent mais sont **du code mort vis-à-vis de l'enrich** — le Step 3 utilise `callClaudeWebSearch` (`CLAUDE_WEB_SEARCH_MODEL = "claude-haiku-4-5-20251001"`, outil natif `web_search_20250305`, max_uses 3). ⚠️ Commentaire trompeur `enrich/route.ts:497` ("OpenAI web_search × 3") obsolète.

### Icypeas (`lib/icypeas/client.ts`, `lib/icypeas/types.ts`)

- **Flux A (single, polling)** — `searchAndPoll()` : `searchEmail()` POST `app.icypeas.com/api/email-search` → `pollResult(id, 5, 3000ms)`. Statuts en attente : `NONE, SCHEDULED, IN_PROGRESS`. Mappe vers `IcypeasEmailEnrichment {email, certainty, mxProvider, phones, saasServices, gender, linkedinUrl, …}`. Auth header `Authorization: ICYPEAS_API_KEY` (pas de Bearer).
- **Flux B (bulk, webhook)** — `app/api/icypeas/bulk-enrich/route.ts` (leads sans email) → `bulkSearch()` POST `/bulk-search` (max 5000), `webhookUrlItem = ${baseUrl}/api/webhooks/icypeas`. `app/api/webhooks/icypeas/route.ts` : signature **HMAC-SHA1** (`ICYPEAS_WEBHOOK_SECRET` — ⚠️ **skip si secret absent** : `return true` en dev), service_role, merge `email_enrichment` via `externalId=leadId`, backfill `email`/`phone` si certainty ∈ `{ultra_sure, very_sure, probable}`. Retourne toujours 200.
- `certainty` : `ultra_sure | very_sure | probable | not_found`.

### Forme du JSON stocké dans `leads.enrichment_data`

Assemblé dans `enrichSingleLead` puis mergé : `mergedData = {...currentLead.enrichment_data, ...enrichmentResult}` (`enrich/route.ts:849`). Clés top-level écrites :

| Clé | Source | Contenu |
|---|---|---|
| `company` | Step 2 | `{name, size, industry, website, headquarters, description, followers_count, employee_count, linkedin_url}` |
| `confidence` | Step 2 | `"high"\|"low"` |
| `web_research` | Step 3 | `{societe?, presse:[], signaux:[], searched_at}` |
| `signal` | Gojiberry | `{type, detail, source:"gojiberry", gojiberry_score, intent_keyword, intent_post_url, intent_post_content, …}` |
| `linkedin_profile` | Step 1 | profil complet Unipile |
| `person` | Step 1 | `{recentPosts: [{summary, sujet, tension, ton, reactions, comments, date}]}` |
| `linkedin_posts` | Step 1 | `[{social_id, text, share_url, timestamp, reactions_count, …}]` |
| `scoring_detail` | Step 3.5 | `{...detail, categorie, segment_icp, confidence, cas_limite, ajustement_ia, justification}` |
| `dossier` | Step 4 | objet dossier + `generated_at`, ou `null` |
| `email_enrichment` | Step 5 / webhook | `IcypeasEmailEnrichment` |
| `_import_batch` | import Gojiberry | métadonnée |

Champs DB séparés écrits par le même update : `score`, `status`, et backfill `first/last_name/title/company/email/phone/stage`. Purge legacy : `delete mergedData.hook_recommande` (remplacé par `dossier`). Clés legacy déclarées dans le type mais non écrites : `summary`, `company.funding/revenue/news`, `person.interests/experience` (sur-ensemble compat Perplexity).

### Gojiberry (`lib/gojiberry-parser.ts`, `lib/actions/import-gojiberry.ts`)

`parseGojiberryIntent(intentHtml, intentKeyword)` mappe vers `SignalType` :

| Détection | signalType |
|---|---|
| "Strategic Window: Just hired" | `NEW_ROLE` |
| "Top 5% most active" | `ICP_TOP_ACTIVE` |
| "Just engaged with" + `/in/` | `ENGAGEMENT_EXPERT` |
| "Just engaged with" + `/company/` | `COMPETITOR_ENGAGEMENT` |
| "Just engaged with" + autre | `ENGAGEMENT_KEYWORD` |
| fallback | `SIGNAL_FAIBLE` |

Tags `goji:*` : `buildSignalTag()` → `goji:keyword:<slug>`, `goji:expert`, `goji:new-role`, `goji:top-active`, `goji:competitor`, `goji:other`. Lead tagué `["gojiberry", signalTag]`. Score posé sans IA via `assignBucket()`. Exploité en aval : `enrich/route.ts:643` (`hasGojiberryTag`), Step 1b (fetch post), `lead-context.ts` (injection scoring + dossier).

---

## 6. Système RAG

⚠️ **Refonte majeure non documentée dans CLAUDE.md** : le système des **17 blocs Smart.AI a été remplacé par 5 blocs v2**. Le dossier `knowledge/` ne contient plus que 5 JSON.

### Blocs réels (`lib/rag/types.ts → RAG_BLOC_IDS`, `lib/rag/mapping.ts`)
`icp_segments`, `pain_points`, `messaging_angles`, `offre_produit`, `qualification` — **TOUS REMPLIS** (vérifiés, contenu substantiel). Localisation : `knowledge/<blocId>.json` (`context.ts → KNOWLEDGE_DIR = process.cwd()/knowledge`).

**`scripts/demo-rag/*.json`** ≠ blocs prod : ce sont des **overrides DB de démo** (secteur immobilier) poussés dans `user_rag_data` du seul user `demo-fiveforty@prospector.app` via `scripts/seed-demo-rag.ts`. Jamais lus en runtime hors ce user.

### Structure (`lib/rag/types.ts`)
- `RagBloc = { bloc_id, title, sections: RagSection[], metadata }`
- `RagSection = { section_id, tags[], heading, content: string[] }`

Sections par bloc (exemples vérifiés) : `icp_segments` (segment_a…segment_d2, signaux_intention, triple_pipeline) ; `pain_points` (pp_generiques_b2b, pp_esn_intercontrat, pp_esn_croyances, pp_commerciaux) ; `messaging_angles` (position_0…position_5, vocabulaire) ; `offre_produit` (vue_ensemble, composants, pricing, arc_framework) ; `qualification` (obj_prix/resultats/confiance/esn/conformite, questions_diagnostic, closing, suivi).

### Injection PAR agent — deux chemins (`lib/ai/prompts/service.ts → buildSystemPromptParts()`)

**A. Agent `prospection` → résolution fine par sections** (`mapping.ts → resolveRagSections()`) :
- `resolveM1()` → **ZÉRO RAG** (`empty()`). M1 = prompt + données lead du runtime uniquement.
- `resolveM2Relance()` → **ZÉRO RAG**.
- `resolveM2Reponse(segment, responseType)` → **seul cas injectant du RAG**, sections ciblées par type de réponse (`question_produit`, `objection_prix/confiance/resultats/esn`, `conformite`, `general`). Ex. `objection_prix` → `icp_segments[seg]` + `offre_produit[pricing]` + `qualification[obj_prix, closing]`.

**B. Autres agents → blocs entiers** (`mapping.ts → resolveAgentBlocs()`, `RAG_AGENT_MAPPING`) :
```
prospection_m1  : [icp_segments, pain_points, messaging_angles, offre_produit]
prospection_m2  : [icp_segments, pain_points, messaging_angles, offre_produit, qualification]
dossier_attaque : [icp_segments, offre_produit, pain_points, messaging_angles]
scoring         : [icp_segments, pain_points, qualification]
enrichissement  : [icp_segments]
conversational  : ['*']  // → les 5 blocs
```
⚠️ Pour l'agent `prospection` au runtime, les entrées `prospection_m1/m2` de `RAG_AGENT_MAPPING` **ne sont PAS utilisées** (court-circuitées par `resolveRagSections` → M1 zéro RAG). Elles ne servent qu'aux tests et à `test-variations/route.ts`.

### `lib/rag/context.ts → buildRagContext()`
- `loadBloc(blocId)` lit `knowledge/<blocId>.json`, **caché en mémoire** (`blocCache: Map`).
- **Overrides DB** : `loadUserOverrides()` lit `user_rag_data` (`data_type, content`). L'override **remplace entièrement** le bloc (`override ?? loadBloc(...)`). Les overrides DB ne sont **pas cachés** (effet immédiat).
- `clearRagCache()` invalide le cache fichiers (appelé après save/reset override).

### Overrides DB & UI
Table `user_rag_data (user_id, data_type, content JSONB, UNIQUE(user_id, data_type))`. `lib/actions/rag.ts` : `getRagBlocs()`, `getRagBlocContent()`, `getUserRagOverrides()`, `saveRagOverride()` (+ clearRagCache), `resetRagOverride()`. UI : `app/(dashboard)/settings/knowledge/`.

### Vide vs rempli
Tous les blocs `knowledge/` (prod) et `scripts/demo-rag/` (démo) sont **remplis**. **« Vide » par design** : M1 et M2-relance produisent un RAG vide volontairement ; seuls M2-réponse + agents non-prospection injectent réellement du RAG.

---

## 7. Schéma BDD (Supabase)

Source : `supabase/migrations/001→015` + `types/database.ts`. **18 tables**.

### Tables principales

| Table | Colonnes clés | Contraintes |
|---|---|---|
| **profiles** | id (FK auth.users), full_name, avatar_url | auto-créé par trigger `handle_new_user()` |
| **user_api_keys** | user_id (PK), claude/openai/perplexity_key_encrypted | 1-to-1, AES-256-GCM |
| **user_settings** | user_id (PK), settings JSONB | 1-to-1 |
| **user_prompts** | id, user_id, agent_id, content | UNIQUE(user_id, agent_id) |
| **user_rag_data** | id, user_id, data_type, content JSONB | UNIQUE(user_id, data_type) |
| **linkedin_accounts** | id, user_id, unipile_account_id, status='active', account_type, warmup_start_date | UNIQUE(user_id) |
| **leads** | id, user_id, first/last_name, title, company, siren, linkedin_url, email, phone, score, status='cold', stage='to_invite', tags[], notes, enrichment_data JSONB | CHECK status/stage, UNIQUE(linkedin_url) |
| **companies** (m015) | siren (PK), nom, naf, ville, effectif, domain, unite_legale JSONB | hub data.gouv |
| **lists / list_leads** | lists(id,user_id,name) ; list_leads PK(list_id,lead_id) | jonction CASCADE |
| **sequences** | id, user_id, name, persona, status='active', stats JSONB | |
| **sequence_steps** | id, sequence_id, step_type, delay_days, template, generation_mode='ai', condition, step_order | UNIQUE(sequence_id, step_order) |
| **sequence_leads** | id, sequence_id, lead_id, current_step=0, status='active', entered_at | CHECK status |
| **actions** | id, user_id, lead_id, sequence_id, step_id, action_type, status='pending', generated_message, final_message, scheduled_at, validated_at, sent_at, error_message, generation_reasoning, generation_data JSONB, retry_count=0 | CHECK status/type |
| **conversations** | id, user_id, lead_id, channel, unipile_chat_id, status='unread', attendee_name, attendee_profile_url | |
| **messages** | id, conversation_id, direction, content, attachments JSONB, timestamp | UNIQUE(conversation_id, timestamp) |
| **ai_usage** (m002) | id, user_id, agent_id, provider, model, input/output/cached_tokens, estimated_cost_usd, input_text, output_text, metadata | |

### Enums / statuts réels (citations exactes)

> Source d'autorité = CHECK constraints DB. ⚠️ plusieurs colonnes « enum » n'ont **aucun CHECK** (validation applicative seulement).

| Colonne | Valeurs réelles | Garde-fou DB |
|---|---|---|
| `leads.status` | `cold, warm, hot, converted, lost` | CHECK (m006) ✅ aligné `LEAD_STATUSES` |
| `leads.stage` | `to_invite, invited, connected, in_sequence, responded, meeting, closed, withdrawn` | CHECK (m014). ⚠️ `withdrawn` absent de `LEAD_STAGES` (constants.ts) |
| `actions.status` | `pending, validated, processing, sent, failed, cancelled` | CHECK (m006) ✅ |
| `actions.action_type` | `visit, invitation, message, inmail, whatsapp, email` | CHECK (m006) ✅ |
| `sequence_steps.step_type` | `visit, invitation, message, inmail, whatsapp, email` (`types/sequences.ts → StepType`) | ⚠️ **AUCUN CHECK** |
| `sequence_steps.condition` | `always, invitation_accepted, message_replied, message_read, profile_visited` (`StepConditionType`) | ⚠️ **AUCUN CHECK** ; le cron accepte aussi alias legacy `if_connected/if_responded/if_no_response` |
| `sequence_steps.generation_mode` | `ai, template` | CHECK (m004) ✅ |
| `sequence_leads.status` | `active, paused, completed, responded, exited` | CHECK (m006) ✅ |
| `conversations.status` | `unread` (observé) ; autres non contraints | ⚠️ AUCUN CHECK |
| `conversations.channel` | `linkedin` (écrit) | ⚠️ AUCUN CHECK |
| `messages.direction` | `outbound, inbound` (`is_sender ? outbound : inbound`) | ⚠️ AUCUN CHECK |

### Relations / FK
Tout `*.user_id → auth.users(id)` CASCADE (sauf `ai_usage` sans CASCADE explicite). `actions.lead_id/sequence_id/step_id → SET NULL` (l'historique survit). `messages.conversation_id`, `sequence_steps/leads.sequence_id`, `list_leads.*` → CASCADE. `conversations.lead_id → SET NULL`. ⚠️ `leads.siren ↔ companies.siren` **non câblé en FK** (colonne + index seulement).

### Migrations (résumé)

| # | Effet |
|---|---|
| 001 | 15 tables, trigger auto-profil, trigger updated_at, RLS + policies |
| 002 | table `ai_usage` + RLS |
| 003_unipile_indexes | index webhook (linkedin_accounts.unipile, conversations.unipile_chat) |
| 003_ai_logs ⚠️doublon | `ai_usage` + colonnes input_text/output_text |
| 004 | `generation_mode` sur sequence_steps + CHECK |
| 005 | UNIQUE(conversation_id, timestamp) messages (idempotence webhook) |
| 006 | CHECK status/stage leads, status/type actions, status seq_leads + UNIQUE(linkedin_url), UNIQUE(linkedin_accounts.user_id) |
| 007 | conversations.attendee_name/profile_url |
| 008_leads_name_nullable ⚠️doublon | first/last_name nullable |
| 008_purge_hook_recommande ⚠️doublon | retire `enrichment_data.hook_recommande` |
| 009 | UNIQUE(sequence_id, step_order) |
| 010 | actions.retry_count |
| 011 | linkedin_accounts.warmup_start_date |
| 012 | actions.generation_reasoning |
| 013 | actions.generation_data JSONB |
| 014 | CHECK leads.stage + `withdrawn` |
| 015 | table `companies` (hub) + leads.siren + linkedin_url nullable + RLS companies |

⚠️ Collisions de numérotation (`003_*` ×2, `008_*` ×2) — migrations indépendantes (pas de casse) mais convention fragile.

---

## 8. Séquences & file d'actions

### Types d'étapes & conditions
`StepType` (`types/sequences.ts`) : `visit, invitation, message, inmail, whatsapp, email`. ⚠️ `executeLinkedInAction()` ne gère que visit/invitation/message/inmail — whatsapp/email → `throw "Type d'action non supporté"` (échoueraient à l'envoi).
`StepConditionType` : `always, invitation_accepted, message_replied, message_read, profile_visited` (+ alias legacy `if_connected/if_responded/if_no_response` gérés par le cron).

### Quotas — VALEURS RÉELLES (`lib/constants.ts → DEFAULT_SETTINGS`)
⚠️ CLAUDE.md (15/10/30) **périmé**. Réel :

| Paramètre | Valeur |
|---|---|
| `daily_invitations_limit` | **18 / jour** |
| `daily_messages_limit` | **25 / jour** |
| `daily_visits_limit` | **25 / jour** |
| `interval_min_seconds` / `max` | **120s / 480s** |
| `active_days` | `mon-fri` |
| `start_hour` / `end_hour` | **9 / 19** (Europe/Paris) |

**`ANTI_DETECTION_DELAYS`** (`constants.ts:194`, base MIN=60s, ranges tirés aléatoirement par `getRequiredDelay()`) : message↔message / visit→message / invitation→message = **8-18 min** ; message→visit/invitation = 4-8 min ; visit/invitation entre eux = 4-8 min ; visit↔invitation = **1-3 min** ; défaut = 8-18 min. `inmail` normalisé en `message`.

### Cron `generate-actions` (`app/api/crons/generate-actions/route.ts`)
- **Schedule** : `0 4,5 * * 1-5` UTC (6-7h Paris, lun-ven). maxDuration 300s. Auth `Bearer CRON_SECRET`.
- Par user actif : `syncAcceptedInvitations()` → quotas du jour → pour chaque séquence active, charge steps + `sequence_leads` actifs.
- Tri prioritaire : leads dont le step suivant est message/inmail passent avant invitations/visites.
- Par lead : `isDelayReady()` (step 0 = `entered_at + delay_days` ; sinon `last sent + delay_days`) → `checkStepCondition()` du step précédent (`run`/`wait`/`skip`) → `actionAlreadyExists()` (idempotence) → quota.
- **Auto-enrichissement** (message/inmail) : si pas de clé `dossier` ET `enrichmentCount < 10` → `enrichSingleLead()` avec timeout **30s**.
- **Génération** : template (`interpolateTemplate`) ou `callAI({ agentId:"prospection", maxTokens:1200 })` (M1 vs M2 selon messages déjà envoyés). Humanisation via `humanizeMessage()`. Si M1 `canal === "none"` → action status `email_recommended`.
- Crée action status `pending` **sans `scheduled_at`** (calculé à la validation).

### Cron `send-actions` (`app/api/crons/send-actions/route.ts`)
- **Schedule** : `*/2 7-19 * * 1-5` UTC. maxDuration 60s.
- **Jitter** 0-30s avant traitement. **Lock atomique** : recovery des `processing` > 10 min → `validated` ; select `validated` + `scheduled_at <= now()` (limit 10) → update `processing` ; unlock final des non-envoyés.
- Anti-détection runtime : `getRequiredDelay(lastSentType, action_type)` → skip si trop tôt ; working hours vérifiés.
- Exécution `executeLinkedInAction()` → `sent` + `advanceSequenceStep()`.

### Scheduling engine (`lib/scheduling.ts`)
- `calculateSchedule()` : pattern **burst** (2-3 actions rapprochées puis gap long), plancher anti-détection, clamp working hours, débordement → jour actif suivant.
- `reorderForOptimalChaining()` : minimise transitions lentes (chaîne V↔I, cluster messages en fin).
- `isActiveDay()`, `isWithinWorkingHours()` (timezone-aware via `Intl.DateTimeFormat`), `getTodayQuotaCounts()` (compte `sent`+`validated` du jour par type).

### Warm-up (`lib/constants.ts → WARMUP_SCHEDULE`, migration 011)
`linkedin_accounts.warmup_start_date` NULL = quotas pleins. Sinon : J0-J2 → 5 inv/8 msg/10 vis ; J3-J5 → 10/15/18 ; **J6+ → quotas pleins** (18/25/25). ⚠️ Pas de palier intermédiaire J5→J6 (rampe abrupte).

### Auto-exit sur réponse
Double mécanisme : webhook `handleNewMessage()` (`sequence_leads → responded` + annulation actions pending/validated) ; cron condition `if_no_response` → `skip`.

---

## 9. Envoi & intégration LinkedIn

### Connexion d'un compte (`lib/actions/linkedin.ts`)
1. **Hosted Auth** : `connectLinkedIn(origin)` → `client.createHostedAuthLink()` (`POST /hosted/accounts/link-token`) → redirect Unipile → callback `app/api/linkedin/auth/callback/route.ts` → upsert `linkedin_accounts {unipile_account_id, status:'active', account_type:'linkedin'}`. ⚠️ Le callback réimplémente l'upsert au lieu d'appeler `saveLinkedInAccount()` (duplication).
2. **Alternative cookie `li_at`** : `connectLinkedInWithCookies()` → `client.connectWithCookies()` (`POST /accounts`).
3. **Fallback** : `syncLinkedInFromUnipile()` relie un compte Unipile existant. `getUnipileAccountIdForUser(userId)` (filtre `status='active'`) sert au send/sync.
⚠️ `UNIPILE_API_KEY` est **partagée** (1 compte Unipile pour 3 users) ; l'isolation se fait par `unipile_account_id` distinct.

### Flux d'envoi (`lib/unipile/execute.ts → executeLinkedInAction()`)
- **visit** : `client.getUserProfile()` (consultation = visite).
- **invitation** : warm-up `getUserProfile()`, détection déjà-connecté (`network_distance` 1er degré / stage connected+) → skip ; sinon `client.sendInvitation({account_id, provider_id, message})` (`POST /users/invite`, ≤300 car.). `to_invite → invited`.
- **message / inmail** : `parseFragments()` (humanisation `|||`). Conversation existante → `client.sendMessage(chatId, {text})` ; sinon `client.createChat({attendees_ids, text})` + upsert conversation. Fragments suivants avec `sleep(getFragmentDelay())` (12-25s). `connected → in_sequence`.
- `markActionFailed()`, `advanceSequenceStep()` (avance `current_step` ou `status:'completed'`).
- Appelé par le cron send ET `lib/actions/conversations.ts → sendDirectMessage()` (envoi manuel).

### Client Unipile (`lib/unipile/client.ts`)
Singleton `getUnipileClient()`, base `https://${UNIPILE_DSN}/api/v1`, header `X-API-KEY`. **Retry** : `NON_RETRYABLE_STATUSES = [400,401,403,404,409,422,429]` (throw immédiat) ; `MAX_RETRIES = 2` pour 5xx (backoff exponentiel + jitter). ~55 méthodes (CLAUDE.md annonce 48). `extractLinkedInIdentifier()` (regex `/in/`). ⚠️ 4 implémentations dupliquées de l'extraction de slug.

### Webhooks (`app/api/webhooks/unipile/route.ts`)
Service_role (bypass RLS). `findUserByAccountId()`. **Retourne toujours 200** (évite retries Unipile).
- **message.received** → `handleNewMessage()` : upsert conversation + insert message (idempotent via UNIQUE(conversation_id, timestamp)). Si inbound + lead stage ∈ {invited, connected, in_sequence} → `stage:'responded'`, `sequence_leads:'responded'`, **annule actions pending/validated**.
- **relation.created** → `handleNewRelation()` : match par slug (fallback URN via `getUserProfile`), si stage ∈ {to_invite, invited} → `connected` + `advancePastInvitationStep()`.
- **account.status_changed** → `handleAccountStatusChange()` : update `linkedin_accounts.status`.

### Réconciliation invitations (`lib/unipile/sync-relations.ts → syncAcceptedInvitations()`)
Filet de sécurité si webhook manqué. Leads stage `invited` (limit **20/user**), `getUserProfile()` → si 1er degré → `connected`. ⚠️ Contrairement au webhook, **n'avance pas** le step invitation (asymétrie). Cron dédié `app/api/crons/check-invitations/route.ts` (`0 8 * * 1-5`).

### Page Visitors (`app/(dashboard)/visitors/`, `lib/actions/visitors.ts`)
`getProfileVisitors()` via `client.linkedinRaw()` (Voyager `wvmpCards`), parse insights, `matchVisitorsWithLeads()`. ⚠️ Charge tous les leads sans filtre user_id (perf + cloison).

### Gestion erreurs cron send (`MAX_RETRIES=3`, `actions.retry_count`)
- **429** → revert `validated`, `retry_count++`, `break` (stoppe le user).
- **422** (cannot_resend) → fail permanent, `break`.
- **Transient** (5xx, ECONNRESET/ETIMEDOUT) → revert + retry si < 3, sinon fail permanent, `break`.
- **4xx client** → fail permanent, `continue`.

---

## 10. Multi-user & isolation des données

### RLS (`supabase/migrations/001_initial_schema.sql`)
- **Pool partagé** (lecture globale, écriture owner) : `leads` (`SELECT USING (true)`, INSERT/UPDATE/DELETE `user_id = auth.uid()`), `profiles` (annuaire), `companies` (SELECT all, écriture service_role only).
- **Owner-only (FOR ALL)** : `user_api_keys, user_settings, user_prompts, user_rag_data, linkedin_accounts, lists, sequences, actions, conversations` (`USING/WITH CHECK user_id = auth.uid()`).
- **Owner-only via parent (EXISTS)** : `list_leads` (via lists), `sequence_steps/sequence_leads` (via sequences), `messages` (via conversations — SELECT+INSERT only, immuables).
- **Bypass RLS** : crons/webhooks/import via `lib/supabase/service.ts` (service_role), pattern `supabaseOverride`.

### Provisioning d'un nouvel user + compte LinkedIn
1. `scripts/seed-users.ts` (`npm run seed`) crée 3 users via `auth.admin.createUser()` (`email_confirm:true`, `user_metadata.full_name`). Emails `khalil@/ludwig@/samy@prospector.app`, password commun (⚠️ à changer avant prod).
2. Trigger `on_auth_user_created → handle_new_user()` insère automatiquement `profiles`.
3. `user_api_keys/settings/prompts/rag_data` créés à la demande (upsert) ; défauts en code (`DEFAULT_SETTINGS`, `PROMPTS_DEFAULTS`, blocs `knowledge/`).
4. Compte LinkedIn : `/settings/api-keys` → `connectLinkedIn()` → Hosted Auth → callback upsert `linkedin_accounts` (UNIQUE(user_id) = 1 compte/user). Warm-up optionnel via `warmup_start_date`.

---

## 11. Config & services externes

### Variables d'environnement (NOMS uniquement — valeurs redactées)

| Variable | Fichier(s) clés |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/{client,server,service,middleware}.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/{client,server,middleware}.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/service.ts` |
| `ENCRYPTION_KEY` | `lib/crypto.ts` (AES-256-GCM) |
| `CRON_SECRET` | `app/api/crons/*`, `lib/actions/actions.ts` |
| `UNIPILE_API_KEY` | `lib/unipile/client.ts` |
| `UNIPILE_DSN` | `lib/unipile/client.ts` ⚠️ non documenté CLAUDE.md |
| `ANTHROPIC_API_KEY` | `lib/ai/service.ts` (fallback dev) |
| `ICYPEAS_API_KEY` | `lib/icypeas/client.ts` ⚠️ nouveau |
| `ICYPEAS_WEBHOOK_SECRET` | `app/api/webhooks/icypeas/route.ts` ⚠️ nouveau |
| `NEXT_PUBLIC_APP_URL` | `app/api/icypeas/bulk-enrich/route.ts` |
| `NEXT_PUBLIC_VERCEL_URL` | `app/api/icypeas/bulk-enrich/route.ts` |
| `DRY_RUN` | `scripts/khalil-cleanup-pipeline.ts` (script only) |

⚠️ Pas de `OPENAI_API_KEY` / `PERPLEXITY_API_KEY` en env — clés stockées **par user en DB chiffrées** (AES-256-GCM).

### Services tiers
**Supabase** (auth + DB + RLS), **Unipile** (LinkedIn, clé partagée), **Icypeas** (email finding, env), **data.gouv** (sourcing SIREN/NAF via `lib/datagouv/*`), **Gojiberry** (signaux importés), **Anthropic Claude** (IA principale), **Vercel** (hosting + crons).

### `vercel.json` — crons (exacts)
```
/api/crons/generate-actions   →  0 4,5 * * 1-5
/api/crons/send-actions       →  */2 7-19 * * 1-5
/api/crons/check-invitations  →  0 8 * * 1-5      ⚠️ nouveau vs CLAUDE.md
```

---

## 12. Frontend / surface UI

### Routes Dashboard (`app/(dashboard)/`) — toutes en split server/client sauf cockpit

dashboard (`/`), actions (+timeline-view), pipeline (+`[id]`), sequences (+`[id]`), lists, **visitors★** (visiteurs profil LinkedIn), **import-leads★** (sourcing data.gouv), inbox, **cockpit** (client only), logs, system, settings/{general, api-keys, prompts, team, usage, knowledge, diagnostic}.
★ = nouveau vs CLAUDE.md. Auth : `app/(auth)/login`, `signup`.

### Routes API (`app/api/`)
`ai/{generate, chat, suggest, score, enrich, test-variations★}`, `linkedin/{send, auth/callback}`, `crons/{generate-actions, send-actions, check-invitations★}`, `icypeas/bulk-enrich★`, `webhooks/{unipile, icypeas★}`, `auth/callback`. ⚠️ `test-variations` = route dev orpheline. Pas de route `app/api/datagouv/` (sourcing via server actions `lib/actions/import-datagouv.ts`).

### Cockpit (`app/(dashboard)/cockpit/page.tsx`)
Chat IA pur (client component unique) : bulles user/assistant, typing, 4 questions suggérées, POST `/api/ai/chat` (contexte pipeline temps réel injecté côté route via `buildPipelineContext()`), rendu markdown minimal, badge « Mode démo (fallback) » si clé absente. ⚠️ **Pas** de validation de messages ni de timeline dans le cockpit — celles-ci sont dans `/actions` (`actions-client.tsx`) + `actions/timeline-view.tsx`.

---

## 13. Couplage & modularité

| Module | Point(s) d'entrée | Isolabilité | Feature flags |
|---|---|---|---|
| **Scoring** | `lib/scoring-buckets.ts` (déterministe) + `lib/ai/scoring.ts → scoreLead()` (IA) | **Bien isolé** : `computeSegmentIcp`/`assignBucket` zéro dépendance API, utilisables seuls. Couplage au format `enrichment_data`. ⚠️ `categoryToStatus` dupliqué (scoring.ts + enrich) | Aucun |
| **RAG** | `lib/rag/{context,mapping,types}.ts` | **Isolé** côté chargement, mais **double régime d'injection** (resolveRagSections fin vs RAG_AGENT_MAPPING grossier) selon le point d'entrée → comportement variable | Aucun |
| **Signal mapping** | `lib/gojiberry-parser.ts`, `lib/rag/mapping.ts → mapGojiberrySignal()` | **Bien isolé** (fonctions pures HTML→SignalType) | Aucun |
| **Enrichissement** | `app/api/ai/enrich/route.ts → enrichSingleLead()` | **Fortement entrelacé** : orchestre Unipile + Claude (post_summary, web_search, scoring, dossier) + Icypeas en un seul flux séquentiel. Steps en try/catch (dégradation gracieuse) mais pas de découpage modulaire réutilisable | Aucun ; gating = logique métier (NO_GO, présence profil/company) |
| **Dossier d'attaque** | `enrich/route.ts` Step 4 + `lib/ai/lead-context.ts → buildDossierInput()/buildDossierSection()` ; prompt `DOSSIER_ATTAQUE_PROMPT` | **Module existant et actif.** Input = sections markdown (profil, posts, company, web_research, signal). Output JSON `{destinataire_profil_lecture, mecanisme, accroche_pivot, corps_message, question_ouverte, signal_declencheur, voix, formalite, canal_recommande, ton[], a_eviter[], preuves[], angle_qualite (SOLIDE/DÉGRADÉ/FAIBLE), …}`. Consommé par M1 (runtime context), pilote `contextDirective`. ⚠️ `scripts/test-dossier-attaque-pipeline.ts` désynchronisé (attend champs `profilage_psycho/plan_b` inexistants) | Aucun ; skip si NO_GO |

**Feature flags globaux** : ⚠️ **AUCUN système trouvé** (pas de `FEATURE_*`/`ENABLE_*`). Seuls gates : présence d'env (`CRON_SECRET` absent → crons autorisés en dev ; `ANTHROPIC_API_KEY` fallback), `DRY_RUN` (scripts), `generation_mode` (toggle de données par step en DB), `PROMPT_VARIATIONS` (via route dev `test-variations`).

---

## 14. Inventaire des incertitudes

1. **`⚠️ NON TROUVÉ` — purge HORS_ICP** : aucun code supprimant/archivant les leads `HORS_ICP`/`NO_GO`. Le commit « purge » est de la classification, pas du nettoyage. (Confirmé par recherche, mais l'intention métier « archiver » dans le prompt n'est pas automatisée.)
2. **Modèle des agents M1/M2** : dépend de `user_settings.ai_model` (par user). Le défaut exact (`DEFAULT_SETTINGS.ai_model` dans `lib/constants.ts`) n'a pas été lu intégralement ici — `⚠️ INCERTAIN` sur sa valeur précise.
3. **`conversations.status`** : seule la valeur `unread` est confirmée écrite ; les valeurs `read/replied/archived` sont plausibles mais **non contraintes ni toutes vérifiées**.
4. **`matchLeadBySenderId()`** (webhook) : fiabilité du `ilike %senderId%` sur `linkedin_url` douteuse (sender_id = URN/provider_id ≠ slug stocké après normalisation). Comportement réel à confirmer en prod.
5. **Asymétrie `syncAcceptedInvitations()`** : transitionne `invited→connected` sans avancer le step invitation — `⚠️ INCERTAIN` sur la façon dont `generate-actions` rattrape ces leads (non tracé en détail).
6. **En-têtes de version incohérents** : prompt scoring (commentaire « v4.2 » vs contenu « v5.0 »), `prompts/PROMPT_M2_FINAL.md` V4.0 vs code V5.0. La source de vérité est **toujours le code** (`defaults.ts`), pas les `.md`.
7. **`post_summary` / `enrichissement`** : agents appelés mais sans prompt par défaut effectif (inline / instructions ad hoc) — leur « prompt actif » n'est pas dans `PROMPTS_DEFAULTS`.
8. **Demo (`scripts/demo-rag/`, `seed-demo*.ts`)** : override RAG immobilier pour un user de démo — non actif pour les vrais users, mais présence à garder en tête.

---

*Document généré en lecture seule. Aucun autre fichier modifié. Aucun secret en clair. Sources : code réel du repo (commit `fcd907f`, branche `main`).*
