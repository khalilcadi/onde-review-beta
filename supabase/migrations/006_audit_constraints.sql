-- Migration 006: Audit constraints
-- Adds CHECK constraints for enum-like columns and UNIQUE indexes for data integrity

-- Lead status must be one of the valid values
ALTER TABLE leads ADD CONSTRAINT chk_leads_status
  CHECK (status IN ('cold', 'warm', 'hot', 'converted', 'lost'));

-- Lead stage must be one of the valid pipeline stages
ALTER TABLE leads ADD CONSTRAINT chk_leads_stage
  CHECK (stage IN ('to_invite', 'invited', 'connected', 'in_sequence', 'responded', 'meeting', 'closed'));

-- Action status includes all runtime states (including processing lock)
ALTER TABLE actions ADD CONSTRAINT chk_actions_status
  CHECK (status IN ('pending', 'validated', 'processing', 'sent', 'failed', 'cancelled'));

-- Action type must be a supported LinkedIn action
ALTER TABLE actions ADD CONSTRAINT chk_actions_type
  CHECK (action_type IN ('visit', 'invitation', 'message', 'inmail', 'whatsapp', 'email'));

-- Sequence lead status (responded = canonical name for lead reply)
ALTER TABLE sequence_leads ADD CONSTRAINT chk_seq_leads_status
  CHECK (status IN ('active', 'paused', 'completed', 'responded', 'exited'));

-- Global lead dedup: one lead per LinkedIn URL across all users (shared pool)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_linkedin_url_unique ON leads(linkedin_url);

-- One LinkedIn account per user (required for upsert onConflict: "user_id")
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_accounts_user_unique ON linkedin_accounts(user_id);
