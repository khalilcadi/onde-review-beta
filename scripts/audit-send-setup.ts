/**
 * audit-send-setup.ts — READ-ONLY audit before wiring tomorrow's send.
 * Aucune écriture DB, aucun envoi. Ping Unipile en lecture seule (getAccount).
 *
 * USAGE : npx tsx scripts/audit-send-setup.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  console.log("\n========== 1. PROFILES & LINKEDIN ACCOUNTS ==========");
  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  console.log("profiles:", JSON.stringify(profiles, null, 2));

  const { data: accounts } = await supabase
    .from("linkedin_accounts")
    .select("id, user_id, unipile_account_id, status, account_type, warmup_start_date");
  console.log("linkedin_accounts:", JSON.stringify(accounts, null, 2));

  console.log("\n========== 2. LEADS seg_A enrichis ==========");
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, user_id, first_name, last_name, stage, status, linkedin_url, enrichment_data, created_at")
    .order("created_at", { ascending: true });
  if (error) { console.error("leads read error:", error.message); process.exit(1); }

  const all = rows || [];
  const segA = all.filter((r) => {
    const seg = (r.enrichment_data as LeadForGeneration["enrichmentData"])?.scoring_detail?.segment_icp;
    return seg === "A";
  });

  // Segment distribution overview
  const dist: Record<string, number> = {};
  for (const r of all) {
    const seg = (r.enrichment_data as LeadForGeneration["enrichmentData"])?.scoring_detail?.segment_icp ?? "(none)";
    dist[seg] = (dist[seg] || 0) + 1;
  }
  console.log("Total leads:", all.length);
  console.log("Segment distribution:", JSON.stringify(dist, null, 2));
  console.log(`seg_A enrichis (segment_icp === "A"): ${segA.length}`);

  console.log("\n--- seg_A detail (enriched_at present? stage? owner? url?) ---");
  for (const r of segA) {
    const ed = r.enrichment_data as LeadForGeneration["enrichmentData"];
    const hasEnrichedAt = !!(ed && typeof ed === "object" && "enriched_at" in ed);
    console.log(
      `- ${r.first_name} ${r.last_name} | stage=${r.stage} | owner=${r.user_id} | enriched_at=${hasEnrichedAt} | url=${r.linkedin_url ? "yes" : "NO"}`
    );
  }

  console.log("\n========== 3. SEQUENCES existantes ==========");
  const { data: seqs } = await supabase
    .from("sequences")
    .select("id, user_id, name, persona, status");
  console.log("sequences:", JSON.stringify(seqs, null, 2));
  for (const s of seqs || []) {
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("step_order, step_type, delay_days, condition, generation_mode, template")
      .eq("sequence_id", s.id)
      .order("step_order", { ascending: true });
    console.log(`  steps for "${s.name}" (${s.id}):`, JSON.stringify(steps, null, 2));
  }

  console.log("\n========== 4. sequence_leads existants (enrôlements) ==========");
  const { data: seqLeads } = await supabase
    .from("sequence_leads")
    .select("id, sequence_id, lead_id, current_step, status");
  console.log(`sequence_leads count: ${(seqLeads || []).length}`);
  console.log(JSON.stringify(seqLeads, null, 2));

  console.log("\n========== 5. ACTIONS existantes ==========");
  const { data: acts } = await supabase
    .from("actions")
    .select("id, status, action_type")
    .limit(1000);
  const actDist: Record<string, number> = {};
  for (const a of acts || []) actDist[a.status] = (actDist[a.status] || 0) + 1;
  console.log(`actions count: ${(acts || []).length} | by status:`, JSON.stringify(actDist));

  console.log("\n========== 6. UNIPILE cookie alive? (getAccount, read-only) ==========");
  for (const acc of accounts || []) {
    try {
      const { getUnipileClient } = await import("@/lib/unipile/client");
      const client = getUnipileClient();
      const a = await client.getAccount(acc.unipile_account_id);
      console.log(`account ${acc.unipile_account_id}:`, JSON.stringify(a, null, 2).slice(0, 800));
    } catch (e) {
      console.log(`account ${acc.unipile_account_id}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\n[audit] DONE — read-only, no writes, no sends.");
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
