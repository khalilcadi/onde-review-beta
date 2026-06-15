/**
 * Batch enrich Khalil's 100 leads imported on 2026-04-23.
 *
 * - Sequential (1 lead at a time) to respect Unipile/Anthropic rate limits
 * - Skips leads already enriched (enrichment_data has 'linkedin_profile' or 'signal')
 * - Perplexity will fail (quota) but enrichment continues with Unipile + classification + hook + Icypeas
 * - ETA: ~15s/lead × 99 = ~25 min
 *
 * Usage:
 *   npx tsx scripts/batch-enrich-khalil-2026-04-23.ts
 *   npx tsx scripts/batch-enrich-khalil-2026-04-23.ts --dry      # show what would be enriched
 *   npx tsx scripts/batch-enrich-khalil-2026-04-23.ts --limit 5  # only first N
 *   npx tsx scripts/batch-enrich-khalil-2026-04-23.ts --resume   # skip already enriched
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const DRY = process.argv.includes("--dry");
const RESUME = process.argv.includes("--resume");
const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg
  ? parseInt(limitArg.replace(/--limit=?/, "") || process.argv[process.argv.indexOf(limitArg) + 1] || "9999", 10)
  : 9999;

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

interface LeadForGeneration {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  company: string | null;
  linkedinUrl: string;
  score: number | null;
  status: string | null;
  stage: string | null;
  tags: string[] | null;
  notes: string | null;
  enrichmentData: Record<string, unknown> | null;
}

function isEnriched(ed: Record<string, unknown> | null): boolean {
  if (!ed) return false;
  // New criterion : enrichi avec la nouvelle méthode = company.size présent
  // (Unipile linkedinCompany doit avoir réussi)
  const company = ed.company as Record<string, unknown> | undefined;
  return !!(company && company.size);
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Fetch the batch
  console.log("Fetching leads imported on 2026-04-23...");
  const { data: rawLeads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data")
    .eq("user_id", KHALIL_USER_ID)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erreur :", error.message);
    process.exit(1);
  }
  if (!rawLeads || rawLeads.length === 0) {
    console.log("Aucun lead trouvé");
    return;
  }

  // 2. Map + filter
  const allLeads: LeadForGeneration[] = rawLeads.map((l) => ({
    id: l.id,
    firstName: l.first_name || "",
    lastName: l.last_name || "",
    title: l.title,
    company: l.company,
    linkedinUrl: l.linkedin_url || "",
    score: l.score,
    status: l.status,
    stage: l.stage,
    tags: l.tags,
    notes: l.notes,
    enrichmentData: l.enrichment_data as Record<string, unknown> | null,
  }));

  let leads = allLeads.filter((l) => !!l.linkedinUrl);
  const skippedNoUrl = allLeads.length - leads.length;

  if (RESUME) {
    const before = leads.length;
    leads = leads.filter((l) => !isEnriched(l.enrichmentData));
    console.log(`  --resume : ${before - leads.length} déjà enrichis ignorés`);
  }

  if (LIMIT < leads.length) {
    leads = leads.slice(0, LIMIT);
  }

  console.log(`\n${allLeads.length} leads dans le batch ; ${skippedNoUrl} sans URL ignorés ; ${leads.length} à traiter\n`);

  if (DRY) {
    console.log("DRY RUN — leads qui seraient enrichis :");
    for (const l of leads.slice(0, 20)) {
      console.log(`  - ${l.firstName} ${l.lastName} (${l.company})`);
    }
    if (leads.length > 20) console.log(`  ... +${leads.length - 20} autres`);
    return;
  }

  // 3. Import enrichSingleLead (after env loaded)
  const { enrichSingleLead } = await import("@/app/api/ai/enrich/route");

  const startTime = Date.now();
  const results: Array<{ id: string; name: string; success: boolean; warning?: string; error?: string; durationMs: number }> = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const leadStart = Date.now();
    const name = `${lead.firstName} ${lead.lastName}`;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = i > 0 ? Math.round(((Date.now() - startTime) / i) * (leads.length - i) / 1000) : 0;
    process.stdout.write(
      `\n[${i + 1}/${leads.length}] (${elapsed}s elapsed, ~${eta}s ETA) ${name} (${lead.company})... `
    );

    try {
      const result = await enrichSingleLead(lead, KHALIL_USER_ID, supabase as never);
      const duration = Date.now() - leadStart;
      const warning = (result as Record<string, unknown>).warning as string | undefined;
      process.stdout.write(`✅ ${Math.round(duration / 1000)}s`);
      if (warning) process.stdout.write(` ⚠️  ${warning.slice(0, 60)}`);
      results.push({ id: lead.id, name, success: true, warning, durationMs: duration });
    } catch (err) {
      const duration = Date.now() - leadStart;
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`❌ ${msg.slice(0, 80)}`);
      results.push({ id: lead.id, name, success: false, error: msg, durationMs: duration });
    }
  }

  // 4. Summary
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const ok = results.filter((r) => r.success).length;
  const ko = results.filter((r) => !r.success).length;
  const withWarning = results.filter((r) => r.warning).length;

  console.log("\n\n" + "═".repeat(70));
  console.log("RÉCAPITULATIF");
  console.log("═".repeat(70));
  console.log(`Total       : ${results.length} leads en ${totalDuration}s (${Math.round(totalDuration / 60)}min)`);
  console.log(`Succès      : ${ok}`);
  console.log(`Échecs      : ${ko}`);
  console.log(`Avec warning: ${withWarning} (Perplexity skippé)`);

  if (ko > 0) {
    console.log("\nÉchecs :");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  - ${r.name} : ${r.error}`);
    }
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
