# Knowledge Base (RAG) — PROSPECTOR

> Base de connaissances Smart.AI injectee dans les prompts IA via le service RAG.

---

## Structure

Chaque fichier JSON dans ce dossier correspond a un **bloc RAG** thematique.
Ces blocs sont injectes dans le contexte des agents IA selon un **mapping par agent** defini dans `lib/rag/mapping.ts`.

## Blocs disponibles (17)

| Fichier | Bloc ID | Contenu |
|---------|---------|---------|
| `positionnement.json` | positionnement | Vision Smart.AI, infrastructure revenue, framework A.R.C., positionnement |
| `icp.json` | icp | 3 segments ICP (Early/Growth/Scale), qualification, croyances erronees |
| `offres.json` | offres | Smart.AI Setup (6000 EUR) + Platform (200-1000 EUR/mois), Jarvis |
| `use_cases.json` | use_cases | 4 use cases agences (structurer acquisition, pipeline previsible, reduire dependance, piloter) |
| `objections.json` | objections | 6 objections frequentes + reponses (DIY, CRM, leads, timing, nouveaute, budget) |
| `regles_decisionnelles.json` | regles_decisionnelles | Qualification ICP 3 segments, niveaux maturite, handoff, cas limites |
| `pain_points.json` | pain_points | 5 pain points agences (irregularite, dependance fondateur, pipeline, pilotage, reseau) |
| `benchmark_marche.json` | benchmark_marche | Analyse PESTEL marche agences B2B France 2025 |
| `benchmark_concurrents.json` | benchmark_concurrents | Limova, Dust, agences SDR + analyse ERAC Smart.AI |
| `pricing.json` | pricing | Setup 6000 EUR + Platform 200-1000 EUR/mois, logique de valeur, objections prix |
| `messaging.json` | messaging | 4 niveaux de pitch, 5 angles commerciaux, ton/style, vocabulaire |
| `operating_rules.json` | operating_rules | 11 regles comportement agents (qualification, pitch, handoff, cas limites) |
| `onboarding.json` | onboarding | 5 etapes A.R.C. (Audit, Architecture, Implementation, Activation, Control Tower) |
| `architecture_core.json` | architecture_core | Jarvis + 4 agents (Prospector, Enrichment, Scoring, Outreach), flux, plateforme |
| `framework_arc.json` | framework_arc | Framework A.R.C. detaille (Audit Revenue, Revenue Engine, Control Tower) |
| `manifesto.json` | manifesto | Territoire intellectuel, 5 positions de rupture, accroches LinkedIn, mission/vision |
| `profil_fondateur.json` | profil_fondateur | Ludwig Graham — parcours, credibilite, angles de message, ton |

## Mapping par agent

Defini dans `lib/rag/mapping.ts` :

| Agent | Blocs injectes |
|-------|----------------|
| **prospection** (Message Writer) | positionnement, icp, offres, messaging, objections, use_cases, pain_points, framework_arc, manifesto, profil_fondateur (10) |
| **scoring** (Lead Scorer) | positionnement, icp, pain_points, regles_decisionnelles (4) |
| **enrichissement** | positionnement, icp (2) |
| **conversational** (Cockpit) | **TOUS les 17 blocs** |

> Le mapping est editable en code (`lib/rag/mapping.ts`). Les overrides user sont editables dans Settings > Knowledge.

## Comment editer un bloc

1. Ouvrir le fichier `.json` correspondant dans ce dossier
2. Modifier les `sections[].content` (tableaux de strings)
3. Les modifications sont prises en compte au prochain appel de `buildRagContext()` (le cache se vide au redemarrage)
4. Pour forcer le rechargement sans redemarrer : appeler `clearRagCache()` depuis `lib/rag/context.ts`

## Format JSON

Chaque bloc suit cette structure :

```json
{
  "source_file": "XX-nom-fichier.md",
  "bloc_id": "bloc_X",
  "title": "Titre du bloc",
  "sections": [
    {
      "heading": "Titre de la section",
      "content": ["Paragraphe 1", "Paragraphe 2"]
    }
  ],
  "metadata": {
    "converted_at": "2026-03-12T00:00:00Z",
    "total_sections": 17,
    "total_paragraphs": 106
  }
}
```

## Overrides DB

Les utilisateurs peuvent editer les blocs via l'interface Settings > Knowledge.
Les overrides sont stockes dans `user_rag_data` (Supabase) et prennent le dessus sur les blocs par defaut.
