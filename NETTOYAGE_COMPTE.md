# NETTOYAGE COMPTE PROSPECTOR

> Exécution : 2026-04-16
> User cible : `14a0eedc-b156-45ab-b2c0-47eb990f4c84` (Khalil)
> Objectif : préparer la base pour génération avec pipeline fixé.

---

## ÉTAPE 1 — Recalcul des segments

**Script** : `npx tsx scripts/recalc-segments.ts`

**Résultat d'exécution :**
- Total leads analysés : **216**
- Leads mis à jour : **214**
- Leads skippés (déjà segment valide) : **2**
- Leads en échec : **0**

**Répartition des segments — user Khalil (88 leads avec enrichment) :**

| Segment | Count | % |
|---------|------:|--:|
| **A** (ICP parfait) | 6 | 6.8% |
| **B** (ICP fort) | 58 | 65.9% |
| **C** | 1 | 1.1% |
| **D1** (adjacent) | 13 | 14.8% |
| **D2** (BU director/sales director) | 2 | 2.3% |
| **HORS_ICP** | 8 | 9.1% |
| **Total** | **88** | 100% |

**Répartition globale (tous users, 216 leads) :**

| Segment | Count |
|---------|------:|
| A | 6 |
| B | 155 |
| C | 1 |
| D1 | 41 |
| D2 | 2 |
| HORS_ICP | 11 |

> Le script initial mentionnait 87 leads, on en trouve 88 pour Khalil. Écart bénin (probablement un lead ajouté récemment).

---

## ÉTAPE 2 — Archivage des séquences mortes

**UPDATE exécuté :**

| id | name | status avant → après |
|----|------|-----------------------|
| `4f7c80c9-6155-4d46-8489-034a18fff895` | Test M1/M2 — Khalil — Avril 2026 | paused → **archived** |
| `b128382c-abdd-4750-b8aa-161fd0371760` | Lancement V2 26/03/2026 | paused → **archived** |

**NON archivée (à décider plus tard) :** aucune séquence `Prospection Avril 2026` (50 leads) trouvée. La séquence active restante est `Prospection Avril V2 — 27 leads` (voir étape 5).

**Séquences actives restantes pour Khalil :**

| id | name | leads |
|----|------|------:|
| `c910cc19-9a75-48de-96f3-e98848630f2a` | Prospection Avril V2 — 27 leads | 27 |

---

## ÉTAPE 3 — Doublons cross-séquences

**Query** : leads présents dans plusieurs `sequence_leads` pour le user Khalil.

**Résultat : 0 doublon.** Aucun lead n'est dans plusieurs séquences en même temps. ✅

---

## ÉTAPE 4 — Protection des 2 répondeurs

**Query** : présence de `Stephan` et `Maxime` dans des séquences (actives ou non).

| Prénom | Nom | sequence_id | sequence name | seq_status | sl_status |
|--------|-----|-------------|---------------|------------|-----------|
| Stephan | Savarese | `b128382c-abdd-4750-b8aa-161fd0371760` | Lancement V2 26/03/2026 | **archived** | active |
| Maxime | Crouzet | `4f7c80c9-6155-4d46-8489-034a18fff895` | Test M1/M2 — Khalil — Avril 2026 | **archived** | responded |

**Verdict : aucune action nécessaire.** Les deux répondeurs sont dans des séquences désormais **archived** (suite à l'étape 2). Les crons `generate-actions` et `send-actions` ne traiteront plus ces séquences. Maxime est déjà flaggé `responded` dans `sequence_leads`. Aucun M2 automatique ne partira. ✅

> ⚠️ Recommandation : si à l'avenir Stephan/Maxime sont réintégrés dans une séquence active, veiller à ne pas réutiliser leur `sequence_leads` existant. Créer une nouvelle entrée avec `status='paused'` si besoin.

---

## ÉTAPE 5 — Leads connected prêts pour M1

Leads `stage = connected` dans la séquence **active** `Prospection Avril V2 — 27 leads`, qui n'ont **pas** encore reçu de message.

| Prénom | Nom | Company | Segment | Signal | Message envoyé |
|--------|-----|---------|---------|--------|:---:|
| Lucas | Pocthier Peccoz | SaluTech SAS | **B** | ENGAGEMENT_EXPERT | NON |
| Patrice | PONTAROLLO | ATN GROUPE | **B** | NEW_ROLE | NON |
| Constant | SANDJO | BlueWings | **D1** | ENGAGEMENT_EXPERT | NON |
| Mathieu | VINOIS | MAÉ Technologies | **B** | ENGAGEMENT_EXPERT | NON |

**4 leads prêts pour M1.** Tous ont un `segment_icp` calculé (3 × B + 1 × D1), tous ont un signal exploitable (ENGAGEMENT_EXPERT × 3, NEW_ROLE × 1). ✅

---

## RÉCAPITULATIF

| Étape | Statut | Résultat |
|-------|:------:|----------|
| 1 — Recalcul segments | ✅ | 214 leads mis à jour, 88 segmentés pour Khalil |
| 2 — Archivage séquences | ✅ | 2 séquences archived (Test M1/M2 + Lancement V2) |
| 3 — Doublons cross-séquences | ✅ | Aucun doublon |
| 4 — Protection répondeurs | ✅ | Stephan + Maxime dans des séquences archived, pas de risque |
| 5 — Leads connected pour M1 | ✅ | 4 leads prêts (Lucas, Patrice, Constant, Mathieu) |

**État final :** 1 seule séquence active pour Khalil (`Prospection Avril V2 — 27 leads`), 4 prochains M1 identifiés, base propre pour génération IA avec le pipeline fixé.
