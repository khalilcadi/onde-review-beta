# 04 — Agent Prospection

> Deep dive sur l'agent qui génère les messages LinkedIn. Rôle, règles, données reçues, blocs RAG, output.

Prompt source : [`lib/ai/prompts/defaults.ts`](../../lib/ai/prompts/defaults.ts) → clé `prospection`

---

## Rôle

Rédiger des messages LinkedIn personnalisés pour prospecter des solopreneurs et dirigeants de petites structures afin de leur présenter JARVIS.

**Ce n'est pas** un agent de copywriting générique. Il connaît JARVIS, son ICP, ses angles de messaging, ses objections, et adapte chaque message au profil exact du lead.

---

## Types de messages supportés

| Type | Limite | Contexte |
|------|--------|----------|
| `invitation` | 300 chars max | Premier contact — demande de connexion LinkedIn |
| `message` | 1500 chars max | Après connexion acceptée |
| `inmail` | 1900 chars max | Message direct sans connexion préalable |
| `email` | ~200 mots | Hors LinkedIn |
| `relance` | Idem message | Follow-up si pas de réponse |
| `réponse` | Libre | Réponse à un message reçu en inbox |

---

## Logique de personnalisation

### Par score (chaleur du lead)

| Score | Catégorie | Approche |
|-------|-----------|----------|
| < 60 | COLD | Approche découverte, pas de social proof, pas d'offre directe |
| 60–79 | WARM | Peut mentionner des clients similaires, angle plus direct |
| ≥ 80 | HOT | Social proof fort, CTA direct, urgence légère possible |

**Règles absolues :**
- Jamais score ≥ 80 sans signal d'engagement (critère 5 du scoring ≥ 5)
- Jamais de prix ou offre explicite en contact froid (COLD)

### Par profil (tu vs vous)

| Profil | Tutoiement |
|--------|-----------|
| Solopreneur, freelance, créateur | Tu |
| CEO, DG, directeur d'une structure > 10 personnes | Vous |

### Par données d'enrichissement disponibles

Si `enrichment_data` présent (lead enrichi via Perplexity) :
- Utiliser les informations entreprise (secteur, taille, news récentes)
- Utiliser les informations personnelles (intérêts, posts récents)
- Ancrer le message dans quelque chose de concret et spécifique

Si non enrichi :
- S'appuyer sur titre, entreprise, score, tags, notes uniquement
- Message plus générique mais toujours personnalisé sur le profil visible

---

## Règles clés du prompt

### Ce qui est obligatoire
- Toujours utiliser le prénom + titre dans l'accroche
- Message en français sauf si le profil est explicitement anglophone
- Accroche différente à chaque régénération (angle + structure + hook différents)
- Varier les angles de messaging systématiquement (5 angles définis dans le bloc RAG messaging)

### Ce qui est interdit
- Mentionner que le message est généré par une IA
- Citer le prix ou l'offre en contact froid
- Utiliser des formules spam ("J'espère que ce message vous trouve bien...")
- Utiliser des hashtags LinkedIn
- Inclure une URL dans une invitation (bloqué LinkedIn)
- Inventer des données non présentes dans le contexte

---

## Blocs RAG injectés (7 blocs)

| Bloc | Utilité dans la génération |
|------|---------------------------|
| `positionnement` | Argument central JARVIS, ce que c'est concrètement |
| `icp` | Comprendre le persona (solopreneur 5-10k€/mois) → tu/vous, angle psycho |
| `offres` | Proposition de valeur JARVIS Start (79€/mois + 500€ setup) |
| `messaging` | 5 angles d'attaque disponibles (productivité, scalabilité, coût...) |
| `objections` | 10 objections + réponses (pour les relances et réponses inbox) |
| `use_cases` | 7 cas d'usage pour ancrer le message dans un bénéfice concret |
| `pain_points` | 4 familles de douleurs (saturation, isolement, prospection, scaling) |

---

## Post-processing : humanisation anti-détection

Après génération, `humanizeMessage()` est appliqué :

```
1. Avec 40% de probabilité : splitté en 2-3 fragments
   → Séparés par "|||" en DB
   → Envoyés par le cron send-actions avec délai aléatoire entre chaque fragment

2. Transformations sur les fragments :
   → 25% chance : première lettre minuscule sur les fragments non-initiaux
   → 50% chance : suppression du point final sur le dernier fragment
```

**Objectif :** imiter la façon dont un humain tape plusieurs messages courts plutôt qu'un bloc de texte long — réduit le risque de détection par les algorithmes LinkedIn.

---

## Paramètres d'appel API

| Paramètre | Valeur |
|-----------|--------|
| Agent ID | `prospection` |
| Max tokens | 512 |
| Temperature | Config user (0.7 par défaut) |
| Model | Config user (claude-sonnet-4-6 par défaut) |
| Caching | Bloc 1 (prompt + RAG) caché — Bloc 2 (lead context) non caché |

---

## Exemples d'output (types de messages)

Le prompt contient 6 exemples pour guider le modèle :

1. **Invitation COLD solopreneur** — courte, accroche sur douleur, pas d'offre
2. **Message WARM CEO** — plus direct, client similaire mentionné, CTA clair
3. **InMail froid directeur** — formel (vous), bénéfice business, invitation à 15 min
4. **Email HOT solopreneur** — social proof fort, urgence, lien calendrier
5. **Régénération** — même lead, angle complètement différent du message précédent
6. **Réponse inbox** — répond à une objection, rebondit sur le contenu du message reçu

---

## Questions ouvertes pour le brainstorm

- **Granularité du contexte lead** : quels champs ont le plus d'impact sur la qualité ? (score ? tags ? notes manuelles ?)
- **Angles de messaging** : les 5 angles actuels sont-ils les bons ? En manque-t-il ?
- **Calibration COLD/WARM/HOT** : le seuil 60/80 est-il bien calibré pour notre usage ?
- **Tu/vous** : la règle actuelle est-elle suffisamment précise pour ne pas se tromper ?
- **Invitations** : la contrainte 300 chars est très serrée — comment l'agent gère-t-il les leads peu enrichis ?
- **Relances** : l'agent sait-il qu'il relance (pas de première impression à faire) ? A-t-il accès à l'historique ?
- **Réponses inbox** : l'agent a accès à quoi du contexte conversationnel ? (voir `suggest` route)
