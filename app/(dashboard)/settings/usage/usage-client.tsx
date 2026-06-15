"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, DollarSign, Cpu, Zap } from "lucide-react";
import type { UsageStats } from "@/lib/actions/ai-usage";
import { AI_MODELS } from "@/lib/ai/models";

type Period = "today" | "week" | "month";

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `< $0.01`;
  return `$${cost.toFixed(2)}`;
}

function getModelLabel(modelId: string): string {
  const model = AI_MODELS[modelId as keyof typeof AI_MODELS];
  return model?.label ?? modelId;
}

const AGENT_LABELS: Record<string, string> = {
  prospection_m1: "Prospection M1",
  prospection_m2: "Prospection M2",
  scoring: "Scoring",
  enrichissement: "Enrichissement",
  conversational: "Cockpit IA",
};

interface UsageClientProps {
  today: UsageStats | null;
  week: UsageStats | null;
  month: UsageStats | null;
}

export function UsageClient({ today, week, month }: UsageClientProps) {
  const [period, setPeriod] = useState<Period>("week");

  const statsMap: Record<Period, UsageStats | null> = { today, week, month };
  const stats = statsMap[period];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Usage IA</h1>
        <p className="text-muted-foreground">
          Suivez votre consommation et vos coûts IA
        </p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(["today", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p === "today" ? "Aujourd'hui" : p === "week" ? "Cette semaine" : "Ce mois"}
          </button>
        ))}
      </div>

      {!stats ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucune donnée disponible
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <Activity className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Appels IA</p>
                    <p className="text-2xl font-semibold">{stats.callCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Cpu className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tokens (in)</p>
                    <p className="text-2xl font-semibold">{formatTokens(stats.totalInputTokens)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <Zap className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tokens (out)</p>
                    <p className="text-2xl font-semibold">{formatTokens(stats.totalOutputTokens)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <DollarSign className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Coût estimé</p>
                    <p className="text-2xl font-semibold">{formatCost(stats.totalEstimatedCostUsd)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cached tokens info */}
          {stats.totalCachedTokens > 0 && (
            <div className="text-sm text-muted-foreground">
              {formatTokens(stats.totalCachedTokens)} tokens lus depuis le cache (prompt caching)
            </div>
          )}

          {/* Breakdown by agent */}
          {stats.byAgent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Par agent</CardTitle>
                <CardDescription>Répartition de la consommation par agent IA</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.byAgent.map((entry) => (
                    <div key={entry.agentId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <span className="font-medium">{AGENT_LABELS[entry.agentId] || entry.agentId}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {entry.calls} appel{entry.calls > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">{formatTokens(entry.tokens)} tokens</span>
                        <span className="ml-3 font-medium">{formatCost(entry.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Breakdown by model */}
          {stats.byModel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Par modèle</CardTitle>
                <CardDescription>Répartition de la consommation par modèle IA</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.byModel.map((entry) => (
                    <div key={entry.model} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <span className="font-medium">{getModelLabel(entry.model)}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {entry.calls} appel{entry.calls > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">{formatTokens(entry.tokens)} tokens</span>
                        <span className="ml-3 font-medium">{formatCost(entry.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {stats.callCount === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aucun appel IA sur cette période
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
