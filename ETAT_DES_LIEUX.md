# ETAT DES LIEUX — Compte Prospector Khalil

> Genere le 2026-04-16 — user_id `14a0eedc-b156-45ab-b2c0-47eb990f4c84`

---

## 1. Dashboard — Vue d'ensemble des leads

### Totaux

| Metrique | Valeur |
|---|---|
| **Total leads** | **88** |
| Enrichis | 88 (100 %) |
| Non enrichis | 0 |
| Avec segment ICP calcule | **1 / 88** (Wagner cobaye "C") |
| Sans segment ICP | **87** (fallback / nouveau scoring a lancer) |
| Source unique | 100 % `gojiberry` |

### Par status

| Status | Total | % |
|---|---:|---:|
| hot | 82 | 93.2 % |
| warm | 4 | 4.5 % |
| cold | 2 | 2.3 % |

### Par stage

| Stage | Total | % |
|---|---:|---:|
| invited | 62 | 70.5 % |
| in_sequence | 11 | 12.5 % |
| to_invite | 9 | 10.2 % |
| connected | 5 | 5.7 % |
| responded | 1 | 1.1 % |

### Par signal (post-enrichissement)

| Signal type | Total |
|---|---:|
| ENGAGEMENT_EXPERT | 35 |
| NEW_ROLE | 27 |
| ICP_TOP_ACTIVE | 13 |
| ENGAGEMENT_KEYWORD | 10 |
| POST_SUJET | 2 |
| ACTUALITE | 1 |

**Observation :** 1 seul lead sur 88 a un `segment_icp` calcule. Les 87 autres ont un signal + enrichissement mais ont echoue au scoring (fallback). **Le fix 2 (signal post-enrichissement) benefice potentiellement aux 87.**

---

## 2. Sequences

| Sequence | Status | Leads total | Actifs | Paused | Completed | Steps |
|---|---|---:|---:|---:|---:|---:|
| **Prospection Avril V2 — 27 leads** | active | 27 | 27 | 0 | 0 | 4 |
| Prospection Avril 2026 — 28 leads | paused | 50 | 50 | 0 | 0 | 4 |
| Test M1/M2 — Khalil — Avril 2026 | paused | 7 | 5 | 0 | 1 | 3 |
| Lancement V2 26/03/2026 | paused | 4 | 4 | 0 | 0 | 5 |

### Structure "Prospection Avril V2" (seule active)

| # | Type | Delai | Mode |
|---:|---|---:|---|
| 1 | invitation | 0 j | ai |
| 2 | message | 0 j | ai |
| 3 | message | 2 j | ai |
| 4 | message | 3 j | ai |

**Observation :** 3 sequences en pause dont une ("Prospection Avril 2026") contient **50 leads bloques en step 1 active** — risque de re-processing au redemarrage.

---

## 3. Historique d'actions

### Resume global

| Type | sent | cancelled | failed | Total |
|---|---:|---:|---:|---:|
| invitation | **84** | 29 | 0 | 113 |
| message | **19** | 69 | 0 | 88 |
| visit | 19 | 18 | 6 | 43 |

**Taux de cancel sur messages : 78.4 %** (69 / 88) — tres eleve, signal d'un cycle "genere -> valide -> fail ou annule".

### 19 messages envoyes (ordre chronologique inverse)

| Date | Lead | Entreprise | Stage | Signal | Aperçu |
|---|---|---|---|---|---|
| 09/04 08:02 | Franck LAMBOT | PulseValues | in_sequence | ENGAGEMENT_EXPERT | Question rapide : quel est votre plus grand defi... |
| 07/04 16:36 | Anthony D. | Holirisk | in_sequence | NEW_ROLE | Question directe : entre la delivery, les salons... |
| 07/04 16:22 | Stephan Savarese | TechnoCarbon | in_sequence | ICP_TOP_ACTIVE | Question directe : quand on lance une production... |
| 07/04 16:10 | Julian PERRIER | Lead up coaching | in_sequence | ENGAGEMENT_EXPERT | Vous aidez des dirigeants a sortir de l'ops... |
| 07/04 15:58 | Alain BONNETAUD | PRIMOE | in_sequence | NEW_ROLE | Quand on structure un groupe comme DIPTYQUE... |
| 07/04 15:41 | Julia Lesdema | J.Lesdema | in_sequence | ENGAGEMENT_KEYWORD | J'ai vu que le sujet ICP vous parlait... |
| 07/04 15:31 | Valerio Laghi | ZebraMed | in_sequence | ICP_TOP_ACTIVE | Ce que je vois souvent chez les fondateurs TechBio... |
| 07/04 15:16 | Eliott Moulin | Line'up | in_sequence | ENGAGEMENT_EXPERT | j'ai vu votre post sur le pivot vers les landing... |
| 07/04 15:01 | Julien Larzilliere | infoswitch.fr | in_sequence | NEW_ROLE | Je vois que vous etes en train de lancer votre CRM... |
| 07/04 14:46 | Ingmar Nopens | Earth Plus | in_sequence | NEW_ROLE | Ce que j'observe souvent quand on arrive a la tete... |
| 03/04 08:14 | Valerio Laghi | ZebraMed | in_sequence | ICP_TOP_ACTIVE | Le prix i-Lab, l'arrivee chez Future4Care... |
| 02/04 13:36 | Julia Lesdema | J.Lesdema | in_sequence | ENGAGEMENT_KEYWORD | Quand on accompagne des dirigeants sur la clarte... |
| 02/04 13:20 | **Maxime Crouzet** | LaMeDuSe | **responded** | NEW_ROLE | Arriver en tant que CSO dans une structure comme LaMeDuSe... |
| 02/04 13:02 | Julien Larzilliere | infoswitch.fr | in_sequence | NEW_ROLE | Une question directe avec tous vos projets... |
| 02/04 12:44 | Eliott Moulin | Line'up | in_sequence | ENGAGEMENT_EXPERT | Bravo pour vos landing pages en 48h a prix fixe... |
| 02/04 09:12 | Ingmar Nopens | Earth Plus | in_sequence | NEW_ROLE | Quand on prend les renes d'une structure... |
| 02/04 08:52 | Ahmet Akyurek | KRATEO | in_sequence | POST_SUJET | Merci pour la connexion Ahmet ! J'ai remarque... |

### Invitations envoyees — vagues

| Vague | Date | Volume | Commentaire |
|---|---|---:|---|
| J-0 (aujourd'hui) | 16/04 | 18 | Batch Prospection Avril V2 (1 responded, 4 connected, 13 invited) |
| J-9 | 07/04 | 10 | Sequence Avril V2 (tous invited) |
| J-13 | 03/04 | 16 | Premiere vague V2 |
| J-14 | 02/04 | 8 | |
| J-17 | 30/03 | 6 | |
| J-20 | 27/03 | 7 | |
| J-21 | 26/03 | 10 | Lancement V2 |

### Actions en attente

Aucune action `pending` / `validated` / `processing` en file d'attente.

### Taux de cancel sur messages

| sent | cancelled | pending | total | taux cancel |
|---:|---:|---:|---:|---:|
| 19 | 69 | 0 | 88 | **78.4 %** |

**Diagnostic :** la majorite des messages sont `cancelled` — probablement parce que la sequence avance au step suivant avant que le message soit envoye (pas de connexion acceptee a temps, ou edits manuels).

---

## 4. Conversations — qui a repondu

### Repondeurs actifs

| Lead | Entreprise | Stage | Inbound | Outbound | Dernier msg |
|---|---|---|---:|---:|---|
| **Stephan Savarese** | TechnoCarbon | in_sequence | **2** | 2 | 09/04 07:34 |
| **Maxime Crouzet** | LaMeDuSe | **responded** | 1 | 2 | 02/04 13:24 |

**2 repondeurs confirmes** sur 19 messages envoyes = taux de reponse messages ~11 %.

### Conversations "fantomes" (0 inbound, 0 outbound en DB)

10 conversations creees sans message stocke : Valerio Laghi, Julien Larzilliere, Julia Lesdema, Julian PERRIER, Eliott Moulin, Anthony D., Alain BONNETAUD, Ahmet Akyurek, Franck LAMBOT, Ingmar Nopens.

**Probablement un sync inbox incomplet** (conversations creees mais messages Unipile pas retrieved). A verifier cote sync.

---

## 5. Leads du jour (2026-04-16)

**27 leads importes aujourd'hui** (batch matin Gojiberry).

| Lead | Entreprise | Stage | Score | Signal | Segment | Bio |
|---|---|---|---:|---|---|---:|
| David Nosibor | Red Alert Labs | invited | 80 | NEW_ROLE | — | 1151 |
| JEAN SEBASTIEN WAGNER | Weeflo | to_invite | 20 | POST_SUJET | **C** | 0 |
| Paul Marta de Andrade | U-Need Consulting | to_invite | 80 | NEW_ROLE | — | 133 |
| Jean-Sylvain CHAVANNE | BZHunt | invited | 80 | NEW_ROLE | — | 1156 |
| Joël ABREU | Enova | to_invite | 80 | NEW_ROLE | — | 0 |
| Cyrille GORMAND | Covadia | to_invite | 80 | NEW_ROLE | — | 0 |
| Patrice PONTAROLLO | ATN GROUPE | connected | 80 | NEW_ROLE | — | 1407 |
| Mathieu VINOIS | MAÉ Technologies | connected | 80 | ENGAGEMENT_EXPERT | — | 0 |
| Laurent Vuillermoz | SOPHIA Engineering | to_invite | 80 | ENGAGEMENT_EXPERT | — | 551 |
| Fabrice Rivet | DEODIS | invited | 80 | ENGAGEMENT_EXPERT | — | 71 |
| Sophie Guerin | KeyWe | invited | 80 | ENGAGEMENT_EXPERT | — | 1767 |
| Beatrice de Rivet | Cenareo | to_invite | 80 | ENGAGEMENT_EXPERT | — | 0 |
| Constant SANDJO | BlueWings | connected | 80 | ENGAGEMENT_EXPERT | — | 605 |
| Eric Bazoin | Auximedia | invited | 80 | ENGAGEMENT_EXPERT | — | 677 |
| Claire des Bois de la Roche | Comet | to_invite | 80 | ENGAGEMENT_EXPERT | — | 683 |
| Rémy EMANUELE | Experteam | invited | 80 | ENGAGEMENT_EXPERT | — | 918 |
| Sébastien ROQUET | ARKETEAM | invited | 80 | ENGAGEMENT_EXPERT | — | 0 |
| Laurent Chery | Médiane Ingénierie | to_invite | 80 | ENGAGEMENT_EXPERT | — | 0 |
| Lucas Pocthier Peccoz | SaluTech SAS | connected | 80 | ENGAGEMENT_EXPERT | — | 0 |
| Florent Ribaut | Klint | invited | 80 | ENGAGEMENT_EXPERT | — | 743 |
| Hervé Brame | Bluelinea | to_invite | 80 | ENGAGEMENT_KEYWORD | — | 568 |
| Jean-Philippe LLOBERA | 2CRSi | invited | 80 | ENGAGEMENT_KEYWORD | — | 0 |
| Joseph GONNACHON | 2CRSi | invited | 80 | ENGAGEMENT_KEYWORD | — | 0 |
| Yann-Yves Cova | K-LAGAN | invited | 80 | ENGAGEMENT_EXPERT | — | 986 |
| Betty Rousseau | FIMATEC | invited | **warm 50** | ENGAGEMENT_EXPERT | — | 0 |
| Sylvain Delahodde | Ippon Technologies | invited | 80 | ENGAGEMENT_EXPERT | — | 758 |
| Badre S. | I-SHANE | invited | 80 | ENGAGEMENT_EXPERT | — | 0 |

**Observation :**
- Tous sont enrichis, scores et dans la sequence active.
- **Seul Wagner (cobaye "C")** a un segment calcule.
- 12 leads ont `bio_length = 0` (about LinkedIn vide) — le fix du pivot Wagner devrait corriger la prochaine vague.
- 4 deja `connected` (accept invitation en < 12h).

---

## 6. Couts IA

### Cumul global

| Metrique | Valeur |
|---|---:|
| Cout total | **13.80 USD** |
| Appels total | 1 272 |

### Detail par agent × modele

| Agent | Modele | Appels | Input | Output | Cached | Cout USD |
|---|---|---:|---:|---:|---:|---:|
| enrichissement | sonar-pro (Perplexity) | 275 | 1 350 937 | 99 170 | 0 | **5.54** |
| prospection | claude-opus-4-6 | 121 | 567 660 | 43 338 | 269 709 | **3.96** |
| enrichissement | claude-sonnet-4-6 | 231 | 631 777 | 37 081 | 609 693 | 1.38 |
| post_summary | claude-sonnet-4-6 | 371 | 193 194 | 23 181 | 0 | 0.93 |
| enrichissement | claude-haiku-4-5 | 155 | 653 526 | 33 991 | 199 145 | 0.82 |
| scoring | claude-sonnet-4-6 | 44 | 197 249 | 7 425 | 211 168 | 0.45 |
| conversational | claude-opus-4-6 | 3 | 47 764 | 414 | 28 460 | 0.25 |
| prospection_m1 | claude-opus-4-6 | 3 | 26 364 | 1 105 | 0 | 0.16 |
| prospection | claude-sonnet-4-5 | 28 | 14 989 | 2 605 | 493 954 | 0.13 |
| scoring | claude-opus-4-6 | 16 | 8 016 | 2 512 | 163 638 | 0.12 |
| scoring | claude-haiku-4-5 | 21 | 20 440 | 3 590 | 212 501 | 0.04 |
| scoring | claude-sonnet-4-5 | 4 | 1 346 | 910 | 41 879 | 0.02 |

### Tendance hebdomadaire

| Semaine | Appels | Cout USD |
|---|---:|---:|
| 2026-04-13 (en cours) | **595** | **4.38** |
| 2026-04-06 | 48 | 1.59 |
| 2026-03-30 | 57 | 2.03 |
| 2026-03-23 | 155 | 1.28 |
| 2026-03-16 | 243 | 2.62 |
| 2026-03-09 | 81 | 0.53 |
| 2026-03-02 | 38 | 0.44 |
| 2026-02-23 | 40 | 0.74 |

**Observation :** la semaine en cours a deja **4.38 USD** (x10 vs semaine precedente) avec le batch du 16/04 — scoring a `claude-opus-4-6` et enrichissement x2 modeles font grimper la facture. Perplexity seule = 40 % du total.

---

## 7. Recommandations

### Priorite 1 — Recalcul scoring (87 leads)

**87 / 88 leads** ont un signal + enrichissement complet mais **aucun `segment_icp`** calcule. Ils beneficient tous du fix 2 (signal post-enrichissement).

-> Lancer `scripts/recalc-segments.ts` sur ces 87 leads.

### Priorite 2 — Investiguer conversations vides

**10 conversations** ont `inbound=0, outbound=0` alors que le lead a recu un message. Soit :
- le sync Unipile ne retrieve pas les messages apres envoi ;
- soit les messages sont stockes mais la contrainte `UNIQUE(conversation_id, timestamp)` les bloque.

-> Verifier `syncInbox()` dans `lib/actions/conversations.ts` et les logs webhook `message.received`.

### Priorite 3 — Taux de cancel messages anormal (78.4 %)

69 messages annules sur 88 generes. Hypotheses :
- sequences en `paused` -> scheduling perd les messages ;
- avancement sequence plus rapide que l'envoi ;
- invitations non acceptees -> message M1 annule au step suivant.

-> Croiser `actions.status='cancelled'` avec `actions.error_message` et `sequence_leads.current_step` pour identifier la cause racine.

### Priorite 4 — Sequences mortes a archiver

3 sequences sont en `paused` avec des leads `active` :
- **Prospection Avril 2026** : 50 leads actifs, 50 en step 1 -> si on la relance, risque de double-contact massif.
- **Test M1/M2** : 5 leads actifs (1 completed) -> test fini, a archiver.
- **Lancement V2 26/03** : 4 leads actifs -> anciennete, a migrer ou archiver.

-> Decider : archive (`status='archived'`) ou migrer leads vers la sequence active V2.

### Priorite 5 — Leads connected dans sequence V2 (bientot M1)

5 leads ont accepte l'invitation (`stage=connected`) et sont en step 1 de la sequence active :
- Lucas Pocthier Peccoz (SaluTech)
- Constant SANDJO (BlueWings)
- Patrice PONTAROLLO (ATN GROUPE)
- Mathieu VINOIS (MAÉ Technologies)
- Marieliesse Gouilliard (Autoplay — sequence **paused**)

-> Le cron devrait generer les M1 tres bientot. Verifier que Marieliesse sort de la sequence paused OU y reste propre.

### Priorite 6 — Cout IA en hausse

Semaine en cours +175 % vs moyenne 4 semaines. Drivers :
- Scoring migre sur Opus (16 appels = 0.12 USD) alors que Haiku fait le job a 0.04 USD.
- Enrichissement dedouble Sonnet + Haiku (`231 + 155` appels).

-> Choix modele : repasser scoring sur `claude-haiku-4-5` (fix signal post-enrichissement sur Haiku), retirer appels Sonnet doublons de l'enrichissement.

### Priorite 7 — Bios LinkedIn vides (~45 % des leads du jour)

12 / 27 leads du jour ont `bio_length = 0`. Impact direct sur la qualite des messages M1. A correler avec la robustesse de `explore-unipile-profile.ts`.

-> Instrumenter le fetch profil Unipile pour detecter les echecs silencieux et retry.

---

## Synthese executive

- **88 leads, 100 % enrichis** mais **1 seul segmente** -> **recalcul scoring requis**.
- **84 invitations envoyees, 5 connected, 1 responded** = taux connexion 6 %, taux reponse messages 11 %.
- **Taux de cancel messages 78 %** = signal rouge sur le scheduling.
- **10 conversations fantomes** en DB = probleme sync inbox.
- **3 sequences zombies** (paused avec leads actifs) a nettoyer.
- Cout cumule : **13.80 USD / 1 272 appels**, pic de 4.38 USD cette semaine.
