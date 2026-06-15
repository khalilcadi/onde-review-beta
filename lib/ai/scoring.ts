import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI } from "@/lib/ai/service";
import {
  buildScoringContext,
  buildScoringUserPrompt,
  type LeadForGeneration,
} from "@/lib/ai/lead-context";

export interface ScoringResult {
  score: number;
  categorie: string;
  segment_icp?: string;
  confidence: number;
  cas_limite: boolean;
  ajustement_ia: string;
  justification: string;
  detail: Record<string, unknown>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
  };
}

/**
 * Score a lead using AI and update the DB.
 * Returns the scoring result or null if parsing/AI fails.
 */
export async function scoreLead(
  lead: LeadForGeneration,
  userId: string,
  supabase: SupabaseClient
): Promise<ScoringResult | null> {
  const runtimeContext = buildScoringContext(lead);
  const userPrompt = buildScoringUserPrompt(lead);

  const response = await callAI({
    userId,
    agentId: "scoring",
    runtimeContext,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1024,
    temperature: 0.3,
    modelOverride: "claude-sonnet-4-6",
    metadata: { leadId: lead.id, action: "score" },
    supabaseOverride: supabase,
  });

  // Parse JSON response
  let scoringResult: ScoringResult;
  try {
    const cleanText = response.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    scoringResult = JSON.parse(cleanText);
  } catch {
    console.error("Scoring JSON parse error. Raw text:", response.text);
    return null;
  }

  // Update lead score + scoring detail in DB
  if (lead.id && typeof scoringResult.score === "number") {
    const { data: currentLead } = await supabase
      .from("leads")
      .select("enrichment_data")
      .eq("id", lead.id)
      .single();

    // Auto-sync: map scoring category to lead status
    const categoryToStatus: Record<string, string> = {
      HOT: "hot",
      WARM: "warm",
      COLD: "cold",
      NO_GO: "cold",
    };
    const newStatus =
      categoryToStatus[scoringResult.categorie?.toUpperCase()] ?? undefined;

    await supabase
      .from("leads")
      .update({
        score: scoringResult.score,
        ...(newStatus ? { status: newStatus } : {}),
        enrichment_data: {
          ...((currentLead?.enrichment_data as Record<string, unknown>) || {}),
          scoring_detail: {
            ...scoringResult.detail,
            categorie: scoringResult.categorie,
            segment_icp: scoringResult.segment_icp || null,
            confidence: scoringResult.confidence,
            cas_limite: scoringResult.cas_limite,
            ajustement_ia: scoringResult.ajustement_ia,
            justification: scoringResult.justification,
          },
        },
      })
      .eq("id", lead.id);
  }

  return { ...scoringResult, usage: response.usage };
}
