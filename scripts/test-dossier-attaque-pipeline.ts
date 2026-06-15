/**
 * E2E test of the dossier_attaque pipeline on a real lead.
 *
 * Steps:
 *  1. Pick the lead with the most complete enrichment_data (linkedin_posts present)
 *  2. Pretty-print enrichment_data
 *  3. Build the dossier input string via buildDossierInput()
 *  4. Direct callAI() to the dossier_attaque agent
 *  5. Parse the response and check all required fields
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { buildDossierInput } from "../lib/ai/lead-context";
import { callAI } from "../lib/ai/service";
import type { AgentId } from "../lib/ai/prompts/defaults";

const SONNET_MODEL = "claude-sonnet-4-6";

const REQUIRED_FIELDS = [
  "mecanisme",
  "accroche_pivot",
  "signal_declencheur",
  "preuves",
  "question_ouverte",
  "profilage_psycho",
  "ton_recommande",
  "ton_justification",
  "plan_b",
  "angle_qualite",
  "reserves",
] as const;

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }

function completenessScore(ed: Record<string, unknown>): number {
  let n = 0;
  if (ed.linkedin_profile) n += 2;
  if (Array.isArray(ed.linkedin_posts)) n += (ed.linkedin_posts as unknown[]).length;
  if (ed.company) n += 2;
  if ((ed.company as { news?: unknown[] } | undefined)?.news) n += 1;
  if ((ed.company as { website_analysis?: unknown } | undefined)?.website_analysis) n += 1;
  if (ed.signal) n += 1;
  if (ed.person) n += 1;
  return n;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const leadIdArg = process.argv.find((a) => a.startsWith("--lead-id="))?.split("=")[1];

  console.log(bold("\n=== STEP 1 — Fetching lead ==="));

  let picked: { id: string; first_name: string | null; last_name: string | null; title: string | null; company: string | null; linkedin_url: string | null; enrichment_data: unknown; user_id: string | null };

  if (leadIdArg) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, first_name, last_name, title, company, linkedin_url, enrichment_data, user_id")
      .eq("id", leadIdArg)
      .single();
    if (error) throw new Error(`Lead not found: ${error.message}`);
    picked = data;
    console.log(
      `Using lead: ${bold(`${picked.first_name ?? ""} ${picked.last_name ?? ""}`.trim())} ` +
        `@ ${picked.company ?? "?"} ` +
        dim(`(id=${picked.id})`)
    );
  } else {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, first_name, last_name, title, company, linkedin_url, enrichment_data, user_id")
      .not("enrichment_data", "is", null)
      .not("enrichment_data->linkedin_posts", "is", null)
      .limit(20);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    if (!leads || leads.length === 0) {
      console.log(red("No leads found with enrichment_data.linkedin_posts"));
      process.exit(1);
    }

    const scored = leads
      .map((l) => ({ lead: l, score: completenessScore((l.enrichment_data as Record<string, unknown>) || {}) }))
      .sort((a, b) => b.score - a.score);

    picked = scored[0].lead;
    console.log(
      `Auto-picked: ${bold(`${picked.first_name ?? ""} ${picked.last_name ?? ""}`.trim())} ` +
        `@ ${picked.company ?? "?"} ` +
        dim(`(id=${picked.id}, completeness=${scored[0].score})`)
    );
  }

  console.log(bold("\n=== STEP 2 — enrichment_data (pretty JSON) ==="));
  console.log(JSON.stringify(picked.enrichment_data, null, 2));

  console.log(bold("\n=== STEP 3 — buildDossierInput() formatted output ==="));
  const dossierInput = buildDossierInput(
    {
      first_name: picked.first_name,
      last_name: picked.last_name,
      title: picked.title,
      company: picked.company,
      linkedin_url: picked.linkedin_url,
    },
    picked.enrichment_data as Record<string, unknown> | null
  );
  console.log(dossierInput);

  console.log(bold("\n=== STEP 4 — callAI(dossier_attaque) ==="));
  const userId = picked.user_id;
  if (!userId) {
    console.log(red("Lead has no user_id — callAI needs one to load the API key"));
    process.exit(1);
  }
  console.log(dim(`Using userId=${userId}, model=${SONNET_MODEL}`));

  const t0 = Date.now();
  const resp = await callAI({
    userId,
    agentId: "dossier_attaque" as AgentId,
    messages: [{ role: "user", content: dossierInput }],
    maxTokens: 1500,
    temperature: 0.3,
    modelOverride: SONNET_MODEL,
    metadata: { leadId: picked.id, action: "test_dossier_attaque_pipeline" },
    supabaseOverride: supabase,
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(dim(`AI call completed in ${elapsed}s — tokens: in=${resp.usage.inputTokens}, out=${resp.usage.outputTokens}, cached=${resp.usage.cachedTokens}, cost~$${resp.usage.estimatedCostUsd.toFixed(4)}`));
  console.log(bold("\n--- Raw response text ---"));
  console.log(resp.text);

  console.log(bold("\n=== STEP 5 — Parse + verify required fields ==="));
  const clean = resp.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.log(red(`JSON.parse failed: ${e instanceof Error ? e.message : e}`));
    process.exit(2);
  }

  if (!parsed || typeof parsed !== "object") {
    console.log(red("Parsed value is not an object"));
    process.exit(2);
  }

  const missing: string[] = [];
  const malformed: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const v = (parsed as Record<string, unknown>)[f];
    if (v === undefined || v === null) {
      missing.push(f);
      continue;
    }
    if (f === "preuves") {
      if (!Array.isArray(v) || v.length === 0) malformed.push(`${f} (expected non-empty array, got ${typeof v})`);
    } else {
      if (typeof v !== "string" || v.trim().length === 0) malformed.push(`${f} (expected non-empty string, got ${typeof v})`);
    }
  }

  console.log(bold("\n--- Field check ---"));
  for (const f of REQUIRED_FIELDS) {
    const v = (parsed as Record<string, unknown>)[f];
    const present = v !== undefined && v !== null;
    const mark = present ? green("✓") : red("✗");
    const preview = present
      ? Array.isArray(v)
        ? `[${(v as unknown[]).length} items]`
        : String(v).slice(0, 80).replace(/\n/g, " ")
      : "—";
    console.log(`  ${mark} ${f.padEnd(22)} ${dim(preview)}`);
  }

  console.log(bold("\n=== REPORT ==="));
  if (missing.length === 0 && malformed.length === 0) {
    console.log(green("✓ SUCCESS — all 11 required fields present and well-formed"));
    process.exit(0);
  } else {
    if (missing.length > 0) console.log(red(`✗ Missing fields (${missing.length}): ${missing.join(", ")}`));
    if (malformed.length > 0) console.log(yellow(`⚠ Malformed fields (${malformed.length}): ${malformed.join(", ")}`));
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(red("\nFATAL:"), e instanceof Error ? e.stack || e.message : e);
  process.exit(1);
});
