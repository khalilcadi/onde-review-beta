-- ============================================================
-- PROSPECTOR - Initial Schema Migration
-- 15 tables: profiles, user_api_keys, user_settings, user_prompts,
-- user_rag_data, linkedin_accounts, leads, lists, list_leads,
-- sequences, sequence_steps, sequence_leads, actions, conversations, messages
-- ============================================================
-- Run this in Supabase SQL Editor after creating the project.
-- ============================================================

-- ===================
-- 1. PROFILES
-- ===================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===================
-- 2. USER API KEYS
-- ===================
CREATE TABLE user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  claude_key_encrypted TEXT,
  openai_key_encrypted TEXT,
  perplexity_key_encrypted TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 3. USER SETTINGS
-- ===================
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 4. USER PROMPTS (overrides)
-- ===================
CREATE TABLE user_prompts (
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
CREATE TABLE user_rag_data (
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
CREATE TABLE linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unipile_account_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  account_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 7. LEADS (pool partage)
-- ===================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  linkedin_url TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'cold',
  stage TEXT DEFAULT 'to_invite',
  tags TEXT[],
  notes TEXT,
  enrichment_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 8. LISTS
-- ===================
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 9. LIST_LEADS (junction)
-- ===================
CREATE TABLE list_leads (
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, lead_id)
);

-- ===================
-- 10. SEQUENCES
-- ===================
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  persona TEXT,
  status TEXT DEFAULT 'active',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 11. SEQUENCE STEPS
-- ===================
CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  delay_days INTEGER DEFAULT 0,
  template TEXT,
  condition TEXT,
  step_order INTEGER NOT NULL
);

-- ===================
-- 12. SEQUENCE LEADS (tracking)
-- ===================
CREATE TABLE sequence_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  entered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 13. ACTIONS
-- ===================
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL,
  step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  generated_message TEXT,
  final_message TEXT,
  scheduled_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 14. CONVERSATIONS
-- ===================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  unipile_chat_id TEXT,
  status TEXT DEFAULT 'unread',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- 15. MESSAGES
-- ===================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Leads: user, status, score (frequent queries)
CREATE INDEX idx_leads_user ON leads(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_score ON leads(score DESC);
CREATE INDEX idx_leads_linkedin_url ON leads(linkedin_url);

-- Actions: user+status combo, scheduled_at for cron queries
CREATE INDEX idx_actions_user_status ON actions(user_id, status);
CREATE INDEX idx_actions_scheduled ON actions(scheduled_at)
  WHERE status = 'validated';
CREATE INDEX idx_actions_lead ON actions(lead_id);

-- Conversations: user, status
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- Messages: conversation lookup
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- Sequence leads: active tracking queries
CREATE INDEX idx_sequence_leads_status ON sequence_leads(status)
  WHERE status = 'active';
CREATE INDEX idx_sequence_leads_sequence ON sequence_leads(sequence_id);

-- Sequence steps: order within sequence
CREATE INDEX idx_sequence_steps_order ON sequence_steps(sequence_id, step_order);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Modele: pool partage + ownership strict (DECISIONS.md 3.10)
--   - Leads: tous visibles par tous, mais seul l'owner peut modifier/supprimer
--   - Autres tables: owner only (read + write)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rag_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- PROFILES: users can read all profiles, update their own
-- -------------------------------------------------------
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- -------------------------------------------------------
-- USER_API_KEYS: owner only
-- -------------------------------------------------------
CREATE POLICY "api_keys_all" ON user_api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_SETTINGS: owner only
-- -------------------------------------------------------
CREATE POLICY "settings_all" ON user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_PROMPTS: owner only
-- -------------------------------------------------------
CREATE POLICY "prompts_all" ON user_prompts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- USER_RAG_DATA: owner only
-- -------------------------------------------------------
CREATE POLICY "rag_data_all" ON user_rag_data
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- LINKEDIN_ACCOUNTS: owner only
-- -------------------------------------------------------
CREATE POLICY "linkedin_all" ON linkedin_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- LEADS: pool partage (SELECT all) + ownership strict (INSERT/UPDATE/DELETE)
-- -------------------------------------------------------
CREATE POLICY "leads_select" ON leads
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "leads_insert" ON leads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_update" ON leads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "leads_delete" ON leads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -------------------------------------------------------
-- LISTS: owner only
-- -------------------------------------------------------
CREATE POLICY "lists_all" ON lists
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- LIST_LEADS: owner of the list can manage
-- -------------------------------------------------------
CREATE POLICY "list_leads_select" ON list_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

CREATE POLICY "list_leads_insert" ON list_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

CREATE POLICY "list_leads_delete" ON list_leads
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM lists WHERE lists.id = list_leads.list_id AND lists.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- SEQUENCES: owner only
-- -------------------------------------------------------
CREATE POLICY "sequences_all" ON sequences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- SEQUENCE_STEPS: owner of the sequence can manage
-- -------------------------------------------------------
CREATE POLICY "sequence_steps_select" ON sequence_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_insert" ON sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_update" ON sequence_steps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_delete" ON sequence_steps
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_steps.sequence_id AND sequences.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- SEQUENCE_LEADS: owner of the sequence can manage
-- -------------------------------------------------------
CREATE POLICY "sequence_leads_select" ON sequence_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_insert" ON sequence_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_update" ON sequence_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

CREATE POLICY "sequence_leads_delete" ON sequence_leads
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sequences WHERE sequences.id = sequence_leads.sequence_id AND sequences.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- ACTIONS: owner only
-- -------------------------------------------------------
CREATE POLICY "actions_all" ON actions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- CONVERSATIONS: owner only
-- -------------------------------------------------------
CREATE POLICY "conversations_all" ON conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------
-- MESSAGES: owner of the conversation can manage
-- -------------------------------------------------------
CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
  );

-- -------------------------------------------------------
-- updated_at trigger helper
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_rag_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
