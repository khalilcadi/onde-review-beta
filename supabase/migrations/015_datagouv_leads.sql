-- Migration 015 : Sourcing data.gouv (recherche synchrone).
--
-- Crée la table `companies` = HUB CENTRAL des entreprises sourcées (pas un cache).
-- Conçue forward-compatible avec un futur join `funding_signals(siren FK companies …)`
-- (Maddyness, hors périmètre de cette session — NE PAS coder ici).
-- Branche les leads "dirigeant" sur le SIREN et rend `linkedin_url` nullable
-- (un lead dirigeant n'a pas d'URL LinkedIn à la création → sinon l'insert casse).

-- ===================
-- 1. COMPANIES (HUB)
-- ===================
CREATE TABLE IF NOT EXISTS companies (
  siren         TEXT PRIMARY KEY,
  nom           TEXT,
  naf           TEXT,
  ville         TEXT,
  date_creation DATE,
  effectif      TEXT,            -- code INSEE de tranche d'effectif salarié
  domain        TEXT,            -- nullable (renseigné plus tard par enrichissement)
  unite_legale  JSONB,           -- payload brut complet de l'API recherche-entreprises
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_naf ON companies(naf);

-- ===================
-- 2. LEADS ↔ SIREN
-- ===================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS siren TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_siren ON leads(siren);

-- Un lead dirigeant data.gouv n'a pas d'URL LinkedIn tant qu'elle n'a pas été
-- résolue (checkpoint 5) → linkedin_url devient nullable.
ALTER TABLE leads ALTER COLUMN linkedin_url DROP NOT NULL;

-- ===================
-- 3. RLS companies (calquée sur `leads`)
--    Lecture : authentifiée (pool partagé). Écriture : service_role uniquement.
-- ===================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON companies
  FOR SELECT TO authenticated
  USING (true);

-- Pas de policy INSERT/UPDATE/DELETE pour le rôle `authenticated` :
-- l'écriture (upsert) passe par le client service_role (bypass RLS) depuis
-- l'action d'import (lib/actions/import-datagouv.ts), comme les crons/webhooks.
