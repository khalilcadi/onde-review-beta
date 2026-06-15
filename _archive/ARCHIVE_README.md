# _archive/ - Fichiers archivés

> Archivage effectué le 2026-02-12 lors de l'audit post-MVP.
> Ces fichiers ne sont plus utilisés par le code actif mais conservés pour référence.

---

## Fichiers archivés

### lib/mock-data.ts
**Raison** : Données mock legacy. Toutes les pages dashboard ont été migrées vers Server Actions + Supabase (Session F). Plus importé par aucun fichier.

### lib/ai/claude.ts
**Raison** : Placeholder Phase 1 avec fonctions `generateMessage()` et `scoreLead()` qui retournent des valeurs en dur. Remplacé par le service IA unifié `lib/ai/service.ts` (Session G).

### lib/ai/perplexity.ts
**Raison** : Simple re-export de `callPerplexity` depuis `lib/ai/service.ts`. Jamais importé par aucun fichier - les routes utilisent directement `service.ts`.

### docs/BRAINSTORM.md
**Raison** : Notes de brainstorming de la phase d'idéation. Non référencé dans le code. Valeur historique uniquement.

### docs/PROMPT_UI_POLISH.md
**Raison** : Prompts utilisés pendant la Phase 4 (polish UI). Le travail est terminé, le fichier n'est plus utile.

### docs/PROMPT_WORKBENCH.md
**Raison** : Prompts de workbench utilisés pendant le développement. Le travail est terminé, le fichier n'est plus utile.

### prompts/ (dossier complet)
**Raison** : Fichiers source markdown des 4 prompts agents (prospection, scoring, enrichissement, conversational) + archive zip. Le contenu a été compilé dans `lib/ai/prompts/defaults.ts`. Les fichiers source ne sont plus nécessaires.

**Contenu** :
- `00_SYNTHESE.md`
- `01_PROSPECTION.md`
- `02_SCORING.md`
- `03_ENRICHISSEMENT.md`
- `04_CONVERSATIONAL.md`
- `files (2).zip`

### RAG JSON/ (dossier complet)
**Raison** : Ancienne version des blocs RAG avec nommage non standard (`_BLOC_1__POSITIONNEMENT_SMART.json`, etc.). Remplacé par le dossier `knowledge/` qui contient les mêmes 14 blocs avec un nommage propre (`positionnement.json`, `icp.json`, etc.). C'est `knowledge/` qui est chargé par `lib/rag/context.ts`.

### RAG DOCX/ (dossier complet)
**Raison** : Documents Word originaux (.docx) source des blocs RAG. Le contenu a été converti en JSON dans `knowledge/`. Les fichiers source ne sont plus nécessaires au runtime.

---

## Fichier supprimé (pas archivé)

### nul
Fichier junk de 118 octets contenant la sortie d'une commande `ls` échouée. Supprimé directement.

---

## Fichiers conservés (semblaient inutilisés mais gardés)

| Fichier | Raison de conservation |
|---------|----------------------|
| `DECISIONS.md` | Référencé dans CLAUDE.md (x3), `lib/constants.ts`, `lib/scheduling.ts` |
| `PROMPTS_ORCHESTRATOR.md` | Guide d'orchestration des sessions de dev (workflow actif) |
| `hooks/use-settings.ts` | Encore utilisé par `settings/page.tsx` |
| `tasks/todo.md` + `tasks/lessons.md` | Workflow de développement actif |
| `knowledge/` | Base RAG active, chargée par `lib/rag/context.ts` |
