-- Migration 010: Add retry_count to actions table
-- Supports transient error retry logic in send-actions cron

ALTER TABLE actions ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
