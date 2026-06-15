/**
 * Script: regénère les M1 pour les 4 leads "connected" de Khalil
 * après la suppression des 17 messages M1 du 17 avril.
 *
 * Réplique la logique exacte du cron generate-actions (même callAI, même
 * buildSystemPromptParts, même parseGenerationResponse, même humanizeMessage).
 *
 * Usage: npx tsx scripts/regen-m1-khalil-2026-04-17.ts [--dry]
 *   --dry : n'insère pas l'action en DB, affiche seulement le message généré
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const DRY = process.argv.includes("--dry");
const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

const TARGETS = [
  { firstName: "Lucas", lastName: "Pocthier Peccoz" },
  { firstName: "Constant", lastName: "SANDJO" },
  { firstName: "Mathieu", lastName: "VINOIS" },
  { firstName: "Marieliesse", lastName: "Gouilliard" },
];

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LeadForGeneration {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  company: string | null;
  linkedinUrl: string;
  score: number | null;
  status: string | null;
  stage: string | null;
  tags: string[] | null;
  notes: string | null;
  enrichmentData: {
    scoring_detail?: { segment_icp?: string };
    signal?: { type?: string };
    [k: string]: unknown;
  } | null;
}

function resolveSignalType(lead: LeadForGeneration): string | undefined {
  if (lead.enrichmentData?.signal?.type) return lead.enrichmentData.signal.type as string;
  if (lead.tags?.length) {
    const goji = lead.tags.find((t) => t.startsWith("goji:"));
    if (goji) return goji.replace("goji:", "");
  }
  return undefined;
}

async function main() {
  console.log(`\n===== REGEN M1 (${DRY ? "DRY RUN" : "LIVE"}) — 4 leads =====\n`);

  const { buildLeadContext, buildUserPrompt, parseGenerationResponse } =
    await import("@/lib/ai/lead-context");
  const { callAI } = await import("@/lib/ai/service");
  const { humanizeMessage } = await import("@/lib/humanize");

  const generatedAll: Array<{
    lead: string;
    company: string;
    seqName: string;
    canal?: string;
    varianteA?: { angle: string; message: string };
    varianteB?: { angle: string; message: string };
    rawReasoning?: string;
    actionId?: string;
    skipReason?: string;
  }> = [];

  for (const target of TARGETS) {
    console.log(`\n────────────────────────────────────────`);
    console.log(`📌 ${target.firstName} ${target.lastName}`);
    console.log(`────────────────────────────────────────`);

    // 1. Load lead
    const { data: leadRow, error: leadErr } = await supabase
      .from("leads")
      .select(
        "id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data"
      )
      .eq("user_id", KHALIL_USER_ID)
      .eq("first_name", target.firstName)
      .eq("last_name", target.lastName)
      .single();

    if (leadErr || !leadRow) {
      console.log(`  ❌ Lead introuvable: ${leadErr?.message}`);
      generatedAll.push({
        lead: `${target.firstName} ${target.lastName}`,
        company: "",
        seqName: "",
        skipReason: `lead not found: ${leadErr?.message}`,
      });
      continue;
    }

    const lead: LeadForGeneration = {
      id: leadRow.id,
      firstName: leadRow.first_name ?? "",
      lastName: leadRow.last_name ?? "",
      title: leadRow.title,
      company: leadRow.company,
      linkedinUrl: leadRow.linkedin_url!,
      score: leadRow.score,
      status: leadRow.status,
      stage: leadRow.stage,
      tags: leadRow.tags,
      notes: leadRow.notes,
      enrichmentData: leadRow.enrichment_data as LeadForGeneration["enrichmentData"],
    };

    // 2. Find active sequence_lead
    const { data: slData } = await supabase
      .from("sequence_leads")
      .select(
        "id, current_step, status, sequence_id, sequences!inner(id, name, status)"
      )
      .eq("lead_id", lead.id)
      .eq("status", "active")
      .eq("sequences.status", "active")
      .single();

    if (!slData) {
      console.log(`  ❌ Pas de sequence_lead actif`);
      generatedAll.push({
        lead: `${lead.firstName} ${lead.lastName}`,
        company: lead.company ?? "",
        seqName: "",
        skipReason: "no active sequence_lead",
      });
      continue;
    }

    const seqInfo = slData.sequences as unknown as { id: string; name: string };

    // 3. Find next step
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id, step_type, delay_days, template, generation_mode, step_order")
      .eq("sequence_id", seqInfo.id)
      .order("step_order", { ascending: true });

    if (!steps?.length) {
      console.log(`  ❌ Pas de steps`);
      continue;
    }

    const nextStep = steps.find((s) => s.step_order === slData.current_step + 1);
    if (!nextStep) {
      console.log(`  ❌ Pas de step suivant`);
      continue;
    }

    // 4. Check if action already exists for this step (idempotence)
    const { count: existingCount } = await supabase
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("step_id", nextStep.id)
      .in("status", ["pending", "validated", "processing", "sent"]);

    if ((existingCount ?? 0) > 0) {
      console.log(
        `  ⏭  Action déjà présente pour step ${nextStep.step_order} — skip`
      );
      generatedAll.push({
        lead: `${lead.firstName} ${lead.lastName}`,
        company: lead.company ?? "",
        seqName: seqInfo.name,
        skipReason: "action already exists",
      });
      continue;
    }

    // 5. Build context
    const icpSegment = lead.enrichmentData?.scoring_detail?.segment_icp;
    const signalType = resolveSignalType(lead);
    const sequenceStepObj = { current: 1, total: steps.filter((s) => ["message", "inmail"].includes(s.step_type)).length, previousMessages: [] };

    const runtimeContext = buildLeadContext(
      lead,
      nextStep.step_type,
      undefined,
      undefined,
      sequenceStepObj
    );

    const userPrompt = buildUserPrompt(
      lead,
      nextStep.step_type,
      undefined,
      undefined,
      sequenceStepObj,
      { withReasoning: true }
    );

    console.log(`  📊 ICP segment: ${icpSegment ?? "∅"} | Signal: ${signalType ?? "∅"}`);
    console.log(`  🎯 Séquence: "${seqInfo.name}" | Step ${nextStep.step_order} (${nextStep.step_type})`);

    // 6. Call AI
    let aiResult;
    try {
      aiResult = await callAI({
        userId: KHALIL_USER_ID,
        agentId: "prospection",
        runtimeContext,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
        metadata: {
          leadId: lead.id,
          sequenceId: seqInfo.id,
          stepId: nextStep.id,
          cron: "regen-manual-2026-04-17",
        },
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: 1,
        signalType,
      });
    } catch (err) {
      console.log(`  ❌ callAI error: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    // 7. Parse
    const parsed = parseGenerationResponse(aiResult.text, true); // isFirstContact=true

    if (!parsed.m1) {
      console.log(`  ⚠️  Parsing M1 a échoué. Réponse brute :\n`);
      console.log(aiResult.text);
      continue;
    }

    // 8. Display variants
    if (parsed.m1.canal === "none") {
      console.log(`  📭 CANAL=none → email recommandé (pas de message généré)`);
      console.log(`  Reasoning: ${parsed.m1.reasoning ?? ""}`);
      generatedAll.push({
        lead: `${lead.firstName} ${lead.lastName}`,
        company: lead.company ?? "",
        seqName: seqInfo.name,
        canal: "none",
        rawReasoning: parsed.m1.reasoning ?? parsed.reasoning,
      });

      if (!DRY) {
        await supabase.from("actions").insert({
          user_id: KHALIL_USER_ID,
          lead_id: lead.id,
          sequence_id: seqInfo.id,
          step_id: nextStep.id,
          action_type: nextStep.step_type,
          status: "email_recommended",
          generated_message: null,
          generation_reasoning: parsed.m1.reasoning ?? null,
          generation_data: parsed.m1 as Record<string, unknown>,
        });
      }
      continue;
    }

    const varianteA = parsed.m1.variante_a;
    const varianteB = parsed.m1.variante_b;

    console.log(`\n  ✏️  VARIANTE A (${varianteA.angle ?? "∅"}):`);
    console.log(`  ${varianteA.message.split("\n").join("\n  ")}`);
    console.log(`\n  ✏️  VARIANTE B (${varianteB.angle ?? "∅"}):`);
    console.log(`  ${varianteB.message.split("\n").join("\n  ")}`);
    console.log(`\n  🎯 Canal: ${parsed.m1.canal ?? "?"}`);
    console.log(`  💡 Reasoning: ${(parsed.m1.reasoning ?? parsed.reasoning ?? "").slice(0, 200)}`);

    generatedAll.push({
      lead: `${lead.firstName} ${lead.lastName}`,
      company: lead.company ?? "",
      seqName: seqInfo.name,
      canal: parsed.m1.canal,
      varianteA: { angle: varianteA.angle ?? "", message: varianteA.message },
      varianteB: { angle: varianteB.angle ?? "", message: varianteB.message },
      rawReasoning: parsed.m1.reasoning ?? parsed.reasoning,
    });

    // 9. Insert in DB (variante A as default, like the cron)
    if (!DRY) {
      const messageText = varianteA.message || varianteB.message;
      const finalMessage = humanizeMessage(messageText, nextStep.step_type);
      const { data: insertData, error: insertErr } = await supabase
        .from("actions")
        .insert({
          user_id: KHALIL_USER_ID,
          lead_id: lead.id,
          sequence_id: seqInfo.id,
          step_id: nextStep.id,
          action_type: nextStep.step_type,
          status: "pending",
          generated_message: finalMessage,
          generation_reasoning: parsed.m1.reasoning ?? parsed.reasoning,
          generation_data: parsed.m1 as Record<string, unknown>,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.log(`  ❌ Insert error: ${insertErr.message}`);
      } else {
        console.log(`  ✅ Action insérée: ${insertData?.id}`);
        generatedAll[generatedAll.length - 1].actionId = insertData?.id;
      }
    } else {
      console.log(`  🔸 DRY RUN — aucun insert`);
    }

    console.log(`\n  📊 Tokens: in=${aiResult.usage.inputTokens} out=${aiResult.usage.outputTokens} cached=${aiResult.usage.cachedTokens} | $${aiResult.usage.estimatedCostUsd.toFixed(4)}`);
  }

  console.log(`\n\n===== SYNTHESE =====`);
  for (const r of generatedAll) {
    if (r.skipReason) {
      console.log(`  ⏭  ${r.lead.padEnd(32)} → SKIP (${r.skipReason})`);
    } else if (r.canal === "none") {
      console.log(`  📭 ${r.lead.padEnd(32)} → email recommandé`);
    } else {
      console.log(`  ✅ ${r.lead.padEnd(32)} → A: "${r.varianteA?.angle}" | B: "${r.varianteB?.angle}"${r.actionId ? ` [${r.actionId.slice(0, 8)}]` : ""}`);
    }
  }

  // Output JSON
  console.log(`\n===== FULL RESULTS (JSON) =====`);
  console.log(JSON.stringify(generatedAll, null, 2));
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
