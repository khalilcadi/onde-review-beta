# 03 — Anatomie d'un appel API

> Ce qui est exactement envoyé à l'IA lors d'un appel, pour chacun des deux agents.

---

## Agent Prospection — Composition complète

### Ce qui est envoyé à Claude / OpenAI

```
┌─────────────────────────────────────────────────────────────────────┐
│  SYSTEM PROMPT (2 blocs pour Claude, 1 string pour OpenAI)          │
│                                                                       │
│  ══════════════════ BLOC 1 : CACHÉ (Claude) ══════════════════════  │
│                                                                       │
│  [Prompt agent prospection]                                           │
│  ~650 lignes de texte                                                 │
│  → Rôle, règles générales, règles par type de message                │
│  → Règles par score (COLD/WARM/HOT)                                  │
│  → Règles de régénération                                             │
│  → Interdictions, exemples d'output                                  │
│  Source : lib/ai/prompts/defaults.ts (ou override DB user_prompts)   │
│                                                                       │
│  [Blocs RAG — 7 blocs knowledge/*.json]                              │
│  ---                                                                  │
│  ## BASE DE CONNAISSANCES (RAG)                                       │
│  ### Positionnement JARVIS [~200 tokens]                             │
│  ### ICP — Profil client idéal [~300 tokens]                         │
│  ### Offres JARVIS [~150 tokens]                                      │
│  ### Messaging — 5 angles [~200 tokens]                              │
│  ### Objections et réponses [~250 tokens]                             │
│  ### Use cases [~150 tokens]                                          │
│  ### Pain points [~200 tokens]                                        │
│  ---                                                                  │
│  Fin de la base de connaissances.                                    │
│  Source : lib/rag/context.ts + knowledge/*.json                       │
│  ════════════════ Total Bloc 1 : ~2200 tokens ═══════════════════════ │
│                                                                       │
│  ══════════════════ BLOC 2 : NON CACHÉ ══════════════════════════╗  │
│  (runtimeContext — change à chaque lead)                          ║  │
│                                                                   ║  │
│  ## Lead                                                          ║  │
│  Nom : Sophie Martin                                              ║  │
│  Titre : Fondatrice                                               ║  │
│  Entreprise : Studio SM                                           ║  │
│  Score : 72 | Statut : warm | Stage : connected                   ║  │
│  Tags : designer, freelance, solo                                 ║  │
│  Notes : A répondu positivement à un premier contact              ║  │
│                                                                   ║  │
│  ## Entreprise                     ← si enrichment_data présent  ║  │
│  Taille : 1-5 personnes (micro-entreprise)                        ║  │
│  Secteur : Design graphique / Identité visuelle                   ║  │
│  CA estimé : 60-80k€/an                                           ║  │
│  News récentes : "A lancé une formation en ligne Q4 2025"         ║  │
│                                                                   ║  │
│  ## Personne                       ← si enrichment_data présent  ║  │
│  Intérêts : Branding, indépendance, productivité créative         ║  │
│  Posts récents : "Post sur l'automatisation des devis clients"    ║  │
│                                                                   ║  │
│  ## Action                                                        ║  │
│  Type : message                                                   ║  │
│  Source : lib/ai/lead-context.ts → buildLeadContext()             ║  │
│  ════════════════ Total Bloc 2 : ~200 tokens ══════════════════════╝  │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  USER MESSAGE                                                         │
│                                                                       │
│  Cas 1 — Génération initiale :                                       │
│  "Génère un message LinkedIn pour Sophie Martin (Fondatrice          │
│  @ Studio SM).                                                        │
│                                                                       │
│  Retourne UNIQUEMENT le message, sans explication."                   │
│                                                                       │
│  Cas 2 — Régénération (bouton "Régénérer" Daily Actions) :           │
│  "Régénère ce message LinkedIn pour Sophie Martin (Fondatrice        │
│  @ Studio SM).                                                        │
│  Message actuel : [message existant]                                  │
│                                                                       │
│  Génère une NOUVELLE version différente du message précédent         │
│  (angle, structure et accroche différents)."                          │
│                                                                       │
│  Source : lib/ai/lead-context.ts → buildUserPrompt()                 │
└─────────────────────────────────────────────────────────────────────┘

Paramètres :
  maxTokens   : 512
  temperature : settings user (défaut 0.7)
  model       : settings user (défaut claude-sonnet-4-6)
```

### Output attendu

Texte brut uniquement — le message LinkedIn complet, rien d'autre.

```
Sophie, j'ai vu ton post sur l'automatisation des devis — tu mets le doigt sur quelque chose que beaucoup de freelances vivent sans vraiment l'adresser.

Je développe JARVIS, un copilote IA pour les indépendants qui veulent scaler sans recruter. Ça t'intéresse d'en discuter 15 min ?
```

Ensuite : `humanizeMessage()` peut splitter ce texte en 2-3 fragments (anti-détection LinkedIn).

---

## Agent Enrichissement — Composition complète

### Ce qui est envoyé à Perplexity (sonar-pro)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SYSTEM PROMPT (1 string, pas de caching)                            │
│                                                                       │
│  [Prompt agent enrichissement]                                        │
│  ~100 lignes                                                          │
│  → Rôle (chercheur web)                                              │
│  → Ce que chercher (entreprise + personne)                           │
│  → Règles (null si pas trouvé, désambiguïsation)                    │
│  → Sources autorisées (societe.com, pappers.fr, LinkedIn, etc.)      │
│  → Format output JSON strict                                          │
│                                                                       │
│  [Blocs RAG — 2 blocs seulement]                                     │
│  ### Positionnement JARVIS [~200 tokens]                             │
│  ### ICP — Profil client idéal [~300 tokens]                         │
│                                                                       │
│  ════════ Total system : ~800 tokens ════════                         │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  RUNTIME CONTEXT (injecté dans system ou passé séparément)          │
│                                                                       │
│  ## Lead à enrichir                                                   │
│  Nom : Thomas Dubois                                                  │
│  Titre : Consultant indépendant                                       │
│  Entreprise : TDC Conseil                                             │
│  LinkedIn : https://linkedin.com/in/thomasdubois                     │
│  Email : thomas@tdcconseil.fr  ← si disponible                       │
│                                                                       │
│  Source : lib/ai/lead-context.ts → buildEnrichmentContext()          │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  USER MESSAGE                                                         │
│                                                                       │
│  "Qui est Thomas Dubois, Consultant indépendant chez TDC Conseil ?  │
│  Son profil LinkedIn : https://linkedin.com/in/thomasdubois          │
│                                                                       │
│  Trouve toutes les informations disponibles publiquement :            │
│  - Sur son entreprise TDC Conseil : taille, secteur d'activité,      │
│    chiffre d'affaires estimé, financement, localisation,             │
│    actualités récentes                                                │
│  - Sur lui : parcours professionnel, formation, centres d'intérêt,  │
│    posts récents LinkedIn, prises de parole publiques                │
│                                                                       │
│  Retourne le résultat au format JSON d'enrichissement défini         │
│  dans tes instructions."                                              │
│                                                                       │
│  Source : lib/ai/lead-context.ts → buildEnrichmentUserPrompt()       │
└─────────────────────────────────────────────────────────────────────┘

Paramètres :
  maxTokens   : 2048
  temperature : 0.3 (déterministe — fixe, pas de config user)
  model       : sonar-pro (toujours Perplexity, pas de config user)
```

### Output attendu

JSON strict uniquement :

```json
{
  "company": {
    "size": "1-5 personnes",
    "industry": "Conseil en stratégie / transformation digitale",
    "funding": null,
    "revenue": "150-300k€/an",
    "location": "Paris, France",
    "news": [
      "A publié un livre blanc sur la transformation IA des PME (Jan 2026)"
    ]
  },
  "person": {
    "interests": ["IA générative", "transformation digitale", "consulting"],
    "recentPosts": [
      "Post sur les erreurs à éviter lors d'un projet IA en entreprise (Feb 2026)"
    ],
    "experience": [
      "Fondateur TDC Conseil (2021-présent)",
      "Directeur transformation digitale chez Capgemini (2015-2021)"
    ],
    "education": ["HEC Paris (2013)", "Master Informatique Paris VI (2011)"],
    "publicSpeaking": ["Conférence LeWeb 2025 — IA et consulting"]
  },
  "confidence": "medium",
  "sources": [
    "https://linkedin.com/in/thomasdubois",
    "https://pappers.fr/entreprise/tdc-conseil"
  ],
  "summary": "Thomas Dubois est un consultant indépendant en transformation IA, ex-Capgemini. Bon signal JARVIS : parle d'IA mais pas encore équipé pour automatiser sa propre prospection."
}
```

---

## Comparaison côte à côte

| | Prospection | Enrichissement |
|---|-------------|----------------|
| **Provider** | Claude / OpenAI (config user) | Perplexity sonar-pro (toujours) |
| **System prompt** | ~2400 tokens (prompt + 7 blocs RAG) | ~800 tokens (prompt + 2 blocs RAG) |
| **Runtime context** | Données lead + enrichissement | Identification minimale du lead |
| **User message** | "Génère / Régénère un message pour X" | "Qui est X ? Trouve ses données..." |
| **maxTokens** | 512 | 2048 |
| **Temperature** | Config user (0.7 par défaut) | 0.3 fixe |
| **Caching** | Oui (Bloc 1 caché) | Non (Perplexity ne cache pas) |
| **Output** | Texte brut (message LinkedIn) | JSON strict |
| **Post-processing** | `humanizeMessage()` (split anti-détection) | Parse JSON + save to DB |
| **Triggered by** | Cron 6h + Daily Actions + batch | Fiche lead + batch pipeline |

---

## Contexte lead : ce que `buildLeadContext()` produit

Tous les champs disponibles dans le runtime context (selon les données présentes) :

```
## Lead
Nom : {firstName} {lastName}
Titre : {title}
Entreprise : {company}
LinkedIn : {linkedinUrl}
Score : {score} ({status})
Stage : {stage}
Tags : {tags.join(", ")}
Notes : {notes}

## Entreprise           ← si enrichment_data.company présent
Taille : {company.size}
Secteur : {company.industry}
CA estimé : {company.revenue}
Financement : {company.funding}
Localisation : {company.location}
News récentes :
- {news[0]}
- {news[1]}

## Personne            ← si enrichment_data.person présent
Intérêts : {person.interests.join(", ")}
Posts récents :
- {person.recentPosts[0]}
- {person.recentPosts[1]}

## Action
Type : {actionType}

[Message précédent (à régénérer avec un nouvel angle) :]   ← si régénération
{currentMessage}
```

Les sections `## Entreprise` et `## Personne` ne sont incluses que si les données d'enrichissement existent dans `lead.enrichment_data`. **C'est pourquoi enrichir un lead avant de générer ses messages améliore la qualité.**
