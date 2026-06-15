-- Migration 002: Table ai_usage pour le suivi de consommation IA
-- Session G — 2026-02-11

CREATE TABLE ai_usage (
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
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user ON ai_usage(user_id);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at);
CREATE INDEX idx_ai_usage_user_created ON ai_usage(user_id, created_at);

-- RLS: chaque user ne voit que ses propres données d'usage
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON ai_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);
