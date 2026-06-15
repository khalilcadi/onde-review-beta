/**
 * Full re-run via les fonctions RÉELLES des endpoints (bypass HTTP/auth seulement) :
 *   - enrichSingleLead()  = logique de POST /api/ai/enrich
 *   - callAI + buildLeadContext + buildUserPrompt + parseGenerationResponse = POST /api/ai/generate
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-enrich-and-m1.ts --lead-id=<uuid>
 *
 * MUTE la DB (enrichment_data réécrit). Web search = Haiku, dossier/M1 = Sonnet.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { enrichSingleLead } from "../app/api/ai/enrich/route";
import {
  buildLeadContext,
  buildUserPrompt,
  parseGenerationResponse,
  type LeadForGeneration,
} from "../lib/ai/lead-context";
import { callAI } from "../lib/ai/service";

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function hr(t: string) { console.log(bold(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`)); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry-on-429 (rate limit Sonnet 30k tok/min). */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < 3) {
        console.log(yellow(`⚠ 429 (${label}) — attente 65s puis retry ${attempt}/2...`));
        await sleep(65000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`${label}: unreachable`);
}

function rowToLeadFG(row: Record<string, unknown>): LeadForGeneration {
  return {
    id: row.id as string,
    firstName: (row.first_name as string) ?? "",
    lastName: (row.last_name as string) ?? "",
    title: row.title as string | null,
    company: row.company as string | null,
    linkedinUrl: (row.linkedin_url as string) ?? "",
    score: row.score as number | null,
    status: row.status as string | null,
    stage: row.stage as string | null,
    tags: row.tags as string[] | null,
    notes: row.notes as string | null,
    enrichmentData: row.enrichment_data as LeadForGeneration["enrichmentData"],
  };
}

/** Réplique resolveSignalType de generate/route.ts */
function resolveSignalType(lead: LeadForGeneration): string | undefined {
  if (lead.enrichmentData?.signal?.type) return lead.enrichmentData.signal.type;
  const gojiTag = lead.tags?.find((t) => t.startsWith("goji:"));
  return gojiTag ? gojiTag.replace("goji:", "") : undefined;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const leadId = process.argv.find((a) => a.startsWith("--lead-id="))?.split("=")[1];
  if (!leadId) throw new Error("Usage: --lead-id=<uuid>");

  const supabase = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // === Charger le lead ===
  const { data: row0, error } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (error || !row0) throw new Error(`Lead introuvable: ${error?.message}`);
  const userId = (row0 as Record<string, unknown>).user_id as string;
  const leadFG = rowToLeadFG(row0 as Record<string, unknown>);
  console.log(bold(`Lead: ${leadFG.firstName} ${leadFG.lastName} @ ${leadFG.company} (user=${userId})`));

  // === STEP A — Enrichment (logique réelle de /api/ai/enrich) ===
  hr("STEP A — enrichSingleLead() [= POST /api/ai/enrich]");
  const enrichResult = await withRetry(() => enrichSingleLead(leadFG, userId, supabase), "enrich") as Record<string, unknown>;
  console.log(green("✓ enrichSingleLead terminé"));
  if (enrichResult.warning) console.log(yellow(`⚠ warning: ${enrichResult.warning}`));

  // === STEP B — Query de vérification ===
  hr("STEP B — SELECT web_research, dossier, hook_recommande");
  const { data: row1 } = await supabase
    .from("leads")
    .select("enrichment_data")
    .eq("id", leadId)
    .single();
  const ed = ((row1 as Record<string, unknown>)?.enrichment_data || {}) as Record<string, unknown>;
  const web_research = ed.web_research ?? null;
  const dossier = ed.dossier ?? null;
  const hook_old = ed.hook_recommande ?? null;

  console.log(bold("\nweb_research:"));
  console.log(JSON.stringify(web_research, null, 2)?.slice(0, 1500));
  console.log(bold("\ndossier (clés):"), dossier ? Object.keys(dossier as object).join(", ") : "(null)");
  console.log(bold("hook_recommande (ancien):"), JSON.stringify(hook_old));

  // === Vérifications ===
  hr("VÉRIFICATIONS");
  const dossierOk = dossier != null && typeof dossier === "object";
  const hookOk = hook_old == null;
  const webOk = web_research != null && typeof web_research === "object";
  console.log(`${dossierOk ? green("✓") : red("✗")} dossier populé et non-null`);
  console.log(`${hookOk ? green("✓") : red("✗")} hook_recommande absent ou null`);
  console.log(`${webOk ? green("✓") : red("✗")} web_research populé`);

  // === STEP C — M1 generation (logique réelle de /api/ai/generate) ===
  hr("STEP C — M1 generation [= POST /api/ai/generate]");
  console.log(dim("Pause 65s avant M1 (reset budget Sonnet 30k/min)..."));
  await sleep(65000);

  const fullLead = rowToLeadFG({ ...(row0 as Record<string, unknown>), enrichment_data: ed });
  const actionType = "invitation";
  const isFirstContact = true; // pas de séquence → premier contact
  const signalType = resolveSignalType(fullLead);
  const runtimeContext = buildLeadContext(fullLead, actionType, undefined, undefined, undefined);
  const userPrompt = buildUserPrompt(fullLead, actionType, undefined, undefined, undefined, { withReasoning: true });
  const icpSegment = fullLead.enrichmentData?.scoring_detail?.segment_icp;

  const response = await withRetry(() => callAI({
    userId,
    agentId: "prospection_m1",
    runtimeContext,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1200,
    metadata: { leadId, actionType },
    icpSegment,
    signalType,
    supabaseOverride: supabase,
  }), "M1");

  const parsed = parseGenerationResponse(response.text, isFirstContact);

  hr("RÉSULTAT M1");
  if (parsed.m1) {
    console.log(bold("variante_a.message:"));
    console.log(parsed.m1.variante_a.message);
    console.log(bold("\nvariante_a.angle:"), parsed.m1.variante_a.angle);
    console.log(bold("\ncanal:"), parsed.m1.canal, "| canal_recommande:", parsed.m1.canal_recommande, "| persona:", parsed.m1.persona);
    console.log(bold("\nreasoning:"));
    console.log(parsed.m1.reasoning ?? parsed.reasoning ?? "(aucun)");
  } else {
    console.log(red("Pas de bloc M1 parsé. Réponse brute (500c):"));
    console.log(response.text.slice(0, 500));
  }

  console.log(green(bold("\n✅ Terminé.")));
  process.exit(0);
}

main().catch((e) => { console.error(red(`\nFATAL: ${e instanceof Error ? e.stack : e}`)); process.exit(1); });
