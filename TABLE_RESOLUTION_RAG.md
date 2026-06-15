# Table de résolution RAG — Mapping déterministe

> Fichier de référence pour implémenter `resolveRagSections()` dans `lib/rag/mapping.ts`

---

## Principe

Chaque appel AI reçoit uniquement les **sections pertinentes** des 5 blocs RAG.
La résolution est déterministe : `(promptType, segment, signalType)` → `section_ids[]`.

---

## Mapping des signaux Gojiberry vers le système M1

| Signal Gojiberry | Type M1 | Logique |
|---|---|---|
| `ENGAGEMENT_KEYWORD` | A (activité LinkedIn) | Le lead s'intéresse au sujet du mot-clé |
| `ENGAGEMENT_EXPERT` | A (activité LinkedIn) | Le lead suit du contenu B2B growth |
| `COMPETITOR_ENGAGEMENT` | A (activité LinkedIn) | Le lead engage avec contenu concurrent |
| `NEW_ROLE` | B (actualité entreprise) | Changement de poste récent |
| `ICP_TOP_ACTIVE` | C (signal marché) | Très actif LinkedIn, pas d'intent spécifique |
| Aucun signal | D (ICP pur) | Pas de signal détecté |

---

## Résolution pour M1 (premier message)

### Segments A/B/C (structures B2B classiques)

| Contexte | icp_segments | pain_points | messaging_angles | offre_produit |
|---|---|---|---|---|
| **Segment A + signal D** | `segment_a` | `pp_generiques_b2b` | `position_4_personne` | `vue_ensemble` |
| **Segment A + signal A** | `segment_a` | `pp_generiques_b2b` | `position_4_personne`, `position_1_systeme` | `vue_ensemble` |
| **Segment A + signal B** | `segment_a` | `pp_generiques_b2b` | `position_0_intention`, `position_4_personne` | `vue_ensemble` |
| **Segment A + signal C** | `segment_a` | `pp_generiques_b2b` | `position_4_personne` | `vue_ensemble` |
| **Segment B + signal D** | `segment_b` | `pp_generiques_b2b` | `position_1_systeme`, `position_3_outil` | `vue_ensemble` |
| **Segment B + signal A** | `segment_b` | `pp_generiques_b2b` | `position_1_systeme`, `position_3_outil` | `vue_ensemble` |
| **Segment B + signal B** | `segment_b` | `pp_generiques_b2b` | `position_0_intention`, `position_3_outil` | `vue_ensemble` |
| **Segment B + signal C** | `segment_b` | `pp_generiques_b2b` | `position_1_systeme` | `vue_ensemble` |
| **Segment C + signal D** | `segment_c` | `pp_generiques_b2b` | `position_2_reseau`, `position_4_personne` | `vue_ensemble` |
| **Segment C + signal A** | `segment_c` | `pp_generiques_b2b` | `position_2_reseau`, `position_1_systeme` | `vue_ensemble` |
| **Segment C + signal B** | `segment_c` | `pp_generiques_b2b` | `position_0_intention`, `position_2_reseau` | `vue_ensemble` |
| **Segment C + signal C** | `segment_c` | `pp_generiques_b2b` | `position_2_reseau` | `vue_ensemble` |

### Segments D1/D2 (ESN / Cabinets)

| Contexte | icp_segments | pain_points | messaging_angles | offre_produit |
|---|---|---|---|---|
| **D1 + signal D** | `segment_d1`, `triple_pipeline` | `pp_esn_intercontrat` | `position_2_reseau`, `position_0_intention` | `vue_ensemble`, `triple_pipeline_detail` |
| **D1 + signal A** | `segment_d1`, `triple_pipeline` | `pp_esn_intercontrat`, `pp_esn_croyances` | `position_0_intention`, `position_3_outil` | `vue_ensemble`, `triple_pipeline_detail` |
| **D1 + signal B** | `segment_d1`, `triple_pipeline` | `pp_esn_intercontrat` | `position_0_intention` | `vue_ensemble`, `triple_pipeline_detail` |
| **D1 + signal C** | `segment_d1`, `triple_pipeline` | `pp_esn_intercontrat` | `position_0_intention`, `position_2_reseau` | `vue_ensemble`, `triple_pipeline_detail` |
| **D2 + signal D** | `segment_d2`, `triple_pipeline` | `pp_esn_intercontrat`, `pp_commerciaux` | `position_0_intention` | `vue_ensemble`, `triple_pipeline_detail` |
| **D2 + signal A** | `segment_d2`, `triple_pipeline` | `pp_esn_intercontrat`, `pp_commerciaux` | `position_0_intention`, `position_1_systeme` | `vue_ensemble`, `triple_pipeline_detail` |
| **D2 + signal B** | `segment_d2`, `triple_pipeline` | `pp_esn_intercontrat`, `pp_commerciaux` | `position_0_intention` | `vue_ensemble`, `triple_pipeline_detail` |
| **D2 + signal C** | `segment_d2`, `triple_pipeline` | `pp_esn_intercontrat`, `pp_commerciaux` | `position_0_intention` | `vue_ensemble`, `triple_pipeline_detail` |

### Sections toujours injectées pour M1

Ces sections sont ajoutées à chaque appel M1 quel que soit le contexte :
- `messaging_angles.vocabulaire`
- `icp_segments.signaux_intention` (uniquement si signal A ou B)

---

## Résolution pour M2 (relances et réponses)

### Situation 2 — Pas de réponse (séquence automatique)

| Contexte | icp_segments | pain_points | messaging_angles | offre_produit | qualification |
|---|---|---|---|---|---|
| **Segment A/B/C** | Section du segment | `pp_generiques_b2b` | — | — | — |
| **Segment D1** | `segment_d1` | `pp_esn_intercontrat` | — | — | — |
| **Segment D2** | `segment_d2` | `pp_commerciaux` | — | — | — |

> M2 situation 2 reçoit peu de RAG — le prompt et les exemples intégrés suffisent pour des relances courtes et humaines.

### Situation 3 — Dernier message

Aucun RAG injecté. Le prompt M2 a les exemples intégrés pour la situation 3.

### Situation 1 — Lead répond (inbox)

| Contexte | icp_segments | pain_points | offre_produit | qualification |
|---|---|---|---|---|
| **Lead répond (question générale)** | Section du segment | Section du segment | — | `questions_diagnostic` |
| **Lead répond (question produit)** | Section du segment | Section du segment | `vue_ensemble`, `composants` | `questions_diagnostic`, `closing` |
| **Lead répond (objection prix)** | Section du segment | — | `pricing` | `obj_prix`, `closing` |
| **Lead répond (objection confiance)** | Section du segment | — | `arc_framework` | `obj_confiance` |
| **Lead répond (objection résultats)** | Section du segment | — | — | `obj_resultats` |
| **Lead ESN (objection spécifique)** | Section du segment | `pp_esn_croyances` | `triple_pipeline_detail` | `obj_esn` |
| **Lead répond (conformité/données)** | — | — | — | `obj_conformite` |

> Pour M2 situation 1 dans l'inbox : le système détecte le type de réponse du lead (question produit, objection, etc.) et injecte le RAG correspondant. En cas de doute, injecter les sections "question générale".

---

## Estimation tokens par cas

| Cas | Sections injectées | Tokens estimés |
|---|---|---|
| M1 Segment B + signal A | ~8 sections | ~1 200 tokens |
| M1 Segment D1 + signal B | ~10 sections | ~1 600 tokens |
| M2 Situation 2 (relance simple) | ~2-3 sections | ~400 tokens |
| M2 Situation 1 (lead pose question produit) | ~6-8 sections | ~1 200 tokens |
| M2 Situation 3 (dernier message) | 0 sections | 0 tokens |

---

## Implémentation TypeScript — signature

```typescript
type PromptType = 'M1' | 'M2';
type M2Situation = 'reponse' | 'relance' | 'dernier_message';
type SignalType = 'A' | 'B' | 'C' | 'D';
type Segment = 'A' | 'B' | 'C' | 'D1' | 'D2';

interface ResolvedSections {
  icp_segments: string[];
  pain_points: string[];
  messaging_angles: string[];
  offre_produit: string[];
  qualification: string[];
}

function resolveRagSections(
  promptType: PromptType,
  segment: Segment,
  signalType: SignalType,
  m2Situation?: M2Situation,
  leadResponseType?: string // pour M2 situation 1 : 'general' | 'question_produit' | 'objection_prix' | 'objection_confiance' | 'objection_resultats' | 'objection_esn' | 'conformite'
): ResolvedSections
```
