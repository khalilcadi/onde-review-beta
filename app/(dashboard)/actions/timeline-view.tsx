"use client";

import { Fragment } from "react";
import {
  Eye,
  UserPlus,
  MessageSquare,
  Mail,
  Phone,
  AtSign,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ANTI_DETECTION_DELAYS, ACTION_STATUSES } from "@/lib/constants";
import type { ActionWithLead, ActionType } from "@/types/actions";

// ---------------------------------------------------------------------------
// Icons map
// ---------------------------------------------------------------------------

const ACTION_ICON_MAP: Record<string, React.ElementType> = {
  visit: Eye,
  invitation: UserPlus,
  message: MessageSquare,
  inmail: Mail,
  whatsapp: Phone,
  email: AtSign,
};

const ACTION_LABEL_MAP: Record<string, string> = {
  visit: "Visite",
  invitation: "Invitation",
  message: "Message",
  inmail: "InMail",
  whatsapp: "WhatsApp",
  email: "Email",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BURST_THRESHOLD_MS = 20 * 60 * 1000; // 20 min

function getMinRequiredDelay(prevType: ActionType, currType: ActionType): number {
  // inmail behaves like message for anti-detection
  const norm = (t: string) => (t === "inmail" ? "message" : t);
  const key = `${norm(prevType)}_to_${norm(currType)}`;
  const delay = ANTI_DETECTION_DELAYS[key];
  if (!delay) return 8 * 60 * 1000;
  return delay.min;
}

function formatTime(date: Date | null): string {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function formatGap(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining > 0 ? String(remaining).padStart(2, "0") : ""}`;
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

interface TimelineEntry {
  action: ActionWithLead;
  displayTime: Date | null;
  gapMs: number | null;
  isInBurst: boolean;
  burstGroupIndex: number;
  isGapWarning: boolean;
}

function prepareTimeline(actions: ActionWithLead[]) {
  const withTime = actions.filter(
    (a) => a.scheduledAt || a.sentAt
  );
  const withoutTime = actions.filter(
    (a) => !a.scheduledAt && !a.sentAt
  );

  const sorted = [...withTime].sort((a, b) => {
    const tA = new Date(a.sentAt || a.scheduledAt!).getTime();
    const tB = new Date(b.sentAt || b.scheduledAt!).getTime();
    return tA - tB;
  });

  let burstGroupIndex = 0;
  let burstCount = 1;
  let warningCount = 0;
  const gaps: number[] = [];

  const entries: TimelineEntry[] = sorted.map((action, i) => {
    const displayTime = action.sentAt
      ? new Date(action.sentAt)
      : action.scheduledAt
        ? new Date(action.scheduledAt)
        : null;

    let gapMs: number | null = null;
    let isInBurst = true;
    let isGapWarning = false;

    if (i > 0 && displayTime) {
      const prevTime = new Date(
        sorted[i - 1].sentAt || sorted[i - 1].scheduledAt!
      ).getTime();
      gapMs = displayTime.getTime() - prevTime;
      gaps.push(gapMs);

      if (gapMs >= BURST_THRESHOLD_MS) {
        burstGroupIndex++;
        burstCount++;
        isInBurst = false;
      }

      const minDelay = getMinRequiredDelay(
        sorted[i - 1].actionType,
        action.actionType
      );
      if (gapMs < minDelay) {
        isGapWarning = true;
        warningCount++;
      }
    }

    return {
      action,
      displayTime,
      gapMs,
      isInBurst,
      burstGroupIndex,
      isGapWarning,
    };
  });

  const avgGapMs =
    gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  return {
    entries,
    unscheduled: withoutTime,
    burstCount: sorted.length > 0 ? burstCount : 0,
    avgGapMinutes: Math.round(avgGapMs / 60000),
    warningCount,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TimelineViewProps {
  actions: ActionWithLead[];
}

export default function TimelineView({ actions }: TimelineViewProps) {
  const { entries, unscheduled, burstCount, avgGapMinutes, warningCount } =
    prepareTimeline(actions);

  if (entries.length === 0 && unscheduled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Clock className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucune action programm&eacute;e aujourd&apos;hui</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary bar */}
        {entries.length > 0 && (
          <div className="flex items-center gap-6 bg-card rounded-lg border border-border px-5 py-3 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent" />
              <span>{entries.length} programm&eacute;e{entries.length > 1 ? "s" : ""}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Bursts :</span>
              <span className="font-mono font-medium">{burstCount}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Gap moyen :</span>
              <span className="font-mono font-medium">{avgGapMinutes}min</span>
            </div>
            {warningCount > 0 && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    {warningCount} alerte{warningCount > 1 ? "s" : ""} anti-d&eacute;tection
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Timeline table */}
        {entries.length > 0 && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-20">
                      Heure
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-24">
                      Delta
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">
                      Statut
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-48">
                      Lead
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => {
                    const { action, displayTime, gapMs, isInBurst, burstGroupIndex, isGapWarning } = entry;
                    const Icon = ACTION_ICON_MAP[action.actionType] ?? MessageSquare;
                    const statusInfo =
                      ACTION_STATUSES[action.status as keyof typeof ACTION_STATUSES] ??
                      ACTION_STATUSES.pending;
                    const message = action.finalMessage || action.generatedMessage || "";
                    const truncated = message.replace(/\|\|\|/g, " ").slice(0, 80);

                    // Show burst separator before this row if big gap
                    const showSeparator = i > 0 && gapMs !== null && gapMs >= BURST_THRESHOLD_MS;

                    return (
                      <Fragment key={action.id}>
                        {showSeparator && (
                          <tr className="bg-muted/20">
                            <td colSpan={6} className="px-4 py-2">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <div className="flex-1 h-px bg-border" />
                                <span className="font-mono">
                                  {formatGap(gapMs!)} de pause
                                </span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                            burstGroupIndex % 2 === 0
                              ? "border-l-2 border-l-accent/30"
                              : "border-l-2 border-l-emerald-400/30"
                          }`}
                        >
                          {/* Heure */}
                          <td className="px-4 py-3 font-mono text-sm">
                            {formatTime(displayTime)}
                          </td>

                          {/* Delta */}
                          <td className="px-4 py-3">
                            {i === 0 ? (
                              <span className="text-muted-foreground">--</span>
                            ) : gapMs !== null ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-mono text-sm ${
                                    isGapWarning
                                      ? "text-destructive font-semibold"
                                      : isInBurst
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {formatGap(gapMs)}
                                </span>
                                {isGapWarning && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">
                                        D&eacute;lai inf&eacute;rieur au minimum anti-d&eacute;tection requis (
                                        {formatGap(
                                          getMinRequiredDelay(
                                            entries[i - 1].action.actionType,
                                            action.actionType
                                          )
                                        )}
                                        )
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3">
                            <Badge
                              variant={statusInfo.color as "secondary" | "accent" | "success" | "destructive"}
                              className="text-xs"
                            >
                              {statusInfo.label}
                            </Badge>
                          </td>

                          {/* Type */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">
                                {ACTION_LABEL_MAP[action.actionType] ?? action.actionType}
                              </span>
                            </div>
                          </td>

                          {/* Lead */}
                          <td className="px-4 py-3">
                            <div className="truncate">
                              <span className="font-medium">
                                {action.lead.displayName}
                              </span>
                              {action.lead.company && (
                                <span className="text-muted-foreground ml-1.5 text-xs">
                                  {action.lead.company}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Message */}
                          <td className="px-4 py-3">
                            {truncated ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-muted-foreground text-xs truncate block max-w-xs cursor-default">
                                    {truncated}{truncated.length >= 80 ? "..." : ""}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <p className="text-xs whitespace-pre-wrap">{message.replace(/\|\|\|/g, "\n---\n")}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Unscheduled (pending, not yet validated) */}
        {unscheduled.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground mb-3">
                {unscheduled.length} action{unscheduled.length > 1 ? "s" : ""} en attente de
                validation (pas encore programm&eacute;e{unscheduled.length > 1 ? "s" : ""})
              </div>
              <div className="space-y-2">
                {unscheduled.map((action) => {
                  const Icon = ACTION_ICON_MAP[action.actionType] ?? MessageSquare;
                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <Badge variant="secondary" className="text-xs">
                        En attente
                      </Badge>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        {action.lead.displayName}
                      </span>
                      {action.lead.company && (
                        <span className="text-muted-foreground text-xs truncate">
                          {action.lead.company}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

