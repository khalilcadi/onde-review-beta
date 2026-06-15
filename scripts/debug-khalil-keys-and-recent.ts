/**
 * Vérifier les clés API de Khalil + activité ai_usage récente
 *
 * Usage: npx tsx scripts/debug-khalil-keys-and-recent.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", "%khalil%");
  const khalil = profiles![0];
  console.log(`Khalil id=${khalil.id}\n`);

  // 1. API keys
  const { data: keys } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("user_id", khalil.id)
    .single();

  console.log("Clés API configurées :");
  if (!keys) {
    console.log("  AUCUNE — c'est ça le problème !");
  } else {
    console.log(`  claude    : ${keys.claude_key_encrypted ? "✅ présente" : "❌ absente"}`);
    console.log(`  openai    : ${keys.openai_key_encrypted ? "✅ présente" : "❌ absente"}`);
    console.log(`  perplexity: ${keys.perplexity_key_encrypted ? "✅ présente" : "❌ absente"}`);
    console.log(`  updated_at: ${keys.updated_at}`);
  }

  // 2. Recent ai_usage activity (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("ai_usage")
    .select("id, agent_id, model_id, provider, created_at, metadata, estimated_cost")
    .eq("user_id", khalil.id)
    .gte("created_at", yesterday)
    .order("created_at", { ascending: false });

  console.log(`\nai_usage Khalil dans les dernières 24h : ${recent?.length || 0} rows`);
  for (const r of (recent || []).slice(0, 10)) {
    const md = r.metadata as Record<string, unknown> | null;
    console.log(
      `  ${r.created_at} | ${r.agent_id} | ${r.provider} | ${md?.action || "—"} | $${r.estimated_cost} | leadId=${md?.leadId || "—"}`
    );
  }

  // 3. Last 5 ai_usage rows globally (any user) for context
  const { data: anyRecent } = await supabase
    .from("ai_usage")
    .select("user_id, agent_id, provider, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(`\nDernières 5 traces ai_usage (tous users) :`);
  for (const r of anyRecent || []) {
    const md = r.metadata as Record<string, unknown> | null;
    console.log(
      `  ${r.created_at} | user=${r.user_id?.slice(0, 8)} | ${r.agent_id} | ${r.provider} | ${md?.action || "—"}`
    );
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
