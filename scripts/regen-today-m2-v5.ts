/**
 * Régénère les 3 actions M2 pending du jour avec le prompt V5.0.
 *   - Cyrille GORMAND (Covadia)
 *   - Joël ABREU (Enova)
 *   - JEAN SEBASTIEN WAGNER (Weeflo)
 *
 * Reproduit la logique du cron generate-actions :
 *   - même buildLeadContext / buildUserPrompt
 *   - même resolveSignalType
 *   - previousMessages avec strip des séparateurs |||
 *   - m2Situation = relance ou dernier_message selon position step
 *
 * Usage:
 *   npx tsx scripts/regen-today-m2-v5.ts            # DRY RUN
 *   npx tsx scripts/regen-today-m2-v5.ts --insert   # remplace les actions pending
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const INSERT = process.argv.includes("--insert");
const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

const TARGETS = [
  { firstName: "Cyrille", lastName: "GORMAND" },
  { firstName: "Joël", lastName: "ABREU" },
  { firstName: "JEAN SEBASTIEN", lastName: "WAGNER" },
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
  console.log(`\n===== REGEN M2 V5.0 (${INSERT ? "INSERT" : "DRY RUN"}) — 3 leads =====\n`);

  const { buildLeadContext, buildUserPrompt, parseGenerationResponse } =
    await import("@/lib/ai/lead-context");
  const { callAI } = await import("@/lib/ai/service");

  for (const target of TARGETS) {
    console.log(`\n────────────────────────────────────────`);
    console.log(`📌 ${target.firstName} ${target.lastName}`);
    console.log(`────────────────────────────────────────`);

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

    const { data: slData } = await supabase
      .from("sequence_leads")
      .select("id, current_step, status, sequence_id, sequences!inner(id, name, status)")
      .eq("lead_id", lead.id)
      .eq("status", "active")
      .eq("sequences.status", "active")
      .single();

    if (!slData) {
      console.log(`  ❌ Pas de sequence_lead actif`);
      continue;
    }

    const seqInfo = slData.sequences as unknown as { id: string; name: string };

    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id, step_type, delay_days, template, generation_mode, step_order")
      .eq("sequence_id", seqInfo.id)
      .order("step_order", { ascending: true });

    if (!steps?.length) {
      console.log(`  ❌ Pas de steps`);
      continue;
    }

    const nextStep =
      steps.find(
        (s) =>
          s.step_order === slData.current_step + 1 &&
          ["message", "inmail"].includes(s.step_type)
      ) ??
      steps.find(
        (s) =>
          s.step_order > slData.current_step &&
          ["message", "inmail"].includes(s.step_type)
      );

    if (!nextStep) {
      console.log(`  ❌ Pas de step message/inmail suivant (current_step=${slData.current_step})`);
      continue;
    }

    const { data: previousActions } = await supabase
      .from("actions")
      .select("final_message, generated_message, sent_at")
      .eq("lead_id", lead.id)
      .eq("sequence_id", seqInfo.id)
      .eq("status", "sent")
      .in("action_type", ["message", "inmail"])
      .order("sent_at", { ascending: true });

    const previousMessages = (previousActions || [])
      .map((a) => (a.final_message || a.generated_message || "").replace(/\|\|\|/g, "\n\n"))
      .filter(Boolean) as string[];

    if (previousMessages.length === 0) {
      console.log(`  ⚠️  Aucun message précédent → ce ne serait pas un M2 (skip)`);
      continue;
    }

    const messageStepNumber = previousMessages.length + 1;
    const messageStepsTotal = steps.filter((s) => ["message", "inmail"].includes(s.step_type)).length;
    const isLastStep = nextStep.step_order === steps[steps.length - 1].step_order;
    const m2Situation = isLastStep ? ("dernier_message" as const) : ("relance" as const);

    const sequenceStepObj = {
      current: messageStepNumber,
      total: messageStepsTotal,
      previousMessages,
    };

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

    const icpSegment = lead.enrichmentData?.scoring_detail?.segment_icp;
    const signalType = resolveSignalType(lead);

    console.log(`  📊 ICP: ${icpSegment ?? "∅"} | Signal: ${signalType ?? "∅"}`);
    console.log(
      `  🎯 Séquence: "${seqInfo.name}" | Step ${nextStep.step_order} (${nextStep.step_type}) | ${m2Situation}`
    );
    console.log(`  📩 ${previousMessages.length} message(s) précédent(s)`);
    console.log(`\n  --- Message(s) précédent(s) envoyé(s) ---`);
    previousMessages.forEach((msg, i) => {
      console.log(`\n  [M${i + 1}]`);
      console.log("  " + msg.split("\n").join("\n  "));
    });

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
          cron: "regen-today-m2-v5",
        },
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: messageStepNumber,
        m2Situation,
        signalType,
      });
    } catch (err) {
      console.log(`  ❌ callAI error: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const parsed = parseGenerationResponse(aiResult.text, false);

    if (!parsed.m2) {
      console.log(`  ⚠️  Parsing M2 a échoué.`);
      console.log(aiResult.text.slice(0, 500));
      continue;
    }

    const m2Message = parsed.m2.message;
    console.log(`\n  ✏️  M2 V5.0 ${m2Situation} régénéré :`);
    console.log("  " + m2Message.split("\n").join("\n  "));
    console.log(`\n  📊 ${m2Message.length} chars`);
    console.log(`  💡 Reasoning: ${(parsed.m2.reasoning ?? parsed.reasoning ?? "").slice(0, 300)}`);
    console.log(
      `  💰 Tokens: in=${aiResult.usage.inputTokens} out=${aiResult.usage.outputTokens} cached=${aiResult.usage.cachedTokens} ($${aiResult.usage.estimatedCostUsd.toFixed(4)})`
    );

    if (INSERT) {
      await supabase
        .from("actions")
        .delete()
        .eq("lead_id", lead.id)
        .eq("step_id", nextStep.id)
        .in("status", ["pending", "validated"]);

      const { humanizeMessage } = await import("@/lib/humanize");
      const finalMessage = humanizeMessage(m2Message, nextStep.step_type);

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
          generation_reasoning: parsed.m2.reasoning ?? parsed.reasoning,
          generation_data: parsed.m2 as Record<string, unknown>,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.log(`  ❌ Insert error: ${insertErr.message}`);
      } else {
        console.log(`  ✅ Action remplacée: ${insertData?.id}`);
      }
    } else {
      console.log(`  🔸 DRY RUN — aucun insert`);
    }
  }

  console.log(`\n===== FIN =====\n`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
