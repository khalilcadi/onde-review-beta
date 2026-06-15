-- Migration 003: Indexes for Unipile integration (Session H)
-- Optimizes webhook lookups and conversation matching

-- Find user by their Unipile account ID (webhook handler)
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_unipile
  ON linkedin_accounts(unipile_account_id);

-- Find conversation by Unipile chat ID (message sync + webhook)
CREATE INDEX IF NOT EXISTS idx_conversations_unipile_chat
  ON conversations(unipile_chat_id)
  WHERE unipile_chat_id IS NOT NULL;
