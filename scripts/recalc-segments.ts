/**
 * One-shot script : recalcule segment_icp pour tous les leads existants
 * qui ont de l'enrichment_data mais pas de scoring_detail.segment_icp.
 *
 * USAGE:
 *   npx tsx scripts/recalc-segments.ts
 *
 * PREREQUISITES:
 *   - .env.local doit contenir NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 *
 * IDEMPOTENT: les leads ayant deja un segment_icp valide sont skippes.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { computeSegmentIcp, type IcpSegment } from "../lib/scoring-buckets";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const VALID_SEGMENTS: readonly IcpSegment[] = ["A", "B", "C", "D", "E", "F", "HORS_ICP"];

async function main() {
  console.log("Loading leads with enrichment_data...\n");

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, title, company, enrichment_data")
    .not("enrichment_data", "is", null);

  if (error) {
    console.error("Failed to load leads:", error);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const lead of leads || []) {
    const enrichment = lead.enrichment_data as Record<string, unknown> | null;
    const scoringDetail = (enrichment?.scoring_detail as Record<string, unknown> | undefined) || {};
    const existing = scoringDetail.segment_icp as string | undefined;

    if (existing && VALID_SEGMENTS.includes(existing as IcpSegment)) {
      skipped++;
      continue;
    }

    const segment = computeSegmentIcp(
      lead.title,
      enrichment as Parameters<typeof computeSegmentIcp>[1],
      lead.company,
    );
    const nextEnrichment = {
      ...(enrichment || {}),
      scoring_detail: { ...scoringDetail, segment_icp: segment },
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update({ enrichment_data: nextEnrichment })
      .eq("id", lead.id);

    if (updateError) {
      console.error(`  [ERROR] ${lead.id}: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  [OK] ${lead.id} -> ${segment} (title: ${lead.title || "—"})`);
      updated++;
    }
  }

  console.log(
    `\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}, Total: ${(leads || []).length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
