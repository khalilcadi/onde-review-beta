/**
 * Test end-to-end de la génération M1 avec dossier d'attaque.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-m1-generation.ts --lead-id=<uuid>
 *
 * Comportement:
 *  1. Charge le lead depuis Supabase
 *  2. Si enrichment_data.dossier absent → génère le dossier d'attaque d'abord
 *  3. Appelle l'agent prospection avec buildLeadContext (dossier injecté)
 *  4. Affiche le message M1 généré + méta (tokens, coût, directive contexte)
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { buildLeadContext, buildUserPrompt, buildDossierInput } from "../lib/ai/lead-context";
import { callAI } from "../lib/ai/service";
import type { AgentId } from "../lib/ai/prompts/defaults";

const SONNET_MODEL = "claude-sonnet-4-6";

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const leadIdArg = process.argv.find((a) => a.startsWith("--lead-id="))?.split("=")[1];
  if (!leadIdArg) throw new Error("Usage: --lead-id=<uuid>");

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // === STEP 1 — Charger le lead ===
  console.log(bold("\n=== STEP 1 — Chargement du lead ==="));

  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, user_id")
    .eq("id", leadIdArg)
    .single();

  if (error || !lead) throw new Error(`Lead not found: ${error?.message}`);

  console.log(`Lead : ${bold(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim())} @ ${lead.company ?? "?"}`);
  console.log(dim(`id=${lead.id} | score=${lead.score} | stage=${lead.stage}`));

  const ed = (lead.enrichment_data || {}) as Record<string, unknown>;
  const userId = lead.user_id!;

  // === STEP 2 — Dossier d'attaque (génère si absent) ===
  let dossier = ed.dossier as Record<string, unknown> | undefined;

  if (dossier) {
    console.log(green(`\n✓ Dossier d'attaque déjà présent en DB (angle=${dossier.angle_qualite})`));
  } else {
    console.log(yellow("\n⚠ Dossier absent — génération à la volée..."));

    const dossierInput = buildDossierInput(
      { first_name: lead.first_name, last_name: lead.last_name, title: lead.title, company: lead.company, linkedin_url: lead.linkedin_url },
      ed
    );

    const t0 = Date.now();
    const resp = await callAI({
      userId,
      agentId: "dossier_attaque" as AgentId,
      messages: [{ role: "user", content: dossierInput }],
      maxTokens: 1500,
      temperature: 0.3,
      modelOverride: SONNET_MODEL,
      metadata: { leadId: lead.id, action: "test_m1_dossier_inline" },
      supabaseOverride: supabase,
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(dim(`Dossier généré en ${elapsed}s — tokens: in=${resp.usage.inputTokens}, out=${resp.usage.outputTokens}, cost~$${resp.usage.estimatedCostUsd.toFixed(4)}`));

    const clean = resp.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      dossier = JSON.parse(clean) as Record<string, unknown>;
      console.log(green(`✓ Dossier généré : angle=${dossier.angle_qualite}, mécanisme=${dossier.mecanisme}`));
    } catch {
      console.log(yellow("⚠ JSON parse échoué — on continue sans dossier"));
      dossier = undefined;
    }
  }

  // === STEP 3 — Construire le contexte lead pour l'agent prospection ===
  console.log(bold("\n=== STEP 2 — buildLeadContext (agent prospection) ==="));

  const enrichmentWithDossier = dossier ? { ...ed, dossier } : ed;

  const leadForGen = {
    id: lead.id,
    firstName: lead.first_name ?? "",
    lastName: lead.last_name ?? "",
    displayName: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
    title: lead.title ?? undefined,
    company: lead.company ?? undefined,
    linkedinUrl: lead.linkedin_url ?? "",
    score: lead.score ?? 0,
    status: (lead.status ?? "cold") as "cold" | "warm" | "hot" | "converted" | "lost",
    stage: (lead.stage ?? "to_invite") as "to_invite" | "invited" | "connected" | "in_sequence" | "responded" | "meeting" | "closed",
    tags: (lead.tags as string[]) ?? [],
    notes: lead.notes ?? undefined,
    enrichmentData: enrichmentWithDossier as Parameters<typeof buildLeadContext>[0]["enrichmentData"],
    userId: lead.user_id ?? "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const runtimeContext = buildLeadContext(leadForGen, "message");
  const userMessage = buildUserPrompt(leadForGen, "message");

  console.log(dim(`\n--- Runtime context (${runtimeContext.length} chars) ---`));
  console.log(dim(runtimeContext.slice(0, 600) + (runtimeContext.length > 600 ? "\n[...tronqué]" : "")));
  console.log(dim(`\n--- User prompt (${userMessage.length} chars) ---`));
  console.log(dim(userMessage.slice(0, 400) + (userMessage.length > 400 ? "\n[...tronqué]" : "")));

  // === STEP 4 — Appel agent prospection ===
  console.log(bold("\n=== STEP 3 — callAI(prospection) → M1 ==="));

  const t1 = Date.now();
  const m1Resp = await callAI({
    userId,
    agentId: "prospection" as AgentId,
    messages: [{ role: "user", content: userMessage }],
    runtimeContext,
    maxTokens: 800,
    temperature: 0.7,
    modelOverride: SONNET_MODEL,
    metadata: { leadId: lead.id, action: "test_m1_generation" },
    supabaseOverride: supabase,
  });

  const elapsed1 = ((Date.now() - t1) / 1000).toFixed(1);
  console.log(dim(`Généré en ${elapsed1}s — tokens: in=${m1Resp.usage.inputTokens}, out=${m1Resp.usage.outputTokens}, cached=${m1Resp.usage.cachedTokens}, cost~$${m1Resp.usage.estimatedCostUsd.toFixed(4)}`));

  console.log(bold("\n" + "─".repeat(60)));
  console.log(cyan("MESSAGE M1 GÉNÉRÉ :"));
  console.log(bold("─".repeat(60)));
  console.log(m1Resp.text);
  console.log(bold("─".repeat(60)));

  // Résumé dossier utilisé
  if (dossier) {
    console.log(bold("\n=== DOSSIER UTILISÉ ==="));
    console.log(`Mécanisme    : ${dossier.mecanisme ?? "—"}`);
    console.log(`Angle qualité: ${dossier.angle_qualite ?? "—"}`);
    console.log(`Accroche     : ${dossier.accroche_pivot ?? "null"}`);
    console.log(`Signal       : ${dossier.signal_declencheur ?? "—"}`);
    console.log(`Ton          : ${dossier.ton_recommande ?? "—"}`);
  }
}

main().catch((e) => {
  console.error(`\x1b[31mFATAL:\x1b[0m`, e instanceof Error ? e.stack || e.message : e);
  process.exit(1);
});
