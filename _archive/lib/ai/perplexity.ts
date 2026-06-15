/**
 * Perplexity enrichment helper.
 *
 * Uses callPerplexity() from the unified AI service (OpenAI-compatible API
 * with base URL https://api.perplexity.ai).
 *
 * The actual client logic lives in lib/ai/service.ts → callPerplexity().
 * This module re-exports it for convenience and backward compatibility.
 */

export { callPerplexity } from "./service";
