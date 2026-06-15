// Prompt service - loads prompt + injects RAG context
// Architecture: system = PROMPT AGENT + BLOCS RAG + CONTEXTE RUNTIME

import { PROMPTS_DEFAULTS, type AgentId } from "./defaults";
import { buildRagContext } from "@/lib/rag/context";
import { resolveRagSections, mapGojiberrySignal } from "@/lib/rag/mapping";
import { createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { M2Situation, IcpSegment, PromptType } from "@/lib/rag/types";

export type { AgentId };

/**
 * Charge le prompt pour un agent donné.
 * Priorité : user override (DB) > default (code).
 */
export const getPrompt = async (
  agentId: AgentId,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>
): Promise<string> => {
  if (userId) {
    try {
      const supabase = supabaseOverride ?? createServerClient();
      const { data } = await supabase
        .from("user_prompts")
        .select("content")
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .maybeSingle();
      if (data?.content) return data.content;
    } catch {
      // Fallback to default if DB query fails
    }
  }
  return (PROMPTS_DEFAULTS as Record<string, string>)[agentId] || "";
};

export interface SystemPromptParts {
  prompt: string;
  rag: string;
}

/**
 * Construit le system prompt en deux parties séparées :
 * 1. prompt = prompt agent (default ou user override) — stable, cachable
 * 2. rag = contexte RAG (blocs knowledge/*.json selon mapping agent) — varie par ICP segment
 *
 * Les routes API ajoutent ensuite le contexte runtime (données lead, pipeline, etc.)
 */
export const buildSystemPromptParts = async (
  agentId: AgentId,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>,
  icpSegment?: string,
  sequenceStep?: number,
  m2Situation?: M2Situation,
  signalType?: string,
  leadResponseType?: string
): Promise<SystemPromptParts> => {
  // --- Routing M1/M2 pour l'agent prospection ---
  if (agentId === "prospection") {
    const promptType: PromptType = (sequenceStep && sequenceStep >= 2) ? "M2" : "M1";
    const resolvedAgentId: AgentId = promptType === "M1" ? "prospection_m1" : "prospection_m2";

    const segment: IcpSegment = (["A", "B", "C", "D1", "D2", "HORS_ICP"].includes(icpSegment || ""))
      ? (icpSegment as IcpSegment)
      : "B"; // fallback segment par défaut

    const signalMapped = mapGojiberrySignal(signalType || null);

    // Déterminer m2Situation pour M2
    let resolvedM2Situation: M2Situation | undefined;
    if (promptType === "M2") {
      if (m2Situation) {
        resolvedM2Situation = m2Situation;
      } else {
        resolvedM2Situation = "relance";
      }
    }

    const resolvedSections = resolveRagSections(
      promptType,
      segment,
      signalMapped,
      resolvedM2Situation,
      leadResponseType
    );

    const prompt = await getPrompt(resolvedAgentId, userId, supabaseOverride);
    const rag = await buildRagContext(resolvedSections, userId, supabaseOverride);

    return { prompt, rag };
  }

  // --- Agents non-prospection : comportement identique à avant ---
  const prompt = await getPrompt(agentId, userId, supabaseOverride);
  const rag = await buildRagContext(agentId, userId, supabaseOverride, icpSegment);
  return { prompt, rag };
};

/**
 * Construit le system prompt complet (prompt + RAG concaténés).
 * Utilisé par les providers qui ne supportent pas le multi-bloc system (OpenAI, Perplexity).
 */
export const buildSystemPrompt = async (
  agentId: AgentId,
  userId?: string,
  supabaseOverride?: SupabaseClient<Database>,
  icpSegment?: string,
  sequenceStep?: number,
  m2Situation?: M2Situation,
  signalType?: string,
  leadResponseType?: string
): Promise<string> => {
  const { prompt, rag } = await buildSystemPromptParts(
    agentId, userId, supabaseOverride, icpSegment,
    sequenceStep, m2Situation, signalType, leadResponseType
  );
  return rag ? `${prompt}\n\n${rag}` : prompt;
};
