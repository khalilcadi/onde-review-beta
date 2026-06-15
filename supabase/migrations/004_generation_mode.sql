-- Migration 004: Add generation_mode to sequence_steps
-- Explicit AI vs Template toggle for message generation
-- 2026-02-12

-- Add the column with a default of 'ai'
ALTER TABLE sequence_steps
  ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'ai';

-- Backfill: existing steps with a non-null template should be 'template'
UPDATE sequence_steps
  SET generation_mode = 'template'
  WHERE template IS NOT NULL AND template != '';

-- Enforce valid values
ALTER TABLE sequence_steps
  ADD CONSTRAINT chk_generation_mode
  CHECK (generation_mode IN ('ai', 'template'));
