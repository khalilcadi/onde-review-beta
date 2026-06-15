# PROSPECTOR — Synthèse Architecture Prompts & RAG v1.1

> Document de référence pour l'intégration des 4 prompts agents.
> Version : 1.1 (corrections post-audit)
> Date : 10 février 2026

---

## 1. ARCHITECTURE D'INJECTION

Chaque appel IA suit le même schéma :

```
┌─────────────────────────────────────────────────────┐
│                   APPEL CLAUDE / GPT                 │
│                                                      │
│  system = PROMPT AGENT (fichier .md)                │
│         + BLOCS RAG (knowledge/*.json)              │
│         + CONTEXTE RUNTIME (données lead/pipeline)  │
│                                                      │
│  user   = Message utilisateur ou instruction         │
│                                                      │
│  → Réponse : texte brut / JSON / markdown           │
└─────────────────────────────────────────────────────┘
```

### Détail des 3 couches

| Couche | Source | Contenu | Responsable |
|--------|--------|---------|-------------|
| **Prompt agent** | `prompts/*.md` | Rôle, règles, format output, exemples, interdictions | Ce livrable |
| **Blocs RAG** | `knowledge/*.json` | Positionnement, ICP, offres, objections, messaging, etc. | Déjà en place |
| **Contexte runtime** | Code route API | Données du lead, pipeline stats, historique conversation | Khalil (routes API) |

Le prompt agent est **statique** (ne change pas entre les appels). Le RAG est **semi-statique** (mis à jour quand le knowledge base change). Le contexte runtime est **dynamique** (différent à chaque appel).

---

## 2. MAPPING RAG → AGENTS

| Agent | Blocs RAG injectés | Justification |
|-------|-------------------|---------------|
| **PROSPECTION** | `positionnement`, `offres`, `messaging`, `objections`, `use_cases` | Connaître JARVIS, les angles d'approche, les réponses aux objections |
| **SCORING** | `positionnement`, `icp`, `pain_points` | Connaître l'ICP et les familles de douleurs pour évaluer le fit |
| **ENRICHISSEMENT** | `positionnement`, `icp` | Savoir quoi chercher (contexte B2B, profil cible) |
| **CONVERSATIONAL** | **TOUS (14 blocs)** | Répondre à toute question sur JARVIS, le marché, les offres, etc. |

### Les 14 blocs RAG disponibles

| # | Bloc ID | Résumé |
|---|---------|--------|
| 1 | `positionnement` | Identité JARVIS, cerveau IA central, proposition de valeur |
| 2 | `icp` | Profil cible : solopreneur 5-10k€/mois, saturé, cherche structure |
| 3 | `offres` | JARVIS Start 79€/mois + 500€ setup |
| 4 | `use_cases` | 7 cas d'usage concrets solopreneurs |
| 5 | `objections` | 10 objections + réponses empathiques |
| 6 | `regles_decisionnelles` | Moteur de décision : variables, scoring pondéré |
| 7 | `pain_points` | 4 familles de douleurs + signaux |
| 8 | `benchmark_marche` | Réalités du marché solopreneur |
| 9 | `benchmark_concurrents` | 4 catégories concurrents, positionnement JARVIS |
| 10 | `pricing` | Justification par équivalence partenaire business |
| 11 | `messaging` | 5 angles déployés contextuellement |
| 12 | `operating_rules` | Règles d'exécution : sobriété, seuils, refus |
| 13 | `onboarding` | 4 phases progressives, 4 piliers RAG |
| 14 | `architecture_core` | Blocs 1-6 = pensée, Blocs 7-11+ = intelligence marché |

---

## 3. ROUTES API ET AGENTS

| Route | Agent | Déclencheur | Input user | Output |
|-------|-------|-------------|------------|--------|
| `POST /api/ai/generate` | PROSPECTION | Cron matin (batch) ou clic "Régénérer" | "Génère un message LinkedIn pour {lead}" | Texte brut (message) |
| `POST /api/ai/suggest` | PROSPECTION | Clic "Suggérer une réponse" dans Inbox | Historique conversation + "Suggère une réponse" | Texte brut (message) |
| `POST /api/ai/score` | SCORING | Phase 4 — scoring auto d'un lead | Données lead complètes | JSON `{ score, category, breakdown, malus, reasoning }` |
| `POST /api/ai/enrich` | ENRICHISSEMENT | Phase 4 — enrichissement via Perplexity | Nom, titre, entreprise, URL LinkedIn | JSON `{ company, person, confidence, sources, summary }` |
| `POST /api/ai/chat` | CONVERSATIONAL | Message dans le Cockpit IA | Message libre de l'utilisateur | Texte markdown |

---

## 4. MODÈLES ET PARAMÈTRES

| Agent | Modèle recommandé | Alternative | Température | Raison |
|-------|-------------------|-------------|-------------|--------|
| PROSPECTION | `claude-sonnet` | `gpt-4o` | 0.7 | Créativité pour les messages, variété des accroches |
| SCORING | `claude-haiku` | `gpt-4o-mini` | 0.3 | Déterministe, rapide, pas cher — le scoring doit être reproductible |
| ENRICHISSEMENT | `perplexity` | — | N/A | Seul modèle avec capacité de recherche web native |
| CONVERSATIONAL | `claude-sonnet` | `gpt-4o` | 0.7 | Qualité conversationnelle, raisonnement sur les données |

---

## 5. DONNÉES INJECTÉES AU RUNTIME PAR ROUTE

### Route `/api/ai/generate` et `/api/ai/suggest` (PROSPECTION)

```
DONNÉES LEAD :
├── firstName, lastName, title, company
├── score, status, stage, tags, notes
├── enrichmentData.company (si enrichi) : size, industry, funding, revenue, location, news[]
└── enrichmentData.person (si enrichi) : interests[], recentPosts[], experience[], education[], publicSpeaking[]

DONNÉES ACTION :
├── actionType : "invitation" | "message" | "inmail" | "email"
├── currentMessage (si régénération) → le message précédent à améliorer
├── sequenceStep (futur) : numéro étape séquence (1, 2, 3...)
└── sequenceTemplate (futur) : template étape ("Relance J+3", "Relance J+7 — cas client")

DONNÉES CONVERSATION (route suggest uniquement) :
├── messages[] : historique complet (direction + content)
└── lead : info basique
```

### Route `/api/ai/score` (SCORING)

```
DONNÉES LEAD :
├── firstName, lastName, title, company
├── score (existant — à ignorer par l'agent), status, stage, tags, notes
├── enrichmentData.company : size, industry, funding, revenue, news[]
├── enrichmentData.person : interests[], recentPosts[], experience[], education[], publicSpeaking[]
│
└── engagement (si disponible — certains champs arriveront en Phase 4+) :
    ├── hasAcceptedInvitation : boolean
    ├── responseCount : nombre de réponses
    ├── lastResponseDate : date dernière réponse
    ├── profileVisitsReceived : boolean (le lead a visité notre profil)
    └── contentEngagement : boolean (le lead a liké/commenté nos posts)
```

### Route `/api/ai/enrich` (ENRICHISSEMENT)

```
DONNÉES LEAD (entrée minimale) :
├── firstName, lastName
├── title
├── company
├── linkedinUrl
└── email (si connu)
```

### Route `/api/ai/chat` (CONVERSATIONAL)

```
DONNÉES PIPELINE :
├── leads_total, leads_hot, en_sequence
├── taux_reponse_semaine, taux_reponse_mois, rdv_planifies
├── quotas_aujourdhui : invitations (x/15), messages (x/50), visites (x/30)
├── top_leads_chauds[] : top 5 avec nom, score, contexte
├── funnel_pipeline : a_inviter → invité → connecté → en_sequence → a_repondu → rdv
├── sequences_actives[] : nom, leads actifs, taux réponse, conversion
└── equipe[] : nom, actions, taux réponse, RDV (par user)
```

---

## 6. COHÉRENCE INTER-AGENTS

Les 4 agents sont conçus pour fonctionner ensemble de façon cohérente. Voici les liens entre eux :

### Flux de données entre agents

```
ENRICHISSEMENT → produit enrichmentData (company + person + summary)
     ↓
SCORING → consomme enrichmentData pour scorer le lead
     ↓ 
PROSPECTION → consomme enrichmentData + score + stage pour personnaliser les messages
     ↓
CONVERSATIONAL → affiche les résultats, recommande des actions basées sur les scores et le pipeline
```

### Vocabulaire partagé (terminologie cohérente)

| Concept | Valeurs | Utilisé par |
|---------|---------|-------------|
| **Score** | 0-100 (entier) | Scoring (produit), Prospection (consomme), Conversational (affiche) |
| **Catégorie** | HOT (≥80) / WARM (60-79) / COLD (<60) | Scoring (produit), Prospection (adapte le ton), Conversational (priorise) |
| **Stage** | to_invite → invited → connected → in_sequence → responded → meeting → closed | Prospection (adapte l'action), Scoring (estime engagement), Conversational (affiche funnel) |
| **Status** | cold / warm / hot / converted / lost | Tous les agents |
| **Confidence** | high / medium / low | Enrichissement (produit) |
| **ActionType** | invitation / message / inmail / email | Prospection (adapte le format) |
| **Angles messaging** | normalisation, clarté, anti-burnout, ROI, partenaire business | Prospection (choisit l'angle), Conversational (recommande un angle) |

### Règles de cohérence croisée

1. **Scoring → Prospection** : Le score et la catégorie du lead déterminent le niveau d'agressivité commerciale du message. COLD = aucune mention de Smart.AI. WARM = proposition de valeur subtile. HOT = plus direct + social proof permis.

2. **Enrichissement → Prospection** : Le champ `summary` de l'enrichissement donne à la prospection un résumé orienté "prospection" du lead. Les `recentPosts` et `news` fournissent les accroches personnalisées.

3. **Enrichissement → Scoring** : Les données `company` (size, industry, revenue) alimentent les critères 2, 3 et 6 du scoring. Les `recentPosts` et `interests` alimentent le critère 4 (signaux de douleur).

4. **Conversational → Prospection** : Quand JARVIS recommande de contacter un lead, il donne un angle d'approche concret qui est cohérent avec les angles messaging du RAG — les mêmes angles que l'agent Prospection utilise.

---

## 7. CHOIX DE DESIGN APPLIQUÉS

| Paramètre | Choix | Détail |
|-----------|-------|--------|
| Ton prospection | Contextuel | Tutoiement pour solopreneurs/freelances, vouvoiement pour dirigeants PME |
| Style premier contact | Observation personnalisée | Référence au profil ou post du lead, pas de pitch |
| Adaptation score/stage | Oui (v1.1) | COLD=léger, WARM=subtil, HOT=direct |
| Types d'action couverts | 6 types (v1.1) | invitation, message, inmail, email, relance, réponse |
| Régénération | Changement d'angle forcé (v1.1) | Angle + structure + accroche différents du message précédent |
| Social proof | Conditionnel (v1.1) | Uniquement WARM en séquence, HOT, ou InMail |
| Format scoring | Détaillé par critère | 6 critères avec score + max + reason |
| Engagement scoring | Détaillé (v1.1) | 5 signaux futurs documentés avec points associés |
| Format enrichissement | JSON étendu (v1.1) | Champs standard + `publicSpeaking` + `summary` |
| Nom cockpit | JARVIS | Cohérent avec le produit |
| Ton cockpit | Tutoiement | Outil interne, entre collègues |
| Capacités cockpit | 3 catégories (v1.1) | Reporting, recommandations, questions business |
| Emojis cockpit | Parcimonie | 1-2 max par réponse si utile |

---

## 8. MODIFICATIONS TYPE TYPESCRIPT REQUISES

L'agent Enrichissement retourne 2 champs qui ne sont pas dans le type `LeadEnrichment` actuel :

```typescript
// À ajouter dans LeadEnrichment
interface LeadEnrichment {
  company: { ... };       // existant
  person: {
    interests: string[];        // existant
    recentPosts: string[];      // existant
    experience: Experience[];    // existant
    education: Education[];      // existant
    publicSpeaking: string[];   // ⭐ NOUVEAU — prises de parole (conférences, podcasts, articles)
  };
  confidence: "high" | "medium" | "low";  // existant mais pas typé
  sources: string[];                       // existant mais pas typé
  summary: string;                         // ⭐ NOUVEAU — résumé 2 phrases pour prospection
}
```

L'agent Scoring utilise des données d'engagement futures qui nécessitent un type :

```typescript
// À ajouter dans Lead (Phase 4+)
interface LeadEngagement {
  hasAcceptedInvitation: boolean;
  responseCount: number;
  lastResponseDate: string | null;
  profileVisitsReceived: boolean;
  contentEngagement: boolean;    // likes/comments sur nos posts
}
```

---

## 9. FICHIERS LIVRÉS

```
prompts-v1.1/
├── 01_PROSPECTION.md      → System prompt agent Prospection v1.1
├── 02_SCORING.md           → System prompt agent Scoring v1.1
├── 03_ENRICHISSEMENT.md    → System prompt agent Enrichissement v1.1
├── 04_CONVERSATIONAL.md    → System prompt agent Conversational (JARVIS) v1.1
└── 00_SYNTHESE.md          → Ce document (architecture + mapping + cohérence)
```

### Intégration

Chaque fichier `.md` contient un prompt système complet, prêt à être utilisé tel quel :

```typescript
// Exemple d'intégration (pseudo-code)
const PROMPTS = {
  prospection: readFile('prompts/01_PROSPECTION.md'),
  scoring: readFile('prompts/02_SCORING.md'),
  enrichissement: readFile('prompts/03_ENRICHISSEMENT.md'),
  conversational: readFile('prompts/04_CONVERSATIONAL.md'),
};

// Appel Claude
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  system: PROMPTS.prospection + ragContext + runtimeContext,
  messages: [{ role: "user", content: userMessage }],
  temperature: 0.7,
});
```

---

## 10. CHANGELOG V1.0 → V1.1

| Agent | Modification | Raison |
|-------|-------------|--------|
| **PROSPECTION** | Ajout types `inmail` et `email` avec contraintes spécifiques | Couverture complète des actionTypes du Workbench |
| **PROSPECTION** | Ajout section "Régénération" (`currentMessage`) | Cas d'usage "Régénérer" non traité en v1.0 |
| **PROSPECTION** | Ajout adaptation score/stage (COLD/WARM/HOT) | Levier de personnalisation manquant |
| **PROSPECTION** | Ajout règles social proof conditionnelles | Non structuré en v1.0 |
| **PROSPECTION** | Ajout règles de variété forcée entre messages | Risque de messages similaires en batch |
| **PROSPECTION** | +3 exemples (inmail, email, régénération) | Couverture des nouveaux types |
| **SCORING** | Détail des 5 signaux d'engagement futurs avec points | Anticipation Phase 4 |
| **SCORING** | Ajout malus "lead a refusé/ignoré relances" | Cas manquant |
| **SCORING** | Ajout règle 7 (fallback stage si pas d'engagement data) | Robustesse |
| **SCORING** | Ajout exemple WARM (engagement faible) | Manquait un exemple intermédiaire |
| **ENRICHISSEMENT** | Note explicite sur les champs `publicSpeaking` et `summary` | Alignement avec Khalil sur le type TS à modifier |
| **ENRICHISSEMENT** | Ajout exemple 3 (confidence low, données minimales) | Cas d'échec non illustré |
| **ENRICHISSEMENT** | Ajout interdiction confidence high mono-source | Garde-fou |
| **CONVERSATIONAL** | Ajout section "Capacités" structurée (3 catégories) | Couverture des cas du Workbench |
| **CONVERSATIONAL** | +4 exemples (comparaison équipe, funnel, pacing, séquence) | Cas d'usage du Workbench non couverts |
| **CONVERSATIONAL** | Ajout règles constructivité équipe et angle d'approche | Garde-fous relationnels |
| **SYNTHÈSE** | Ajout section 6 "Cohérence inter-agents" | Vérification croisée |
| **SYNTHÈSE** | Ajout section 8 "Modifications TypeScript requises" | Alignement Khalil |
| **SYNTHÈSE** | Ajout section 10 "Changelog" | Traçabilité |

---

## 11. DIFFÉRENCES CLÉS VS V3.2

| Aspect | V3.2 (JARVIS multi-agents) | PROSPECTOR (ce livrable) |
|--------|---------------------------|--------------------------|
| Cible | PME 20-100 employés | Solopreneurs 5-10k€/mois |
| Offre | THINK/BUILD/SCALE | JARVIS Start 79€/mois |
| Architecture | Orchestrateur + Decisional + Validators | Route API directe → Claude → Réponse |
| Prompts | Specs techniques avec TypeScript/Redis | Instructions LLM pures (400-800 mots) |
| Output | JSON complexe avec metadata | Texte brut / JSON simple / Markdown |
| Agents | 7 agents orchestrés | 4 agents indépendants |
| Mémoire | Redis avec recyclage outputs | Historique conversation natif (multi-turn) |
| Validation | 3 niveaux (self + request + output) | Aucune validation inter-agents |
| Enrichissement | Apollo + Hunter + Clearbit | Perplexity uniquement |
| Types d'action | message + email | invitation + message + inmail + email + relance + réponse |

---

*Document PROSPECTOR — Synthèse Architecture v1.1*
*Smart.AI — 10 février 2026*
