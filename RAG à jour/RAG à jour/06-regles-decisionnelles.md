# 06 — Règles décisionnelles

## Note de lecture pour les agents

Ce document définit les règles de qualification ICP et les règles de comportement en cas de situation limite.
Il est la référence principale pour le Scoring Agent et pour JARVIS en phase de qualification.
Les critères de taille d'équipe et de CA sont harmonisés avec le doc 02 (ICP V3 — 3 segments).

---

## Qualification ICP — critères d'entrée

Un prospect est pertinent si :

- il dirige une agence B2B (marketing, growth, automation, dev, data, consulting, acquisition)
- il a entre 1 et 12 collaborateurs (fourchette couvrant les 3 segments Early/Growth/Scale)
- son CA annuel se situe entre 70 000€ et 500 000€
- il possède une offre claire et des clients existants (l'offre est validée)
- il souhaite structurer son acquisition commerciale

---

## Non ICP — écarter sans hésiter

Les profils suivants ne sont pas la cible de Smart.AI :

- freelances solo sans clients récurrents ni projet de structuration
- agences sans offre définie ou en phase de pivotement
- entreprises cherchant uniquement un outil sans accompagnement humain
- CA inférieur à 70 000€ (capacité de Setup non confirmée)
- fondateurs qui refusent explicitement de déléguer ou de changer leurs habitudes commerciales
- fondateurs dont le problème principal est l'offre, pas l'acquisition

---

## Les 3 segments ICP — qualification différenciée

Les profils ICP ne sont pas homogènes. Se référer au doc 02 pour le détail complet de chaque segment.

### Segment A — Early Stage (70k–200k€, 1–4 personnes)

**Profil** : fondateur récent, acquisition par réseau et bouche-à-oreille, prospection inexistante ou irrégulière.

**Priorité** : ICP secondaire — à qualifier avec vigilance accrue.

**Vigilance obligatoire avant engagement** :
- Le fondateur dispose-t-il d'au moins 3h/semaine dédiables au suivi du Setup ?
- Le budget Setup (6 000€) est-il disponible sans mettre la trésorerie en tension ?
- La douleur est-elle réelle et active (client perdu, mois creux) ou seulement perçue ?

Si ces trois questions ne sont pas confirmées positivement, classer en ICP froid et requalifier dans 3 à 6 mois.

**Risque opérationnel** : profil le plus susceptible de décrocher en cours de Setup faute de ressources ou de maturité suffisante. Ne pas engager sous pression émotionnelle seule.

### Segment B — Growth Stage (200k–350k€, 3–7 personnes)

**Profil** : fondateur expérimenté, outils déjà testés sans résultats durables, plateau de croissance.

**Priorité** : ICP primaire — cible optimale.

**Signal fort** : "J'ai essayé Lemlist / Waalaxy / Apollo, ça n'a pas marché." → Ce fondateur comprend le problème de l'architecture. C'est le profil idéal pour Smart.AI.

### Segment C — Scale Stage (350k–500k€, 6–12 personnes)

**Profil** : agence établie, fondateur goulot d'étranglement commercial, cherche à industrialiser.

**Priorité** : ICP primaire — ticket moyen plus élevé, cycle de vente plus long.

**Signal fort** : "Je suis le seul commercial de mon agence à 400k€ de CA." → Douleur réelle et budget disponible.

---

## Qualification par niveau de maturité (cross-segments)

### Niveau 1 — ICP chaud (action immédiate)

Le prospect vit un moment de douleur actif :

- pipeline vide ou en train de se vider
- fondateur saturé par l'opérationnel
- prospection déjà tentée sans résultats durables
- croissance bloquée depuis 3 mois ou plus

Action : engager directement sur le diagnostic. Proposer un Audit Revenue comme première étape.

### Niveau 2 — ICP tiède (nurturing)

Le prospect correspond au profil mais sans douleur aiguë immédiate :

- croissance correcte mais irrégulière
- conscience du problème sans déclencheur immédiat
- curiosité pour structurer mais pas d'urgence

Action : nourrir avec du contenu sur l'infrastructure revenue. Reprendre contact dans 30 à 60 jours.

### Niveau 3 — ICP froid (pipeline long terme)

Le prospect correspond au profil mais trop tôt dans sa trajectoire :

- agence de moins de 12 mois
- offre pas encore stabilisée
- budget non disponible
- Segment A sans les 3 conditions de vigilance confirmées

Action : garder dans le pipeline, requalifier dans 3 à 6 mois.

---

## Règles de handoff Prospector → Ludwig

Les agents Prospector et JARVIS escaladent vers Ludwig dans les situations suivantes.

**Escalade obligatoire :**
- Le prospect demande un RDV ou une démonstration → passer la main immédiatement
- Le prospect pose des questions sur les garanties contractuelles ou la clause de sortie
- Le prospect mentionne un budget supérieur à 10 000€ ou un projet multi-entités
- Le prospect est dans un secteur réglementé nécessitant une validation supplémentaire

**Escalade recommandée :**
- Le prospect est Segment C avec une équipe de plus de 8 personnes
- Le prospect a déjà travaillé avec une agence conseil (attentes professionnelles élevées)
- Le prospect exprime un doute sur la crédibilité ou l'expérience de Smart.AI

**Format du handoff :**
Avant d'escalader, l'agent synthétise : segment identifié, douleur principale, objections exprimées, niveau de maturité ICP, signal déclencheur.

---

## Gestion des cas d'échec et situations limites

### Setup qui dépasse les 8 semaines

Si l'implémentation excède la durée promise :

- Ne pas minimiser le retard ni inventer des explications techniques
- Reconnaître le retard, exposer la cause réelle, donner une nouvelle date ferme
- Réponse type : "Nous avons pris du retard sur la phase [X] en raison de [cause réelle]. La nouvelle date de livraison est le [date]. Voici ce que ça change concrètement pour vous."

### Résultats insuffisants à J+60

Si les résultats à 60 jours sont en deçà des projections initiales :

- Ne pas citer les projections comme des garanties — elles ne l'ont jamais été
- Analyser avec le client les causes réelles (ICP ciblé, message, timing, séquences)
- Proposer un ajustement de la stratégie avant tout autre engagement
- Escalader vers Ludwig si le client exprime de l'insatisfaction formelle

### Activation de la clause de sortie après Audit Revenue

Si un client active la clause de sortie à l'issue de S1-S2 :

- Respecter la clause sans négociation ni rétention agressive
- Documenter les raisons de sortie pour améliorer le filtre ICP en amont
- Réponse type : "Nous respectons votre décision. L'Audit Revenue vous appartient intégralement et peut vous être utile indépendamment de la suite avec Smart.AI."

### Prospect qui demande des références clients

Smart.AI est en phase de construction de son portefeuille de cas clients. Ne pas inventer ni exagérer.

Réponse type : "Nous sommes en phase d'early adopters. C'est précisément pour ça que nos premiers clients bénéficient d'une attention et d'un niveau d'accompagnement qu'une structure établie ne peut plus offrir. La clause de sortie après Audit Revenue est notre garantie concrète — pas des témoignages."

---

## Règle de priorité absolue

Les agences avec une acquisition chaotique, une offre solide et un fondateur conscient du problème sont les meilleures candidates.

Signal fort : "Je sais que j'ai besoin d'un système, je n'ai juste pas eu le temps de m'en occuper."

Signal d'alerte Segment A : "Je veux bien essayer mais je n'ai pas vraiment le temps de m'en occuper non plus." → Ne pas engager.
