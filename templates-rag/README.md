# Templates RAG - Prospector

## Objectif

Ces templates servent a remplir la base de connaissances (RAG) de Prospector.
Chaque fichier correspond a un "bloc" de connaissance que l'IA utilise pour personnaliser les messages de prospection LinkedIn.

**Workflow recommande** :
1. Ouvre un template dans Claude.ai
2. Remplis les sections ensemble (Claude pose des questions, tu reponds)
3. Une fois le bloc finalise, convertis en JSON et place-le dans `knowledge/`

---

## Ordre de remplissage recommande

Commence par les fondations, puis descends :

| Priorite | Bloc | Fichier | Pourquoi en premier |
|----------|------|---------|---------------------|
| 1 | Positionnement | `01-positionnement.md` | Tout le reste en depend |
| 2 | ICP | `02-icp.md` | Definit a qui on parle |
| 3 | Pain Points | `07-pain-points.md` | Les douleurs guident tout le messaging |
| 4 | Offre | `03-offres.md` | Ce qu'on vend concretement |
| 5 | Objections | `05-objections.md` | Comment repondre aux freins |
| 6 | Messaging | `11-messaging.md` | Les angles d'approche |
| 7 | Use Cases | `04-use-cases.md` | Cas concrets d'utilisation |
| 8 | Regles decisionnelles | `06-regles-decisionnelles.md` | Quand/comment l'IA agit |
| 9 | Pricing | `10-pricing.md` | Strategie de prix |
| 10 | Benchmark marche | `08-benchmark-marche.md` | Contexte marche |
| 11 | Benchmark concurrents | `09-benchmark-concurrents.md` | Paysage concurrentiel |
| 12 | Operating Rules | `12-operating-rules.md` | Regles comportementales IA |
| 13 | Onboarding | `13-onboarding.md` | Flow d'accueil client |
| 14 | Architecture Core | `14-architecture-core.md` | Meta-consolidation |

---

## Quel agent utilise quel bloc ?

| Agent IA | Blocs utilises | Role |
|----------|----------------|------|
| **Prospection** (generation messages LinkedIn) | 1, 2, 3, 4, 5, 7, 11 | Personnalise les messages d'approche |
| **Scoring** (qualification leads) | 1, 2, 6, 7 | Note les leads de 0 a 100 |
| **Enrichissement** (recherche contexte) | 1, 2 | Comprend le profil du lead |
| **Conversationnel** (chat cockpit) | TOUS (1-14) | Repond a toute question business |

---

## Format JSON cible

Chaque template rempli doit etre converti dans ce format pour `knowledge/` :

```json
{
  "source_file": "nom_du_fichier_source.md",
  "bloc_id": "bloc_X",
  "title": "TITRE DU BLOC",
  "sections": [
    {
      "heading": "1. Titre de la section",
      "content": [
        "Premier paragraphe.",
        "Deuxieme paragraphe.",
        "Troisieme paragraphe."
      ]
    },
    {
      "heading": "2. Autre section",
      "content": [
        "Contenu ici."
      ]
    }
  ],
  "metadata": {
    "converted_at": "2026-03-09T00:00:00Z",
    "total_sections": 2,
    "total_paragraphs": 4
  }
}
```

**Regles** :
- `content` = array de strings (un element par paragraphe ou bullet point)
- Pas de sous-sections imbriquees, tout est plat
- Les listes a puces = un element par bullet
- `bloc_id` : `bloc_1` a `bloc_13` + `architecture_core` pour le dernier

---

## Prompt Claude.ai pour demarrer une session

Copie-colle ce prompt dans Claude.ai pour lancer le remplissage d'un bloc :

```
Je vais te partager un template de bloc RAG pour mon outil de prospection LinkedIn (Prospector).

Contexte Prospector :
- Outil interne de prospection LinkedIn semi-automatisee
- L'IA genere des messages personnalises bases sur le contexte du lead
- L'utilisateur valide/edite avant envoi
- Les blocs RAG sont injectes dans le system prompt de l'IA pour personnaliser les messages

Mon produit/service : [DECRIS TON PRODUIT EN 2-3 PHRASES]
Ma cible : [DECRIS TA CIBLE EN 2-3 PHRASES]

Voici le template a remplir ensemble. Pour chaque section :
1. Pose-moi les bonnes questions pour comprendre mon contexte
2. Propose une redaction basee sur mes reponses
3. On itere jusqu'a ce que ce soit bon
4. A la fin, genere le JSON final compatible avec le format RAG

[COLLE LE CONTENU DU TEMPLATE ICI]
```

---

## Prompt Claude.ai pour convertir en JSON

Une fois un template rempli, utilise ce prompt :

```
Convertis ce document rempli en JSON compatible avec le format RAG de Prospector.

Regles :
- Format : { source_file, bloc_id, title, sections: [{ heading, content: [string] }], metadata }
- Chaque paragraphe = un element dans le array content
- Chaque bullet point = un element separe
- Pas de markdown dans le JSON (pas de **, pas de #)
- bloc_id = "bloc_X" (le numero est dans le header du template)
- metadata.converted_at = date ISO du jour
- Compte total_sections et total_paragraphs

[COLLE LE TEMPLATE REMPLI ICI]
```
