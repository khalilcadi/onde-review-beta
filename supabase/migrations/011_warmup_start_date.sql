-- 011: Add warmup_start_date to linkedin_accounts
-- When set (non-null), enables progressive quota ramp-up for new accounts.
-- Existing accounts keep NULL = no warm-up (full quotas immediately).
ALTER TABLE linkedin_accounts ADD COLUMN IF NOT EXISTS warmup_start_date TIMESTAMPTZ DEFAULT NULL;
