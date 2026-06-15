# 05 — Agent Enrichissement

> Deep dive sur l'agent qui enrichit les données des leads via la recherche web (Perplexity). Rôle, règles, output JSON, cycle de vie des données.

Prompt source : [`lib/ai/prompts/defaults.ts`](../../lib/ai/prompts/defaults.ts) → clé `enrichissement`

---

## Rôle

Effectuer une recherche web sur un lead pour structurer ses données publiques dans un JSON normalisé. Ces données nourrissent ensuite l'agent prospection pour des messages plus personnalisés.

**L'enrichissement est le pont entre "qui est ce lead" (LinkedIn URL) et "que sait-on vraiment de lui" (contexte utilisable pour prospecter).**

---

## Provider : toujours Perplexity

Contrairement aux autres agents, l'enrichissement **bypass la configuration provider de l'utilisateur**. Il appelle toujours `callPerplexity()` avec le modèle `sonar-pro`.

Pourquoi : Perplexity est un moteur de recherche IA avec accès au web en temps réel. C'est le seul provider qui peut effectivement aller chercher des informations récentes sur une entreprise ou une personne.

---

## Ce qui est recherché

### Côté entreprise
- Taille (nombre d'employés)
- Secteur / industrie
- Chiffre d'affaires estimé
- Financement / levées de fonds
- Localisation
- Actualités récentes (6-12 derniers mois)

### Côté personne
- Parcours professionnel (postes, durées)
- Formation
- Centres d'intérêt professionnels
- Posts LinkedIn récents (résumés 1 ligne)
- Prises de parole publiques (conférences, podcasts, livres...)

---

## Règles importantes du prompt

### Fiabilité
- Si une information n'est pas trouvée → `null` (ne jamais inventer)
- Sources autorisées : societe.com, pappers.fr, LinkedIn, CrunchBase, site officiel, presse
- Niveau de confiance : `high` (multi-sources concordantes), `medium` (partiel), `low` (peu de données / ambigu)

### Désambiguïsation
- Si plusieurs personnes portent le même nom → croiser avec titre + entreprise pour identifier
- Si aucune certitude possible → retourner `null` plutôt que le mauvais profil

### Format posts
- Posts récents = résumé en 1 ligne uniquement (pas de contenu complet)

---

## Output JSON strict

```typescript
{
  company: {
    size: string | null,       // ex: "1-5 personnes", "50-200 personnes"
    industry: string | null,   // ex: "Conseil en stratégie digitale"
    funding: string | null,    // ex: "500k€ (seed 2023)", null si bootstrapped
    revenue: string | null,    // ex: "150-300k€/an" (estimé)
    location: string | null,   // ex: "Paris, France"
    news: string[]             // actualités récentes (peut être vide [])
  },
  person: {
    interests: string[],        // ex: ["IA générative", "prospection"]
    recentPosts: string[],      // résumés 1-ligne des posts récents
    experience: string[],       // ex: ["Fondateur XY (2021-présent)", "DG chez Z (2018-2021)"]
    education: string[],        // ex: ["HEC Paris (2013)"]
    publicSpeaking: string[]    // conférences, podcasts, livres
  },
  confidence: "high" | "medium" | "low",
  sources: string[],            // URLs des sources utilisées
  summary: string               // 2 lignes max, ce qui compte pour JARVIS
}
```

---

## Blocs RAG injectés (2 blocs seulement)

| Bloc | Pourquoi seulement ces 2 ? |
|------|---------------------------|
| `positionnement` | Donne le contexte de ce qu'on cherche à vendre — oriente la recherche |
| `icp` | Définit le profil idéal — permet de calibrer la pertinence des données trouvées |

Les autres blocs (messaging, objections, use_cases...) ne sont pas nécessaires pour une **recherche factuelle**. Moins de contexte = moins de tokens = moins de coût + focus maximal sur la tâche.

---

## Cycle de vie des données enrichies

```
[Lead créé]
      │
      ▼
leads.enrichment_data = null
      │
      │  [User déclenche enrichissement — fiche lead ou batch]
      ▼
POST /api/ai/enrich
      │
      ▼
callPerplexity("enrichissement", ...)
      │
      ▼
JSON parsé
      │
      ▼
leads.enrichment_data = { company, person, confidence, sources, summary }
      │
      ▼
[Agent prospection lit enrichment_data dans buildLeadContext()]
      │
      ▼
## Entreprise + ## Personne injectés dans le runtime context
      │
      ▼
Message LinkedIn plus personnalisé
```

---

## Paramètres d'appel API

| Paramètre | Valeur |
|-----------|--------|
| Agent ID | `enrichissement` |
| Max tokens | 2048 (besoin de plus de tokens pour le JSON complet) |
| Temperature | **0.3 fixe** (déterministe — on veut des faits, pas de créativité) |
| Model | sonar-pro (Perplexity, toujours) |
| Caching | Non (Perplexity ne supporte pas le caching) |

---

## Gestion des erreurs

Route `/api/ai/enrich` :
- **Mode batch** : si un lead échoue, les autres continuent. Résultat par lead : `{ leadId, success, data?, error? }`
- **Parse JSON** : le modèle peut retourner du JSON enveloppé dans des balises markdown (\`\`\`json ... \`\`\`) → strippé avant parsing
- **Si parse échoue** : erreur remontée, `enrichment_data` non mis à jour

---

## Questions ouvertes pour le brainstorm

- **Pertinence des données** : quels champs du JSON ont vraiment un impact sur les messages générés ?
- **Qualité des résumés** : le champ `summary` est-il bien utilisé ? (actuellement injecté dans le contexte mais pas mis en avant)
- **Sources fiables** : pappers.fr / societe.com donnent des infos sur les sociétés françaises — mais pour les indépendants sans SIRET visible, que se passe-t-il ?
- **Taux de succès réel** : pour les leads peu connus en ligne, quel % d'enrichissements revient avec `confidence: low` ou données nulles ?
- **Enrichissement automatique** : devrait-on enrichir automatiquement à l'import CSV ou à l'entrée en séquence, plutôt qu'en manuel ?
- **Données sensibles** : le stockage de posts et données personnelles en DB soulève-t-il des questions RGPD ?
- **Actualisation** : les données enrichies vieillissent — devrait-on prévoir un re-enrichissement automatique après X jours ?
