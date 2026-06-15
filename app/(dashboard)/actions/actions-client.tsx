"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  X,
  RefreshCw,
  Clock,
  Edit2,
  Eye,
  UserPlus,
  MessageSquare,
  CheckSquare,
  ExternalLink,
  Sparkles,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Brain,
  Mail,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActionWithLead, DailyActionsStats, QuotaUsage, M1GenerationData } from "@/types/actions";
import { validateAction as serverValidate, validateActions as serverValidateBatch, cancelAction as serverCancel, rescheduleAction as serverReschedule, triggerGenerateActions } from "@/lib/actions/actions";
import { parseFragments, FRAGMENT_SEPARATOR } from "@/lib/humanize";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TimelineView from "./timeline-view";

const ACTION_ICONS = {
  visit: Eye,
  invitation: UserPlus,
  message: MessageSquare,
};

/** Renders a message as one or multiple chat bubbles (if fragments detected) */
function MessageFragments({ message }: { message: string }) {
  const fragments = parseFragments(message);
  return (
    <div className="space-y-2 min-h-[120px]">
      {fragments.map((fragment, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center gap-2 my-1.5">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-xs text-muted-foreground/70 bg-muted/50 px-2 py-0.5 rounded-full">
                ≈ 15s
              </span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
          )}
          <div className="bg-muted rounded-lg px-4 py-3">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{fragment}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Checks if generation data is an M1 response with two variants */
function isM1Data(data: unknown): data is M1GenerationData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    !!d.variante_a &&
    !!d.variante_b &&
    typeof (d.variante_a as Record<string, unknown>)?.message === "string" &&
    typeof (d.variante_b as Record<string, unknown>)?.message === "string"
  );
}

const ACTION_LABELS = {
  visit: "Visite profil",
  invitation: "Invitation",
  message: "Message",
};

type ActionType = keyof typeof ACTION_ICONS;

interface ActionsClientProps {
  initialActions: ActionWithLead[];
  initialStats: DailyActionsStats;
  initialQuotas: QuotaUsage;
}

export default function ActionsClient({ initialActions, initialStats, initialQuotas }: ActionsClientProps) {
  const [actions, setActions] = useState<ActionWithLead[]>(initialActions);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [editingAction, setEditingAction] = useState<ActionWithLead | null>(null);
  const [editedFragments, setEditedFragments] = useState<string[]>([]);
  const [postponeAction, setPostponeAction] = useState<ActionWithLead | null>(null);
  const [postponeDelay, setPostponeDelay] = useState<string>("tomorrow");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);
  // M1 variant selection: action.id -> "a" | "b"
  const [selectedVariant, setSelectedVariant] = useState<Record<string, "a" | "b">>({});
  const [isForcingLinkedin, setIsForcingLinkedin] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const pendingActions = actions.filter((a) => a.status === "pending");
  const stats = {
    pending: pendingActions.length,
    validated: actions.filter((a) => a.status === "validated").length,
    sent: actions.filter((a) => a.status === "sent").length,
  };

  // Compute quotas from local state so they update after validation
  const sentOrValidated = actions.filter((a) => a.status === "sent" || a.status === "validated");
  const quotas = {
    invitations: {
      used: sentOrValidated.filter((a) => a.actionType === "invitation").length,
      limit: initialQuotas.invitations.limit,
    },
    messages: {
      used: sentOrValidated.filter((a) => a.actionType === "message" || a.actionType === "inmail").length,
      limit: initialQuotas.messages.limit,
    },
    visits: {
      used: sentOrValidated.filter((a) => a.actionType === "visit").length,
      limit: initialQuotas.visits.limit,
    },
  };

  const toggleSelectAction = (id: string) => {
    const newSelected = new Set(selectedActions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedActions(newSelected);
  };

  const selectAll = () => {
    if (selectedActions.size === pendingActions.length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(pendingActions.map((a) => a.id)));
    }
  };

  const validateAction = async (id: string, finalMessage?: string) => {
    const action = actions.find((a) => a.id === id);
    // For M1: use selected variant message if no explicit finalMessage
    if (!finalMessage && action && isM1Data(action.generationData)) {
      const variant = selectedVariant[id] || "a";
      finalMessage = variant === "b"
        ? action.generationData.variante_b.message
        : action.generationData.variante_a.message;
    }
    const previousActions = [...actions];
    // Optimistic local update
    setActions((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: "validated" as const, generatedMessage: finalMessage || a.generatedMessage }
          : a
      )
    );
    setSelectedActions((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    // Server sync with error handling
    const result = await serverValidate(id, finalMessage);
    if (result.success) {
      if (action) {
        toast.success(`Action validée pour ${action.lead?.firstName ?? ""} ${action.lead?.lastName ?? ""}`);
      }
    } else {
      // Rollback on failure
      setActions(previousActions);
      toast.error(result.error || "Erreur lors de la validation");
    }
  };

  const validateSelected = async () => {
    const ids = Array.from(selectedActions);
    const previousActions = [...actions];
    // Optimistic local update
    setActions((prev) =>
      prev.map((a) =>
        selectedActions.has(a.id) ? { ...a, status: "validated" as const } : a
      )
    );
    setSelectedActions(new Set());
    // Single batch server call (scheduling computed sequentially server-side)
    const result = await serverValidateBatch(ids);
    if (!result.success) {
      setActions(previousActions);
      toast.error(`Erreur: ${result.error}`);
    } else {
      const { validated, failed } = result.data;
      if (failed > 0) {
        toast.warning(`${validated} validée(s), ${failed} rejetée(s) (quota dépassé)`);
      } else {
        toast.success(`${validated} action(s) validée(s)`);
      }
    }
  };

  const cancelAction = async (id: string) => {
    const previousActions = [...actions];
    // Optimistic local update
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "cancelled" as const } : a))
    );
    // Server sync with error handling
    const result = await serverCancel(id);
    if (result.success) {
      toast("Action annulée");
    } else {
      setActions(previousActions);
      toast.error(result.error || "Erreur lors de l\u2019annulation");
    }
  };

  const regenerateMessage = async (id: string, feedback?: string) => {
    setIsRegenerating(id);
    const action = actions.find((a) => a.id === id);
    if (!action) { setIsRegenerating(null); return; }

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: action.lead,
          actionType: action.actionType,
          currentMessage: action.finalMessage || action.generatedMessage,
          ...(feedback ? { feedback } : {}),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();

      setActions((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                generatedMessage: data.message,
                generationReasoning: data.reasoning || a.generationReasoning,
                generationData: data.m1 || data.m2 || a.generationData,
              }
            : a
        )
      );
      toast.success(feedback ? "Message r\u00e9g\u00e9n\u00e9r\u00e9 avec feedback" : "Message r\u00e9g\u00e9n\u00e9r\u00e9");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Régénération échouée : ${msg}`);
    } finally {
      setIsRegenerating(null);
      setFeedbackText("");
      setFeedbackActionId(null);
    }
  };

  const forceLinkedinGeneration = async (action: ActionWithLead) => {
    setIsForcingLinkedin(action.id);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: action.lead,
          actionType: action.actionType,
          force_linkedin: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();

      setActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? {
                ...a,
                generatedMessage: data.message,
                generationReasoning: data.reasoning || a.generationReasoning,
                generationData: data.m1 || data.m2 || a.generationData,
              }
            : a
        )
      );
      toast.success("Message LinkedIn g\u00e9n\u00e9r\u00e9");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`\u00c9chec : ${msg}`);
    } finally {
      setIsForcingLinkedin(null);
    }
  };

  const openEditModal = (action: ActionWithLead) => {
    setEditingAction(action);
    setEditedFragments(parseFragments(action.generatedMessage || ""));
  };

  const saveEdit = () => {
    if (editingAction) {
      const finalMessage = editedFragments
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
        .join(FRAGMENT_SEPARATOR);
      validateAction(editingAction.id, finalMessage);
      setEditingAction(null);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await triggerGenerateActions();
      if (result.success) {
        toast.success(
          result.data.generated > 0
            ? `${result.data.generated} action(s) générée(s)`
            : "Aucune nouvelle action à générer"
        );
        // Reload page to fetch the newly generated actions
        window.location.reload();
      } else {
        toast.error(`Erreur : ${result.error}`);
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Quotas */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Actions du jour</h1>
            <p className="text-muted-foreground">
              Validez les messages avant envoi automatique
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="ml-2"
          >
            <Zap className={`mr-1 h-4 w-4 ${isGenerating ? "animate-pulse" : ""}`} />
            {isGenerating ? "Génération..." : "Générer"}
          </Button>
        </div>

        {/* Quotas Bar */}
        <div className="flex items-center gap-6 bg-card rounded-lg border border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">
              {quotas.invitations.used}/{quotas.invitations.limit}
            </span>
            <Progress
              value={(quotas.invitations.used / quotas.invitations.limit) * 100}
              className="w-16 h-2"
              indicatorClassName="bg-accent"
            />
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-success" />
            <span className="text-sm font-medium">
              {quotas.messages.used}/{quotas.messages.limit}
            </span>
            <Progress
              value={(quotas.messages.used / quotas.messages.limit) * 100}
              className="w-16 h-2"
              indicatorClassName="bg-success"
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold text-warning">{stats.pending}</div>
              <div className="text-sm text-warning/80">En attente</div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold text-accent">{stats.validated}</div>
              <div className="text-sm text-accent/80">Valid&eacute;es</div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Check className="h-5 w-5 text-accent" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold text-success">{stats.sent}</div>
              <div className="text-sm text-success/80">Envoy&eacute;es</div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckSquare className="h-5 w-5 text-success" />
            </div>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-semibold">
                {Math.round((stats.validated / (stats.pending + stats.validated + stats.sent || 1)) * 100)}%
              </div>
              <div className="text-sm text-muted-foreground">Progression</div>
              <Progress
                value={(stats.validated / (stats.pending + stats.validated + stats.sent || 1)) * 100}
                className="mt-3 h-2"
                indicatorClassName="bg-accent"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="validation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="validation">
            <CheckSquare className="h-4 w-4 mr-2" />
            Validation ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4">
      {/* Bulk Actions Bar */}
      {pendingActions.length > 0 && (
        <div className="flex items-center justify-between bg-card rounded-lg border border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedActions.size === pendingActions.length
                  ? "bg-accent border-accent text-accent-foreground"
                  : "border-muted-foreground/40 hover:border-muted-foreground"
              }`}
            >
              {selectedActions.size === pendingActions.length && (
                <Check className="h-3 w-3" />
              )}
            </button>
            <span className="text-sm text-muted-foreground">
              {selectedActions.size > 0
                ? `${selectedActions.size} action(s) sélectionnée(s)`
                : `${pendingActions.length} action(s) en attente`}
            </span>
          </div>
          {selectedActions.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedActions(new Set())}>
                D&eacute;s&eacute;lectionner
              </Button>
              <Button size="sm" variant="accent" onClick={validateSelected}>
                <Check className="mr-1 h-4 w-4" />
                Valider la s&eacute;lection
              </Button>
            </div>
          )}
          {selectedActions.size === 0 && (
            <Button size="sm" variant="accent" onClick={selectAll}>
              <Check className="mr-1 h-4 w-4" />
              Tout valider
            </Button>
          )}
        </div>
      )}

      {/* Actions List */}
      <div className="space-y-4">
        {pendingActions.map((action) => {
          const Icon = ACTION_ICONS[action.actionType as ActionType] || MessageSquare;
          const isSelected = selectedActions.has(action.id);

          return (
            <Card
              key={action.id}
              className={`${
                isSelected ? "ring-2 ring-accent" : ""
              }`}
            >
              <CardContent className="p-0">
                <div className="flex">
                  {/* Selection checkbox */}
                  <div
                    className="flex items-center justify-center w-12 border-r border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSelectAction(action.id)}
                  >
                    <div
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-accent border-accent text-accent-foreground"
                          : "border-muted-foreground/40 hover:border-muted-foreground"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 p-5">
                    <div className="flex gap-6">
                      {/* Lead Info */}
                      <div className="flex items-start gap-3 w-56">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-muted text-foreground font-medium">
                            {(action.lead?.displayName ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="outline" className="text-xs">
                              {ACTION_LABELS[action.actionType as ActionType] || action.actionType}
                            </Badge>
                          </div>
                          <Link
                            href={`/pipeline/${action.lead?.id ?? ""}`}
                            className="font-medium hover:text-accent transition-colors block truncate"
                          >
                            {action.lead?.displayName ?? ""}
                          </Link>
                          <div className="text-sm text-muted-foreground truncate">
                            {action.lead?.title ?? ""}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {action.lead?.company ?? ""}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge
                              variant={(action.lead?.score ?? 0) >= 70 ? "destructive" : (action.lead?.score ?? 0) >= 50 ? "warning" : "secondary"}
                              className="font-mono"
                            >
                              {action.lead?.score ?? 0}
                            </Badge>
                            {!action.lead?.hasEnrichment && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="warning" className="text-xs gap-1 px-1.5">
                                      <AlertCircle className="h-3 w-3" />
                                      Non enrichi
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ce lead n&apos;a pas &eacute;t&eacute; enrichi &mdash; le message sera moins personnalis&eacute;</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {action.lead?.linkedinUrl && (
                              <a
                                href={action.lead.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-accent transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Message — invitations are sent without message */}
                      <div className="flex-1">
                        {action.actionType === "invitation" ? (
                          <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-2 text-muted-foreground">
                            <UserPlus className="h-4 w-4" />
                            <span className="text-sm">Invitation sans message</span>
                          </div>
                        ) : (
                          <>
                            {isRegenerating === action.id || isForcingLinkedin === action.id ? (
                              <div className="bg-muted rounded-lg p-4 min-h-[120px] flex items-center gap-2 text-muted-foreground">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>G&eacute;n&eacute;ration en cours...</span>
                              </div>
                            ) : isM1Data(action.generationData) ? (
                              /* ---- M1: Two variants with tabs ---- */
                              <>
                                {/* Email recommended banner */}
                                {action.generationData.canal === "none" && (
                                  <div className="mb-3 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
                                    <Mail className="h-4 w-4 text-warning shrink-0" />
                                    <p className="text-sm text-warning flex-1">
                                      La logique recommande l&apos;email pour ce lead. Vous pouvez forcer la g&eacute;n&eacute;ration LinkedIn.
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="shrink-0 border-warning/40 text-warning hover:bg-warning/10"
                                      onClick={() => forceLinkedinGeneration(action)}
                                      disabled={isForcingLinkedin === action.id}
                                    >
                                      <Zap className="mr-1 h-3.5 w-3.5" />
                                      Forcer LinkedIn
                                    </Button>
                                  </div>
                                )}

                                {action.generationData.canal !== "none" && (
                                  <Tabs
                                    defaultValue="a"
                                    value={selectedVariant[action.id] || "a"}
                                    onValueChange={(v) => setSelectedVariant((prev) => ({ ...prev, [action.id]: v as "a" | "b" }))}
                                    className="space-y-2"
                                  >
                                    <TabsList className="h-8">
                                      <TabsTrigger value="a" className="text-xs px-3 h-7">Variante A</TabsTrigger>
                                      <TabsTrigger value="b" className="text-xs px-3 h-7">Variante B</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="a" className="mt-0">
                                      <MessageFragments message={action.generationData.variante_a.message} />
                                      <p className="mt-1.5 text-xs text-muted-foreground/70 italic">
                                        Angle : {action.generationData.variante_a.angle}
                                      </p>
                                    </TabsContent>

                                    <TabsContent value="b" className="mt-0">
                                      <MessageFragments message={action.generationData.variante_b.message} />
                                      <p className="mt-1.5 text-xs text-muted-foreground/70 italic">
                                        Angle : {action.generationData.variante_b.angle}
                                      </p>
                                    </TabsContent>
                                  </Tabs>
                                )}
                              </>
                            ) : (
                              /* ---- M2 / legacy: single message ---- */
                              <MessageFragments message={action.generatedMessage || ""} />
                            )}

                            {/* Generated by + reasoning toggle */}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Sparkles className="h-3 w-3" />
                              <span>G&eacute;n&eacute;r&eacute; par Claude</span>
                              {(action.generationReasoning || (isM1Data(action.generationData) && action.generationData.reasoning)) && (
                                <button
                                  onClick={() => setExpandedReasoning(prev => prev === action.id ? null : action.id)}
                                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                                >
                                  <Brain className="h-3 w-3" />
                                  <span>Raisonnement</span>
                                  {expandedReasoning === action.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              )}
                            </div>

                            {/* AI Reasoning expandable */}
                            {expandedReasoning === action.id && (action.generationReasoning || (isM1Data(action.generationData) && action.generationData.reasoning)) && (
                              <div className="mt-2 rounded-lg bg-accent/5 border border-accent/20 px-3 py-2 text-xs text-muted-foreground">
                                <div className="flex items-start gap-2">
                                  <Brain className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" />
                                  <p>{action.generationReasoning || (isM1Data(action.generationData) ? action.generationData.reasoning : "")}</p>
                                </div>
                              </div>
                            )}

                            {/* Feedback input inline */}
                            {feedbackActionId === action.id && (
                              <div className="mt-3 space-y-1.5">
                                <div className="flex gap-2 items-start">
                                  <Textarea
                                    placeholder="Ex: Plus court, mentionne son post r&eacute;cent..."
                                    className="flex-1 min-h-[36px] rounded-lg bg-muted/50 border border-border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent resize-none overflow-hidden"
                                    value={feedbackText}
                                    id={`feedback-${action.id}`}
                                    onChange={(e) => {
                                      setFeedbackText(e.target.value);
                                      e.target.style.height = "auto";
                                      e.target.style.height = e.target.scrollHeight + "px";
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        const val = (e.currentTarget as HTMLTextAreaElement).value.trim();
                                        regenerateMessage(action.id, val || undefined);
                                      }
                                      if (e.key === "Escape") {
                                        setFeedbackActionId(null);
                                        setFeedbackText("");
                                      }
                                    }}
                                    autoFocus
                                    rows={1}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-9 px-3"
                                    onClick={() => {
                                      const el = document.getElementById(`feedback-${action.id}`) as HTMLTextAreaElement | null;
                                      const val = el?.value.trim() || "";
                                      regenerateMessage(action.id, val || undefined);
                                    }}
                                    disabled={isRegenerating === action.id}
                                  >
                                    <RefreshCw className={`h-4 w-4 ${isRegenerating === action.id ? "animate-spin" : ""}`} />
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Entr&eacute;e pour r&eacute;g&eacute;n&eacute;rer &middot; Shift+Entr&eacute;e pour saut de ligne &middot; Echap pour annuler
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 w-32">
                        <Button
                          size="sm"
                          variant="accent"
                          className="w-full"
                          onClick={() => validateAction(action.id)}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Valider
                        </Button>
                        {action.actionType !== "invitation" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => openEditModal(action)}
                            >
                              <Edit2 className="mr-1 h-4 w-4" />
                              &Eacute;diter
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                if (feedbackActionId === action.id) {
                                  setFeedbackActionId(null);
                                  setFeedbackText("");
                                } else {
                                  setFeedbackActionId(action.id);
                                  setFeedbackText("");
                                }
                              }}
                              disabled={isRegenerating === action.id}
                            >
                              <RefreshCw className={`mr-1 h-4 w-4 ${isRegenerating === action.id ? "animate-spin" : ""}`} />
                              R&eacute;g&eacute;n&eacute;rer
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-muted-foreground"
                          onClick={() => setPostponeAction(action)}
                        >
                          <Calendar className="mr-1 h-4 w-4" />
                          Reporter
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-destructive hover:text-destructive"
                          onClick={() => cancelAction(action.id)}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {pendingActions.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-success-light flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Toutes les actions sont valid&eacute;es !</h3>
              <p className="text-muted-foreground mb-4">
                Vos messages seront envoy&eacute;s automatiquement selon les intervalles configur&eacute;s.
              </p>
              <Link href="/settings">
                <Button variant="outline">Configurer les intervalles</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineView actions={actions} />
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={!!editingAction} onOpenChange={() => setEditingAction(null)}>
        <DialogContent className="max-w-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle>&Eacute;diter le message</DialogTitle>
            <DialogDescription>
              Modifiez le message avant validation. Le message sera envoy&eacute; &agrave;{" "}
              <strong>{editingAction?.lead?.displayName ?? ""}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Lead Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Avatar>
                <AvatarFallback className="bg-muted text-foreground font-medium">
                  {(editingAction?.lead?.displayName ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">
                  {editingAction?.lead?.displayName ?? ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {editingAction?.lead?.title ?? ""} @ {editingAction?.lead?.company ?? ""}
                </div>
              </div>
              <Badge variant="outline" className="ml-auto">
                {ACTION_LABELS[editingAction?.actionType as ActionType]}
              </Badge>
            </div>

            {/* Message Editor — one textarea per fragment */}
            <div className="space-y-2">
              <label className="text-sm font-medium block">Message</label>
              {editedFragments.map((fragment, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        ≈ 15s
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <Textarea
                    value={fragment}
                    onChange={(e) => {
                      const updated = [...editedFragments];
                      updated[i] = e.target.value;
                      setEditedFragments(updated);
                    }}
                    className="min-h-[80px] rounded-lg font-normal"
                    placeholder={`Fragment ${i + 1}...`}
                  />
                </div>
              ))}
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>
                  {editedFragments.join("").length} caract&egrave;res
                  {editedFragments.length > 1 && ` · ${editedFragments.length} fragments`}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAction(null)}>
              Annuler
            </Button>
            <Button variant="accent" onClick={saveEdit}>
              <Check className="mr-2 h-4 w-4" />
              Valider et envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Postpone Modal */}
      <Dialog open={!!postponeAction} onOpenChange={() => { setPostponeAction(null); setPostponeDelay("tomorrow"); }}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Reporter l&apos;action</DialogTitle>
            <DialogDescription>
              Choisissez quand vous souhaitez que cette action soit reprogramm&eacute;e.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={postponeDelay} onValueChange={setPostponeDelay}>
              <SelectTrigger className="h-11 rounded-lg">
                <SelectValue placeholder="S&eacute;lectionnez une date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tomorrow">Demain</SelectItem>
                <SelectItem value="2days">Dans 2 jours</SelectItem>
                <SelectItem value="week">Dans 1 semaine</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPostponeAction(null)}>
              Annuler
            </Button>
            <Button variant="accent" disabled={isRescheduling} onClick={async () => {
              if (!postponeAction) return;
              setIsRescheduling(true);
              const daysMap: Record<string, number> = { tomorrow: 1, "2days": 2, week: 7 };
              const days = daysMap[postponeDelay] ?? 1;
              const newDate = new Date();
              newDate.setDate(newDate.getDate() + days);
              const result = await serverReschedule(postponeAction.id, newDate.toISOString());
              if (result.success) {
                setActions((prev) => prev.filter((a) => a.id !== postponeAction.id));
                toast.success(`Action reportée de ${days} jour(s)`);
              } else {
                toast.error(result.error || "Erreur lors du report");
              }
              setIsRescheduling(false);
              setPostponeAction(null);
              setPostponeDelay("tomorrow");
            }}>
              <Calendar className="mr-2 h-4 w-4" />
              {isRescheduling ? "Report en cours..." : "Reporter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
