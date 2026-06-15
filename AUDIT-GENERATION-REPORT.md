# RAPPORT D'AUDIT — Qualite des messages generes par l'agent de prospection

**Date** : 13 mars 2026
**Scope** : 10 dernieres generations de l'agent `prospection`
**Objectif** : Comprendre pourquoi les messages sont generiques, plats et peu percutants

---

## RESUME EXECUTIF

L'agent de prospection genere des messages qui se ressemblent tous : une observation vague suivie d'une question ouverte du type "c'est un sujet chez vous ?". L'audit revele **5 causes racines** qui s'additionnent pour produire ce resultat :

1. **Le RAG represente 66.8% du payload** — le LLM est noye sous 43k chars d'instructions et ne recoit que 3.5k chars de donnees lead (ratio 17:1)
2. **Le stage n'est pas transmis** (= N/A) — le prompt ne peut pas appliquer ses regles de longueur et d'objectif
3. **Le scoring n'est pas injecte** — la decision matrix ne peut pas determiner fit/timing → fallback systematique en MODE E
4. **Les posts sont tronques** — le LLM ne voit que le debut des posts, pas le contenu exploitable
5. **Le prompt v7.0 est trop defensif** — 30+ interdictions, fallback protocol pousse vers MODE E des que le contexte est "ambigu"

**Impact combine** : 100% des messages tombent en MODE E (exploration basique), produisant le meme squelette : observation generique RAG + question ouverte sans tension.

---

## 1. DONNEES DE L'AUDIT

### 1.1 Echantillon analyse

| # | Date | Lead | Action | Signal | Sections | Enrichment | Message |
|---|------|------|--------|--------|----------|------------|---------|
| 1 | 13/03 09:46 | MJ Harpon | message | POST_SUJET | 8/9 | NONE (lead supprime) | 438 chars |
| 2 | 13/03 07:40 | MJ Harpon | message | POST_SUJET | 8/9 | NONE | 374 chars |
| 3 | 12/03 17:25 | MJ Harpon | message | POST_SUJET | 8/9 | NONE | 182 chars |
| 4 | 12/03 17:24 | Yann Roger | message | SIGNAL_FAIBLE | 7/9 | NONE | 212 chars |
| 5 | 12/03 17:24 | Yann Roger | message | SIGNAL_FAIBLE | 7/9 | NONE | 179 chars |
| 6 | 10/03 09:21 | Yann Roger | message | SIGNAL_FAIBLE | 7/9 | NONE | 224 chars |
| 7 | 10/03 09:21 | Yann Roger | message | SIGNAL_FAIBLE | 7/9 | NONE | 260 chars |
| 8 | 10/03 09:20 | Yann Roger | message | SIGNAL_FAIBLE | 7/9 | NONE | 300 chars |
| 9 | 10/03 03:00 | Jennifer (?) | message | POST_DOULEUR | 8/9 | NONE | 475 chars |
| 10 | 10/03 03:00 | Caroline PLEE | message | POST_DOULEUR | 7/9 | RICH | 333 chars |

**Statistiques globales :**
- Enrichment quality : RICH = 1, NONE = 9 (leads supprimes de la DB mais contexte etait injecte au moment de la generation)
- Signals : POST_SUJET = 3, SIGNAL_FAIBLE = 5, POST_DOULEUR = 2
- Avg tokens : input = 931, output = 87, cached = 18,152
- Avg message length : 298 chars
- Modele : undefined dans les logs (probleme de tracking)

### 1.2 Distribution des tokens (cas MJ Harpon #1)

| Composant | Caracteres | % du total | Tokens estimes |
|-----------|-----------|-----------|----------------|
| **RAG context (10 blocs)** | **42,915** | **66.8%** | **~10,700** |
| Prompt agent v7.0 | 17,581 | 27.4% | ~4,400 |
| Donnees lead | 3,513 | 5.5% | ~880 |
| User message | 261 | 0.4% | ~65 |
| **Total** | **64,270** | **100%** | **~16,000** |

**Ratio instructions vs donnees lead = 17.2x**

Le LLM recoit 17 fois plus d'instructions et de base de connaissances que de donnees reelles sur le prospect.

---

## 2. ANALYSE DES MESSAGES GENERES

### 2.1 Pattern repetitif identifie

Tous les messages suivent le meme squelette :

```
{Prenom},

[Observation generique tiree du RAG ou vague reference a un post]

[Question ouverte type "c'est un sujet chez vous ?"]
```

**Exemples concrets :**

**MJ Harpon (3 regenerations successives) :**
> 1. "Votre post sur le pivot vers l'international quand le marche francais declinait m'a fait reflechir — c'est exactement le genre de moment ou l'acquisition doit tenir sans reposer uniquement sur le fondateur. Comment vous gerez la generation de nouveaux clients aujourd'hui ?"
> 2. "Vous publiez regulierement sur l'optimisation de l'acquisition et la croissance cross-border. Une question directe : votre propre acquisition chez Donutz est structuree comme un systeme reproductible, ou elle repose encore principalement sur votre reseau et votre activite LinkedIn ?"
> 3. "Question directe : quand vous avez perdu ces deals sur le marche francais — c'etait un probleme de prix, de positionnement, ou de pipeline qui s'est vide trop vite pour ajuster ?"

**Yann Roger (4 regenerations) :**
> 1. "Question directe : est-ce que l'acquisition de The Browz repose encore principalement sur votre reseau et vos recommandations ?"
> 2. "Question directe : est-ce que votre propre acquisition chez The Browz fonctionne aussi bien que les campagnes que vous gerez pour vos clients ?"
> 3. "Beaucoup de fondateurs d'agence que je croise cumulent la gestion clients, le pilotage d'equipe et le developpement commercial. C'est quelque chose que vous vivez aussi chez The Browz ?"
> 4. "J'observe que la plupart des dirigeants d'agence digitale jonglent entre plusieurs casquettes. Chez The Browz, vous avez structure l'organisation pour alleger cette charge ?"

### 2.2 Formules recurrentes

| Formule | Occurrences | Probleme |
|---------|------------|----------|
| "question directe" | 4/10 | Artificiellement direct, sonne script |
| "beaucoup de fondateurs que je croise/rencontre" | 3/10 | Generique, pas credible venant d'un message LinkedIn |
| "repose encore principalement sur votre reseau" | 3/10 | Meme douleur RAG recyclee |
| "c'est un sujet/quelque chose que vous vivez" | 4/10 | Question sans tension |
| "systeme reproductible" | 2/10 | Jargon Smart.AI qui fuit du RAG |

### 2.3 Ce qui ne va pas

**Ton** : Les messages oscillent entre "consultant qui fait un diagnostic" et "commercial qui pose des questions ouvertes". Ils ne sonnent pas comme un humain qui ecrit a un pair.

**Personnalisation** : Meme avec un profil riche (MJ Harpon : 7 posts, createur LinkedIn, 4173 followers, 44 connexions en commun, ISC Paris + Polytech), le message reste generique. Le LLM n'exploite pas la richesse du contexte.

**Percutance** : Les questions ne creent aucune tension. "C'est un sujet chez vous ?" donne envie de repondre "non" et de passer a autre chose.

**Variete** : Les regenerations produisent des paraphrases, pas des angles differents. Le prompt demande 6 axes de variation mais le LLM reste sur le meme pain point RAG.

---

## 3. CAUSES RACINES

### 3.1 RAG trop volumineux (66.8% du payload)

**Constat** : 10 blocs RAG injectes pour l'agent prospection = 42,915 caracteres de base de connaissances.

**Blocs injectes :**
1. positionnement (vision Smart.AI, A.R.C.)
2. icp (3 segments agences B2B)
3. offres (Setup 6000 EUR + Platform)
4. messaging (4 niveaux pitch, 5 angles, vocabulaire)
5. objections (6 objections + reponses)
6. use_cases (4 cas d'usage agences)
7. pain_points (5 douleurs agences)
8. framework_arc (Audit, Revenue Engine, Control Tower)
9. manifesto (positions de rupture, accroches)
10. profil_fondateur (Ludwig Graham, credibilite)

**Probleme** : Le LLM est noye. Avec 43k chars d'instructions contre 3.5k de donnees lead, le RAG devient le signal dominant. Le LLM pioche dans les pain_points et le messaging RAG pour construire le message, au lieu de s'ancrer sur le contexte reel du lead.

**Blocs probablement inutiles pour la generation de messages** :
- `offres` : le prompt interdit de pitcher, donc les details de l'offre sont du bruit
- `framework_arc` : details A.R.C. non utilisables dans un premier message
- `objections` : pas pertinent en approche initiale
- `manifesto` : le prompt interdit explicitement d'utiliser le manifeste comme slogan
- `profil_fondateur` : rarement exploitable dans un message de prospection

**Impact** : Le ratio 17:1 force le LLM a sur-ponderer les instructions au detriment du contexte lead.

### 3.2 Champs critiques manquants dans le contexte

**Stage = N/A (10/10 cas)**

Le champ `stage` est systematiquement `N/A` dans le contexte envoye au LLM. Or le prompt v7.0 s'appuie lourdement sur le stage :
- Etape 2 : determine l'objectif et la longueur (prospect <= 300, connected <= 500)
- Decision matrix : MODE C reserve aux `replied`
- Regle Smart.AI : comportement different selon le stage

Sans stage, le LLM ne peut pas appliquer ces regles et tombe dans un comportement par defaut non calibre.

**Cause probable** : L'appel depuis l'UI ne transmet pas le stage du lead, ou le lead est charge sans ses champs de base.

**Scoring absent (10/10 cas)**

La section `## Scoring IA` n'apparait jamais dans le contexte, meme pour Caroline PLEE qui a un score de 62 avec scoring_detail complet (fit=30, intent=22, timing=10).

**Cause probable** : La fonction `buildLeadSections()` dans `lib/ai/lead-context.ts` conditionne l'injection du scoring a l'existence de `enrichmentData.scoring_detail.fit_score`. Soit le mapping ne fonctionne pas, soit le champ n'est pas transmis depuis l'UI.

**Impact** : Sans scoring, la decision matrix ne peut pas determiner fit/timing → fallback systematique en MODE E.

**Titre = headline entier ou N/A**

Le champ `Titre` contient soit le headline LinkedIn complet (emoji + description) soit `N/A` :
```
Titre : 👉 Founder & CEO @ Donutz Digital | Scaling European Brands...
```
au lieu de simplement `Founder & CEO`.

**Entreprise = N/A**

Le champ `Entreprise` est `N/A` pour 9/10 cas, meme quand l'enrichissement contient le nom de l'entreprise.

### 3.3 Posts tronques

Les posts LinkedIn sont coupes apres ~100-150 caracteres :

```
- A while back, we almost didn't make it.

The French market was declining. Budgets were collapsing. We were losing deals; not because we weren't good, ...
```

Le LLM ne voit que le debut du post. Il ne peut pas :
- Comprendre la tension reelle exprimee
- Identifier l'angle exploitable
- Distinguer un post pertinent d'un post anecdotique

**Cause** : Les posts sont resumes par Claude Sonnet (max 30 mots) dans l'etape d'enrichissement, mais les resumes semblent etre le texte brut tronque plutot que de vrais resumes.

### 3.4 Prompt trop defensif

Le prompt v7.0 contient **30+ interdictions explicites** :

**Interdictions de contenu :**
- Ne jamais inventer (post, actualite, relation, douleur, maturite, objection, historique, recommandation, resultat)
- Ne jamais pitcher trop tot
- Ne jamais mentionner le prix
- Ne jamais presenter Smart.AI (sauf exceptions strictes)
- Ne jamais utiliser le manifeste comme slogan
- Ne jamais utiliser de tiret cadratin

**Interdictions de style :**
- Ne jamais flatter
- Ne jamais surjouer la proximite
- Ne jamais donner une impression de surveillance
- Ne jamais poser deux questions
- Ne jamais utiliser : "J'espere que vous allez bien", "Je me permets", "J'ai vu que vous avez like", "j'ai regarde votre profil"

**Interdictions de vocabulaire en approche initiale :**
- solution, plateforme, outil, programme, accompagnement

**Fallback protocol** : "Si le contexte est contradictoire, ambigu, faible ou partiellement vide → MODE E". Avec Stage=N/A et Scoring absent, le contexte est TOUJOURS "partiellement vide" → le LLM tombe systematiquement en MODE E.

**Impact** : Le LLM joue la securite. Avec autant d'interdictions et un fallback protocol strict, il produit le message le plus "safe" possible : une observation generique + une question ouverte inoffensive.

### 3.5 Decision matrix trop complexe pour un contexte incomplet

La decision matrix requiert :
- Stage (pour MODE C) → **absent**
- fit_score (pour MODE D) → **absent**
- timing_score (pour MODE D) → **absent**
- Signal fort + fit fort + timing fort/moyen (pour MODE D) → **impossible a evaluer**
- Signal exploitable (pour MODE R) → **present mais pas suffisant sans les autres**

Resultat : seul MODE E est atteignable dans 100% des cas observes.

---

## 4. IMPACT SUR LES RESULTATS

### 4.1 Taux de reponse attendu

Des messages generiques du type "c'est un sujet chez vous ?" ont un taux de reponse typique de **2-5%** sur LinkedIn. Des messages personnalises et percutants atteignent **15-25%**.

### 4.2 Perte de valeur de l'enrichissement

L'enrichissement fonctionne : les leads ont des profils LinkedIn riches, des posts, des signaux. Mais cette richesse n'est pas exploitee par le generateur de messages a cause des problemes de transmission et du prompt trop defensif.

### 4.3 Cout gaspille

Chaque generation consomme ~16,000 tokens en cache + ~1,000 tokens dynamiques. Avec 10 blocs RAG dont 5 probablement inutiles, on paye du cache pour du bruit.

---

## 5. RECOMMANDATIONS

### 5.1 Corrections immediates (bugs)

| # | Correction | Fichier | Impact |
|---|-----------|---------|--------|
| 1 | **Transmettre le stage, titre, company** depuis l'UI vers l'API generate | Appel client-side ou `app/api/ai/generate/route.ts` | Le prompt peut enfin appliquer les regles stage |
| 2 | **Injecter le scoring_detail** dans buildLeadSections quand il existe | `lib/ai/lead-context.ts` | La decision matrix peut determiner fit/timing |
| 3 | **Ameliorer les resumes de posts** (vrais resumes, pas troncature) | `app/api/ai/enrich/route.ts` | Le LLM comprend le contenu des posts |
| 4 | **Logger le model_id** correctement dans ai_usage | `lib/ai/service.ts` | Tracabilite des generations |

### 5.2 Optimisation RAG (ratio signal/bruit)

**Proposition : reduire de 10 a 5 blocs pour l'agent prospection :**

| Garder | Raison |
|--------|--------|
| icp | Essentiel pour calibrer le message par segment |
| messaging | Angles et vocabulaire de prospection |
| pain_points | Douleurs plausibles pour MODE E |
| use_cases | Cas concrets pour ancrer la conversation |
| positionnement | Contexte minimal sur ce qu'on fait |

| Retirer | Raison |
|---------|--------|
| offres | Le prompt interdit de pitcher |
| framework_arc | Trop technique pour un premier message |
| objections | Pas pertinent en approche initiale |
| manifesto | Le prompt interdit de l'utiliser comme slogan |
| profil_fondateur | Rarement exploitable |

**Impact estime** : RAG passe de ~43k chars a ~20k chars. Ratio instructions/donnees passe de 17:1 a ~8:1.

### 5.3 Refonte du prompt v8.0

**Principes :**

1. **Moins d'interdictions, plus de directions** : remplacer "ne jamais faire X" par "privilegier Y"
2. **Simplifier la decision matrix** : 2 modes au lieu de 4 (Personnalise vs Exploration)
3. **Supprimer le fallback protocol** : si le contexte est partiel, adapter la profondeur du message au lieu de tomber en mode degradre
4. **Encourager l'ancrage sur le contexte reel** : les posts, la bio et le parcours doivent etre la source primaire, pas le RAG
5. **Varier les structures** : donner 4-5 squelettes de message differents au lieu d'un seul pattern observation+question
6. **Ton plus humain** : ecrire comme un pair qui ecrit a un pair, pas comme un consultant qui fait un diagnostic

### 5.4 Amelioration de l'enrichissement

- **Posts** : augmenter la limite de resume a 50-80 mots (au lieu de 30) pour capturer la tension et l'angle
- **Summary Perplexity** : demander explicitement un "angle d'approche recommande" dans le summary, pas juste un resume factuel
- **Signal classification** : etre moins conservateur — un post sur un sujet B2B devrait etre POST_SUJET, pas SIGNAL_FAIBLE

---

## 6. PRIORITE D'EXECUTION

| Priorite | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Fix stage/titre/company manquants | 1h | Debloque la decision matrix |
| **P0** | Fix scoring non injecte | 30min | Debloque fit/timing |
| **P1** | Reduire RAG de 10 a 5 blocs | 15min | Ratio 17:1 → 8:1 |
| **P1** | Ameliorer resumes posts (50-80 mots) | 30min | Posts exploitables par le LLM |
| **P2** | Refonte prompt v8.0 | 2-3h | Messages plus naturels et varies |
| **P3** | Fix logging model_id | 15min | Tracabilite |

---

## ANNEXES

### A. Fichiers de reference

- Prompt agent : `lib/ai/prompts/defaults.ts`
- Construction contexte lead : `lib/ai/lead-context.ts`
- Service IA : `lib/ai/service.ts`
- Mapping RAG : `lib/rag/mapping.ts`
- Route generation : `app/api/ai/generate/route.ts`
- Route enrichissement : `app/api/ai/enrich/route.ts`
- Humanisation : `lib/humanize.ts`

### B. Donnees brutes

- `audit-output.json` : 10 dernieres generations avec metadata
- `audit-full-payload.txt` : payload complet reconstruit (system + context + user) pour le cas #1

### C. Scripts d'audit

- `scripts/audit-generations.ts` : dump des N dernieres generations avec resume
- `scripts/audit-full-payload.ts` : reconstruction du payload complet pour une generation specifique

---

*Rapport genere le 13 mars 2026*
