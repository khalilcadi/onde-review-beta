import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildLeadContext, buildUserPrompt, type LeadForGeneration } from "@/lib/ai/lead-context";
import { buildRagContext } from "@/lib/rag/context";
import { PROMPT_VARIATIONS, type PromptVariation } from "@/lib/ai/prompts/variations";
import type { Tables } from "@/types/database";

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

    const { leadId } = await req.json();
    if (!leadId) {
      return NextResponse.json({ error: "leadId requis" }, { status: 400 });
    }

    // Load lead from DB
    const { data: rawLead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !rawLead) {
      return NextResponse.json({ error: "Lead introuvable" }, { status: 404 });
    }

    const dbLead = rawLead as unknown as Tables<"leads">;

    // Map to LeadForGeneration
    const lead: LeadForGeneration = {
      id: dbLead.id,
      firstName: dbLead.first_name ?? "",
      lastName: dbLead.last_name ?? "",
      title: dbLead.title,
      company: dbLead.company,
      linkedinUrl: dbLead.linkedin_url ?? "",
      score: dbLead.score,
      status: dbLead.status,
      stage: dbLead.stage,
      tags: dbLead.tags,
      notes: dbLead.notes,
      enrichmentData: dbLead.enrichment_data as LeadForGeneration["enrichmentData"],
    };

    // Build context — identical for all 5 variations
    const actionType = "invitation";
    const runtimeContext = buildLeadContext(lead, actionType);
    const userPrompt = buildUserPrompt(lead, actionType);

    // Build RAG context for info (same for all)
    const ragContext = await buildRagContext("prospection_m1", user.id, undefined, lead.enrichmentData?.scoring_detail?.segment_icp);

    // Run 5 variations in parallel
    const variationKeys = Object.keys(PROMPT_VARIATIONS) as PromptVariation[];

    const variationResults = await Promise.all(
      variationKeys.map(async (key) => {
        const variationPrompt = PROMPT_VARIATIONS[key];

        // Call AI with the variation prompt as system override
        // We bypass the normal prompt loading by using a direct Claude call
        const response = await callAIWithCustomSystem({
          userId: user.id,
          systemPrompt: variationPrompt,
          ragContext,
          runtimeContext,
          userPrompt,
          supabase,
        });

        return {
          key,
          message: response.text,
          chars: response.text.length,
          tokens_in: response.usage.inputTokens,
          tokens_out: response.usage.outputTokens,
        };
      })
    );

    // Build results object
    const results: Record<string, { message: string; chars: number; tokens_in: number; tokens_out: number }> = {};
    for (const r of variationResults) {
      results[r.key] = {
        message: r.message,
        chars: r.chars,
        tokens_in: r.tokens_in,
        tokens_out: r.tokens_out,
      };
    }

    // Lead summary for display
    const signalType = lead.enrichmentData?.signal?.type ?? null;

    return NextResponse.json({
      lead: {
        name: `${lead.firstName} ${lead.lastName}`.trim(),
        title: lead.title ?? null,
        company: lead.company ?? null,
        score: lead.score ?? 0,
        signal_type: signalType,
      },
      context_sent: runtimeContext,
      user_prompt_sent: userPrompt,
      results,
    });
  } catch (error) {
    console.error("Test variations API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du test des variations",
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Direct Claude call with custom system prompt (bypasses normal prompt loading)
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import { getDecryptedApiKey } from "@/lib/actions/settings";
import { estimateCost } from "@/lib/ai/models";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

async function callAIWithCustomSystem(options: {
  userId: string;
  systemPrompt: string;
  ragContext: string;
  runtimeContext: string;
  userPrompt: string;
  supabase: SupabaseClient<Database>;
}): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; cachedTokens: number; estimatedCostUsd: number } }> {
  const { userId, systemPrompt, ragContext, runtimeContext, userPrompt } = options;

  // Get Claude API key (user key or env fallback)
  const userKey = await getDecryptedApiKey(userId, "claude");
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    throw new Error("Clé API Claude non configurée.");
  }

  // Load user model preference
  const { data: settingsRow } = await options.supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const model = (settings.ai_model as string) || "claude-sonnet-4-5-20250929";

  const anthropic = new Anthropic({ apiKey });

  // 3 system blocks: variation prompt (cached) + RAG + runtime context
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    {
      type: "text" as const,
      text: systemPrompt,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  if (ragContext) {
    systemBlocks.push({
      type: "text" as const,
      text: ragContext,
    });
  }

  if (runtimeContext) {
    systemBlocks.push({
      type: "text" as const,
      text: runtimeContext,
    });
  }

  const result = await anthropic.messages.create({
    model,
    max_tokens: 512,
    temperature: 0.7,
    system: systemBlocks,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textContent = result.content.find((c) => c.type === "text");
  const text = textContent && "text" in textContent ? textContent.text.trim() : "";

  const inputTokens = result.usage.input_tokens ?? 0;
  const outputTokens = result.usage.output_tokens ?? 0;
  const usageAny = result.usage as unknown as Record<string, number>;
  const cacheRead = usageAny.cache_read_input_tokens ?? 0;
  const cacheCreation = usageAny.cache_creation_input_tokens ?? 0;
  const cachedTokens = cacheRead + cacheCreation;

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens, cacheRead),
    },
  };
}
