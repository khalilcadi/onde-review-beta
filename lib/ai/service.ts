/**
 * Service IA unifié — Session G
 *
 * Point d'entrée unique pour tous les appels IA.
 * Gère : chargement config user, prompt + RAG, appel Claude/OpenAI,
 * prompt caching (Claude), logging usage.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AgentId } from "./prompts/defaults";
import { buildSystemPrompt, buildSystemPromptParts } from "./prompts/service";
import { getDecryptedApiKey } from "@/lib/actions/settings";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { AI_MODELS, estimateCost, type AIProvider } from "./models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallAIOptions {
  userId: string;
  agentId: AgentId;
  /** Contexte dynamique injecté après le prompt+RAG (lead data, pipeline, etc.) */
  runtimeContext?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Metadata pour le logging usage (action_id, lead_id, etc.) */
  metadata?: Record<string, unknown>;
  /** Optional: provide a pre-created Supabase client (for crons, no cookies) */
  supabaseOverride?: SupabaseClient<Database>;
  /** Override the user's configured model (e.g. force haiku for lightweight tasks) */
  modelOverride?: string;
  /** Optional: ICP segment for dynamic RAG selection (prospection_m1/m2 agents) */
  icpSegment?: string;
  /** Sequence step number: 1 = premier message (M1), 2+ = relance (M2) */
  sequenceStep?: number;
  /** M2 situation override (inbox use case) */
  m2Situation?: "reponse" | "relance" | "dernier_message";
  /** Raw Gojiberry signal type for M1 signal mapping */
  signalType?: string;
  /** Lead response type for M2 situation 'reponse' (inbox) */
  leadResponseType?: string;
}

export interface AIResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    estimatedCostUsd: number;
  };
}

interface UserAIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  temperature: number;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

async function getUserAIConfig(
  userId: string,
  supabaseOverride?: SupabaseClient<Database>
): Promise<UserAIConfig> {
  const supabase = supabaseOverride ?? createServerClient();

  // Charger les settings user
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const provider = (settings.ai_provider as AIProvider) || DEFAULT_SETTINGS.ai_provider;
  const model = (settings.ai_model as string) || DEFAULT_SETTINGS.ai_model;
  const temperature = (settings.temperature as number) ?? DEFAULT_SETTINGS.temperature;

  // Charger et décrypter la clé API
  const keyType = provider === "openai" ? "openai" : "claude";
  const userKey = await getDecryptedApiKey(userId, keyType, supabaseOverride);

  // Fallback env var pour dev (Claude uniquement)
  const apiKey = userKey || (provider === "claude" ? process.env.ANTHROPIC_API_KEY || "" : "");

  if (!apiKey) {
    throw new Error(
      `Clé API ${provider === "openai" ? "OpenAI" : "Claude"} non configurée. ` +
      `Ajoutez-la dans Settings > Clés API.`
    );
  }

  return { provider, model, apiKey, temperature };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function callAI(options: CallAIOptions): Promise<AIResponse> {
  const {
    userId,
    agentId,
    runtimeContext,
    messages,
    maxTokens = 512,
    temperature: tempOverride,
    metadata,
    supabaseOverride,
    modelOverride,
  } = options;

  // 1. Config user (provider, model, clé API, température)
  const config = await getUserAIConfig(userId, supabaseOverride);
  const temperature = tempOverride ?? config.temperature;

  // Apply model override if specified (force specific model, keep same provider logic)
  if (modelOverride) {
    const overrideModel = AI_MODELS[modelOverride as keyof typeof AI_MODELS];
    if (overrideModel) {
      config.model = modelOverride;
      // If overriding to a Claude model but user has OpenAI key, get Claude key
      if (overrideModel.provider === "claude" && config.provider === "openai") {
        const claudeKey = await getDecryptedApiKey(userId, "claude", supabaseOverride);
        config.apiKey = claudeKey || process.env.ANTHROPIC_API_KEY || config.apiKey;
        (config as { provider: AIProvider }).provider = "claude";
      }
    }
  }

  // 2. System prompt = prompt agent + RAG séparés (meilleur cache Claude)
  const { prompt: agentPrompt, rag: ragContext } = await buildSystemPromptParts(
    agentId, userId, supabaseOverride, options.icpSegment,
    options.sequenceStep, options.m2Situation, options.signalType, options.leadResponseType
  );

  // --- DEBUG: log payload avant appel API ---
  if (agentId === "prospection_m1" || agentId === "prospection_m2") {
    const promptTokenEstimate = Math.ceil(agentPrompt.length / 4);
    const ragTokenEstimate = ragContext ? Math.ceil(ragContext.length / 4) : 0;
    const runtimeTokenEstimate = runtimeContext ? Math.ceil(runtimeContext.length / 4) : 0;
    const ragBlocNames = ragContext?.match(/### ([^\n]+)/g)?.map(m => m.replace("### ", "")) || [];
    console.log(`\n========== [AI DEBUG] ${agentId.toUpperCase()} CALL ==========`);
    console.log(`[AI DEBUG] Model: ${config.model} | Provider: ${config.provider} | Temp: ${temperature}`);
    console.log(`[AI DEBUG] Agent prompt: ~${promptTokenEstimate} tokens (${agentPrompt.length} chars)`);
    console.log(`[AI DEBUG] RAG context: ~${ragTokenEstimate} tokens (${ragContext?.length || 0} chars)`);
    console.log(`[AI DEBUG] Runtime context: ~${runtimeTokenEstimate} tokens (${runtimeContext?.length || 0} chars)`);
    console.log(`[AI DEBUG] RAG blocs (${ragBlocNames.length}): ${ragBlocNames.join(", ")}`);
    console.log(`[AI DEBUG] ICP segment: ${options.icpSegment || "none"}`);
    console.log(`[AI DEBUG] User prompt:\n${messages[0]?.content || "(empty)"}`);
    console.log("==================================================\n");
  }

  // 3. Appel provider
  let response: AIResponse;

  if (config.provider === "openai") {
    // OpenAI : tout concaténé en un seul system prompt
    const fullSystem = [agentPrompt, ragContext, runtimeContext].filter(Boolean).join("\n\n");
    response = await callOpenAI(config.apiKey, config.model, fullSystem, messages, maxTokens, temperature);
  } else {
    // Claude : 3 blocs séparés pour un cache optimal
    response = await callClaude(config.apiKey, config.model, agentPrompt, ragContext, runtimeContext, messages, maxTokens, temperature);
  }

  // --- DEBUG: log réponse ---
  if (agentId === "prospection_m1" || agentId === "prospection_m2") {
    console.log(`[AI DEBUG] Response (${response.usage.inputTokens}in/${response.usage.outputTokens}out, cached: ${response.usage.cachedTokens}):`);
    console.log(`[AI DEBUG] Generated message:\n${response.text}`);
    console.log(`[AI DEBUG] Cost: $${response.usage.estimatedCostUsd.toFixed(4)}`);
    console.log("========== [AI DEBUG] END ==========\n");
  }

  // 4. Build loggable input (system prompt tronqué + RAG tronqué + runtimeContext + user messages)
  const inputForLog = [
    agentPrompt ? `[System Prompt]\n${agentPrompt.slice(0, 500)}${agentPrompt.length > 500 ? "..." : ""}` : null,
    ragContext ? `[RAG Context]\n${ragContext.slice(0, 1000)}${ragContext.length > 1000 ? "..." : ""}` : null,
    runtimeContext ? `[Runtime Context]\n${runtimeContext}` : null,
    ...messages.map(m => `[${m.role}]\n${m.content}`),
  ].filter(Boolean).join("\n\n---\n\n");

  // 5. Log usage (fire & forget)
  logUsage(userId, agentId, config.provider, config.model, response.usage, inputForLog, response.text, metadata, supabaseOverride).catch(
    (err) => console.error("[AI Service] Usage logging failed:", err)
  );

  return response;
}

// ---------------------------------------------------------------------------
// Claude (avec prompt caching)
// ---------------------------------------------------------------------------

async function callClaude(
  apiKey: string,
  model: string,
  agentPrompt: string,
  ragContext: string | undefined,
  runtimeContext: string | undefined,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<AIResponse> {
  const anthropic = new Anthropic({ apiKey });

  // 3 blocs system séparés pour un cache optimal :
  // - agentPrompt : stable (même pour tous les leads) → toujours caché
  // - ragContext : varie par ICP segment → caché au sein du même segment
  // - runtimeContext : varie par lead → jamais caché
  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];

  if (agentPrompt) {
    systemBlocks.push({
      type: "text" as const,
      text: agentPrompt,
      cache_control: { type: "ephemeral" as const },
    });
  }

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

  // Fallback: si aucun bloc system, ajouter un bloc minimal
  if (systemBlocks.length === 0) {
    systemBlocks.push({ type: "text" as const, text: "You are a helpful assistant." });
  }

  const result = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemBlocks,
    messages: messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const textContent = result.content.find((c) => c.type === "text");
  const text = textContent && "text" in textContent ? textContent.text.trim() : "";

  // Usage tokens — access typed props + cache props via unknown cast (SDK types may not expose cache fields)
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

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  fullSystemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<AIResponse> {
  const openai = new OpenAI({ apiKey });

  // GPT-5.x are reasoning models:
  // - max_tokens is rejected → use max_completion_tokens
  // - "system" role is rejected → use "developer" role
  const isGpt5 = model.startsWith("gpt-5");
  const result = await openai.chat.completions.create({
    model,
    ...(isGpt5 ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    temperature,
    messages: [
      { role: (isGpt5 ? "developer" : "system") as "system", content: fullSystemPrompt },
      ...messages,
    ],
  });

  const text = result.choices[0]?.message?.content?.trim() ?? "";

  const inputTokens = result.usage?.prompt_tokens ?? 0;
  const outputTokens = result.usage?.completion_tokens ?? 0;
  const usageAny = result.usage as unknown as Record<string, unknown> | undefined;
  const detailsAny = usageAny?.prompt_tokens_details as Record<string, number> | undefined;
  const cachedTokens = detailsAny?.cached_tokens ?? 0;

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens, cachedTokens),
    },
  };
}

// ---------------------------------------------------------------------------
// Perplexity (API compatible OpenAI, base URL différente)
// ---------------------------------------------------------------------------

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
const PERPLEXITY_DEFAULT_MODEL = "sonar-pro";

async function callPerplexityInternal(
  apiKey: string,
  model: string,
  fullSystemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<AIResponse> {
  const openai = new OpenAI({ apiKey, baseURL: PERPLEXITY_BASE_URL });

  const result = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system" as const, content: fullSystemPrompt },
      ...messages,
    ],
  });

  const text = result.choices[0]?.message?.content?.trim() ?? "";

  const inputTokens = result.usage?.prompt_tokens ?? 0;
  const outputTokens = result.usage?.completion_tokens ?? 0;

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens, 0),
    },
  };
}

/**
 * Call Perplexity directly for enrichment (forces Perplexity provider).
 * Uses the user's perplexity API key from DB.
 */
export async function callPerplexity(options: {
  userId: string;
  agentId: AgentId;
  runtimeContext?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
  supabaseOverride?: SupabaseClient<Database>;
}): Promise<AIResponse> {
  const {
    userId,
    agentId,
    runtimeContext,
    messages,
    maxTokens = 2048,
    temperature = 0.3,
    metadata,
    supabaseOverride,
  } = options;

  // Get Perplexity API key
  const apiKey = await getDecryptedApiKey(userId, "perplexity", supabaseOverride);
  if (!apiKey) {
    throw new Error(
      "Clé API Perplexity non configurée. Ajoutez-la dans Settings > Clés API."
    );
  }

  // Build system prompt (prompt + RAG)
  const basePrompt = await buildSystemPrompt(agentId, userId, supabaseOverride);
  const fullSystem = runtimeContext
    ? `${basePrompt}\n\n${runtimeContext}`
    : basePrompt;

  const model = PERPLEXITY_DEFAULT_MODEL;

  const response = await callPerplexityInternal(
    apiKey,
    model,
    fullSystem,
    messages,
    maxTokens,
    temperature
  );

  // Build loggable input (system prompt+RAG tronqués + runtimeContext + user messages)
  const inputForLog = [
    basePrompt ? `[System Prompt + RAG]\n${basePrompt.slice(0, 1500)}${basePrompt.length > 1500 ? "..." : ""}` : null,
    runtimeContext ? `[Runtime Context]\n${runtimeContext}` : null,
    ...messages.map(m => `[${m.role}]\n${m.content}`),
  ].filter(Boolean).join("\n\n---\n\n");

  // Log usage
  logUsage(userId, agentId, "perplexity", model, response.usage, inputForLog, response.text, metadata, supabaseOverride).catch(
    (err) => console.error("[AI Service] Usage logging failed:", err)
  );

  return response;
}

// ---------------------------------------------------------------------------
// OpenAI Responses API + web_search tool
// ---------------------------------------------------------------------------

export interface WebSearchResponse {
  text: string;
  sources: string[];
  usage: AIResponse["usage"];
}

const WEB_SEARCH_DEFAULT_MODEL = "gpt-5-mini";

/**
 * Recherche web factuelle via OpenAI Responses API + tool web_search.
 * Remplace Perplexity pour les news/funding/freshness.
 *
 * Le tool web_search est facturé ~$0.025/call par OpenAI (en plus des tokens).
 */
export async function callOpenAIWebSearch(options: {
  userId: string;
  agentId: AgentId;
  /** Prompt de recherche (1-3 phrases) */
  prompt: string;
  /** Optional: instructions système (ex: "Réponds en JSON strict avec keys news, funding, recent_events") */
  instructions?: string;
  modelOverride?: string;
  metadata?: Record<string, unknown>;
  supabaseOverride?: SupabaseClient<Database>;
}): Promise<WebSearchResponse> {
  const { userId, agentId, prompt, instructions, modelOverride, metadata, supabaseOverride } = options;

  const apiKey = await getDecryptedApiKey(userId, "openai", supabaseOverride);
  if (!apiKey) {
    throw new Error("Clé API OpenAI non configurée. Ajoutez-la dans Settings > Clés API.");
  }

  const model = modelOverride || WEB_SEARCH_DEFAULT_MODEL;
  const openai = new OpenAI({ apiKey });

  // Responses API avec web_search tool
  const result = (await openai.responses.create({
    model,
    input: prompt,
    ...(instructions ? { instructions } : {}),
    tools: [{ type: "web_search" }],
  })) as unknown as {
    output_text?: string;
    output?: Array<Record<string, unknown>>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };

  const text = result.output_text || "";

  // Extract URLs from message annotations (web_search citations)
  const sources: string[] = [];
  for (const item of result.output || []) {
    if (item.type === "message") {
      const content = (item.content as Array<Record<string, unknown>>) || [];
      for (const part of content) {
        const annotations = (part.annotations as Array<Record<string, unknown>>) || [];
        for (const ann of annotations) {
          const url = ann.url as string | undefined;
          if (url && !sources.includes(url)) sources.push(url);
        }
      }
    }
  }

  const inputTokens = result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.output_tokens ?? 0;
  const cachedTokens = result.usage?.input_tokens_details?.cached_tokens ?? 0;
  const usage: AIResponse["usage"] = {
    inputTokens,
    outputTokens,
    cachedTokens,
    estimatedCostUsd: estimateCost(model, inputTokens, outputTokens, cachedTokens),
  };

  // Log
  const inputForLog = [
    instructions ? `[Instructions]\n${instructions}` : null,
    `[Prompt]\n${prompt}`,
  ].filter(Boolean).join("\n\n");
  const outputForLog = sources.length > 0 ? `${text}\n\n[Sources]\n${sources.join("\n")}` : text;
  logUsage(userId, agentId, "openai", model, usage, inputForLog, outputForLog, metadata, supabaseOverride).catch(
    (err) => console.error("[AI Service] Usage logging failed:", err)
  );

  return { text, sources, usage };
}

// ---------------------------------------------------------------------------
// Claude + outil web_search (recherche web factuelle via Anthropic)
// ---------------------------------------------------------------------------

const CLAUDE_WEB_SEARCH_MODEL = "claude-haiku-4-5-20251001";

/**
 * Recherche web via l'outil natif `web_search` de Claude (utilise la clé Claude
 * du user, fallback ANTHROPIC_API_KEY). Calque callOpenAIWebSearch mais côté Claude.
 * Renvoie le texte + les URLs sources citées.
 */
export async function callClaudeWebSearch(options: {
  userId: string;
  agentId: AgentId;
  prompt: string;
  /** Optional: instructions système (ex: "Réponds en JSON strict avec keys ...") */
  instructions?: string;
  maxUses?: number;
  modelOverride?: string;
  metadata?: Record<string, unknown>;
  supabaseOverride?: SupabaseClient<Database>;
}): Promise<WebSearchResponse> {
  const { userId, agentId, prompt, instructions, maxUses = 3, modelOverride, metadata, supabaseOverride } = options;

  const userKey = await getDecryptedApiKey(userId, "claude", supabaseOverride);
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) throw new Error("Clé API Claude non configurée.");

  const model = modelOverride || CLAUDE_WEB_SEARCH_MODEL;
  const anthropic = new Anthropic({ apiKey });

  const result = await anthropic.messages.create({
    model,
    max_tokens: 512,
    ...(instructions ? { system: instructions } : {}),
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }] as unknown as Anthropic.Messages.Tool[],
  });

  const blocks = result.content as unknown as Array<Record<string, unknown>>;
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .join(" ")
    .trim();

  // URLs sources citées par l'outil web_search
  const sources: string[] = [];
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content as Array<Record<string, unknown>>) {
        const url = r.url as string | undefined;
        if (url && !sources.includes(url)) sources.push(url);
      }
    }
  }

  const inputTokens = result.usage.input_tokens ?? 0;
  const outputTokens = result.usage.output_tokens ?? 0;
  const usageAny = result.usage as unknown as Record<string, number>;
  const cacheRead = usageAny.cache_read_input_tokens ?? 0;
  const usage: AIResponse["usage"] = {
    inputTokens,
    outputTokens,
    cachedTokens: cacheRead + (usageAny.cache_creation_input_tokens ?? 0),
    estimatedCostUsd: estimateCost(model, inputTokens, outputTokens, cacheRead),
  };

  const inputForLog = instructions ? `[Instructions]\n${instructions}\n\n[Prompt]\n${prompt}` : prompt;
  const outputForLog = sources.length > 0 ? `${text}\n\n[Sources]\n${sources.join("\n")}` : text;
  logUsage(userId, agentId, "claude", model, usage, inputForLog, outputForLog, metadata, supabaseOverride).catch(
    (err) => console.error("[AI Service] Usage logging failed:", err)
  );

  return { text, sources, usage };
}

// ---------------------------------------------------------------------------
// Usage logging (non-bloquant)
// ---------------------------------------------------------------------------

async function logUsage(
  userId: string,
  agentId: string,
  provider: string,
  model: string,
  usage: AIResponse["usage"],
  inputText: string | null,
  outputText: string | null,
  metadata?: Record<string, unknown>,
  supabaseOverride?: SupabaseClient<Database>
): Promise<void> {
  try {
    const supabase = supabaseOverride ?? createServerClient();
    await supabase.from("ai_usage").insert({
      user_id: userId,
      agent_id: agentId,
      provider,
      model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_tokens: usage.cachedTokens,
      estimated_cost_usd: usage.estimatedCostUsd,
      input_text: inputText,
      output_text: outputText,
      metadata: (metadata ?? null) as import("@/types/database").Json,
    });
  } catch (err) {
    console.error("[AI Service] Failed to log usage:", err);
  }
}
