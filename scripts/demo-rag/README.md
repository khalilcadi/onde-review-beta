# RAG démo — blocs à importer

Dépose ici **1 fichier `.json` par bloc** (généré depuis le site du prospect), puis lance :

```bash
npx tsx scripts/seed-demo-rag.ts
```

Chaque fichier doit avoir la forme `{ bloc_id, title, sections, metadata }` avec un
`bloc_id` parmi : `icp_segments`, `pain_points`, `messaging_angles`, `offre_produit`,
`qualification`.

Les blocs sont poussés dans le RAG du **seul user démo** (`demo@prospector.app`) via
`user_rag_data` — tes vrais users ne sont pas touchés. Effet immédiat, sans restart.

Pour revenir aux defaults : supprime les fichiers ici / reset via Settings > Knowledge.
