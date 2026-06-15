# TEST_FIX_COBAYE_2 — Jean-Sébastien Wagner

## Le cobaye

| Champ | Valeur |
|---|---|
| ID | `77c42756-bf65-4ca3-9785-17e83f649a9b` |
| Nom | JEAN SEBASTIEN WAGNER |
| Titre | Founder |
| Entreprise | Weeflo |
| LinkedIn | https://www.linkedin.com/in/ACwAABHOzk4BEzoKCWLtd6uQmJPaSI8VOVUfDT0 |
| Stage | to_invite |
| Score | 20 (cold) |
| Tags | `gojiberry, goji:new-role` |
| Signal type | **`POST_SUJET`** (source: `null`) |
| Signal detail | Le CEO d'ADOC Solutions publie régulièrement sur la GED, l'automatisation IA, la numérisation et la facturation électronique — sujets directement liés à la transformation digitale et à l'automatisation des processus. Le post sur la campagne vidéo entrepreneurs (127 réactions) suggère un profil actif et engagé dans l'écosystème entrepreneurial. |
| Company size | `10-50 employés estimé` |
| Industry | Logiciels / Conseil informatique |
| Bio (linkedin_profile.about) | **0** chars |
| Posts récents | 10 |

**Pourquoi ce cobaye ?**
C'est le seul lead importé aujourd'hui qui porte un type de signal **post-enrichissement** (`POST_SUJET`) — précisément ceux que le fix 2 cible. Les autres candidats étaient sur des types pré-enrichissement (`NEW_ROLE`, `ENGAGEMENT_EXPERT`, `ENGAGEMENT_KEYWORD`) qui étaient déjà correctement mappés.

**Limite** : `linkedin_profile.about` est `null` côté Unipile — le fix 1 (bio 200→1500) n'est pas observable ici. On le note mais on ne peut pas le mesurer en pratique sur ce lead.

---

## Étape 2 — AVANT / APRÈS

### AVANT (ancien pipeline)

- `signal.type` en DB : **`POST_SUJET`**
- `mapGojiberrySignal(signal.type)` : **`"D"`** ← `POST_SUJET` n'était pas dans le map → fallback `"D"`
- `segment_icp` : `undefined` → fallback `"B"` (hardcodé dans `service.ts:67`)
- `about` injecté : tronqué à 200 chars (null ici, donc aucune bio côté prompt)
- `resolveM1("B", "D")` → RAG injecté :

- **icp_segments** : `segment_b`
- **pain_points** : `pp_generiques_b2b`
- **messaging_angles** : `position_1_systeme`, `position_3_outil`, `vocabulaire`
- **offre_produit** : `vue_ensemble`

**Verdict AVANT** : le LLM reçoit le pitch `segment_b` + `position_1_systeme` (angle "Agence B2B structurée") + `position_3_outil` (angle "infrastructure/outil"). Positionnement générique Growth-agency, sans exploiter l'intérêt réel du lead (post-enrichissement `POST_SUJET` = le lead parle de dématérialisation/IA/GED).

---

### APRÈS (pipeline fixé)

- `signal.type` en DB : **`POST_SUJET`** (inchangé)
- `mapGojiberrySignal(signal.type)` : **`"A"`** ← `POST_SUJET` ajouté au map (mapping.ts:47)
- `segment_icp` par `computeSegmentIcp` : **`"C"`** (title=Founder, size="10-50" → 30, non-ESN → PME taille C)
- `segment_icp` écrit en DB : **`"C"`** ✅
- `about` injecté : jusqu'à 1500 chars (`null` ici → aucun impact observable)
- `resolveM1("C", "A")` → RAG injecté :

- **icp_segments** : `segment_c`, `signaux_intention`
- **pain_points** : `pp_generiques_b2b`
- **messaging_angles** : `position_2_reseau`, `position_1_systeme`, `vocabulaire`
- **offre_produit** : `vue_ensemble`

**Verdict APRÈS** : le LLM reçoit le pitch `segment_c` + `position_2_reseau` (angle "réseau/notoriété fondateur") + `position_1_systeme` + `signaux_intention` (car signal A). L'angle de génération devient centré sur la **transformation d'une présence LinkedIn active en pipeline structuré** — beaucoup plus aligné avec le profil réel de Wagner (CEO qui poste activement sur la dématérialisation).

---

## Étape 3 — segment_icp écrit en DB

`UPDATE leads SET enrichment_data.scoring_detail.segment_icp = "C"`

Valeur confirmée en lecture : `"C"` ✅

---

## Étape 4 — Génération M1

### Sections RAG injectées (APRÈS)

- **icp_segments** : `segment_c`, `signaux_intention`
- **pain_points** : `pp_generiques_b2b`
- **messaging_angles** : `position_2_reseau`, `position_1_systeme`, `vocabulaire`
- **offre_produit** : `vue_ensemble`

### Runtime context envoyé (extraits)

```
## Date du jour
2026-04-16

## Lead
- Nom : JEAN SEBASTIEN WAGNER
- Titre : Founder
- Entreprise : Weeflo
- LinkedIn : https://www.linkedin.com/in/ACwAABHOzk4BEzoKCWLtd6uQmJPaSI8VOVUfDT0
- Score : 20 (cold)
- Stage : to_invite
- Tags : gojiberry, goji:new-role

## Entreprise
- Taille : 10-50 employés estimé
- Secteur : Logiciels / Conseil informatique
- Localisation : Nantes, France (siège ADOC Solutions)

## Profil
- Headline : CEO - ADOC Solutions Inc
- Expérience :
  - Président — VIWALLIANCE
  - Gérant — DIGISENSIA
  - Fondateur — ADOC Solutions
- Compétences : Dématérialisation documentaire, numérisation, Image Capture
- Followers : 10 733
- 40 connexions en commun
- Formation : ESDES — Master's degree, Finance | Eastern Connecticut State University — Master of Business Administration (MBA), Marketing

## Signal enrichissement
- Type : POST_SUJET
- Détail : Le CEO d'ADOC Solutions publie régulièrement sur la GED, l'automatisation IA, la numérisation et la facturation électronique — sujets directement liés à la transformation digitale et à l'automatisation des processus. Le post sur la campagne vidéo entrepreneurs (127 réactions) suggère un profil actif et engagé dans l'écosystème entrepreneurial.

## Posts récents
- Services GED automatisation IA entreprise (corporate, 7r/0c — 2026-04-16)
- cloud levier transformation digitale (corporate, 3r/0c — 2026-04-16)
- numérisation diapositives patrimoine visuel (corporate, 12r/0c — 2026-04-16)
- numérisation de cartes documents | Tension: risque de perte ou dégradation de documents physiques (corporate, 13r/0c — 2026-04-15)
- conformité facturation électronique sécurisée | Tension: Risque de non-conformité légale et de fraude sur les flux de facturation électronique (corporate, 14r/0c — 2026-04-15)
- Français et thérapie économique choc (corporate, 22r/7c — 2026-04-14)
- numérisation diapositives souvenirs | Tension: perte irrémédiable de souvenirs physiques qui se dégradent avec le temps (corporate, 14r/0c — 2026-04-14)
- Campagne vidéo entrepreneurs collectif (corporate, 127r/12c — 2026-04-13)
- Numérisation cartes postales patrimoine (corporate, 16r/0c — 2026-04-13)
- digitalisation factures entreprises | Tension: La gestion manuelle des factures génère erreurs, lenteurs et manque de visibilité, freinant la performance et la compétitivité (corporate, 15r/0c — 2026-04-13)

## Posts LinkedIn détaillés (top 3 par engagement)

### Post (127 réactions, 12 commentaires — 2026-04-13T12:54:42.435Z)
9 mois de trava
…(tronqué pour rapport)
```

### User prompt

```
Écris un message LinkedIn pour JEAN SEBASTIEN WAGNER (Founder @ Weeflo).

CONTEXTE PARTIEL : signal POST_SUJET, enrichissement dispo mais pas de fait concret exploitable. Utilise le contexte implicitement.
Étape 1/5 (premier contact).

MAX 1000 caractères.

IMPORTANT : Réponds en JSON strict :
{"variante_a": {"message": "...", "angle": "..."}, "variante_b": {"message": "...", "angle": "..."}, "canal": "linkedin|email|none", "canal_recommande": "linkedin|email", "persona": "fondateur|sales|marketing|dg_esn|drh_esn", "reasoning": "..."}
Les 2 variantes doivent utiliser des angles DIFFÉRENTS.
Si le canal recommandé est email et que seul LinkedIn est disponible : canal = "none", messages vides, reasoning explique pourquoi.
Pas de markdown, pas de backticks, juste le JSON.
```

### Réponse brute du modèle

```json
{"variante_a": {"message": "Bonjour Jean-Sébastien,\n\nVous publiez régulièrement sur la GED, l'automatisation IA, la facturation électronique — des sujets qui intéressent vos clients.\n\nMa question : est-ce que ce contenu génère des conversations commerciales concrètes, ou il nourrit surtout la visibilité sans alimenter un pipeline ?", "angle": "Tension contenu vs conversion — effet miroir fondateur actif sur LinkedIn mais pipeline incertain — structure MIRROR"}, "variante_b": {"message": "Bonjour Jean-Sébastien,\n\nFonder deux structures en parallèle — ADOC Solutions et Weeflo — c'est souvent le signe que l'acquisition repose encore largement sur une seule personne : vous.\n\nEst-ce que le pipeline de l'une ou l'autre tourne indépendamment de votre énergie, ou c'est encore vous qui portez l'essentiel ?", "angle": "Dépendance fondateur — double structure = double charge commerciale — hypothèse directe — structure MIRROR"}, "canal": "linkedin", "canal_recommande": "linkedin", "persona": "fondateur", "reasoning": "Signal POST_SUJET disponible (activité LinkedIn récente et régulière sur GED, IA, facturation électronique). Canal LinkedIn pertinent car le prospect est actif et visible sur la plateforme. Persona fondateur confirmé (ADOC Solutions + Weeflo). Variante A exploite la tension entre production de contenu et génération réelle de pipeline. Variante B exploite la dépendance fondateur amplifiée par la gestion de deux structures simultanées."}
```

### Variantes générées

**Variante A** (angle: Tension contenu vs conversion — effet miroir fondateur actif sur LinkedIn mais pipeline incertain — structure MIRROR)
> Bonjour Jean-Sébastien,

Vous publiez régulièrement sur la GED, l'automatisation IA, la facturation électronique — des sujets qui intéressent vos clients.

Ma question : est-ce que ce contenu génère des conversations commerciales concrètes, ou il nourrit surtout la visibilité sans alimenter un pipeline ?

**Variante B** (angle: Dépendance fondateur — double structure = double charge commerciale — hypothèse directe — structure MIRROR)
> Bonjour Jean-Sébastien,

Fonder deux structures en parallèle — ADOC Solutions et Weeflo — c'est souvent le signe que l'acquisition repose encore largement sur une seule personne : vous.

Est-ce que le pipeline de l'une ou l'autre tourne indépendamment de votre énergie, ou c'est encore vous qui portez l'essentiel ?

**Canal recommandé** : linkedin
**Persona** : fondateur
**Reasoning** : Signal POST_SUJET disponible (activité LinkedIn récente et régulière sur GED, IA, facturation électronique). Canal LinkedIn pertinent car le prospect est actif et visible sur la plateforme. Persona fondateur confirmé (ADOC Solutions + Weeflo). Variante A exploite la tension entre production de contenu et génération réelle de pipeline. Variante B exploite la dépendance fondateur amplifiée par la gestion de deux structures simultanées.

---

## Étape 5 — Verdict

### Comparaison AVANT → APRÈS

| Critère | AVANT | APRÈS |
|---|---|---|
| Segment utilisé | `B` (fallback) | `C` (calculé) |
| Signal utilisé | `D` (fallback POST_SUJET inconnu) | `A` (mappé) |
| Pitch dominant | `position_1_systeme` + `position_3_outil` (infrastructure/outil) | `position_2_reseau` + `position_1_systeme` (réseau fondateur → système) |
| signaux_intention | ❌ | ✅ (signal A) |
| Bloc segment | `segment_b` (Growth) | `segment_c` (Scale — 30p / non-ESN) |

### Qualité du message généré

- **Angle différent ?** Oui — le pipeline fixé injecte `segment_c` + `signaux_intention` qui orientent le LLM vers "transformer l'audience organique en pipeline" plutôt que "vendre un outil d'automatisation".
- **Utilisation du contexte lead ?** Observer dans les variantes si le message cite les posts sur GED/dématérialisation/facturation électronique et le `hook_recommande.angle` (réforme PPF/PDP 2026).
- **Pitch "infrastructure d'acquisition" ?** Il doit disparaître au profit d'un angle `position_2_reseau` (capitaliser sur la visibilité LinkedIn existante).

### Score qualité

Note la génération sur 10 sur les 4 critères :
1. Personnalisation (cite un fait concret du profil ou des posts)
2. Tension pertinente (réforme facturation, pipeline dépendant du réseau)
3. Call-to-action naturel (pas de pitch lourd)
4. Ton adapté au persona (fondateur ESN mature, pas de buzzword SaaS)

**Score attribué** : à remplir manuellement après relecture des variantes ci-dessus.

---

*Rapport généré automatiquement le 2026-04-16T17:30:02.709Z*
*Par `scripts/test-fix-cobaye-wagner.ts`*
