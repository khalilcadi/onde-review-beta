/**
 * Script: test M2 V5.0 regeneration for 3 leads
 *   - Constant SANDJO
 *   - Lucas Pocthier Peccoz
 *   - Mathieu VINOIS
 *
 * DRY RUN par défaut : appelle callAI avec le nouveau prompt M2 V5.0
 * et produit TEST_M2_V5.md avec les messages + checklist de validation.
 *
 * Reproduit exactement la logique du cron generate-actions :
 *   - même buildLeadContext / buildUserPrompt
 *   - même resolveSignalType
 *   - previousMessages avec strip des séparateurs |||
 *   - m2Situation = relance ou dernier_message selon step position
 *
 * Usage:
 *   npx tsx scripts/test-m2-v5-regen.ts            # DRY RUN, écrit TEST_M2_V5.md
 *   npx tsx scripts/test-m2-v5-regen.ts --insert   # insert en DB (remplace action pending existante)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "@/types/database";

const INSERT = process.argv.includes("--insert");
const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

const TARGETS = [
  { firstName: "Constant", lastName: "SANDJO" },
  { firstName: "Lucas", lastName: "Pocthier Peccoz" },
  { firstName: "Mathieu", lastName: "VINOIS" },
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

// --- Checklist (reflet de l'auto-validation du prompt V5.0) ---
const FORBIDDEN_OPENINGS = [
  "je reviens vers vous avec un angle différent",
  "je reviens vers vous avec un autre angle",
  "je reviens vers vous",
  "je me permets de revenir vers vous",
  "je me dis que ce n'était peut-être pas le bon moment",
  "ce que j'observe souvent",
  "un point revient souvent",
];

const FORBIDDEN_WORDS = [
  "structurer", "industrialiser", "infrastructure", "pipeline prévisible",
  "système d'acquisition", "scaler", "repose sur vous", "repose sur une seule personne",
  "pipe", "piloter le pipeline", "trimestre", "closing", "hit rate",
  "delivery", "chantier", "trous dans le pipe", "process structuré", "convertir",
  "solution", "accompagnement", "levier", "ROI", "valeur ajoutée", "optimiser",
  "troisième et dernier message", "je vous relance une dernière fois",
  "après ce message je vous laisse tranquille", "je ne vais pas m'éterniser",
  "c'est mon dernier message", "dernier essai",
  "Smart.AI", "JARVIS", "PROSPECTOR", "NEXUS", " CRM",
];

function checkMessage(message: string, opts: { maxChars: number; maxWords: number; label: string }) {
  const msg = message.toLowerCase();
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  const chars = message.length;

  const hitsForbiddenWords = FORBIDDEN_WORDS.filter(w => msg.includes(w.toLowerCase()));
  const hitsForbiddenOpening = FORBIDDEN_OPENINGS.find(o => msg.includes(o.toLowerCase()));
  const hasQuestion = /\?/.test(message);
  const hasExclamation = /!/.test(message);

  return {
    label: opts.label,
    words,
    chars,
    respectsLengthChars: chars <= opts.maxChars,
    respectsLengthWords: words <= opts.maxWords,
    hitsForbiddenWords,
    hitsForbiddenOpening: hitsForbiddenOpening || null,
    hasQuestion,
    hasExclamation,
  };
}

async function main() {
  console.log(`\n===== TEST M2 V5.0 (${INSERT ? "INSERT" : "DRY RUN"}) — 3 leads =====\n`);

  const { buildLeadContext, buildUserPrompt, parseGenerationResponse } =
    await import("@/lib/ai/lead-context");
  const { callAI } = await import("@/lib/ai/service");

  const mdLines: string[] = [];
  mdLines.push(`# Test M2 V5.0 — Régénération`);
  mdLines.push(``);
  mdLines.push(`**Date** : ${new Date().toISOString()}`);
  mdLines.push(`**Mode** : ${INSERT ? "INSERT (DB modifiée)" : "DRY RUN"}`);
  mdLines.push(`**Prompt** : prospection_m2 V5.0`);
  mdLines.push(``);
  mdLines.push(`---`);
  mdLines.push(``);

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
      mdLines.push(`## ❌ ${target.firstName} ${target.lastName}`);
      mdLines.push(``);
      mdLines.push(`Lead introuvable : ${leadErr?.message}`);
      mdLines.push(``);
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
      mdLines.push(`## ❌ ${lead.firstName} ${lead.lastName}`);
      mdLines.push(``);
      mdLines.push(`Pas de sequence_lead actif.`);
      mdLines.push(``);
      continue;
    }

    const seqInfo = slData.sequences as unknown as { id: string; name: string };

    // 3. Load all steps
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id, step_type, delay_days, template, generation_mode, step_order")
      .eq("sequence_id", seqInfo.id)
      .order("step_order", { ascending: true });

    if (!steps?.length) {
      console.log(`  ❌ Pas de steps`);
      continue;
    }

    // 4. Find next message/inmail step from current_step
    const nextStep = steps.find(
      (s) => s.step_order === slData.current_step + 1 &&
             ["message", "inmail"].includes(s.step_type)
    ) ?? steps.find(
      (s) => s.step_order > slData.current_step &&
             ["message", "inmail"].includes(s.step_type)
    );

    if (!nextStep) {
      console.log(`  ❌ Pas de step message/inmail suivant (current_step=${slData.current_step})`);
      mdLines.push(`## ❌ ${lead.firstName} ${lead.lastName}`);
      mdLines.push(``);
      mdLines.push(`Pas de step message/inmail suivant (current_step=${slData.current_step}).`);
      mdLines.push(``);
      continue;
    }

    // 5. Load previously sent messages (same logic as cron)
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
      mdLines.push(`## ⚠️ ${lead.firstName} ${lead.lastName}`);
      mdLines.push(``);
      mdLines.push(`Aucun message précédent envoyé — ce lead est en M1, pas M2. Skip.`);
      mdLines.push(``);
      continue;
    }

    const messageStepNumber = previousMessages.length + 1;
    const messageStepsTotal = steps.filter(s => ["message", "inmail"].includes(s.step_type)).length;
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
    console.log(`  🎯 Séquence: "${seqInfo.name}" | Step ${nextStep.step_order} (${nextStep.step_type}) | ${m2Situation}`);
    console.log(`  📩 ${previousMessages.length} message(s) précédent(s)`);

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
          cron: "test-m2-v5-regen",
        },
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: messageStepNumber,
        m2Situation,
        signalType,
      });
    } catch (err) {
      console.log(`  ❌ callAI error: ${err instanceof Error ? err.message : err}`);
      mdLines.push(`## ❌ ${lead.firstName} ${lead.lastName}`);
      mdLines.push(``);
      mdLines.push(`Erreur callAI : ${err instanceof Error ? err.message : String(err)}`);
      mdLines.push(``);
      continue;
    }

    // 7. Parse (isFirstContact=false → M2)
    const parsed = parseGenerationResponse(aiResult.text, false);

    if (!parsed.m2) {
      console.log(`  ⚠️  Parsing M2 a échoué.`);
      console.log(aiResult.text.slice(0, 500));
      mdLines.push(`## ⚠️ ${lead.firstName} ${lead.lastName}`);
      mdLines.push(``);
      mdLines.push(`Parsing M2 a échoué. Réponse brute :`);
      mdLines.push("```");
      mdLines.push(aiResult.text.slice(0, 1000));
      mdLines.push("```");
      mdLines.push(``);
      continue;
    }

    const m2Message = parsed.m2.message;
    const maxChars = m2Situation === "dernier_message" ? 300 : 500;
    const maxWords = m2Situation === "dernier_message" ? 40 : 70;

    const check = checkMessage(m2Message, {
      maxChars,
      maxWords,
      label: `M2 ${m2Situation}`,
    });

    console.log(`\n  ✏️  M2 ${m2Situation} :`);
    console.log(`  ${m2Message.split("\n").join("\n  ")}`);
    console.log(`\n  📊 ${check.chars} chars / ${check.words} mots (max ${maxChars}/${maxWords})`);
    console.log(`  💡 Reasoning: ${(parsed.m2.reasoning ?? parsed.reasoning ?? "").slice(0, 200)}`);

    if (check.hitsForbiddenWords.length) {
      console.log(`  ⚠️  Mots interdits détectés : ${check.hitsForbiddenWords.join(", ")}`);
    }
    if (check.hitsForbiddenOpening) {
      console.log(`  ⚠️  Ouverture template détectée : "${check.hitsForbiddenOpening}"`);
    }

    // --- Markdown output ---
    mdLines.push(`## ${lead.firstName} ${lead.lastName}`);
    mdLines.push(``);
    mdLines.push(`- **Entreprise** : ${lead.company ?? "?"}`);
    mdLines.push(`- **Titre** : ${lead.title ?? "?"}`);
    mdLines.push(`- **Séquence** : ${seqInfo.name} (step ${nextStep.step_order}/${messageStepsTotal})`);
    mdLines.push(`- **Situation** : ${m2Situation}`);
    mdLines.push(`- **Signal** : ${signalType ?? "∅"} | **Segment ICP** : ${icpSegment ?? "∅"}`);
    mdLines.push(`- **Canal** : ${parsed.m2.canal ?? "?"} | **Ton** : ${parsed.m2.ton ?? "?"}`);
    mdLines.push(``);

    // M1 envoyé
    mdLines.push(`### Messages précédents envoyés`);
    mdLines.push(``);
    previousMessages.forEach((msg, i) => {
      mdLines.push(`**Message ${i + 1}** :`);
      mdLines.push("```");
      mdLines.push(msg);
      mdLines.push("```");
      mdLines.push(``);
    });

    // M2 régénéré
    mdLines.push(`### M2 V5.0 régénéré`);
    mdLines.push(``);
    mdLines.push("```");
    mdLines.push(m2Message);
    mdLines.push("```");
    mdLines.push(``);

    // Métriques
    mdLines.push(`**Métriques** : ${check.chars} caractères / ${check.words} mots (max ${maxChars} / ${maxWords})`);
    mdLines.push(``);

    // Reasoning
    mdLines.push(`### Reasoning`);
    mdLines.push(``);
    mdLines.push(`> ${parsed.m2.reasoning ?? parsed.reasoning ?? "∅"}`);
    mdLines.push(``);

    // Checklist auto
    mdLines.push(`### Checklist auto (reflet auto-validation V5.0)`);
    mdLines.push(``);
    mdLines.push(`- [${check.respectsLengthChars ? "x" : " "}] Longueur caractères ≤ ${maxChars} (${check.chars})`);
    mdLines.push(`- [${check.respectsLengthWords ? "x" : " "}] Longueur mots ≤ ${maxWords} (${check.words})`);
    mdLines.push(`- [${check.hitsForbiddenWords.length === 0 ? "x" : " "}] Aucun mot de la liste interdite${check.hitsForbiddenWords.length ? ` — détectés : ${check.hitsForbiddenWords.join(", ")}` : ""}`);
    mdLines.push(`- [${!check.hitsForbiddenOpening ? "x" : " "}] Ouverture originale (pas de formule template)${check.hitsForbiddenOpening ? ` — détectée : "${check.hitsForbiddenOpening}"` : ""}`);
    mdLines.push(`- [${check.hasQuestion ? "x" : " "}] Contient une question (point d'interrogation)`);
    mdLines.push(`- [${!check.hasExclamation ? "x" : " "}] Pas de point d'exclamation`);
    mdLines.push(``);

    // Checklist manuelle (vérifiée par l'humain)
    mdLines.push(`### Checklist manuelle (à cocher manuellement)`);
    mdLines.push(``);
    mdLines.push(`- [ ] L'ouverture est DIFFÉRENTE des 2 autres M2 régénérés`);
    mdLines.push(`- [ ] L'angle est DIFFÉRENT du M1 envoyé (listé ci-dessus)`);
    mdLines.push(`- [ ] Le test "replace name" passe (le message ne marche PAS si on change le prénom)`);
    mdLines.push(`- [ ] Le message donne envie de répondre`);
    mdLines.push(``);

    mdLines.push(`**Tokens** : in=${aiResult.usage.inputTokens} out=${aiResult.usage.outputTokens} cached=${aiResult.usage.cachedTokens} | coût : $${aiResult.usage.estimatedCostUsd.toFixed(4)}`);
    mdLines.push(``);
    mdLines.push(`---`);
    mdLines.push(``);

    // 8. Insert / replace action if --insert
    if (INSERT) {
      // Delete existing pending action for this step
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
        console.log(`  ✅ Action insérée: ${insertData?.id}`);
      }
    } else {
      console.log(`  🔸 DRY RUN — aucun insert`);
    }
  }

  // Write markdown file
  const outPath = path.resolve(process.cwd(), "TEST_M2_V5.md");
  fs.writeFileSync(outPath, mdLines.join("\n"), "utf-8");
  console.log(`\n\n📝 Fichier écrit : ${outPath}`);
  console.log(`===== FIN =====\n`);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
