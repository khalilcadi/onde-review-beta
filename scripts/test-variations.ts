/**
 * CLI script to test A/B prompt variations on a specific lead.
 *
 * USAGE:
 *   npx tsx scripts/test-variations.ts [leadId]
 *
 * If no leadId is provided, picks the first enriched lead from the database.
 * Requires .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * either ANTHROPIC_API_KEY or a user Claude key in DB.
 */

// Immediate output to verify script starts
process.stdout.write("[test-variations] Script demarre...\n");

import dotenv from "dotenv";
import path from "path";

// Load .env.local from project root (resolve relative to this script)
const envPath = path.resolve(__dirname, "..", ".env.local");
const envResult = dotenv.config({ path: envPath, quiet: true });

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

function logErr(msg: string) {
  process.stderr.write(msg + "\n");
}

if (envResult.error) {
  logErr(`[WARN] Could not load ${envPath}: ${envResult.error.message}`);
  // Try cwd fallback
  dotenv.config({ path: ".env.local" });
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logErr("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local");
    process.exit(1);
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Find lead
// ---------------------------------------------------------------------------

async function findLeadId(providedId?: string): Promise<string> {
  if (providedId) return providedId;

  log("Aucun leadId fourni -- recherche du premier lead enrichi...\n");
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, enrichment_data")
    .not("enrichment_data", "is", null)
    .order("score", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    logErr("Aucun lead enrichi trouve en base. " + (error?.message || ""));
    process.exit(1);
  }

  log(`Lead trouve : ${data.first_name} ${data.last_name} (${data.company || "?"})\n`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Core logic — calls Claude 6 times in parallel
// ---------------------------------------------------------------------------

async function callTestVariations(leadId: string) {
  log("[1/5] Import des modules...");

  let buildLeadContext: any, buildUserPrompt: any;
  try {
    const mod = await import("../lib/ai/lead-context");
    buildLeadContext = mod.buildLeadContext;
    buildUserPrompt = mod.buildUserPrompt;
  } catch (e: any) {
    logErr("Erreur import lead-context: " + e.message);
    process.exit(1);
  }

  let buildRagContext: any;
  try {
    const mod = await import("../lib/rag/context");
    buildRagContext = mod.buildRagContext;
  } catch (e: any) {
    logErr("Erreur import rag/context: " + e.message);
    process.exit(1);
  }

  let PROMPT_VARIATIONS: any, VARIATION_LABELS: any;
  try {
    const mod = await import("../lib/ai/prompts/variations");
    PROMPT_VARIATIONS = mod.PROMPT_VARIATIONS;
    VARIATION_LABELS = mod.VARIATION_LABELS;
  } catch (e: any) {
    logErr("Erreur import variations: " + e.message);
    process.exit(1);
  }

  let Anthropic: any;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch (e: any) {
    logErr("Erreur import anthropic SDK: " + e.message);
    process.exit(1);
  }

  log("[2/5] Chargement du lead...");
  const supabase = getServiceClient();

  const { data: dbLead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (error || !dbLead) {
    logErr("Lead introuvable: " + (error?.message || ""));
    process.exit(1);
  }

  const lead = {
    id: dbLead.id,
    firstName: dbLead.first_name ?? "",
    lastName: dbLead.last_name ?? "",
    title: dbLead.title,
    company: dbLead.company,
    linkedinUrl: dbLead.linkedin_url,
    score: dbLead.score,
    status: dbLead.status,
    stage: dbLead.stage,
    tags: dbLead.tags,
    notes: dbLead.notes,
    enrichmentData: dbLead.enrichment_data as any,
  };

  log("[3/5] Construction du contexte...");
  const actionType = "invitation";
  const runtimeContext = buildLeadContext(lead, actionType);
  const userPrompt = buildUserPrompt(lead, actionType);
  const ragContext = await buildRagContext("prospection");

  log("[4/5] Resolution de la cle API...");
  const userId = dbLead.user_id;
  let apiKey: string | null = null;

  // Try to get user's encrypted key from DB
  try {
    const { getDecryptedApiKey } = await import("../lib/actions/settings");
    apiKey = await getDecryptedApiKey(userId, "claude", supabase);
  } catch {
    // DB key not available, fall through
  }
  apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";

  if (!apiKey) {
    logErr("Pas de cle API Claude (ni en DB, ni en env ANTHROPIC_API_KEY).");
    process.exit(1);
  }

  // Load user model preference
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const model = (settings.ai_model as string) || "claude-sonnet-4-5-20250929";

  log(`[5/5] Generation des 6 variations en parallele (modele: ${model})...\n`);

  const anthropic = new Anthropic({ apiKey });

  type VarKey = keyof typeof PROMPT_VARIATIONS;
  const keys = Object.keys(PROMPT_VARIATIONS) as VarKey[];

  const results = await Promise.all(
    keys.map(async (key) => {
      const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [
        { type: "text", text: PROMPT_VARIATIONS[key], cache_control: { type: "ephemeral" } },
      ];
      if (ragContext) systemBlocks.push({ type: "text", text: ragContext });
      if (runtimeContext) systemBlocks.push({ type: "text", text: runtimeContext });

      const result = await anthropic.messages.create({
        model,
        max_tokens: 512,
        temperature: 0.7,
        system: systemBlocks,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textContent = result.content.find((c: any) => c.type === "text");
      const text = textContent && "text" in textContent ? (textContent as any).text.trim() : "";
      const inputTokens = result.usage.input_tokens ?? 0;
      const outputTokens = result.usage.output_tokens ?? 0;

      return {
        key,
        label: VARIATION_LABELS[key],
        message: text,
        chars: text.length,
        tokens_in: inputTokens,
        tokens_out: outputTokens,
      };
    })
  );

  return { lead, runtimeContext, userPrompt, ragContext, results, model };
}

// ---------------------------------------------------------------------------
// Display — plain text blocks, no table
// ---------------------------------------------------------------------------

function display(data: Awaited<ReturnType<typeof callTestVariations>>) {
  const { lead, runtimeContext, userPrompt, results, model } = data;

  const signal = lead.enrichmentData?.signal?.type || "aucun";
  const contextLevel =
    signal && !["FROID", "SIGNAL_FAIBLE", "aucun"].includes(signal) ? "FORT" : "FAIBLE";

  log("============================================================");
  log(`LEAD: ${lead.firstName} ${lead.lastName} (${lead.title || "?"} @ ${lead.company || "?"})`);
  log(`Score: ${lead.score ?? "?"} | Signal: ${signal} | Contexte: ${contextLevel}`);
  log(`Modele: ${model}`);
  log("============================================================\n");

  // --- Each variation as a full block ---
  for (const r of results) {
    log(`=== ${r.label} (${r.chars} chars) ===`);
    log(r.message);
    log("");
  }

  // --- Context sent ---
  log("=== Contexte envoye ===");
  log("");
  log("-- User Prompt --");
  log(userPrompt);
  log("");
  log("-- Runtime Context (extrait) --");
  // Show first 1500 chars to keep it readable
  const ctxPreview = runtimeContext.length > 1500
    ? runtimeContext.slice(0, 1500) + "\n[... tronque a 1500 chars]"
    : runtimeContext;
  log(ctxPreview);
  log("");

  // --- Hooks / enrichment elements ---
  const hooks: string[] = [];
  if (lead.enrichmentData?.hook_recommande?.fait_concret) {
    hooks.push("Fait concret: " + lead.enrichmentData.hook_recommande.fait_concret);
  }
  if (lead.enrichmentData?.signal?.intent_keyword) {
    hooks.push("Keyword: " + lead.enrichmentData.signal.intent_keyword);
  }
  if (hooks.length > 0) {
    log("=== Elements de personnalisation ===");
    for (const h of hooks) log("  " + h);
    log("");
  }

  // --- Token summary ---
  const totalIn = results.reduce((s: number, r: { tokens_in: number }) => s + r.tokens_in, 0);
  const totalOut = results.reduce((s: number, r: { tokens_out: number }) => s + r.tokens_out, 0);
  log(`Tokens: ${totalIn} in / ${totalOut} out (6 appels)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const providedId = process.argv[2];
  const leadId = await findLeadId(providedId);
  const data = await callTestVariations(leadId);
  display(data);
}

main().catch((err) => {
  logErr("Erreur: " + (err?.message || err));
  if (err?.stack) logErr(err.stack);
  process.exit(1);
});
