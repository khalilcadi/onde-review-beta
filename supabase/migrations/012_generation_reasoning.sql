-- Add generation_reasoning column to actions table
-- Stores the AI's reasoning/explanation for why it generated a specific message
ALTER TABLE actions ADD COLUMN IF NOT EXISTS generation_reasoning TEXT;
