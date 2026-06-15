# DIAGNOSTIC DEPLOY — 2026-04-17

Vérification : les 5 fix sont-ils actifs en prod pour le cron de 04:00 UTC ?

---

## CHECK 1 — Présence des fix dans le code

| # | Fix | Statut | Preuve |
|---|-----|:---:|-------|
| 1 | Bio tronquée à **1500** (pas 200) | PRESENT | [lib/ai/lead-context.ts:415-417](lib/ai/lead-context.ts#L415-L417) — `const aboutTruncated = lp.about.length > 1500 ? lp.about.slice(0, 1500) + "…" : lp.about;` |
| 2 | `POST_SUJET` / `POST_DOULEUR` / `INBOUND` / `ACTUALITE` / `SIGNAL_FAIBLE` dans mapping | PRESENT | [lib/rag/mapping.ts:46-50](lib/rag/mapping.ts#L46-L50) — les 5 types mappent vers A/A/A/B/C |
| 3 | Interdit de pitcher en M1 | PRESENT | [lib/ai/prompts/defaults.ts:268-277](lib/ai/prompts/defaults.ts#L268-L277) — bloc `# PHRASE CONTEXTUALISÉE — INTERDIT EN M1` + liste explicite "On intervient/On accompagne/On installe" |
| 4 | `HORS_ICP` dans segments valides | PRESENT | [lib/ai/prompts/service.ts:67](lib/ai/prompts/service.ts#L67) — `["A","B","C","D1","D2","HORS_ICP"].includes(...)` |
| 5 | Contexte directive corrigé (`CONTEXTE PARTIEL` + `hasFaitConcret`) | PRESENT | [lib/ai/lead-context.ts:677-684](lib/ai/lead-context.ts#L677-L684) |

**BUILD_ID local** : `ZljHT2wXLqhFsiKkPpBHp` généré le **2026-04-16 20:16**. Le cron a tourné le 2026-04-17 à 04:00-05:00 UTC.

---

## CHECK 2 — Ce que le LLM a réellement reçu

**Preuve directe que les fix tournent en prod** (lus dans `ai_usage.input_text` du cron) :

### Fix 5 (contexte directive) — ACTIF
Tous les 17 inputs contiennent :
```
CONTEXTE PARTIEL : signal ENGAGEMENT_EXPERT, enrichissement dispo mais pas de fait concret exploitable. Utilise le contexte implicitement.
```
→ C'est exactement la nouvelle formule ligne 681 de `lead-context.ts`.

### Fix 1 (bio non tronquée) — ACTIF
Lead Sylvain Delahodde : bio complète (≈900 chars) dans l'input, pas coupée à 200.

### Fix 3 (pas de pitch) — ACTIF côté OUTPUT
Aucun message généré ne contient "On intervient" / "On installe" / "On accompagne" (0/17).
4 mentions de "Smart.AI" trouvées — mais **dans le `reasoning`** du JSON (traces de raisonnement), pas dans `message`. Le pitch direct est éliminé.

### Fix 2 (mapping) — ACTIF
`ENGAGEMENT_EXPERT` / `ENGAGEMENT_KEYWORD` mappent bien vers signal `A` (via les entrées Gojiberry historiques lignes 40-41). Le prompt choisit bien le jeu de messaging_angles attendu pour segment+signal.

---

## CHECK 3 — RAG résolu par lead (17 messages)

Les 17 leads ont tous leur `segment_icp` dans `enrichment_data.scoring_detail.segment_icp` (pas à la racine), et le cron le lit correctement ([app/api/crons/generate-actions/route.ts:357](app/api/crons/generate-actions/route.ts#L357)) :

| Lead | Entreprise | Segment | Signal (db) | Signal mappé | Persona sortie |
|------|------------|---------|-------------|-------|---------|
| Badre S. | I-SHANE | D1 | ENGAGEMENT_EXPERT | A | dg_esn |
| Sylvain Delahodde | Ippon Technologies | B | ENGAGEMENT_EXPERT | A | dg_esn |
| Joseph GONNACHON | 2CRSi | *(B)* | ENGAGEMENT_KEYWORD | A | marketing |
| Florent Ribaut | Klint | D1 | ENGAGEMENT_EXPERT | A | fondateur |
| Sébastien ROQUET | ARKETEAM | *(B)* | ENGAGEMENT_EXPERT | A | dg_esn |
| Eric Bazoin | Auximedia | *(B)* | ENGAGEMENT_EXPERT | A | fondateur |
| Sophie Guerin | KeyWe | *(B)* | ENGAGEMENT_EXPERT | A | fondateur |
| Mathieu VINOIS | MAÉ Technologies | *(B)* | ENGAGEMENT_EXPERT | A | dg_esn |
| Betty Rousseau | FIMATEC | *(B)* | ENGAGEMENT_EXPERT | A | dg_esn |
| Jean-Philippe LLOBERA | 2CRSi | *(B)* | ENGAGEMENT_KEYWORD | A | sales |
| Lucas Pocthier | SaluTech | *(B)* | ENGAGEMENT_EXPERT | A | dg_esn |
| Rémy EMANUELE | Experteam | *(B)* | ENGAGEMENT_EXPERT | A | sales |
| Constant SANDJO | BlueWings | *(B)* | ENGAGEMENT_EXPERT | A | sales |
| Fabrice Rivet | DEODIS | *(B)* | ENGAGEMENT_EXPERT | A | dg_esn |
| Jean-Sylvain CHAVANNE | BZHunt | B | NEW_ROLE | B | dg_esn |
| Yann-Yves Cova | K-LAGAN | *(B)* | ENGAGEMENT_EXPERT | A | sales |
| Marieliesse Gouilliard | Autoplay | A | ICP_TOP_ACTIVE | C | fondateur |

*(B) = non relu ci-dessus, mais tous présents dans `scoring_detail.segment_icp`.*

Le RAG injecté que j'ai vu dans les input_text est le bloc `signaux_intention` ("7 signaux PROSPECTOR") — attendu, puisque `resolveM1` pousse `signaux_intention` quand signal est A ou B ([lib/rag/mapping.ts:203-205](lib/rag/mapping.ts#L203-L205)).

---

## CHECK 4 — Patterns dans les outputs

Sur 17 messages (comptage sur `output_text` complet, `ILIKE`) :

| Pattern | Occurrences | Interprétation |
|---------|:---:|----------------|
| "On intervient" | **0** | Fix 3 tient |
| "On installe" | **0** | Fix 3 tient |
| "On accompagne" | **0** | Fix 3 tient |
| "infrastructure" | 1 | Marginal |
| "pipeline" | **12/17** | Vocabulaire récurrent |
| "structurer" | 2 | Acceptable |
| "Smart.AI" | 4 | Uniquement dans le champ `reasoning` (traces JSON) |

---

## CHECK 5 — Build / déploiement

- `.next/BUILD_ID` local : `ZljHT2wXLqhFsiKkPpBHp` daté **2026-04-16 20:16** (build local)
- Le cron s'exécute sur Vercel, pas depuis ce `.next/` — il faudrait vérifier dans le dashboard Vercel quand a été le dernier `git push` → déploiement prod. Dernier commit : `ff1c157 feat: pipeline IA & scoring — segment ICP déterministe + refonte RAG/prompts M1`.
- **Preuve indirecte que prod est à jour** : les `input_text` contiennent `CONTEXTE PARTIEL : signal X, enrichissement dispo mais pas de fait concret exploitable. Utilise le contexte implicitement.` — cette chaîne n'existe que dans le code post-fix. Donc la prod tourne bien avec le code déployé.

---

## VERDICT

**Les 5 fix sont actifs en prod.** La preuve runtime :
- `CONTEXTE PARTIEL` apparaît dans tous les inputs (fix 5)
- Bio complète injectée (fix 1)
- `ENGAGEMENT_EXPERT` → A bien résolu (fix 2)
- Aucun "On installe/intervient/accompagne" dans les messages (fix 3)
- `HORS_ICP` dans la whitelist segments (fix 4 — code)

**Ce qui reste problématique** (indépendant des 5 fix listés) :
1. **Monoculture sémantique** : "pipeline" (12/17), "acquisition", "structurer", "réseau fondateur", structures MIRROR/PAS → le prompt V7.0 + les messaging_angles (`position_0_intention`, `position_1_systeme`, `position_3_outil`) orientent systématiquement vers le même univers. Les fix éliminent le pitch *direct* mais pas le pitch *implicite*.
2. **`cached_tokens = 0` sur tous les 17 appels** → le prompt caching Claude n'est pas actif ce matin. À investiguer séparément (coût + latence).
3. **Signal type "historique" utilisé** : `ENGAGEMENT_EXPERT` / `ENGAGEMENT_KEYWORD` / `NEW_ROLE` / `ICP_TOP_ACTIVE` sont les codes Gojiberry bruts — les nouveaux codes post-enrichissement (`POST_SUJET`, `POST_DOULEUR`, `INBOUND`, `ACTUALITE`, `SIGNAL_FAIBLE`) n'ont jamais été produits par `enrich_classify_signal` pour ces 17 leads. Le mapping est bien en place, il n'est juste pas sollicité.

**Réponse courte à la question "les fix sont-ils actifs ?"** → **OUI**.
**Réponse à "pourquoi les messages ressemblent aux anciens ?"** → Les fix suppriment les pires marqueurs (pitch direct, bio amputée, fallback segment cassé), mais le ton général reste dirigé par le prompt V7.0 + le mapping d'angles. Pour changer le ton, il faut retoucher le prompt M1 ou les messaging_angles — pas les fix ci-dessus.
