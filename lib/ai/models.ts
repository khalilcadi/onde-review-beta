/**
 * Catalogue des modèles IA disponibles avec pricing (mars 2026).
 *
 * Prix en USD par million de tokens.
 * Sources : platform.claude.com/docs/en/about-claude/pricing
 *           developers.openai.com/api/docs/pricing
 */

export const AI_MODELS = {
  // --- Claude (Anthropic) ---
  "claude-opus-4-6": {
    provider: "claude" as const,
    label: "Claude Opus 4.6",
    inputPricePer1M: 5.0,
    outputPricePer1M: 25.0,
    cacheReadPer1M: 0.5,
  },
  "claude-sonnet-4-6": {
    provider: "claude" as const,
    label: "Claude Sonnet 4.6",
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    cacheReadPer1M: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    provider: "claude" as const,
    label: "Claude Haiku 4.5",
    inputPricePer1M: 1.0,
    outputPricePer1M: 5.0,
    cacheReadPer1M: 0.1,
  },
  // --- OpenAI ---
  "gpt-5.4": {
    provider: "openai" as const,
    label: "GPT-5.4",
    inputPricePer1M: 2.5,
    outputPricePer1M: 15.0,
    cacheReadPer1M: 0.25,
  },
  "gpt-5.2": {
    provider: "openai" as const,
    label: "GPT-5.2",
    inputPricePer1M: 1.75,
    outputPricePer1M: 14.0,
    cacheReadPer1M: 0.175,
  },
  "gpt-5.1": {
    provider: "openai" as const,
    label: "GPT-5.1",
    inputPricePer1M: 1.25,
    outputPricePer1M: 10.0,
    cacheReadPer1M: 0.125,
  },
  "gpt-5-mini": {
    provider: "openai" as const,
    label: "GPT-5 Mini",
    inputPricePer1M: 0.25,
    outputPricePer1M: 2.0,
    cacheReadPer1M: 0.025,
  },
  "gpt-5-nano": {
    provider: "openai" as const,
    label: "GPT-5 Nano",
    inputPricePer1M: 0.05,
    outputPricePer1M: 0.4,
    cacheReadPer1M: 0.005,
  },
  // --- Perplexity ---
  "sonar-pro": {
    provider: "perplexity" as const,
    label: "Sonar Pro",
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    cacheReadPer1M: 0,
  },
  "sonar": {
    provider: "perplexity" as const,
    label: "Sonar",
    inputPricePer1M: 1.0,
    outputPricePer1M: 1.0,
    cacheReadPer1M: 0,
  },
} as const;

export type AIModelId = keyof typeof AI_MODELS;
export type AIProvider = "claude" | "openai" | "perplexity";

/** Retourne les model IDs disponibles pour un provider donné. */
export function getModelsByProvider(provider: AIProvider): AIModelId[] {
  return (Object.keys(AI_MODELS) as AIModelId[]).filter(
    (id) => AI_MODELS[id].provider === provider
  );
}

/** Estime le coût en USD d'un appel API. */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const model = AI_MODELS[modelId as AIModelId];
  if (!model) return 0;

  const uncachedInputTokens = Math.max(0, inputTokens - cachedTokens);

  const inputCost = (uncachedInputTokens / 1_000_000) * model.inputPricePer1M;
  const cachedCost = (cachedTokens / 1_000_000) * model.cacheReadPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputPricePer1M;

  return inputCost + cachedCost + outputCost;
}
