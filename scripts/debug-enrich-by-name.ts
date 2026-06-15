/**
 * Search ai_usage rows for "Kevin Mercier" or recent enrich_perplexity actions
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
  const khalilId = profiles![0].id;

  // Search input_text containing "Kevin" OR "Mercier" OR "TransformIQ"
  console.log("=== input_text contenant 'Mercier' ou 'TransformIQ' (Khalil only, last 7d) ===\n");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: byName } = await supabase
    .from("ai_usage")
    .select("created_at, agent_id, provider, metadata, input_text, output_text")
    .eq("user_id", khalilId)
    .gte("created_at", sevenDaysAgo)
    .or("input_text.ilike.%Mercier%,input_text.ilike.%TransformIQ%")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log(`${byName?.length || 0} matches`);
  for (const r of byName || []) {
    const md = r.metadata as Record<string, unknown>;
    console.log(`\n${r.created_at} | ${r.agent_id} | ${md?.action} | leadId=${md?.leadId}`);
    console.log(`OUTPUT (1500 chars): ${(r.output_text || "").slice(0, 1500)}`);
  }

  // Recent enrich_perplexity actions across all users (catches failed cases that didn't log too)
  console.log("\n\n=== Tous les enrich_perplexity des 7 derniers jours ===\n");
  const { data: enrichRows } = await supabase
    .from("ai_usage")
    .select("created_at, agent_id, provider, metadata, output_text, user_id")
    .eq("user_id", khalilId)
    .gte("created_at", sevenDaysAgo)
    .filter("metadata->>action", "eq", "enrich_perplexity")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log(`${enrichRows?.length || 0} matches`);
  for (const r of enrichRows || []) {
    const md = r.metadata as Record<string, unknown>;
    const out = r.output_text || "";
    console.log(`\n${r.created_at} | leadId=${md?.leadId}`);
    // Try to parse — to know if the response is parseable JSON
    const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      JSON.parse(cleaned);
      console.log("  → JSON parseable ✅");
    } catch (err) {
      console.log(`  → JSON FAIL ❌ : ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      console.log(`  → début output: ${cleaned.slice(0, 300)}`);
      console.log(`  → fin output  : ${cleaned.slice(-300)}`);
    }
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
