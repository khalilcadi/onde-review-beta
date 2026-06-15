/**
 * Script: Check Ludwig's invited leads against Unipile to find
 * which ones actually accepted the connection.
 *
 * Uses getUserProfile per lead (like sync-relations does) to check
 * network_distance / is_relationship.
 *
 * Usage: npx tsx scripts/check-ludwig-relations.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const LUDWIG_USER_ID = "ce3c55fd-8ccb-4330-b9d5-e21857b6ffdb";
const LUDWIG_ACCOUNT_ID = "5HBjYpYfR_G1YbPhWOidow";
const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

async function unipileGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${UNIPILE_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { "X-API-KEY": UNIPILE_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Unipile ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function extractIdentifier(linkedinUrl: string): string | null {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/$/, "") : null;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Get Ludwig's leads with stage "invited"
  const { data: invitedLeads, error: leadsError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, stage")
    .eq("user_id", LUDWIG_USER_ID)
    .eq("stage", "invited")
    .not("linkedin_url", "is", null)
    .order("updated_at", { ascending: false });

  if (leadsError) {
    console.error("Error fetching leads:", leadsError.message);
    process.exit(1);
  }

  console.log(`\n📋 Ludwig a ${invitedLeads.length} leads en stage "invited"\n`);
  console.log("🔄 Vérification de chaque lead via Unipile getUserProfile...\n");

  const connected: Array<{ id: string; name: string; company: string; networkDistance?: string; isRelationship?: boolean }> = [];
  const pending: Array<{ name: string; company: string; networkDistance?: string }> = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const lead of invitedLeads) {
    const name = `${lead.first_name} ${lead.last_name}`;
    const identifier = extractIdentifier(lead.linkedin_url!);

    if (!identifier) {
      errors.push({ name, error: "URL invalide" });
      continue;
    }

    try {
      const profile = await unipileGet<{
        network_distance?: string;
        is_relationship?: boolean;
        first_name?: string;
        last_name?: string;
      }>(`/users/${identifier}`, { account_id: LUDWIG_ACCOUNT_ID });

      const nd = profile.network_distance;
      const isRel = profile.is_relationship;

      const isConnected =
        isRel === true ||
        ["FIRST", "DISTANCE_1", "1", "1ST"].includes(
          (nd || "").toUpperCase().trim()
        );

      if (isConnected) {
        connected.push({
          id: lead.id,
          name,
          company: lead.company || "-",
          networkDistance: nd,
          isRelationship: isRel,
        });
        process.stdout.write(`  ✅ ${name}\n`);
      } else {
        pending.push({ name, company: lead.company || "-", networkDistance: nd });
        process.stdout.write(`  ⏳ ${name} (distance: ${nd})\n`);
      }

      // Rate limit: small delay between calls
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ name, error: msg });
      process.stdout.write(`  ❌ ${name}: ${msg}\n`);
    }
  }

  // Results
  console.log("\n" + "=".repeat(70));
  console.log(`🔴 ${connected.length} leads "invited" en DB mais CONNECTÉS sur LinkedIn :`);
  console.log("=".repeat(70));

  if (connected.length === 0) {
    console.log("  (aucun)");
  } else {
    for (const l of connected) {
      console.log(
        `  ✅ ${l.name.padEnd(30)} ${l.company.padEnd(25)} (distance=${l.networkDistance}, rel=${l.isRelationship})`
      );
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`⏳ ${pending.length} leads réellement en attente :`);
  console.log("=".repeat(70));
  for (const l of pending) {
    console.log(`  ⏳ ${l.name.padEnd(30)} ${l.company.padEnd(25)} (distance=${l.networkDistance})`);
  }

  if (errors.length > 0) {
    console.log("\n" + "=".repeat(70));
    console.log(`❌ ${errors.length} erreurs :`);
    console.log("=".repeat(70));
    for (const e of errors) {
      console.log(`  ❌ ${e.name}: ${e.error}`);
    }
  }

  // Auto-fix
  if (connected.length > 0) {
    console.log("\n" + "=".repeat(70));
    console.log("🔧 Correction automatique...");
    console.log("=".repeat(70));

    const ids = connected.map((l) => l.id);
    const { error: updateError } = await supabase
      .from("leads")
      .update({ stage: "connected", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) {
      console.error(`  ❌ Erreur update: ${updateError.message}`);
    } else {
      console.log(`  ✅ ${ids.length} leads corrigés : invited → connected`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 RÉSUMÉ LUDWIG");
  console.log("=".repeat(70));
  console.log(`  Leads "invited" vérifiés   : ${invitedLeads.length}`);
  console.log(`  → Réellement connectés     : ${connected.length} (corrigés)`);
  console.log(`  → En attente               : ${pending.length}`);
  console.log(`  → Erreurs                  : ${errors.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
