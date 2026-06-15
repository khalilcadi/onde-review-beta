/**
 * Exécute l'équivalent de la migration 008 (purge enrichment_data.hook_recommande)
 * via le client service-role (supabase-js ne fait pas de SQL brut).
 *
 * Usage: npx tsx --env-file=.env.local scripts/run-purge-hook.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Récupère les leads dont enrichment_data contient la clé hook_recommande
  // (équivalent du WHERE enrichment_data ? 'hook_recommande')
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, enrichment_data")
    .not("enrichment_data", "is", null);
  if (error) throw new Error(`Select failed: ${error.message}`);

  const targets = (rows || []).filter((r) => {
    const ed = r.enrichment_data as Record<string, unknown> | null;
    return ed != null && typeof ed === "object" && "hook_recommande" in ed;
  });

  console.log(`Lignes avec hook_recommande : ${targets.length} / ${rows?.length ?? 0} (enrichies)`);

  let updated = 0;
  const failures: { id: string; error: string }[] = [];
  for (const r of targets) {
    const ed = { ...(r.enrichment_data as Record<string, unknown>) };
    delete ed.hook_recommande;
    const { error: upErr } = await supabase
      .from("leads")
      .update({ enrichment_data: ed })
      .eq("id", r.id);
    if (upErr) failures.push({ id: r.id as string, error: upErr.message });
    else updated++;
  }

  console.log(`\n✅ Rows updated: ${updated}`);
  if (failures.length > 0) {
    console.log(`❌ Failures: ${failures.length}`);
    failures.slice(0, 10).forEach((f) => console.log(`   ${f.id}: ${f.error}`));
  }

  // Vérification : plus aucune ligne ne doit contenir la clé
  const { data: check } = await supabase
    .from("leads")
    .select("id, enrichment_data")
    .not("enrichment_data", "is", null);
  const remaining = (check || []).filter((r) => {
    const ed = r.enrichment_data as Record<string, unknown> | null;
    return ed != null && typeof ed === "object" && "hook_recommande" in ed;
  }).length;
  console.log(`Lignes restantes avec hook_recommande : ${remaining}`);

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(`FATAL: ${e instanceof Error ? e.stack : e}`); process.exit(1); });
