-- 013: Add generation_data JSONB column to actions
-- Stores full M1 response (variante_a + variante_b + reasoning) or M2 response

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS generation_data JSONB DEFAULT NULL;

COMMENT ON COLUMN actions.generation_data IS 'Full AI generation response JSON (M1 variants, M2 response, canal info)';
