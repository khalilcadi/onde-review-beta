"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Eye,
  RefreshCw,
  ExternalLink,
  User,
  Loader2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { getProfileVisitors } from "@/lib/actions/visitors";
import type { ProfileVisitor, VisitorInsight } from "@/lib/actions/visitors";
import Link from "next/link";
import { LEAD_STAGES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVisitDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "À l\u2019instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD < 7) return `Il y a ${diffD}j`;

  const day = d.getDate();
  const months = [
    "jan", "fév", "mar", "avr", "mai", "jun",
    "jul", "aoû", "sep", "oct", "nov", "déc",
  ];
  const month = months[d.getMonth()];
  return `${day} ${month}`;
}

function formatDistance(distance: string): string | null {
  if (distance === "DISTANCE_1") return "1er";
  if (distance === "DISTANCE_2") return "2e";
  if (distance === "DISTANCE_3") return "3e";
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VisitorsClientProps {
  initialData: {
    visitors: ProfileVisitor[];
    insights: VisitorInsight[];
    viewsChangePercentage: number | null;
    totalViewers: number;
    rawResponse?: string;
    error?: string;
  };
}

export function VisitorsClient({ initialData }: VisitorsClientProps) {
  const [visitors, setVisitors] = useState<ProfileVisitor[]>(
    initialData.visitors
  );
  const [insights, setInsights] = useState<VisitorInsight[]>(
    initialData.insights
  );
  const [viewsChange, setViewsChange] = useState<number | null>(
    initialData.viewsChangePercentage
  );
  const [totalViewers, setTotalViewers] = useState(initialData.totalViewers);
  const [error, setError] = useState<string | null>(
    initialData.error ?? null
  );
  const [rawResponse, setRawResponse] = useState<string | null>(
    initialData.rawResponse ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [showRaw, setShowRaw] = useState(false);

  function handleRefresh() {
    startTransition(async () => {
      const result = await getProfileVisitors();
      if (result.success) {
        setVisitors(result.data.visitors);
        setInsights(result.data.insights);
        setViewsChange(result.data.viewsChangePercentage);
        setTotalViewers(result.data.totalViewers);
        setRawResponse(
          result.data.rawResponse
            ? JSON.stringify(result.data.rawResponse, null, 2)
            : null
        );
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  const identifiedCount = visitors.filter((v) => v.profileUrl).length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Visiteurs du profil</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personnes ayant consulté votre profil LinkedIn
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Actualiser
        </Button>
      </div>

      {/* Stats bar */}
      {totalViewers > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totalViewers}</span>
            <span className="text-muted-foreground">
              visiteur{totalViewers > 1 ? "s" : ""}
            </span>
            {identifiedCount > 0 && identifiedCount < totalViewers && (
              <span className="text-muted-foreground">
                ({identifiedCount} identifié{identifiedCount > 1 ? "s" : ""})
              </span>
            )}
          </div>
          {viewsChange !== null && (
            <div className={`flex items-center gap-1 ${viewsChange >= 0 ? "text-green-600" : "text-muted-foreground"}`}>
              {viewsChange >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span className="text-xs font-medium">
                {viewsChange > 0 ? "+" : ""}{viewsChange}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error !== null ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Erreur</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Visitors List */}
      {visitors.length === 0 && !error ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Eye}
              title="Aucun visiteur récent"
              description="Les visiteurs de votre profil LinkedIn apparaîtront ici."
              action={
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Actualiser
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visitors.map((visitor, i) => {
            const isAnonymous = !visitor.profileUrl;
            const distanceLabel = formatDistance(visitor.distance);

            return (
              <Card
                key={`${visitor.profileUrl || "anon"}-${i}`}
                className={`bg-white/80 backdrop-blur-sm border border-border/50 hover:shadow-sm transition-all duration-200 ${
                  isAnonymous ? "opacity-60" : ""
                }`}
              >
                <CardContent className="py-4 flex items-center gap-4">
                  {/* Avatar */}
                  <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {visitor.profilePictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={visitor.profilePictureUrl}
                        alt={visitor.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {visitor.leadMatch ? (
                          <Link
                            href={`/pipeline/${visitor.leadMatch.leadId}`}
                            className="hover:underline"
                          >
                            {visitor.name}
                          </Link>
                        ) : (
                          visitor.name
                        )}
                      </p>
                      {distanceLabel && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {distanceLabel}
                        </Badge>
                      )}
                      {visitor.leadMatch && (
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-blue-600 hover:bg-blue-600 text-white">
                          {LEAD_STAGES[visitor.leadMatch.stage as keyof typeof LEAD_STAGES]?.label ?? visitor.leadMatch.stage}
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className="text-xs shrink-0"
                      >
                        {formatVisitDate(visitor.viewedAt)}
                      </Badge>
                    </div>
                    {visitor.title && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {visitor.title}
                      </p>
                    )}
                    {visitor.leadMatch?.sequence && (
                      <p className="text-xs text-blue-600 mt-0.5">
                        {visitor.leadMatch.sequence.name} — étape {visitor.leadMatch.sequence.currentStep}/{visitor.leadMatch.sequence.totalSteps} depuis {visitor.leadMatch.sequence.daysSinceEntry}j
                      </p>
                    )}
                    {visitor.connectionsInCommon !== null && visitor.connectionsInCommon > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {visitor.connectionsInCommon} relation{visitor.connectionsInCommon > 1 ? "s" : ""} en commun
                        </p>
                      </div>
                    )}
                  </div>

                  {/* LinkedIn Link */}
                  {visitor.profileUrl && (
                    <a
                      href={visitor.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Aperçu des visiteurs
          </h2>
          <div className="flex flex-wrap gap-2">
            {insights.map((insight, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {insight.label}
                {insight.count !== undefined && ` (${insight.count})`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Raw response debug toggle */}
      {rawResponse && (
        <div className="mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-muted-foreground"
          >
            {showRaw ? "Masquer" : "Afficher"} la réponse brute (debug)
          </Button>
          {showRaw && (
            <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96 font-mono">
              {rawResponse}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
