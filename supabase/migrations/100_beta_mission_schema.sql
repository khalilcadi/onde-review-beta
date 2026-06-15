-- ============================================================
-- PROSPECTOR - Beta Mission Schema (isolation complète)
-- ============================================================
-- Recrée le schéma applicatif complet (état final des migrations
-- 001 -> 015) dans un schéma `beta_mission` dédié, sans toucher
-- à AUCUN objet du schéma `public`.
--
-- Tables (18) : profiles, user_api_keys, user_settings, user_prompts,
--   user_rag_data, linkedin_accounts, leads, companies, lists,
--   list_leads, sequences, sequence_steps, sequence_leads, actions,
--   conversations, messages, ai_usage.
--
-- Les FK vers les utilisateurs restent en auth.users (schéma Supabase).
-- Toutes les FK internes pointent vers beta_mission.*.
-- handle_new_user N'EST PAS recréé (le trigger sur auth.users reste
-- celui du schéma public ; il n'alimente pas beta_mission.profiles).
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS beta_mission;

-- ------------------------------------------------------------
-- Fonction trigger updated_at (locale au schéma beta_mission)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION beta_mission.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- 1. PROFILES
-- ===================
CREATE TABLE beta_mission.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 2. USER API KEYS
-- ===================
CREATE TABLE beta_mission.user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  claude_key_encrypted TEXT,
  openai_key_encrypted TEXT,
  perplexity_key_encrypted TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 3. USER SETTINGS
-- ===================
CREATE TABLE beta_mission.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 4. USER PROMPTS (overrides)
-- ===================
CREATE TABLE beta_mission.user_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, agent_id)
);

-- ===================
-- 5. USER RAG DATA (overrides)
-- ===================
CREATE TABLE beta_mission.user_rag_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, data_type)
);

-- ===================
-- 6. LINKEDIN ACCOUNTS
-- ===================
CREATE TABLE beta_mission.linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unipile_account_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  account_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  warmup_start_date TIMESTAMPTZ DEFAULT NULL
);

-- ===================
-- 7. COMPANIES (HUB sourcing data.gouv)
-- ===================
CREATE TABLE beta_mission.companies (
  siren         TEXT PRIMARY KEY,
  nom           TEXT,
  naf           TEXT,
  ville         TEXT,
  date_creation DATE,
  effectif      TEXT,
  domain        TEXT,
  unite_legale  JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 8. LEADS (pool partagé)
-- ===================
CREATE TABLE beta_mission.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  title TEXT,
  company TEXT,
  linkedin_url TEXT,
  email TEXT,
  phone TEXT,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'cold',
  stage TEXT DEFAULT 'to_invite',
  tags TEXT[],
  notes TEXT,
  enrichment_data JSONB,
  siren TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_leads_status
    CHECK (status IN ('cold', 'warm', 'hot', 'converted', 'lost')),
  CONSTRAINT chk_leads_stage
    CHECK (stage IN (
      'to_invite',
      'invited',
      'connected',
      'in_sequence',
      'responded',
      'meeting',
      'closed',
      'withdrawn'
    ))
);

-- ===================
-- 9. LISTS
-- ===================
CREATE TABLE beta_mission.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 10. LIST_LEADS (junction)
-- ===================
CREATE TABLE beta_mission.list_leads (
  list_id UUID NOT NULL REFERENCES beta_mission.lists(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES beta_mission.leads(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, lead_id)
);

-- ===================
-- 11. SEQUENCES
-- ===================
CREATE TABLE beta_mission.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  persona TEXT,
  status TEXT DEFAULT 'active',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 12. SEQUENCE STEPS
-- ===================
CREATE TABLE beta_mission.sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES beta_mission.sequences(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  delay_days INTEGER DEFAULT 0,
  template TEXT,
  condition TEXT,
  step_order INTEGER NOT NULL,
  generation_mode TEXT NOT NULL DEFAULT 'ai',
  CONSTRAINT chk_generation_mode
    CHECK (generation_mode IN ('ai', 'template'))
);

-- ===================
-- 13. SEQUENCE LEADS (tracking)
-- ===================
CREATE TABLE beta_mission.sequence_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES beta_mission.sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES beta_mission.leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_seq_leads_status
    CHECK (status IN ('active', 'paused', 'completed', 'responded', 'exited'))
);

-- ===================
-- 14. ACTIONS
-- ===================
CREATE TABLE beta_mission.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES beta_mission.leads(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES beta_mission.sequences(id) ON DELETE SET NULL,
  step_id UUID REFERENCES beta_mission.sequence_steps(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  generated_message TEXT,
  final_message TEXT,
  scheduled_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  retry_count INT DEFAULT 0,
  generation_reasoning TEXT,
  generation_data JSONB DEFAULT NULL,
  CONSTRAINT chk_actions_status
    CHECK (status IN ('pending', 'validated', 'processing', 'sent', 'failed', 'cancelled')),
  CONSTRAINT chk_actions_type
    CHECK (action_type IN ('visit', 'invitation', 'message', 'inmail', 'whatsapp', 'email'))
);

COMMENT ON COLUMN beta_mission.actions.generation_data IS 'Full AI generation response JSON (M1 variants, M2 response, canal info)';

-- ===================
-- 15. CONVERSATIONS
-- ===================
CREATE TABLE beta_mission.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES beta_mission.leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  unipile_chat_id TEXT,
  status TEXT DEFAULT 'unread',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  attendee_name TEXT,
  attendee_profile_url TEXT
);

-- ===================
-- 16. MESSAGES
-- ===================
CREATE TABLE beta_mission.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES beta_mission.conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT messages_conv_timestamp_unique UNIQUE (conversation_id, timestamp)
);

-- ===================
-- 17. AI USAGE
-- ===================
CREATE TABLE beta_mission.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  input_text TEXT,
  output_text TEXT
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Companies
CREATE INDEX idx_companies_naf ON beta_mission.companies(naf);

-- Leads
CREATE INDEX idx_leads_user ON beta_mission.leads(user_id);
CREATE INDEX idx_leads_status ON beta_mission.leads(status);
CREATE INDEX idx_leads_score ON beta_mission.leads(score DESC);
CREATE INDEX idx_leads_linkedin_url ON beta_mission.leads(linkedin_url);
CREATE INDEX idx_leads_siren ON beta_mission.leads(siren);
-- Global lead dedup: one lead per LinkedIn URL across all users (shared pool)
CREATE UNIQUE INDEX idx_leads_linkedin_url_unique ON beta_mission.leads(linkedin_url);

-- LinkedIn accounts
CREATE INDEX idx_linkedin_accounts_unipile ON beta_mission.linkedin_accounts(unipile_account_id);
CREATE UNIQUE INDEX idx_linkedin_accounts_user_unique ON beta_mission.linkedin_accounts(user_id);

-- Actions
CREATE INDEX idx_actions_user_status ON beta_mission.actions(user_id, status);
CREATE INDEX idx_actions_scheduled ON beta_mission.actions(scheduled_at)
  WHERE status = 'validated';
CREATE INDEX idx_actions_lead ON beta_mission.actions(lead_id);

-- Conversations
CREATE INDEX idx_conversations_user ON beta_mission.conversations(user_id);
CREATE INDEX idx_conversations_status ON beta_mission.conversations(status);
CREATE INDEX idx_conversations_unipile_chat ON beta_mission.conversations(unipile_chat_id)
  WHERE unipile_chat_id IS NOT NULL;

-- Messages
CREATE INDEX idx_messages_conversation ON beta_mission.messages(conversation_id);

-- Sequence leads
CREATE INDEX idx_sequence_leads_status ON beta_mission.sequence_leads(status)
  WHERE status = 'active';
CREATE INDEX idx_sequence_leads_sequence ON beta_mission.sequence_leads(sequence_id);

-- Sequence steps
CREATE INDEX idx_sequence_steps_order ON beta_mission.sequence_steps(sequence_id, step_order);
CREATE UNIQUE INDEX idx_sequence_steps_order_unique
  ON beta_mission.sequence_steps(sequence_id, step_order);

-- AI usage
CREATE INDEX idx_ai_usage_user ON beta_mission.ai_usage(user_id);
CREATE INDEX idx_ai_usage_created ON beta_mission.ai_usage(created_at);
CREATE INDEX idx_ai_usage_user_created ON beta_mission.ai_usage(user_id, created_at);


-- ============================================================
-- updated_at TRIGGERS
-- ============================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.user_settings
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.user_prompts
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.user_rag_data
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.leads
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON beta_mission.conversations
  FOR EACH ROW EXECUTE FUNCTION beta_mission.update_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Modèle : pool partagé (leads/companies SELECT all) + ownership strict.
-- ============================================================
ALTER TABLE beta_mission.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.user_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.user_rag_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.linkedin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.list_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.sequence_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_mission.ai_usage ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- PROFILES: read all, update own
-- -------------------------------------------------------
CREATE POLICY "profiles_select" ON beta_mission.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update" ON beta_mission.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- -------------------------------------------------------
-- USER_API_KEYS: owner only
-- -------------------------------------------------------
CREATE POLICY "api_keys_all" ON beta_mission.user_api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_SETTINGS: owner only
-- -------------------------------------------------------
CREATE POLICY "settings_all" ON beta_mission.user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_PROMPTS: owner only
-- -------------------------------------------------------
CREATE POLICY "prompts_all" ON beta_mission.user_prompts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_RAG_DATA: owner only
-- -------------------------------------------------------
CREATE POLICY "rag_data_all" ON beta_mission.user_rag_data
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- LINKEDIN_ACCOUNTS: owner only
-- -------------------------------------------------------
CREATE POLICY "linkedin_all" ON beta_mission.linkedin_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- COMPANIES: pool partagé (SELECT all). Écriture via service_role.
-- -------------------------------------------------------
CREATE POLICY "companies_select" ON beta_mission.companies
  FOR SELECT TO authenticated
  USING (true);

-- -------------------------------------------------------
-- LEADS: pool partagé (SELECT all) + ownership strict (INSERT/UPDATE/DELETE)
-- -------------------------------------------------------
CREATE POLICY "leads_select" ON beta_mission.leads
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "leads_insert" ON beta_mission.leads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_update" ON beta_mission.leads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "leads_delete" ON beta_mission.leads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------
-- LISTS: owner only
-- -------------------------------------------------------
CREATE POLICY "lists_all" ON beta_mission.lists
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- LIST_LEADS: owner of the list can manage
-- -------------------------------------------------------
CREATE POLICY "list_leads_select" ON beta_mission.list_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

CREATE POLICY "list_leads_insert" ON beta_mission.list_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM beta_mission.lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

CREATE POLICY "list_leads_delete" ON beta_mission.list_leads
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- SEQUENCES: owner only
-- -------------------------------------------------------
CREATE POLICY "sequences_all" ON beta_mission.sequences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- SEQUENCE_STEPS: owner of the sequence can manage
-- -------------------------------------------------------
CREATE POLICY "sequence_steps_select" ON beta_mission.sequence_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_insert" ON beta_mission.sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_update" ON beta_mission.sequence_steps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_delete" ON beta_mission.sequence_steps
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- SEQUENCE_LEADS: owner of the sequence can manage
-- -------------------------------------------------------
CREATE POLICY "sequence_leads_select" ON beta_mission.sequence_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_insert" ON beta_mission.sequence_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_update" ON beta_mission.sequence_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_delete" ON beta_mission.sequence_leads
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- ACTIONS: owner only
-- -------------------------------------------------------
CREATE POLICY "actions_all" ON beta_mission.actions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- CONVERSATIONS: owner only
-- -------------------------------------------------------
CREATE POLICY "conversations_all" ON beta_mission.conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- MESSAGES: owner of the conversation can manage
-- -------------------------------------------------------
CREATE POLICY "messages_select" ON beta_mission.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM beta_mission.conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "messages_insert" ON beta_mission.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM beta_mission.conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- AI_USAGE: owner only (read + insert)
-- -------------------------------------------------------
CREATE POLICY "Users can read own usage" ON beta_mission.ai_usage
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON beta_mission.ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- GRANTS
-- ============================================================
GRANT USAGE ON SCHEMA beta_mission TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA beta_mission TO anon, authenticated, service_role;

COMMIT;
