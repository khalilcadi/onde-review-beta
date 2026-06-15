"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AI_MODELS } from "@/lib/ai/models";
import { getAILogs } from "@/lib/actions/ai-usage";
import type { AILogEntry, AILogsResult } from "@/lib/actions/ai-usage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01 && cost > 0) return "< $0.01";
  return `$${cost.toFixed(3)}`;
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

const AGENT_COLORS: Record<string, string> = {
  prospection_m1: "bg-blue-500/10 text-blue-700",
  prospection_m2: "bg-sky-500/10 text-sky-700",
  scoring: "bg-amber-500/10 text-amber-700",
  enrichissement: "bg-purple-500/10 text-purple-700",
  conversational: "bg-green-500/10 text-green-700",
};

const AGENT_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "prospection_m1", label: "Prospection M1" },
  { id: "prospection_m2", label: "Prospection M2" },
  { id: "scoring", label: "Scoring" },
  { id: "enrichissement", label: "Enrichissement" },
  { id: "conversational", label: "Cockpit IA" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = [
    "jan", "fev", "mar", "avr", "mai", "jun",
    "jul", "aou", "sep", "oct", "nov", "dec",
  ];
  const month = months[d.getMonth()];
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${hours}:${minutes}`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogsClientProps {
  initialData: AILogsResult;
}

export function LogsClient({ initialData }: LogsClientProps) {
  const [logs, setLogs] = useState<AILogEntry[]>(initialData.logs);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor);
  const [totalCount, setTotalCount] = useState(initialData.totalCount);
  const [agentFilter, setAgentFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFilterChange(agentId: string) {
    setAgentFilter(agentId);
    setExpandedId(null);
    startTransition(async () => {
      const result = await getAILogs({
        agentId: agentId === "all" ? undefined : agentId,
        limit: 25,
      });
      if (result.success) {
        setLogs(result.data.logs);
        setNextCursor(result.data.nextCursor);
        setTotalCount(result.data.totalCount);
      }
    });
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    startTransition(async () => {
      const result = await getAILogs({
        agentId: agentFilter === "all" ? undefined : agentFilter,
        cursor: nextCursor,
        limit: 25,
      });
      if (result.success) {
        setLogs((prev) => [...prev, ...result.data.logs]);
        setNextCursor(result.data.nextCursor);
      }
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Logs IA</h1>
        <p className="text-muted-foreground">
          {totalCount} appel{totalCount !== 1 ? "s" : ""} IA enregistre{totalCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Agent filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {AGENT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => handleFilterChange(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              agentFilter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isPending && logs.length === 0 && (
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isPending && logs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun log IA pour le moment
          </CardContent>
        </Card>
      )}

      {/* Logs list */}
      {logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <Card key={log.id} className="overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-muted-foreground w-[90px] shrink-0">
                    {formatDate(log.createdAt)}
                  </span>

                  <Badge
                    variant="secondary"
                    className={`shrink-0 ${AGENT_COLORS[log.agentId] || ""}`}
                  >
                    {AGENT_LABELS[log.agentId] || log.agentId}
                  </Badge>

                  <span className="text-xs text-muted-foreground shrink-0">
                    {getModelLabel(log.model)}
                  </span>

                  <span className="flex-1 text-sm truncate text-muted-foreground min-w-0">
                    {log.outputText
                      ? truncateText(log.outputText, 80)
                      : "—"}
                  </span>

                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatTokens(log.inputTokens + log.outputTokens)}
                  </span>

                  <span className="text-sm font-medium shrink-0 w-[60px] text-right tabular-nums">
                    {formatCost(log.estimatedCostUsd)}
                  </span>

                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/30">
                    {/* Meta row */}
                    <div className="flex gap-6 text-sm text-muted-foreground flex-wrap">
                      <span>Provider: <span className="text-foreground font-medium">{log.provider}</span></span>
                      <span>Model: <span className="text-foreground font-medium">{getModelLabel(log.model)}</span></span>
                      <span>Tokens in: <span className="text-foreground font-medium">{log.inputTokens.toLocaleString()}</span></span>
                      <span>Tokens out: <span className="text-foreground font-medium">{log.outputTokens.toLocaleString()}</span></span>
                      {log.cachedTokens > 0 && (
                        <span>Cached: <span className="text-foreground font-medium">{log.cachedTokens.toLocaleString()}</span></span>
                      )}
                      <span>Cost: <span className="text-foreground font-medium">{formatCost(log.estimatedCostUsd)}</span></span>
                    </div>

                    {/* Input */}
                    <div>
                      <p className="text-sm font-medium mb-2">Input</p>
                      {log.inputText ? (
                        <pre className="text-sm font-mono bg-background rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                          {log.inputText}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Non disponible (log anterieur a la capture)</p>
                      )}
                    </div>

                    {/* Output */}
                    <div>
                      <p className="text-sm font-medium mb-2">Output</p>
                      {log.outputText ? (
                        <pre className="text-sm font-mono bg-background rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                          {log.outputText}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Non disponible (log anterieur a la capture)</p>
                      )}
                    </div>

                    {/* Metadata */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Metadata</p>
                        <pre className="text-sm font-mono bg-background rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Charger plus
          </Button>
        </div>
      )}
    </div>
  );
}
