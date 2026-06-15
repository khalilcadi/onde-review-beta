/**
 * Inspect what's actually inside enrichment_data for Khalil's recent imports.
 *
 * Usage: npx tsx scripts/inspect-khalil-enrichment.ts
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

  // Get the 100 leads imported on 2026-04-23
  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, enrichment_data, score, created_at")
    .eq("user_id", khalilId)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z")
    .order("created_at", { ascending: true });

  if (!leads) {
    console.log("aucun lead");
    return;
  }
  console.log(`${leads.length} leads importés le 2026-04-23\n`);

  // Aggregate stats on enrichment_data shape
  const stats = {
    null: 0,
    emptyObject: 0,
    hasKeys: 0,
    keyFreq: new Map<string, number>(),
    topLevelOnly: 0,
    hasNestedContent: 0,
  };

  for (const lead of leads) {
    const ed = lead.enrichment_data as Record<string, unknown> | null;
    if (ed === null || ed === undefined) {
      stats.null++;
      continue;
    }
    const keys = Object.keys(ed);
    if (keys.length === 0) {
      stats.emptyObject++;
      continue;
    }
    stats.hasKeys++;
    for (const k of keys) {
      stats.keyFreq.set(k, (stats.keyFreq.get(k) || 0) + 1);
    }
    // Check if any nested value is non-empty
    let hasContent = false;
    for (const v of Object.values(ed)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && Object.keys(v as object).length === 0) continue;
      hasContent = true;
      break;
    }
    if (hasContent) stats.hasNestedContent++;
    else stats.topLevelOnly++;
  }

  console.log("Distribution enrichment_data :");
  console.log(`  null              : ${stats.null}`);
  console.log(`  {} (empty object) : ${stats.emptyObject}`);
  console.log(`  has keys          : ${stats.hasKeys}`);
  console.log(`    └ avec contenu  : ${stats.hasNestedContent}`);
  console.log(`    └ vide en réel  : ${stats.topLevelOnly}`);

  console.log("\nClés les plus fréquentes :");
  const sortedKeys = Array.from(stats.keyFreq.entries()).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sortedKeys) {
    console.log(`  ${k.padEnd(30)} → ${n} leads`);
  }

  // Show full sample of 3 leads — including Kevin Mercier
  console.log("\n──────────────────────────────────────────────────────");
  console.log("Échantillon brut (3 leads complets) :");
  console.log("──────────────────────────────────────────────────────");

  const samples = [
    leads.find((l) => `${l.first_name} ${l.last_name}`.toLowerCase().includes("mercier")),
    leads[0],
    leads[Math.floor(leads.length / 2)],
  ].filter(Boolean) as typeof leads;

  for (const l of samples) {
    console.log(`\n→ ${l.first_name} ${l.last_name} (${l.company})`);
    console.log(`  score : ${l.score}`);
    console.log(`  enrichment_data :`);
    console.log(JSON.stringify(l.enrichment_data, null, 2));
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
