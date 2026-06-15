/**
 * Test enrichSingleLead with new flow (Unipile company + OpenAI web_search) on Kevin Mercier.
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
    .select("id")
    .ilike("full_name", "%khalil%");
  const khalilId = profiles![0].id;

  const { data: leadRow } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data")
    .eq("user_id", khalilId)
    .ilike("first_name", "thomas")
    .ilike("last_name", "martin")
    .maybeSingle();

  if (!leadRow) {
    console.log("Kevin not found");
    return;
  }

  const lead = {
    id: leadRow.id,
    firstName: leadRow.first_name || "",
    lastName: leadRow.last_name || "",
    title: leadRow.title,
    company: leadRow.company,
    linkedinUrl: leadRow.linkedin_url || "",
    score: leadRow.score,
    status: leadRow.status,
    stage: leadRow.stage,
    tags: leadRow.tags,
    notes: leadRow.notes,
    enrichmentData: leadRow.enrichment_data as Record<string, unknown> | null,
  };

  console.log(`Test enrichment: ${lead.firstName} ${lead.lastName} (${lead.company})\n`);

  const { enrichSingleLead } = await import("@/app/api/ai/enrich/route");
  const start = Date.now();
  const result = await enrichSingleLead(lead, khalilId, supabase as never);
  const elapsed = Math.round((Date.now() - start) / 1000);

  console.log(`\n✅ Done in ${elapsed}s\n`);
  console.log("=== Result keys ===");
  console.log(Object.keys(result));
  console.log("\n=== company ===");
  console.log(JSON.stringify(result.company, null, 2));
  console.log("\n=== signal ===");
  console.log(JSON.stringify(result.signal, null, 2));
  console.log("\n=== hook_recommande ===");
  console.log(JSON.stringify(result.hook_recommande, null, 2));
  console.log("\n=== sources ===");
  console.log(result.sources);
  console.log("\n=== confidence ===", result.confidence);
  console.log("=== warning ===", result.warning);

  // Check segment ICP recompute
  const { data: refreshed } = await supabase
    .from("leads")
    .select("score, status, stage, enrichment_data")
    .eq("id", lead.id)
    .single();
  const sd = (refreshed?.enrichment_data as Record<string, unknown>)?.scoring_detail as Record<string, unknown> | undefined;
  console.log(`\n=== DB after update ===`);
  console.log(`score=${refreshed?.score} status=${refreshed?.status} stage=${refreshed?.stage}`);
  console.log(`segment_icp=${sd?.segment_icp}`);
}

main().catch((err) => {
  console.error("[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
