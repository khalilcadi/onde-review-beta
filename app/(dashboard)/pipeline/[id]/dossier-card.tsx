"use client";

import { useState } from "react";
import {
  Target,
  Zap,
  Clock,
  CheckCircle2,
  MessageCircleQuestion,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
  Ban,
  Send,
  Flag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { LeadEnrichment } from "@/types/leads";

type Dossier = NonNullable<LeadEnrichment["dossier"]>;

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1.5 rounded hover:bg-muted transition-colors flex-shrink-0"
      title="Copier"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function AngleQualiteBadge({ qualite }: { qualite: Dossier["angle_qualite"] }) {
  if (qualite === "SOLIDE") {
    return (
      <Badge className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 gap-1 text-xs font-medium">
        <CheckCircle2 className="h-3 w-3" />
        Solide
      </Badge>
    );
  }
  if (qualite === "DÉGRADÉ") {
    return (
      <Badge className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100 gap-1 text-xs font-medium">
        <Zap className="h-3 w-3" />
        Dégradé
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 gap-1 text-xs font-medium">
      <AlertTriangle className="h-3 w-3" />
      Faible
    </Badge>
  );
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) {
    const diffMin = Math.floor(diffMs / (1000 * 60));
    return diffMin <= 1 ? "à l'instant" : `il y a ${diffMin} min`;
  }
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `il y a ${diffD}j`;
}

interface DossierCardProps {
  dossier: Dossier;
}

export function DossierCard({ dossier }: DossierCardProps) {
  const [secondaireOpen, setSecondaireOpen] = useState(false);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4 flex items-center gap-2">
        <Target className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <h3 className="text-base font-semibold flex-1">Dossier d&apos;attaque</h3>
        <AngleQualiteBadge qualite={dossier.angle_qualite} />
        <span className="text-xs text-muted-foreground ml-1">
          {formatGeneratedAt(dossier.generated_at)}
        </span>
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* Mécanisme */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 font-medium">
            Mécanisme
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {dossier.mecanisme}
          </p>
        </div>

        <Separator />

        {/* Accroche pivot */}
        {dossier.accroche_pivot && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-accent" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Accroche pivot
                </p>
                <CopyBtn text={dossier.accroche_pivot} />
              </div>
              <div className="bg-accent/5 border border-accent/15 rounded-lg p-4">
                <p className="text-base font-medium italic text-foreground leading-relaxed">
                  &ldquo;{dossier.accroche_pivot}&rdquo;
                </p>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Signal déclencheur */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Pourquoi maintenant
            </p>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <p className="text-sm text-foreground/80 leading-relaxed">
              {dossier.signal_declencheur}
            </p>
          </div>
        </div>

        {/* Preuves */}
        {dossier.preuves.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 font-medium">
                Preuves vérifiables
              </p>
              <ul className="space-y-1.5">
                {dossier.preuves.map((preuve, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {preuve}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* À intégrer */}
        {Array.isArray(dossier.a_integrer) && dossier.a_integrer.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  À intégrer
                </p>
              </div>
              <ul className="space-y-1.5">
                {dossier.a_integrer.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* À éviter */}
        {Array.isArray(dossier.a_eviter) && dossier.a_eviter.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Ban className="h-3.5 w-3.5 text-red-500" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  À éviter
                </p>
              </div>
              <ul className="space-y-1.5">
                {dossier.a_eviter.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Ban className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator />

        {/* Question ouverte */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MessageCircleQuestion className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Question à poser
            </p>
            <CopyBtn text={dossier.question_ouverte} />
          </div>
          <div className="bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3">
            <p className="text-sm italic text-foreground/85 leading-relaxed">
              &ldquo;{dossier.question_ouverte}&rdquo;
            </p>
          </div>
        </div>

        {/* Objectif de réponse */}
        {dossier.objectif_reponse && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Objectif de réponse
              </p>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {dossier.objectif_reponse}
            </p>
          </div>
        )}

        {/* Canal recommandé */}
        {dossier.canal_recommande && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Canal recommandé
              </p>
              <Badge variant="outline" className="rounded-full text-xs">
                {dossier.canal_recommande}
              </Badge>
            </div>
            {dossier.canal_justification && (
              <p className="text-xs text-foreground/70 leading-relaxed">
                {dossier.canal_justification}
              </p>
            )}
          </div>
        )}

        {/* Réserves */}
        {dossier.reserves && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg p-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              {dossier.reserves}
            </p>
          </div>
        )}

        {/* Secondaire (collapsible) */}
        <div>
          <button
            onClick={() => setSecondaireOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {secondaireOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {secondaireOpen ? "Masquer" : "Voir"} profil de lecture et ton
          </button>

          {secondaireOpen && (
            <div className="mt-3 space-y-3 pl-1">
              {/* Profil de lecture du destinataire */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Profil de lecture du destinataire</p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {dossier.destinataire_profil_lecture}
                </p>
              </div>

              {/* Ton (formalité + voix) */}
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ton recommandé</p>
                  <Badge variant="outline" className="rounded-full text-xs capitalize">
                    {dossier.formalite} — voix {dossier.voix}
                  </Badge>
                </div>
                {dossier.formalite_justification && (
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Justification</p>
                    <p className="text-xs text-foreground/70 leading-relaxed">
                      {dossier.formalite_justification}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DossierCardOrPlaceholderProps {
  dossier: Dossier | undefined | null;
  onEnrich: () => void;
  isEnriching: boolean;
  isOwner: boolean;
}

export function DossierCardOrPlaceholder({
  dossier,
  onEnrich,
  isEnriching,
  isOwner,
}: DossierCardOrPlaceholderProps) {
  if (dossier) {
    return <DossierCard dossier={dossier} />;
  }

  return (
    <div className="bg-card rounded-lg border border-dashed border-border p-6">
      <div className="flex flex-col items-center gap-3 text-center py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Target className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Dossier d&apos;attaque non disponible</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lancez l&apos;enrichissement pour générer le brief commercial
          </p>
        </div>
        {isOwner && (
          <button
            onClick={onEnrich}
            disabled={isEnriching}
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isEnriching ? "Enrichissement en cours..." : "Enrichir ce lead"}
          </button>
        )}
      </div>
    </div>
  );
}
