// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";

export interface AILogEntry {
  id: string;
  agentId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  inputText: string | null;
  outputText: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AILogsResult {
  logs: AILogEntry[];
  nextCursor: string | null;
  totalCount: number;
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalEstimatedCostUsd: number;
  callCount: number;
  byAgent: Array<{
    agentId: string;
    calls: number;
    tokens: number;
    cost: number;
  }>;
  byModel: Array<{
    model: string;
    calls: number;
    tokens: number;
    cost: number;
  }>;
}

export async function getUsageStats(
  period: "today" | "week" | "month"
): Promise<ActionResult<UsageStats>> {
  try {
    const { supabase } = await getAuthUser();

    // Calculer la date de début selon la période
    const now = new Date();
    const startDate = new Date();
    if (period === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    const { data: rows, error } = await supabase
      .from("ai_usage")
      .select("agent_id, provider, model, input_tokens, output_tokens, cached_tokens, estimated_cost_usd")
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    const records = rows ?? [];

    // Totaux
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let totalEstimatedCostUsd = 0;

    // Breakdowns
    const agentMap = new Map<string, { calls: number; tokens: number; cost: number }>();
    const modelMap = new Map<string, { calls: number; tokens: number; cost: number }>();

    for (const r of records) {
      const input = r.input_tokens ?? 0;
      const output = r.output_tokens ?? 0;
      const cached = r.cached_tokens ?? 0;
      const cost = Number(r.estimated_cost_usd) || 0;

      totalInputTokens += input;
      totalOutputTokens += output;
      totalCachedTokens += cached;
      totalEstimatedCostUsd += cost;

      // By agent
      const agentEntry = agentMap.get(r.agent_id) || { calls: 0, tokens: 0, cost: 0 };
      agentEntry.calls += 1;
      agentEntry.tokens += input + output;
      agentEntry.cost += cost;
      agentMap.set(r.agent_id, agentEntry);

      // By model
      const modelEntry = modelMap.get(r.model) || { calls: 0, tokens: 0, cost: 0 };
      modelEntry.calls += 1;
      modelEntry.tokens += input + output;
      modelEntry.cost += cost;
      modelMap.set(r.model, modelEntry);
    }

    const byAgent = [...agentMap.entries()]
      .map(([agentId, stats]) => ({ agentId, ...stats }))
      .sort((a, b) => b.cost - a.cost);

    const byModel = [...modelMap.entries()]
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost - a.cost);

    return {
      success: true,
      data: {
        totalInputTokens,
        totalOutputTokens,
        totalCachedTokens,
        totalEstimatedCostUsd,
        callCount: records.length,
        byAgent,
        byModel,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getAILogs(options: {
  agentId?: string;
  cursor?: string;
  limit?: number;
}): Promise<ActionResult<AILogsResult>> {
  try {
    const { supabase } = await getAuthUser();
    const limit = options.limit ?? 25;

    let query = supabase
      .from("ai_usage")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options.agentId && options.agentId !== "all") {
      query = query.eq("agent_id", options.agentId);
    }

    if (options.cursor) {
      query = query.lt("created_at", options.cursor);
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;

    const logs: AILogEntry[] = (rows ?? []).map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      provider: r.provider,
      model: r.model,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
      cachedTokens: r.cached_tokens ?? 0,
      estimatedCostUsd: Number(r.estimated_cost_usd) || 0,
      inputText: r.input_text ?? null,
      outputText: r.output_text ?? null,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.created_at,
    }));

    const nextCursor =
      logs.length === limit ? logs[logs.length - 1].createdAt : null;

    return {
      success: true,
      data: { logs, nextCursor, totalCount: count ?? 0 },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
