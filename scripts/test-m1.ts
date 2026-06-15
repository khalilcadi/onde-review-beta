/**
 * Test M1 generation — appelle les fonctions internes avec un lead réel de la DB.
 *
 * USAGE: npx tsx scripts/test-m1.ts
 *
 * Affiche :
 * 1. Lead sélectionné
 * 2. System prompt (agent prompt + RAG)
 * 3. User prompt
 * 4. Réponse JSON brute de Claude
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ---- MODE: "M1" ou "M2" — changer ici pour tester ----
const MODE: "M1" | "M2" = (process.argv[2]?.toUpperCase() === "M2" ? "M2" : "M1") as "M1" | "M2";

// Service role client (bypass RLS, pas de cookies)
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("\n========== [TEST M1] Recherche d'un lead en séquence active... ==========\n");

  // 1. Trouver un lead dans une séquence active, idéalement step 1
  const { data: sequenceLeads, error: slError } = await supabase
    .from("sequence_leads")
    .select(`
      id,
      current_step,
      status,
      lead_id,
      sequence_id,
      sequences!inner ( id, name, status ),
      leads!inner ( id, first_name, last_name, title, company, linkedin_url, email, score, status, stage, tags, notes, enrichment_data, user_id )
    `)
    .eq("status", "active")
    .eq("sequences.status", "active")
    .order("current_step", { ascending: true })
    .limit(5);

  if (slError) {
    console.error("Erreur requête sequence_leads:", slError);
    process.exit(1);
  }

  if (!sequenceLeads || sequenceLeads.length === 0) {
    console.log("Aucun lead trouvé dans une séquence active. Recherche d'un lead enrichi...");

    // Fallback : prendre un lead enrichi quelconque
    const { data: fallbackLeads, error: fbError } = await supabase
      .from("leads")
      .select("*")
      .not("enrichment_data", "is", null)
      .order("score", { ascending: false })
      .limit(1);

    if (fbError || !fallbackLeads?.length) {
      console.error("Aucun lead trouvé en DB.", fbError);
      process.exit(1);
    }

    const lead = fallbackLeads[0];
    console.log(`\nLead fallback: ${lead.first_name} ${lead.last_name} (${lead.title} @ ${lead.company})`);
    console.log(`Score: ${lead.score} | Stage: ${lead.stage} | LinkedIn: ${lead.linkedin_url}`);

    await runM1Generation(lead as unknown as Record<string, unknown>, lead.user_id, null);
    return;
  }

  // Afficher les candidats
  console.log(`${sequenceLeads.length} lead(s) trouvé(s) en séquence active:\n`);
  for (const sl of sequenceLeads) {
    const lead = sl.leads as unknown as Record<string, unknown>;
    const seq = sl.sequences as unknown as Record<string, unknown>;
    console.log(`  - ${lead.first_name} ${lead.last_name} (${lead.title} @ ${lead.company})`);
    console.log(`    Séquence: "${seq.name}" | Step: ${sl.current_step} | Score: ${lead.score}`);
  }

  // Prendre le premier (step le plus bas)
  const selected = sequenceLeads[0];
  const lead = selected.leads as unknown as Record<string, unknown>;
  const seq = selected.sequences as unknown as Record<string, unknown>;

  console.log(`\n>>> Sélectionné: ${lead.first_name} ${lead.last_name} — séquence "${seq.name}", step ${selected.current_step}\n`);

  await runM1Generation(lead, lead.user_id as string, selected);
}

async function runM1Generation(
  leadRow: Record<string, unknown>,
  userId: string,
  sequenceLead: { current_step: number; sequence_id: string } | null
) {
  // Import dynamique des fonctions internes
  const { buildSystemPromptParts } = await import("@/lib/ai/prompts/service");
  const { buildLeadContext, buildUserPrompt } = await import("@/lib/ai/lead-context");
  const { callAI } = await import("@/lib/ai/service");

  // Mapper le lead DB vers LeadForGeneration
  const lead = {
    id: leadRow.id as string,
    firstName: (leadRow.first_name as string) || "",
    lastName: (leadRow.last_name as string) || "",
    title: leadRow.title as string | null,
    company: leadRow.company as string | null,
    linkedinUrl: leadRow.linkedin_url as string,
    score: leadRow.score as number | null,
    status: leadRow.status as string | null,
    stage: leadRow.stage as string | null,
    tags: leadRow.tags as string[] | null,
    notes: leadRow.notes as string | null,
    enrichmentData: leadRow.enrichment_data as Record<string, unknown> | null,
  };

  // Détecter le segment ICP depuis l'enrichment
  const scoringDetail = lead.enrichmentData?.scoring_detail as Record<string, unknown> | undefined;
  const icpSegment = (scoringDetail?.segment_icp as string) || "B";
  const signalType = (lead.enrichmentData?.signal as Record<string, unknown>)?.type as string | undefined;

  console.log("========== [1] LEAD CONTEXT ==========\n");
  console.log(`ICP Segment: ${icpSegment}`);
  console.log(`Signal Type: ${signalType || "aucun"}`);
  console.log(`Enrichment keys: ${lead.enrichmentData ? Object.keys(lead.enrichmentData).join(", ") : "none"}`);

  // Construire les prompts
  console.log("\n========== [2] SYSTEM PROMPT PARTS ==========\n");

  const stepNum = MODE === "M2" ? 2 : 1;
  const m2Situation = MODE === "M2" ? "relance" as const : undefined;

  const { prompt: agentPrompt, rag: ragContext } = await buildSystemPromptParts(
    "prospection",
    userId,
    supabase,
    icpSegment,
    stepNum,
    m2Situation,
    signalType,
    undefined // leadResponseType
  );

  console.log(`--- AGENT PROMPT (${agentPrompt.length} chars, ~${Math.ceil(agentPrompt.length / 4)} tokens) ---`);
  console.log(agentPrompt.substring(0, 500) + "\n...\n");

  console.log(`--- RAG CONTEXT (${ragContext?.length || 0} chars, ~${Math.ceil((ragContext?.length || 0) / 4)} tokens) ---`);
  if (ragContext) {
    // Extraire les titres des blocs
    const blocTitles = ragContext.match(/### ([^\n]+)/g) || [];
    console.log(`Blocs injectés (${blocTitles.length}):`);
    for (const t of blocTitles) {
      console.log(`  ${t}`);
    }
    console.log("\n" + ragContext.substring(0, 800) + "\n...\n");
  } else {
    console.log("(aucun RAG injecté)\n");
  }

  // Runtime context (lead data)
  const actionType = MODE === "M1" ? "invitation" : "message";
  const previousMessages = MODE === "M2" ? ["Bonjour Franck, [message M1 précédent simulé]"] : undefined;
  const runtimeContext = buildLeadContext(lead, actionType, undefined, undefined, {
    current: stepNum,
    total: 3,
    previousMessages,
  });

  console.log("========== [3] RUNTIME CONTEXT (lead data) ==========\n");
  console.log(runtimeContext);

  // User prompt
  const userPrompt = buildUserPrompt(
    lead,
    actionType,
    undefined, // currentMessage
    undefined, // feedback
    { current: stepNum, total: 3, previousMessages },
    { withReasoning: true }
  );

  console.log("\n========== [4] USER PROMPT ==========\n");
  console.log(userPrompt);

  // Appel IA
  console.log(`\n========== [5] APPEL CLAUDE (${MODE})... ==========\n`);

  try {
    const response = await callAI({
      userId,
      agentId: "prospection",
      runtimeContext,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1024,
      temperature: 0.7,
      supabaseOverride: supabase,
      icpSegment,
      sequenceStep: stepNum,
      signalType,
      m2Situation: MODE === "M2" ? "relance" : undefined,
      metadata: { test: true, lead_id: lead.id, mode: MODE },
    });

    console.log("========== [6] RÉPONSE BRUTE ==========\n");
    console.log(response.text);

    console.log("\n========== [7] USAGE ==========\n");
    console.log(`Input tokens: ${response.usage.inputTokens}`);
    console.log(`Output tokens: ${response.usage.outputTokens}`);
    console.log(`Cached tokens: ${response.usage.cachedTokens}`);
    console.log(`Coût estimé: $${response.usage.estimatedCostUsd.toFixed(4)}`);

    // Parse selon le mode
    if (MODE === "M1") {
      const { parseM1Response } = await import("@/lib/ai/lead-context");
      const parsed = parseM1Response(response.text);
      if (parsed) {
        console.log("\n========== [8] PARSED M1 ==========\n");
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log("\n!! Parsing M1 échoué — réponse brute ci-dessus");
      }
    } else {
      const { parseM2Response } = await import("@/lib/ai/lead-context");
      const parsed = parseM2Response(response.text);
      if (parsed) {
        console.log("\n========== [8] PARSED M2 ==========\n");
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log("\n!! Parsing M2 échoué — réponse brute ci-dessus");
      }
    }
  } catch (err) {
    console.error("\n!! Erreur appel IA:", err);
  }

  console.log(`\n========== FIN TEST ${MODE} ==========\n`);
}

main().catch(console.error);
