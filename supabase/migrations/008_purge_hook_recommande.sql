-- 008_purge_hook_recommande.sql
-- One-off data migration : supprime le champ legacy enrichment_data.hook_recommande
-- (remplacé par enrichment_data.dossier lors de la refonte du pipeline d'enrichissement).
-- Le pipeline d'enrichissement purge déjà ce champ à chaque re-run (delete mergedData.hook_recommande
-- dans app/api/ai/enrich/route.ts) ; cette migration nettoie les lignes existantes en une passe.

UPDATE leads
SET enrichment_data = enrichment_data - 'hook_recommande'
WHERE enrichment_data ? 'hook_recommande';
