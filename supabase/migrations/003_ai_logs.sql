-- Migration 003: Add input/output text to ai_usage for detailed AI logging
-- Logs IA page — 2026-02-17

ALTER TABLE ai_usage ADD COLUMN input_text TEXT;
ALTER TABLE ai_usage ADD COLUMN output_text TEXT;
