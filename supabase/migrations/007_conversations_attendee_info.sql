-- Migration 007: Add attendee info columns to conversations
-- Purpose: Store Unipile attendee name & profile URL so we can display
-- the contact name even when the conversation is not matched to a lead.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS attendee_name TEXT,
  ADD COLUMN IF NOT EXISTS attendee_profile_url TEXT;

-- Backfill: existing conversations with a matched lead get the lead name
UPDATE conversations c
SET attendee_name = l.first_name || ' ' || l.last_name
FROM leads l
WHERE c.lead_id = l.id
  AND c.attendee_name IS NULL;
