/**
 * Check recent imports for Khalil + enrichment status
 *
 * Usage: npx tsx scripts/check-khalil-recent-imports.ts
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

  // 1. Find Khalil
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", "%khalil%");

  if (!profiles || profiles.length === 0) {
    console.error("Khalil non trouvé");
    process.exit(1);
  }
  const khalil = profiles[0];
  console.log(`Compte : ${khalil.full_name} (id=${khalil.id})\n`);

  // 2. All leads, ordered by created_at desc
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, created_at, enrichment_data, score, stage")
    .eq("user_id", khalil.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur :", error.message);
    process.exit(1);
  }
  if (!leads || leads.length === 0) {
    console.log("Aucun lead.");
    return;
  }

  console.log(`Total leads Khalil : ${leads.length}\n`);

  // 3. Group by import day (created_at date)
  const byDay = new Map<string, typeof leads>();
  for (const l of leads) {
    const day = (l.created_at as string).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, [] as unknown as typeof leads);
    byDay.get(day)!.push(l);
  }

  console.log("Imports par jour (15 derniers jours avec activité) :");
  console.log("─".repeat(70));
  const sortedDays = Array.from(byDay.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );
  for (const [day, list] of sortedDays.slice(0, 15)) {
    const enriched = list.filter(
      (l) => l.enrichment_data && Object.keys(l.enrichment_data as object).length > 0
    ).length;
    const scored = list.filter((l) => (l.score ?? 0) > 0).length;
    console.log(
      `  ${day} → ${String(list.length).padStart(3)} leads | enrichis: ${String(enriched).padStart(3)} | scorés: ${String(scored).padStart(3)}`
    );
  }

  // 4. Look at last big import (>= 50 leads in one day)
  console.log("\n" + "─".repeat(70));
  console.log("Imports massifs (≥ 50 leads / jour) :");
  console.log("─".repeat(70));
  for (const [day, list] of sortedDays) {
    if (list.length >= 50) {
      const enriched = list.filter(
        (l) => l.enrichment_data && Object.keys(l.enrichment_data as object).length > 0
      ).length;
      const scored = list.filter((l) => (l.score ?? 0) > 0).length;
      const stages = new Map<string, number>();
      for (const l of list) {
        const s = (l.stage as string) || "—";
        stages.set(s, (stages.get(s) || 0) + 1);
      }
      console.log(`\n  📅 ${day} : ${list.length} leads importés`);
      console.log(`     Enrichis (enrichment_data non vide) : ${enriched} (${Math.round((enriched / list.length) * 100)}%)`);
      console.log(`     Scorés (score > 0)                  : ${scored} (${Math.round((scored / list.length) * 100)}%)`);
      console.log(`     Répartition par stage :`);
      for (const [s, n] of stages.entries()) {
        console.log(`       - ${s} : ${n}`);
      }
      // Show first 5 sample names
      console.log(`     Exemples (5 premiers) :`);
      for (const l of list.slice(0, 5)) {
        const enrichedTag =
          l.enrichment_data && Object.keys(l.enrichment_data as object).length > 0
            ? "✅"
            : "❌";
        console.log(
          `       ${enrichedTag} ${l.first_name} ${l.last_name} — ${l.company} (score=${l.score ?? 0})`
        );
      }
    }
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
