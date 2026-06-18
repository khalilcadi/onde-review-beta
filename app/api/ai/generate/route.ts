import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/service";
import { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeM1Message, type M1Response, type M2Response, type LeadForGeneration } from "@/lib/ai/lead-context";
import { humanizeMessage } from "@/lib/humanize";

// ---------------------------------------------------------------------------
// Helpers: extract signal & M2 situation from lead data
// ---------------------------------------------------------------------------

/** Extract signal type from lead tags (goji:* prefix) or enrichmentData.signal.type */
function resolveSignalType(lead: LeadForGeneration, explicit?: string): string | undefined {
  if (explicit) return explicit;
  // From enrichmentData.signal.type
  if (lead.enrichmentData?.signal?.type) return lead.enrichmentData.signal.type;
  // From tags: look for goji:* pattern
  if (lead.tags?.length) {
    const gojiTag = lead.tags.find(t => t.startsWith("goji:"));
    if (gojiTag) return gojiTag.replace("goji:", "");
  }
  return undefined;
}

/** Determine M2 situation automatically or from explicit parameter */
function resolveM2Situation(
  explicit?: "reponse" | "relance" | "dernier_message",
  currentMessage?: string,
  sequenceStep?: { current: number; total: number }
): "reponse" | "relance" | "dernier_message" | undefined {
  if (explicit) return explicit;
  // If there's a currentMessage being replied to, it's a response
  if (currentMessage) return "reponse";
  // If at last step of sequence, it's dernier_message
  if (sequenceStep && sequenceStep.current >= sequenceStep.total) return "dernier_message";
  // Default for M2: relance
  return "relance";
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();

    // Support batch: { leads: [...] } ou single: { lead: {...} }
    const isBatch = Array.isArray(body.leads);
    const leads = isBatch ? body.leads : [body.lead];
    const { actionType, currentMessage, feedback } = body;

    // New parameters (optional, backward-compatible)
    const bodySequenceStep = body.sequenceStep as number | undefined;
    const bodySignalType = body.signalType as string | undefined;
    const bodyM2Situation = body.m2Situation as "reponse" | "relance" | "dernier_message" | undefined;
    const bodyLeadResponseType = body.leadResponseType as string | undefined;

    // Générer un message par lead (parallèle = prompt caching bénéfique)
    const results = await Promise.all(
            leads.map(async (lead: any) => {
        // Recharger le lead complet depuis la DB pour avoir enrichment_data + sequence info
        let fullLead = lead;
        let dbSequenceStep: number | undefined;
        if (lead.id) {
          const { data: dbLead } = await supabase
            .from("leads")
            .select("*")
            .eq("id", lead.id)
            .single();
          if (dbLead) {
            fullLead = {
              ...lead,
              enrichmentData: (dbLead as Record<string, unknown>).enrichment_data,
              tags: (dbLead as Record<string, unknown>).tags as string[] | null,
            };
          }

          // Fetch current_step from sequence_leads if not provided
          if (!bodySequenceStep) {
            const { data: seqLead } = await supabase
              .from("sequence_leads")
              .select("current_step")
              .eq("lead_id", lead.id)
              .eq("status", "active")
              .maybeSingle();
            if (seqLead) {
              dbSequenceStep = (seqLead as Record<string, unknown>).current_step as number;
            }
          }
        }

        // Resolve sequence step: explicit param > DB > default
        const effectiveStep = bodySequenceStep ?? dbSequenceStep;

        // M1 = step 1 or first contact, M2 = step 2+
        const isFirstContact = effectiveStep != null
          ? effectiveStep <= 1
          : !currentMessage && (actionType === "invitation" || actionType === "visit");
        const agentId = isFirstContact ? "prospection_m1" : "prospection_m2";

        // Resolve signal type and M2 situation
        const signalType = resolveSignalType(fullLead, bodySignalType);
        const sequenceStepObj = effectiveStep != null
          ? { current: effectiveStep, total: body.sequenceTotal || effectiveStep }
          : undefined;
        const m2Situation = !isFirstContact
          ? resolveM2Situation(bodyM2Situation, currentMessage, sequenceStepObj)
          : undefined;

        const runtimeContext = buildLeadContext(fullLead, actionType, currentMessage, feedback, sequenceStepObj);
        const userPrompt = buildUserPrompt(fullLead, actionType, currentMessage, feedback, sequenceStepObj, {
          withReasoning: true,
          leadMessage: bodyM2Situation === "reponse" ? currentMessage : undefined,
        });
        const icpSegment = fullLead.enrichmentData?.scoring_detail?.segment_icp;

        const response = await callAI({
          userId: user.id,
          agentId,
          runtimeContext,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: 1200,
          metadata: { leadId: lead.id, actionType },
          icpSegment,
          sequenceStep: effectiveStep,
          m2Situation,
          signalType,
          leadResponseType: bodyLeadResponseType,
        });

        const parsed = parseGenerationResponse(response.text, isFirstContact);

        if (parsed.m1) {
          // canal = "none" → email recommended but not available
          if (parsed.m1.canal === "none") {
            return {
              type: "M1" as const,
              message: null,
              email_recommended: true,
              canal: "none" as const,
              canal_recommande: parsed.m1.canal_recommande,
              persona: parsed.m1.persona,
              reasoning: parsed.m1.reasoning,
            };
          }

          // Sanitize déterministe (—/– → ", ", Frame.io → Frame, espaces doubles) AVANT humanisation.
          const cleanA = sanitizeM1Message(parsed.m1.variante_a.message);
          const cleanB = sanitizeM1Message(parsed.m1.variante_b.message);

          return {
            type: "M1" as const,
            message: humanizeMessage(cleanA, actionType || "message"),
            reasoning: parsed.reasoning,
            m1: {
              variante_a: {
                message: humanizeMessage(cleanA, actionType || "message"),
                angle: parsed.m1.variante_a.angle,
              },
              variante_b: {
                message: humanizeMessage(cleanB, actionType || "message"),
                angle: parsed.m1.variante_b.angle,
              },
              canal: parsed.m1.canal,
              canal_recommande: parsed.m1.canal_recommande,
              persona: parsed.m1.persona,
              reasoning: parsed.m1.reasoning,
            } satisfies M1Response,
          };
        }

        if (parsed.m2) {
          return {
            type: "M2" as const,
            message: humanizeMessage(parsed.m2.message, actionType || "message"),
            reasoning: parsed.reasoning,
            m2: {
              ...parsed.m2,
              message: humanizeMessage(parsed.m2.message, actionType || "message"),
            } satisfies M2Response,
          };
        }

        // Fallback: plain text (backward-compatible)
        return {
          message: humanizeMessage(parsed.message, actionType || "message"),
          reasoning: parsed.reasoning,
        };
      })
    );

    // Rétro-compatible : single lead → { message, reasoning, type?, m1?, m2?, email_recommended? }, batch → { messages }
    if (!isBatch) {
      const r = results[0];
      return NextResponse.json({
        message: r.message,
        reasoning: r.reasoning,
        ...("type" in r ? { type: r.type } : {}),
        ...("m1" in r ? { m1: r.m1 } : {}),
        ...("m2" in r ? { m2: r.m2 } : {}),
        ...("email_recommended" in r ? { email_recommended: r.email_recommended, canal: r.canal, canal_recommande: (r as any).canal_recommande, persona: (r as any).persona } : {}),
      });
    }
    return NextResponse.json({
      messages: results.map(r => r.message),
      reasonings: results.map(r => r.reasoning),
      types: results.map(r => ("type" in r ? r.type : null)),
      m1s: results.map(r => ("m1" in r ? r.m1 : null)),
      m2s: results.map(r => ("m2" in r ? r.m2 : null)),
      email_recommended: results.map(r => ("email_recommended" in r ? r.email_recommended : false)),
    });
  } catch (error) {
    console.error("Generate API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la génération du message",
      },
      { status: 500 }
    );
  }
}
