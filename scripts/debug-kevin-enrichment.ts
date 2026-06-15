/**
 * Debug Kevin Mercier enrichment failure - inspect raw Perplexity output
 *
 * Usage: npx tsx scripts/debug-kevin-enrichment.ts
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

  // Find Kevin
  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company")
    .ilike("first_name", "kevin")
    .ilike("last_name", "mercier");
  if (!leads || leads.length === 0) {
    console.log("Kevin Mercier non trouvé");
    return;
  }
  const kevin = leads[0];
  console.log(`Kevin Mercier id=${kevin.id} (${kevin.company})\n`);

  // Find ai_usage rows for this lead via metadata->>leadId filter
  const { data: kevinRows } = await supabase
    .from("ai_usage")
    .select("id, agent_id, model_id, provider, created_at, metadata, input_text, output_text, estimated_cost")
    .filter("metadata->>leadId", "eq", kevin.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!kevinRows) {
    console.log("aucune trace ai_usage");
    return;
  }

  console.log(`${kevinRows.length} traces ai_usage pour Kevin\n`);

  for (const r of kevinRows.slice(0, 5)) {
    console.log("─".repeat(80));
    console.log(`Date     : ${r.created_at}`);
    console.log(`Agent    : ${r.agent_id}`);
    console.log(`Model    : ${r.model_id} (${r.provider})`);
    const md = r.metadata as Record<string, unknown>;
    console.log(`Action   : ${md.action}`);
    console.log(`Cost     : $${r.estimated_cost}`);
    console.log(`\n>>> OUTPUT (premiers 4000 chars) :`);
    console.log((r.output_text || "").slice(0, 4000));
    console.log("");
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
