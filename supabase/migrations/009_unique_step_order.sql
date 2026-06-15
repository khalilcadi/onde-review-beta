-- Migration 009: Prevent duplicate step_order within a sequence
-- Adds UNIQUE constraint on (sequence_id, step_order) to enforce data integrity
-- PREREQUISITE: Duplicate step_order rows must be cleaned before applying

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_order_unique
  ON sequence_steps(sequence_id, step_order);
