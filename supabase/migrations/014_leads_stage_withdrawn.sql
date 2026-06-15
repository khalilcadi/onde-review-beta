-- Migration 014: Add 'withdrawn' to the allowed lead.stage values.
-- Used when a sent LinkedIn invitation is cancelled/withdrawn so the lead can
-- be relaunched later (manual tag relance:YYYY-MM-DD).

ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_leads_stage;

ALTER TABLE leads ADD CONSTRAINT chk_leads_stage
  CHECK (stage IN (
    'to_invite',
    'invited',
    'connected',
    'in_sequence',
    'responded',
    'meeting',
    'closed',
    'withdrawn'
  ));
