/**
 * Supprime les leads du batch 2026-04-23 sans profil Unipile.
 *
 * Filtre :
 *   - user_id = Khalil
 *   - created_at dans 2026-04-23
 *   - enrichment_data.linkedin_profile IS NULL (Unipile getUserProfile a échoué)
 *
 * Sécurités :
 *   - Vérifie qu'aucun lead n'a d'actions ou conversations liées (sinon abort)
 *   - Mode dry par défaut (--apply pour exécuter)
 *
 * Usage:
 *   npx tsx scripts/delete-31-no-profile-leads.ts          # dry run
 *   npx tsx scripts/delete-31-no-profile-leads.ts --apply  # delete
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Find candidates
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, enrichment_data")
    .eq("user_id", KHALIL_USER_ID)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z");

  if (error) {
    console.error("Erreur lecture leads:", error.message);
    process.exit(1);
  }
  if (!leads) {
    console.log("aucun lead");
    return;
  }

  const candidates = leads.filter((l) => {
    const ed = l.enrichment_data as Record<string, unknown> | null;
    if (!ed) return true;
    const profile = ed.linkedin_profile;
    return !profile || (typeof profile === "object" && Object.keys(profile as object).length === 0);
  });

  console.log(`\n${candidates.length} leads candidats à la suppression :\n`);
  for (const l of candidates) {
    console.log(`  - ${l.first_name} ${l.last_name} | ${l.company} | ${l.linkedin_url}`);
  }

  if (candidates.length === 0) {
    console.log("\nRien à supprimer.");
    return;
  }

  const ids = candidates.map((l) => l.id);

  // 2. Safety check : aucune action / conversation
  const { count: actionCount } = await supabase
    .from("actions")
    .select("id", { count: "exact", head: true })
    .in("lead_id", ids);

  const { count: convCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .in("lead_id", ids);

  console.log(`\nDépendances :`);
  console.log(`  Actions liées      : ${actionCount ?? 0}`);
  console.log(`  Conversations      : ${convCount ?? 0}`);

  if ((actionCount ?? 0) > 0 || (convCount ?? 0) > 0) {
    console.error("\n❌ BLOQUÉ : ces leads ont des actions ou conversations. Suppression annulée.");
    console.error("   Investigue manuellement avant de relancer.");
    process.exit(1);
  }

  // 3. Apply or dry
  if (!APPLY) {
    console.log(`\n[DRY RUN] Pour exécuter : --apply`);
    return;
  }

  console.log(`\n🗑️  Suppression de ${ids.length} leads...`);
  // Delete by chunks of 50 to avoid URL length limits
  const CHUNK = 50;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error: delErr, count } = await supabase
      .from("leads")
      .delete({ count: "exact" })
      .in("id", slice);
    if (delErr) {
      console.error(`  Chunk ${i}-${i + slice.length}: ${delErr.message}`);
      process.exit(1);
    }
    deleted += count ?? 0;
  }
  console.log(`✅ ${deleted} leads supprimés`);
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
