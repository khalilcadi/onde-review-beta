/**
 * GET /api/crons/generate-actions
 *
 * Daily cron (6h00 Paris) — generates pending actions from active sequences.
 * For each user: finds sequence_leads ready for their next step,
 * generates AI messages, and creates actions with status 'pending'.
 *
 * Vercel cron schedule: "0 4,5 * * 1-5" (UTC, covers CET/CEST)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { callAI } from "@/lib/ai/service";
import { buildLeadContext, buildUserPrompt, parseGenerationResponse } from "@/lib/ai/lead-context";
import type { LeadForGeneration, M1Response, M2Response } from "@/lib/ai/lead-context";
import { humanizeMessage } from "@/lib/humanize";
import type { Json } from "@/types/database";
import {
  isActiveDay,
  getTodayQuotaCounts,
  loadUserSchedulingSettings,
  type QuotaCounts,
} from "@/lib/scheduling";
import { advanceSequenceStep } from "@/lib/unipile/execute";
import { syncAcceptedInvitations } from "@/lib/unipile/sync-relations";
import { enrichSingleLead } from "@/app/api/ai/enrich/route";

export const maxDuration = 300; // 5 min for generation

/** Max auto-enrichments per cron execution to limit API costs & duration */
const MAX_AUTO_ENRICHMENTS = 10;

/** Timeout per enrichment call (ms) */
const ENRICHMENT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// CRON_SECRET verification
// ---------------------------------------------------------------------------

function verifyCronSecret(req: NextRequest): Response | null {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[Generate Cron] CRON_SECRET not configured");
    return null; // Allow in dev without secret
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const supabase = createServiceClient();
  let enrichmentCount = 0;
  const results: Array<{
    userId: string;
    generated: number;
    skipped: number;
    errors: number;
  }> = [];

  try {
    // Get all users with active LinkedIn accounts
    const { data: linkedinAccounts } = await supabase
      .from("linkedin_accounts")
      .select("user_id, unipile_account_id")
      .eq("status", "active");

    if (!linkedinAccounts?.length) {
      return NextResponse.json({
        success: true,
        message: "No active users with LinkedIn accounts",
        results: [],
      });
    }

    // Deduplicate by user_id, keep first account
    const accountByUser: Record<string, string> = {};
    for (const a of linkedinAccounts) {
      if (!accountByUser[a.user_id]) {
        accountByUser[a.user_id] = a.unipile_account_id;
      }
    }

    const userIds = Object.keys(accountByUser);

    for (const userId of userIds) {
      const unipileAccountId = accountByUser[userId];
      let generated = 0;
      let skipped = 0;
      let errors = 0;

      try {
        // Check if today is an active day
        const settings = await loadUserSchedulingSettings(supabase, userId);
        if (!isActiveDay(settings.activeDays, settings.timezone)) {
          results.push({ userId, generated: 0, skipped: 0, errors: 0 });
          continue;
        }

        // --- Sync accepted invitations before generating actions ---
        try {
          const syncResult = await syncAcceptedInvitations(
            supabase,
            userId,
            unipileAccountId
          );
          if (syncResult.transitioned > 0) {
            console.log(
              `[Generate Cron] Synced ${syncResult.transitioned} accepted invitation(s) for user ${userId}`
            );
          }
        } catch (syncErr) {
          // Non-blocking: continue generation even if sync fails
          console.warn(
            `[Generate Cron] Sync relations failed for user ${userId}:`,
            syncErr instanceof Error ? syncErr.message : syncErr
          );
        }

        // Get today's quota usage
        const quotas = await getTodayQuotaCounts(supabase, userId);

        // Find active sequences for this user
        const { data: sequences } = await supabase
          .from("sequences")
          .select("id, name")
          .eq("user_id", userId)
          .eq("status", "active");

        if (!sequences?.length) {
          results.push({ userId, generated: 0, skipped: 0, errors: 0 });
          continue;
        }

        for (const seq of sequences) {
          // Load all steps for this sequence (ordered)
          const { data: steps } = await supabase
            .from("sequence_steps")
            .select("id, step_type, delay_days, template, generation_mode, condition, step_order")
            .eq("sequence_id", seq.id)
            .order("step_order", { ascending: true });

          if (!steps?.length) continue;

          // Load active sequence_leads
          const { data: seqLeads } = await supabase
            .from("sequence_leads")
            .select("id, lead_id, current_step, status, entered_at")
            .eq("sequence_id", seq.id)
            .eq("status", "active");

          if (!seqLeads?.length) continue;

          // Prioritize leads whose next step is message/inmail (follow-ups
          // for newly connected leads) over invitations/visits.
          const stepsById = new Map(steps.map((s) => [s.step_order, s]));
          const sortedSeqLeads = [...seqLeads].sort((a, b) => {
            const nextA = stepsById.get(a.current_step + 1);
            const nextB = stepsById.get(b.current_step + 1);
            const isMessageA = nextA && ["message", "inmail"].includes(nextA.step_type) ? 0 : 1;
            const isMessageB = nextB && ["message", "inmail"].includes(nextB.step_type) ? 0 : 1;
            return isMessageA - isMessageB;
          });

          for (const sl of sortedSeqLeads) {
            try {
              // Determine next step
              const nextStep = steps.find(
                (s) => s.step_order === sl.current_step + 1
              );

              if (!nextStep) {
                // No more steps — mark as completed
                await supabase
                  .from("sequence_leads")
                  .update({ status: "completed" })
                  .eq("id", sl.id);
                skipped++;
                continue;
              }

              // Check if delay_days has elapsed
              const delayReady = await isDelayReady(
                supabase,
                sl,
                nextStep.delay_days,
                seq.id
              );
              if (!delayReady) {
                skipped++;
                continue;
              }

              // Check condition of the PREVIOUS step (the one just completed).
              // A condition on step N gates what comes AFTER it, not step N itself.
              // e.g. invitation (condition: accepted?) → message: check "accepted?" before sending message.
              const previousStep = steps.find(
                (s) => s.step_order === sl.current_step
              );
              const conditionResult = await checkStepCondition(
                supabase,
                sl.lead_id,
                previousStep?.condition ?? null
              );
              if (conditionResult === "wait") {
                skipped++;
                continue;
              }
              if (conditionResult === "skip") {
                // Condition permanently unmet (e.g. if_no_response but lead replied)
                // Advance past this step without generating an action
                await advanceSequenceStep(supabase, seq.id, sl.lead_id, nextStep.id);
                skipped++;
                continue;
              }

              // Idempotency: check if action already exists for this step today
              const exists = await actionAlreadyExists(
                supabase,
                sl.lead_id,
                nextStep.id
              );
              if (exists) {
                skipped++;
                continue;
              }

              // Check quota
              const quotaKey = getQuotaKey(nextStep.step_type);
              const limit = getQuotaLimit(quotaKey, settings);
              if (quotas[quotaKey] >= limit) {
                skipped++;
                continue;
              }

              // Generate AI message for message/inmail types
              let generatedMessage: string | null = null;
              let generationReasoning: string | null = null;
              let generationData: Json | null = null;
              let actionStatus: string = "pending";

              if (
                ["message", "inmail"].includes(
                  nextStep.step_type
                )
              ) {
                let lead = await loadLeadForGeneration(
                  supabase,
                  sl.lead_id
                );
                if (!lead) {
                  skipped++;
                  continue;
                }

                // Auto-enrich if lead hasn't gone through the new enrichment pipeline (v2).
                // "dossier" is the key added by the new system (Unipile profile + posts + dossier d'attaque).
                // Leads enriched with the old Perplexity system have "company" but no "dossier" → re-enrich.
                const isEnriched =
                  lead.enrichmentData &&
                  typeof lead.enrichmentData === "object" &&
                  "dossier" in lead.enrichmentData;

                if (!isEnriched && enrichmentCount < MAX_AUTO_ENRICHMENTS) {
                  try {
                    console.log(
                      `[generate-actions] Lead ${lead.id} auto-enrichi avant génération`
                    );
                    await Promise.race([
                      enrichSingleLead(lead, userId, supabase),
                      new Promise((_, reject) =>
                        setTimeout(
                          () => reject(new Error("Enrichment timeout")),
                          ENRICHMENT_TIMEOUT_MS
                        )
                      ),
                    ]);
                    enrichmentCount++;

                    // Reload enriched lead from DB
                    const refreshed = await loadLeadForGeneration(
                      supabase,
                      sl.lead_id
                    );
                    if (refreshed) lead = refreshed;
                  } catch (enrichErr) {
                    console.warn(
                      `[generate-actions] Auto-enrichissement échoué pour lead ${lead.id}, génération en mode dégradé:`,
                      enrichErr instanceof Error
                        ? enrichErr.message
                        : enrichErr
                    );
                  }
                }

                // Use template if mode is 'template' and content exists, otherwise generate via AI
                if (nextStep.generation_mode === "template" && nextStep.template) {
                  generatedMessage = interpolateTemplate(
                    nextStep.template,
                    lead
                  );
                } else {
                  // Build sequence step context for relance strategy
                  const { data: previousActions } = await supabase
                    .from("actions")
                    .select("final_message, generated_message")
                    .eq("lead_id", sl.lead_id)
                    .eq("sequence_id", seq.id)
                    .eq("status", "sent")
                    .in("action_type", ["message", "inmail"])
                    .order("sent_at", { ascending: true });

                  const previousMessages = (previousActions || [])
                    .map((a) => (a.final_message || a.generated_message || "").replace(/\|\|\|/g, "\n\n"))
                    .filter(Boolean) as string[];

                  // M1 = no previous sent messages, M2 = has previous messages
                  const isFirstContact = previousMessages.length === 0;
                  const isLastStep = nextStep.step_order === steps[steps.length - 1].step_order;

                  // Sequence step number: 1 for M1, 2+ for M2
                  const messageStepNumber = previousMessages.length + 1;

                  const sequenceStepObj = {
                    current: messageStepNumber,
                    total: steps.filter(s => ["message", "inmail"].includes(s.step_type)).length,
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

                  // Extract signal type from lead tags (goji:*) or enrichmentData
                  const signalType = resolveSignalType(lead);

                  // M2 situation: relance by default, dernier_message if last step
                  const m2Situation = isFirstContact
                    ? undefined
                    : (isLastStep ? "dernier_message" as const : "relance" as const);

                  // Use generic "prospection" agentId → buildSystemPromptParts
                  // routes to M1/M2 prompt + smart RAG section resolution
                  const aiResult = await callAI({
                    userId,
                    agentId: "prospection",
                    runtimeContext,
                    messages: [{ role: "user", content: userPrompt }],
                    maxTokens: 1200,
                    metadata: {
                      leadId: sl.lead_id,
                      sequenceId: seq.id,
                      stepId: nextStep.id,
                      cron: "generate-actions",
                    },
                    supabaseOverride: supabase,
                    icpSegment,
                    sequenceStep: messageStepNumber,
                    m2Situation,
                    signalType,
                  });

                  const parsed = parseGenerationResponse(aiResult.text, isFirstContact);

                  if (parsed.m1) {
                    // M1: canal = "none" → email recommended, no message generated
                    if (parsed.m1.canal === "none") {
                      actionStatus = "email_recommended";
                      generatedMessage = null;
                      generationReasoning = parsed.m1.reasoning || null;
                      generationData = parsed.m1 as unknown as Json;
                    } else {
                      // M1: pick variante_a as default (user can switch in Daily Actions)
                      const messageText = parsed.m1.variante_a.message || parsed.m1.variante_b.message;
                      generatedMessage = humanizeMessage(messageText, nextStep.step_type);
                      generationReasoning = parsed.reasoning;
                      // Store full M1 response (both variants + canal + reasoning)
                      generationData = parsed.m1 as unknown as Json;
                    }
                  } else if (parsed.m2) {
                    // M2: store message + full M2 response
                    generatedMessage = humanizeMessage(parsed.m2.message, nextStep.step_type);
                    generationReasoning = parsed.reasoning;
                    generationData = parsed.m2 as unknown as Json;
                  } else {
                    // Fallback: plain text
                    generatedMessage = humanizeMessage(parsed.message, nextStep.step_type);
                    generationReasoning = parsed.reasoning;
                  }
                }
              }

              // Insert action
              const { error: insertError } = await supabase
                .from("actions")
                .insert({
                  user_id: userId,
                  lead_id: sl.lead_id,
                  sequence_id: seq.id,
                  step_id: nextStep.id,
                  action_type: nextStep.step_type,
                  status: actionStatus,
                  generated_message: generatedMessage,
                  generation_reasoning: generationReasoning,
                  generation_data: generationData,
                });

              if (insertError) {
                console.error(
                  `[Generate Cron] Insert error for lead ${sl.lead_id}:`,
                  insertError
                );
                errors++;
                continue;
              }

              // Increment quota counter
              quotas[quotaKey]++;
              generated++;
            } catch (err) {
              console.error(
                `[Generate Cron] Error for lead ${sl.lead_id}:`,
                err
              );
              errors++;
            }
          }
        }
      } catch (err) {
        console.error(`[Generate Cron] Error for user ${userId}:`, err);
        errors++;
      }

      results.push({ userId, generated, skipped, errors });
    }

    const totalGenerated = results.reduce((s, r) => s + r.generated, 0);
    console.log(
      `[Generate Cron] Done: ${totalGenerated} actions generated for ${results.length} users, ${enrichmentCount} auto-enrichments`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err) {
    console.error("[Generate Cron] Fatal error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SequenceLeadRow {
  id: string;
  lead_id: string;
  current_step: number;
  status: string;
  entered_at: string;
}

interface SchedulingSettings {
  dailyInvitationsLimit: number;
  dailyMessagesLimit: number;
  dailyVisitsLimit: number;
}

/**
 * Check if the delay_days since the last step action has elapsed.
 * For first step (current_step=0): check entered_at + delay_days.
 */
async function isDelayReady(
  supabase: ReturnType<typeof createServiceClient>,
  sl: SequenceLeadRow,
  delayDays: number,
  sequenceId: string
): Promise<boolean> {
  const now = Date.now();

  if (sl.current_step === 0) {
    // First step: check entered_at + delay_days
    const readyAt =
      new Date(sl.entered_at).getTime() + delayDays * 24 * 60 * 60 * 1000;
    return now >= readyAt;
  }

  // Subsequent steps: check last sent action for this lead+sequence
  const { data: lastAction } = await supabase
    .from("actions")
    .select("sent_at")
    .eq("lead_id", sl.lead_id)
    .eq("sequence_id", sequenceId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastAction?.sent_at) {
    // No sent action found — the previous step may not have been sent yet
    return false;
  }

  const readyAt =
    new Date(lastAction.sent_at).getTime() + delayDays * 24 * 60 * 60 * 1000;
  return now >= readyAt;
}

/**
 * Check if a step condition is met for a lead.
 *
 * Returns:
 *  - 'run'  → condition met, generate action
 *  - 'wait' → condition not met but may become true later (e.g. not connected yet)
 *  - 'skip' → condition permanently unmet, advance past this step without action
 */
async function checkStepCondition(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
  conditionJson: string | null
): Promise<"run" | "wait" | "skip"> {
  if (!conditionJson) return "run";

  let condition: { type: string };
  try {
    condition = JSON.parse(conditionJson);
  } catch {
    return "run"; // Invalid JSON — default to always run
  }

  switch (condition.type) {
    case "always":
      return "run";

    // Invitation accepted? Check if lead stage indicates they're connected
    case "invitation_accepted":
    case "if_connected": {
      const { data: lead } = await supabase
        .from("leads")
        .select("stage")
        .eq("id", leadId)
        .single();

      const connectedStages = [
        "connected",
        "in_sequence",
        "responded",
        "meeting",
        "closed",
      ];
      return lead && connectedStages.includes(lead.stage) ? "run" : "wait";
    }

    // Lead replied? Check inbound messages in conversations
    case "message_replied":
    case "if_responded": {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("lead_id", leadId)
        .maybeSingle();

      if (!conv) return "wait";

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound");

      return (count ?? 0) > 0 ? "run" : "wait";
    }

    // No response? Check that lead has NOT replied — skip if they did
    case "if_no_response": {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("lead_id", leadId)
        .maybeSingle();

      if (!conv) return "run"; // No conversation = no response = condition met

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound");

      // Lead replied → this follow-up is permanently irrelevant → skip
      return (count ?? 0) > 0 ? "skip" : "run";
    }

    // Message read? We can't reliably track read receipts via Unipile,
    // so treat as "run" — the message was sent, proceed with sequence
    case "message_read":
      return "run";

    // Profile visited back? We can't track this via Unipile,
    // so treat as "run" — proceed with sequence
    case "profile_visited":
      return "run";

    default:
      return "run";
  }
}

/**
 * Idempotency check: is there already an active (non-cancelled, non-failed) action
 * for this lead+step? Prevents regenerating an action that's pending or already sent.
 */
async function actionAlreadyExists(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
  stepId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("actions")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_id", stepId)
    .in("status", ["pending", "validated", "processing", "sent"])
    .limit(1)
    .maybeSingle();

  return !!data;
}

/**
 * Load full lead data for AI generation.
 */
async function loadLeadForGeneration(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string
): Promise<LeadForGeneration | null> {
  const { data } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data"
    )
    .eq("id", leadId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    title: data.title,
    company: data.company,
    linkedinUrl: data.linkedin_url ?? "",
    score: data.score,
    status: data.status,
    stage: data.stage,
    tags: data.tags,
    notes: data.notes,
    enrichmentData: data.enrichment_data as LeadForGeneration["enrichmentData"],
  };
}

/**
 * Simple template interpolation for step templates.
 * Replaces {{firstName}}, {{lastName}}, {{company}}, {{title}}.
 */
function interpolateTemplate(
  template: string,
  lead: LeadForGeneration
): string {
  return template
    .replace(/\{\{firstName\}\}/g, lead.firstName)
    .replace(/\{\{lastName\}\}/g, lead.lastName)
    .replace(/\{\{company\}\}/g, lead.company || "")
    .replace(/\{\{title\}\}/g, lead.title || "");
}

type QuotaKey = keyof QuotaCounts;

function getQuotaKey(actionType: string): QuotaKey {
  switch (actionType) {
    case "invitation":
      return "invitations";
    case "visit":
      return "visits";
    default:
      return "messages";
  }
}

function getQuotaLimit(key: QuotaKey, settings: SchedulingSettings): number {
  switch (key) {
    case "invitations":
      return settings.dailyInvitationsLimit;
    case "visits":
      return settings.dailyVisitsLimit;
    case "messages":
      return settings.dailyMessagesLimit;
  }
}

/**
 * Extract signal type from lead tags (goji:* prefix) or enrichmentData.signal.type.
 * Returns the raw signal string for mapGojiberrySignal() in the prompt service.
 */
function resolveSignalType(lead: LeadForGeneration): string | undefined {
  // From enrichmentData.signal.type
  if (lead.enrichmentData?.signal?.type) return lead.enrichmentData.signal.type;
  // From tags: look for goji:* pattern
  if (lead.tags?.length) {
    const gojiTag = lead.tags.find(t => t.startsWith("goji:"));
    if (gojiTag) return gojiTag.replace("goji:", "");
  }
  return undefined;
}
