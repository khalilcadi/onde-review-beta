/**
 * Script: Check Khalil's invited leads (suspects from 2026-04-17 desync)
 * against Unipile to detect accepted invitations not reflected in DB.
 *
 * Usage: npx tsx scripts/check-khalil-invited-sync.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const KHALIL_ACCOUNT_ID = "8bGZCi3mQw2LgAiGGuInqw";
const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

// The 13 suspect leads (had M1 generated 2026-04-17 despite stage=invited)
const SUSPECT_NAMES: [string, string][] = [
  ["Badre", "S."],
  ["Sylvain", "Delahodde"],
  ["Joseph", "GONNACHON"],
  ["Florent", "Ribaut"],
  ["Sébastien", "ROQUET"],
  ["Eric", "Bazoin"],
  ["Sophie", "Guerin"],
  ["Betty", "Rousseau"],
  ["Jean-Philippe", "LLOBERA"],
  ["Rémy", "EMANUELE"],
  ["Fabrice", "Rivet"],
  ["≡ Jean-Sylvain", "CHAVANNE"],
  ["Yann - Yves", "Cova"],
];

interface UnipileProfile {
  network_distance?: string | null;
  is_relationship?: boolean;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
}

async function unipileGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
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
    throw new Error(`Unipile ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function extractIdentifier(linkedinUrl: string): string | null {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/$/, "") : null;
}

function isFirstDegree(nd: string | null | undefined): boolean {
  if (!nd) return false;
  const n = nd.toUpperCase().trim();
  return ["FIRST", "FIRST_DEGREE", "DISTANCE_1", "1", "1ST"].includes(n);
}

async function main() {
  if (!UNIPILE_API_KEY || !process.env.UNIPILE_DSN) {
    console.error("❌ Missing UNIPILE_API_KEY or UNIPILE_DSN in .env.local");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the 13 suspect leads
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, stage")
    .eq("user_id", KHALIL_USER_ID)
    .eq("stage", "invited")
    .in(
      "first_name",
      SUSPECT_NAMES.map((n) => n[0])
    );

  if (error || !leads) {
    console.error("❌ DB error:", error?.message);
    process.exit(1);
  }

  // Filter by (first_name, last_name) pair
  const suspectSet = new Set(SUSPECT_NAMES.map(([f, l]) => `${f}|${l}`));
  const filtered = leads.filter((l) =>
    suspectSet.has(`${l.first_name}|${l.last_name}`)
  );

  console.log(`\n📋 Checking ${filtered.length} suspect leads via Unipile...\n`);

  const results: Array<{
    id: string;
    name: string;
    company: string;
    linkedin_url: string;
    network_distance: string | null | undefined;
    is_relationship: boolean | undefined;
    verdict: "FIRST_DEGREE (sync broken)" | "SECOND_DEGREE (truly invited)" | "ERROR" | "NO_URL";
    error?: string;
  }> = [];

  for (const lead of filtered) {
    const name = `${lead.first_name} ${lead.last_name}`;
    if (!lead.linkedin_url) {
      results.push({
        id: lead.id,
        name,
        company: lead.company ?? "",
        linkedin_url: "",
        network_distance: null,
        is_relationship: undefined,
        verdict: "NO_URL",
      });
      continue;
    }

    const identifier = extractIdentifier(lead.linkedin_url);
    if (!identifier) {
      results.push({
        id: lead.id,
        name,
        company: lead.company ?? "",
        linkedin_url: lead.linkedin_url,
        network_distance: null,
        is_relationship: undefined,
        verdict: "ERROR",
        error: "Invalid LinkedIn URL",
      });
      continue;
    }

    try {
      const profile = await unipileGet<UnipileProfile>(`/users/${identifier}`, {
        account_id: KHALIL_ACCOUNT_ID,
      });
      const firstDeg = isFirstDegree(profile.network_distance);
      const connected = firstDeg || profile.is_relationship === true;
      results.push({
        id: lead.id,
        name,
        company: lead.company ?? "",
        linkedin_url: lead.linkedin_url,
        network_distance: profile.network_distance,
        is_relationship: profile.is_relationship,
        verdict: connected
          ? "FIRST_DEGREE (sync broken)"
          : "SECOND_DEGREE (truly invited)",
      });
      console.log(
        `  ${connected ? "🔴" : "⚪"} ${name.padEnd(32)} nd=${profile.network_distance ?? "null"}  rel=${profile.is_relationship}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: lead.id,
        name,
        company: lead.company ?? "",
        linkedin_url: lead.linkedin_url,
        network_distance: null,
        is_relationship: undefined,
        verdict: "ERROR",
        error: msg,
      });
      console.log(`  ⚠️  ${name.padEnd(32)} ERROR: ${msg.slice(0, 80)}`);
    }

    // Rate limit politeness: 500ms between calls
    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  const desynced = results.filter((r) => r.verdict === "FIRST_DEGREE (sync broken)");
  const trulyInvited = results.filter((r) => r.verdict === "SECOND_DEGREE (truly invited)");
  const errors = results.filter((r) => r.verdict === "ERROR");

  console.log("\n===== SUMMARY =====");
  console.log(`Total checked       : ${results.length}`);
  console.log(`🔴 Desynced (1st deg) : ${desynced.length}`);
  console.log(`⚪ Truly invited      : ${trulyInvited.length}`);
  console.log(`⚠️  Errors             : ${errors.length}`);

  if (desynced.length > 0) {
    console.log("\n===== DESYNCED LEADS (stage should be 'connected') =====");
    for (const r of desynced) {
      console.log(`  - ${r.id}  ${r.name}  (${r.company})`);
    }
    console.log(`\nIDs for UPDATE: ${desynced.map((r) => `'${r.id}'`).join(", ")}`);
  }

  // Output JSON for further processing
  console.log("\n===== FULL RESULTS (JSON) =====");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
