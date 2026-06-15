"use client";

import { Loader2, Sparkles, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ScoringDetail {
  fit_score?: number;
  intent_score?: number;
  timing_score?: number;
  categorie?: string;
  segment_icp?: string;
  confidence?: string;
  justification?: string;
  cas_limite?: boolean;
  ajustement_ia?: string;
  [key: string]: unknown;
}

interface ScoreBreakdownCardProps {
  breakdown: ScoringDetail;
  isOwner: boolean;
  isScoring: boolean;
  onRescore: () => void;
}

export function ScoreBreakdownCard({
  breakdown,
  isOwner,
  isScoring,
  onRescore,
}: ScoreBreakdownCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            Scoring
            {breakdown.categorie && (
              <Badge variant="outline" className="rounded-full ml-1 text-xs">
                {breakdown.categorie}
              </Badge>
            )}
            {breakdown.confidence && (
              <span className="text-xs text-muted-foreground font-normal">
                ({breakdown.confidence})
              </span>
            )}
            {breakdown.cas_limite && (
              <Badge variant="warning" className="rounded-full text-xs">
                Cas limite
              </Badge>
            )}
          </CardTitle>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRescore}
              disabled={isScoring}
              className="text-xs h-7 px-2"
            >
              {isScoring ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {isScoring ? "Scoring..." : "Rescorer"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {typeof breakdown.fit_score === "number" && (
            <div className="bg-muted rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">Fit</div>
              <div className="text-base font-semibold mt-0.5">
                {breakdown.fit_score}<span className="text-xs text-muted-foreground">/40</span>
              </div>
            </div>
          )}
          {typeof breakdown.intent_score === "number" && (
            <div className="bg-muted rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">Intent</div>
              <div className="text-base font-semibold mt-0.5">
                {breakdown.intent_score}<span className="text-xs text-muted-foreground">/40</span>
              </div>
            </div>
          )}
          {typeof breakdown.timing_score === "number" && (
            <div className="bg-muted rounded-lg p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">Timing</div>
              <div className="text-base font-semibold mt-0.5">
                {breakdown.timing_score}<span className="text-xs text-muted-foreground">/20</span>
              </div>
            </div>
          )}
        </div>
        {breakdown.segment_icp && (
          <p className="text-xs text-muted-foreground mb-2">
            Segment : <span className="font-medium text-foreground">{breakdown.segment_icp}</span>
          </p>
        )}
        {breakdown.justification && (
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            {breakdown.justification}
          </p>
        )}
        {breakdown.ajustement_ia && (
          <p className="text-xs text-muted-foreground mt-2">
            Ajustement IA : {breakdown.ajustement_ia}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
