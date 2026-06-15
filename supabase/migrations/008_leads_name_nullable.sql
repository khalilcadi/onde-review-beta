-- Migration 008: Make first_name and last_name nullable on leads table
-- Allows CSV import with only linkedin_url, enrichment fills the rest

ALTER TABLE leads ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN last_name DROP NOT NULL;

-- Set defaults for new rows without names
ALTER TABLE leads ALTER COLUMN first_name SET DEFAULT '';
ALTER TABLE leads ALTER COLUMN last_name SET DEFAULT '';
