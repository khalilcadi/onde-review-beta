# BLOC 6 - REGLES DECISIONNELLES

> **bloc_id** : `bloc_6`
> **Utilise par** : Scoring, Conversationnel
> **Priorite** : #8 - Quand et comment l'IA agit

---

## A quoi sert ce bloc ?

Ce bloc definit la logique de decision de l'IA : quand contacter un lead, avec quel niveau d'intensite, et comment prioriser. C'est le "cerveau strategique" qui guide les agents IA.

---

## Sections a remplir

### 1. Principe fondateur

> Quel est le role decisonnel de l'IA dans ton process de prospection ?

```
[A REMPLIR]

Questions guides :
- L'IA decide seule ou recommande et tu valides ?
- Quelle est la philosophie : agressif, patient, opportuniste, methodique ?
- Y a-t-il des situations ou l'IA ne doit PAS agir ?
```

### 2. Variables d'entree (inputs de decision)

> Quelles informations l'IA doit analyser avant de decider.

```
[A REMPLIR]

Variables potentielles :
- Score du lead (0-100)
- Stage dans le pipeline (to_invite, invited, connected, responded...)
- Anciennete dans la sequence
- Nombre d'interactions passees
- Signaux recents (post LinkedIn, changement de poste, visite profil...)
- [Ajoute tes propres variables]
```

### 3. Matrice de decision : Quand contacter ?

> Regles claires pour savoir quand un lead merite une action.

```
[A REMPLIR]

| Situation | Action recommandee | Priorite |
|-----------|--------------------|----------|
| Lead froid, score > 70 | ... | ... |
| Lead connecte, pas de reponse depuis 7j | ... | ... |
| Lead a repondu positivement | ... | ... |
| Lead a repondu negativement | ... | ... |
| Lead inactif depuis 30j | ... | ... |
| [Ajoute tes situations] | ... | ... |
```

### 4. Regles de priorisation

> Comment classer les leads quand il y en a trop a traiter.

```
[A REMPLIR]

Questions guides :
- Quel critere prime : recence d'interaction, score, stage, taille entreprise ?
- Combien de leads max par jour ?
- Y a-t-il un "quota" mental a ne pas depasser ?
```

### 5. Regles de non-action (quand NE PAS agir)

> Aussi important que les regles d'action.

```
[A REMPLIR]

Questions guides :
- Quand est-ce qu'il vaut mieux attendre ?
- Quels signaux indiquent qu'un lead ne doit pas etre contacte ?
- Y a-t-il un nombre max de relances ?
- A quel moment un lead est "mort" ?
```

### 6. Regles de scoring (criteres de qualification)

> Comment l'IA evalue la qualite d'un lead.

```
[A REMPLIR]

Criteres de scoring (pondere) :
- Fit ICP (titre, secteur, taille) : ...%
- Engagement (posts, likes, commentaires) : ...%
- Signaux d'achat (recrutement, levee, changement) : ...%
- Historique d'interaction : ...%
- [Ajoute tes criteres] : ...%

Seuils :
- Score > ... = lead chaud (priorite haute)
- Score ... a ... = lead tiede (sequence standard)
- Score < ... = lead froid (pas d'action ou action legere)
```

---

## Exemple de section bien redigee

```
### Matrice de decision

Avant toute recommandation, Jarvis identifie et score :

1. Moment business dominant (un seul actif) :
   - STAGNATION
   - SURCHARGE_MENTALE
   - CROISSANCE_NON_MAITRISEE
   - LANCEMENT_OU_PIVOT
   - DOUTE_STRATEGIQUE
   - PHASE_STABLE

2. Niveau d'energie du solopreneur :
   - BAS -> proteger, simplifier, une seule action
   - MOYEN -> structurer, 2-3 actions ciblees
   - HAUT -> accelerer, actions ambitieuses

La combinaison moment x energie determine l'intensite et le type d'action.
```
