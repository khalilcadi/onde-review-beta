/**
 * Enrichissement batch des leads sans linkedin_profile.
 * Séquentiel avec 15s de pause — évite le rate-limiting LinkedIn.
 * dotenv chargé AVANT les imports dynamiques pour garantir UNIPILE_DSN correct.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const PAUSE_MS = 15000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Import dynamique APRÈS dotenv pour garantir les env vars
  const { enrichSingleLead } = await import("../app/api/ai/enrich/route");

  console.log("DSN:", process.env.UNIPILE_DSN);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data")
    .eq("user_id", KHALIL_USER_ID)
    .neq("stage", "withdrawn");

  if (error) throw new Error("Fetch leads: " + error.message);

  // Leads sans linkedin_profile (pas encore enrichis avec le vrai système)
  const toEnrich = (leads || []).filter(
    (l: any) => !l.enrichment_data?.linkedin_profile && l.linkedin_url
  );

  console.log(`\n🚀 ${toEnrich.length} leads à enrichir (séquentiel, ${PAUSE_MS/1000}s entre chaque)\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    const raw = toEnrich[i];
    const lead = {
      id: raw.id,
      firstName: raw.first_name ?? "",
      lastName: raw.last_name ?? "",
      title: raw.title,
      company: raw.company,
      linkedinUrl: raw.linkedin_url,
      score: raw.score,
      status: raw.status,
      stage: raw.stage,
      tags: raw.tags,
      notes: raw.notes,
      enrichmentData: raw.enrichment_data,
    };

    try {
      const result = await enrichSingleLead(lead, KHALIL_USER_ID, supabase as any);
      const gotProfile = !!(result as any)?.linkedin_profile;
      success++;
      console.log(`  ✓ [${i+1}/${toEnrich.length}] ${lead.firstName} ${lead.lastName} — ${lead.company || "(no company)"}${gotProfile ? " | profil✓" : " | profil✗"}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ [${i+1}/${toEnrich.length}] ${lead.firstName} ${lead.lastName}: ${err instanceof Error ? err.message : err}`);
    }

    if (i < toEnrich.length - 1) {
      await sleep(PAUSE_MS);
    }
  }

  console.log(`\n✅ Terminé — ${success} enrichis, ${failed} erreurs`);

  // Résumé
  const { data: updated } = await supabase
    .from("leads")
    .select("enrichment_data")
    .eq("user_id", KHALIL_USER_ID)
    .neq("stage", "withdrawn");

  const withProfile = updated?.filter((l: any) => l.enrichment_data?.linkedin_profile).length || 0;
  const segments: Record<string, number> = {};
  updated?.forEach((l: any) => {
    const seg = l.enrichment_data?.scoring_detail?.segment_icp || "unknown";
    segments[seg] = (segments[seg] || 0) + 1;
  });

  console.log(`\n📊 Profils LinkedIn récupérés: ${withProfile}/${updated?.length}`);
  console.log("Segments ICP:");
  Object.entries(segments).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${k}: ${v}`)
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
