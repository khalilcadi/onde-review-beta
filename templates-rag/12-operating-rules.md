# BLOC 12 - REGLES OPERATIONNELLES IA

> **bloc_id** : `bloc_12`
> **Utilise par** : Conversationnel
> **Priorite** : #12 - Regles comportementales de l'IA

---

## A quoi sert ce bloc ?

Ce bloc definit les regles de fonctionnement internes de l'IA : comment elle pense, priorise, refuse ou ralentit. C'est le "systeme d'exploitation" de l'IA de prospection.

**Aucun agent IA n'agit sans respecter ce bloc.**

---

## Sections a remplir

### 1. Role strategique

> Quel est le cadre operationnel de l'IA.

```
[A REMPLIR]

Questions guides :
- L'IA a-t-elle le droit de refuser une action ?
- L'IA doit-elle etre sobre (minimum d'actions) ou proactive (maximum) ?
- Quelle est la priorite #1 de l'IA ? (qualite, volume, coherence, protection...)
```

### 2. Principe fondateur

> La regle numero 1 que l'IA doit toujours respecter.

```
[A REMPLIR]

Questions guides :
- Si l'IA ne devait retenir qu'une seule regle, ce serait quoi ?
- Exemples : "Ne jamais envoyer un message qui fait perdre la face au prospect",
  "Qualite > Quantite", "Proteger la reputation avant tout"...
```

### 3. Hierarchie des priorites

> L'ordre dans lequel l'IA doit prioriser ses actions.

```
[A REMPLIR]

Priorite 1 (non-negociable) : ...
Priorite 2 : ...
Priorite 3 : ...
Priorite 4 : ...
Priorite 5 (nice to have) : ...
```

### 4. Regles de sobriete

> Limites pour eviter le spam et le bruit.

```
[A REMPLIR]

Questions guides :
- Nombre max de messages par jour ?
- Nombre max de relances par lead ?
- Delai minimum entre deux contacts au meme lead ?
- L'IA peut-elle contacter le meme lead sur plusieurs canaux ?
- Y a-t-il des horaires/jours interdits ?
```

### 5. Regles de non-activation

> Quand l'IA ne doit PAS se declencher.

```
[A REMPLIR]

Questions guides :
- Situations ou l'IA doit rester silencieuse ?
- Signaux qui indiquent "stop" ? (desabonnement, reponse negative, plainte...)
- L'IA doit-elle respecter une "cooling period" apres un echec ?
```

### 6. Regles de ton et comportement

> Comment l'IA se comporte dans les interactions.

```
[A REMPLIR]

Questions guides :
- L'IA peut-elle etre humoristique ?
- L'IA peut-elle etre directe/confrontante ?
- L'IA doit-elle toujours etre polie meme si le prospect est impoli ?
- L'IA peut-elle admettre ses limites ? ("je ne sais pas")
```

### 7. Regles inter-blocs

> Comment ce bloc interagit avec les autres.

```
[A REMPLIR]

Hierarchie d'injection recommandee :
1. Pain Points (Bloc 7) -> toujours en premier
2. Regles decisionnelles (Bloc 6) -> cadre d'action
3. Operating Rules (ce bloc) -> meta-controle
4. Messaging (Bloc 11) -> execution
5. Pricing (Bloc 10) -> si pertinent
6. Concurrents (Bloc 9) -> jamais par defaut
7. Marche (Bloc 8) -> support uniquement

(Adapte cette hierarchie a ton cas)
```

---

## Exemple de section bien redigee

```
### Regles de sobriete

1. Maximum 15 invitations LinkedIn par jour
2. Maximum 10 messages par jour
3. 15 minutes minimum entre deux messages
4. Maximum 3 relances par lead sur une sequence
5. Apres 3 relances sans reponse = lead en pause pour 30 jours
6. Jamais de contact le weekend
7. Plage horaire : 9h-19h (timezone du prospect si connue, sinon Paris)
```
