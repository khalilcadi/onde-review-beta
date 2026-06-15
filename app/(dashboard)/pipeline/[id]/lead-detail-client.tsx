"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateLead, deleteLead } from "@/lib/actions/leads";
import { sendDirectMessage } from "@/lib/actions/conversations";
import { addLeadToSequence } from "@/lib/actions/sequences";
import {
  resolveLinkedInForLead,
  attachLinkedInToLeadById,
  type LinkedInCandidate,
} from "@/lib/actions/resolve-linkedin";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building,
  MapPin,
  Calendar,
  MessageSquare,
  Plus,
  Eye,
  UserPlus,
  CheckCircle,
  Send,
  FileText,
  TrendingUp,
  Globe,
  DollarSign,
  Users,
  Briefcase,
  Sparkles,
  ChevronDown,
  Save,
  Linkedin,
  Loader2,
  Trash2,
  Crown,
  RefreshCw,
  Unlock,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LeadWithOwner } from "@/lib/mappers";
import type { ActionWithLead } from "@/types/actions";
import type { Sequence } from "@/types/sequences";
import type { LeadStatus, LeadStage } from "@/types/leads";
import { LEAD_STATUSES, LEAD_STAGES, SIGNAL_TYPES } from "@/lib/constants";
import type { IcypeasEmailEnrichment } from "@/lib/icypeas/types";
import { DossierCardOrPlaceholder } from "./dossier-card";
import { ScoreBreakdownCard } from "./score-breakdown-card";
import { LeadContextPanel } from "./lead-context-panel";

interface LeadDetailClientProps {
  lead: LeadWithOwner;
  history: ActionWithLead[];
  sequences: Sequence[];
  currentUserId: string;
}

// Get score color based on value
function getScoreColor(score: number): string {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  if (score >= 40) return "bg-orange-500";
  return "bg-muted-foreground/50";
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  if (score >= 40) return "text-orange-500";
  return "text-muted-foreground";
}

// Get status badge variant
function getStatusBadge(status: string) {
  switch (status) {
    case "hot":
      return { variant: "destructive" as const, label: "Chaud 🔥" };
    case "warm":
      return { variant: "warning" as const, label: "Tiède" };
    case "cold":
      return { variant: "secondary" as const, label: "Froid" };
    default:
      return { variant: "outline" as const, label: status };
  }
}

// Timeline event icon
function getTimelineIcon(type: string) {
  switch (type) {
    case "visit":
      return <Eye className="h-4 w-4" />;
    case "invitation":
      return <UserPlus className="h-4 w-4" />;
    case "invitation_accepted":
      return <CheckCircle className="h-4 w-4 text-success" />;
    case "message":
      return <Send className="h-4 w-4 text-accent" />;
    case "response":
      return <MessageSquare className="h-4 w-4 text-success" />;
    case "note":
      return <FileText className="h-4 w-4 text-warning" />;
    case "inmail":
      return <Mail className="h-4 w-4 text-accent" />;
    default:
      return <Calendar className="h-4 w-4" />;
  }
}

// Format date for timeline
function formatTimelineDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return `Aujourd'hui à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (days === 1) {
    return `Hier à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (days < 7) {
    return `Il y a ${days} jours`;
  } else {
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }
}

// Map action types to human-readable descriptions
const ACTION_TYPE_DESCRIPTIONS: Record<string, string> = {
  visit: "Visite du profil",
  invitation: "Invitation envoyée",
  message: "Message envoyé",
  inmail: "InMail envoyé",
  whatsapp: "WhatsApp envoyé",
  email: "Email envoyé",
};

// Certainty badge for Icypeas email
function getCertaintyBadge(certainty: string | null) {
  switch (certainty) {
    case "ultra_sure":
    case "very_sure":
      return { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: ShieldCheck, label: "Vérifié" };
    case "probable":
      return { color: "bg-amber-100 text-amber-700 border-amber-200", icon: ShieldAlert, label: "Probable" };
    case "not_found":
      return { color: "bg-gray-100 text-gray-500 border-gray-200", icon: Shield, label: "Non trouvé" };
    default:
      return { color: "bg-gray-100 text-gray-500 border-gray-200", icon: Shield, label: "Inconnu" };
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded hover:bg-muted transition-colors"
      title="Copier"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

function IcypeasContactCard({ emailEnrichment }: { emailEnrichment: IcypeasEmailEnrichment }) {
  const certainty = getCertaintyBadge(emailEnrichment.certainty);
  const CertaintyIcon = certainty.icon;
  const hasEmail = emailEnrichment.email && emailEnrichment.certainty !== "not_found";
  const hasPhone = emailEnrichment.phones && emailEnrichment.phones.length > 0;

  if (!hasEmail && !hasPhone) return null;

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 pb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Contact enrichi
          <Badge variant="outline" className="rounded-full text-xs ml-auto font-normal">
            Icypeas
          </Badge>
        </h3>
      </div>
      <div className="px-6 pb-6 space-y-3">
        {hasEmail && (
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <a href={`mailto:${emailEnrichment.email}`} className="hover:underline text-accent">
              {emailEnrichment.email}
            </a>
            <Badge variant="outline" className={`rounded-full text-xs border ${certainty.color}`}>
              <CertaintyIcon className="h-3 w-3 mr-1" />
              {certainty.label}
            </Badge>
            <CopyButton text={emailEnrichment.email!} />
          </div>
        )}
        {hasEmail && emailEnrichment.mxProvider && (
          <p className="text-xs text-muted-foreground pl-7">
            {emailEnrichment.mxProvider}
          </p>
        )}
        {hasPhone && (
          <div className="flex items-center gap-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <a href={`tel:${emailEnrichment.phones[0]}`} className="hover:underline">
              {emailEnrichment.phones[0]}
            </a>
            <CopyButton text={emailEnrichment.phones[0]} />
          </div>
        )}
      </div>
    </div>
  );
}

function IcypeasBonusCard({ emailEnrichment }: { emailEnrichment: IcypeasEmailEnrichment }) {
  const [expanded, setExpanded] = useState(false);

  const hasSaas = emailEnrichment.saasServices && emailEnrichment.saasServices.length > 0;
  const hasGender = emailEnrichment.gender && emailEnrichment.gender !== "UNKNOWN";
  const hasLinkedin = !!emailEnrichment.linkedinUrl;
  const hasBonus = hasSaas || hasGender || hasLinkedin;

  if (!hasBonus) return null;

  return (
    <div className="bg-card rounded-lg border border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 pb-3 flex items-center gap-2 text-left"
      >
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base font-semibold">Données Icypeas</h3>
        <ChevronRight className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {hasSaas && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">SaaS détectés</p>
              <div className="flex flex-wrap gap-1.5">
                {emailEnrichment.saasServices.map((svc) => (
                  <Badge key={svc} variant="secondary" className="text-xs rounded-full">
                    {svc}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {hasGender && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-xs">Genre :</span>
              <span>{emailEnrichment.gender === "MALE" ? "Homme" : emailEnrichment.gender === "FEMALE" ? "Femme" : emailEnrichment.gender}</span>
            </div>
          )}
          {hasLinkedin && (
            <div className="flex items-center gap-2 text-sm">
              <Linkedin className="h-4 w-4 text-muted-foreground" />
              <a
                href={emailEnrichment.linkedinUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline text-xs truncate"
              >
                {emailEnrichment.linkedinUrl}
              </a>
            </div>
          )}
          {emailEnrichment.enrichedAt && (
            <p className="text-xs text-muted-foreground">
              Enrichi le {new Date(emailEnrichment.enrichedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadDetailClient({ lead: initialLead, history, sequences, currentUserId }: LeadDetailClientProps) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const isOwner = lead.userId === currentUserId;

  // Résolution LinkedIn (fiche) — pour les leads sans URL (ex. sourcing data.gouv)
  const [lkOpen, setLkOpen] = useState(false);
  const [lkLoading, setLkLoading] = useState(false);
  const [lkCandidates, setLkCandidates] = useState<LinkedInCandidate[]>([]);
  const [lkAttaching, setLkAttaching] = useState<string | null>(null);

  const openFindLinkedIn = useCallback(async () => {
    setLkOpen(true);
    setLkCandidates([]);
    setLkLoading(true);
    const res = await resolveLinkedInForLead(lead.id);
    setLkLoading(false);
    if (!res.success) {
      toast.error(res.error || "Recherche LinkedIn impossible.");
      setLkOpen(false);
      return;
    }
    if (res.data.attached && res.data.profileUrl) {
      toast.success("LinkedIn attaché automatiquement (sources concordantes).");
      setLead((prev) => ({ ...prev, linkedinUrl: res.data.profileUrl as string }));
      setLkOpen(false);
      router.refresh();
      return;
    }
    setLkCandidates(res.data.candidates);
    if (res.data.candidates.length === 0) toast.info("Aucun candidat LinkedIn trouvé.");
  }, [lead.id, router]);

  const confirmLinkedInCandidate = useCallback(
    async (c: LinkedInCandidate) => {
      if (!c.profileUrl) return;
      setLkAttaching(c.id);
      const res = await attachLinkedInToLeadById(lead.id, c.profileUrl);
      setLkAttaching(null);
      if (!res.success) {
        toast.error(res.error || "Impossible d'attacher le profil.");
        return;
      }
      toast.success("Profil LinkedIn attaché.");
      setLead((prev) => ({ ...prev, linkedinUrl: c.profileUrl as string }));
      setLkOpen(false);
      router.refresh();
    },
    [lead.id, router]
  );
  const [notes, setNotes] = useState(lead.notes || "");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [addingToSequence, setAddingToSequence] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showMessageFeedback, setShowMessageFeedback] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState("");
  const [isScoring, setIsScoring] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [scoringBreakdown, setScoringBreakdown] = useState<Record<string, unknown> | null>(
    initialLead.enrichmentData?.scoring_detail || null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteLead = useCallback(async () => {
    setIsDeleting(true);
    try {
      const result = await deleteLead(lead.id);
      if (result.success) {
        toast.success("Lead supprimé");
        router.push("/pipeline");
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
        setIsDeleting(false);
      }
    } catch {
      toast.error("Erreur serveur lors de la suppression");
      setIsDeleting(false);
    }
  }, [lead.id, router]);

  const generateAIMessage = useCallback(async (feedback?: string) => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            title: lead.title,
            company: lead.company,
            score: lead.score,
            tags: lead.tags,
            notes: lead.notes,
            enrichmentData: lead.enrichmentData,
          },
          actionType: "message",
          ...(feedback && messageContent ? { currentMessage: messageContent, feedback } : {}),
        }),
      });
      if (!response.ok) throw new Error("API error");
      const data = await response.json();
      setMessageContent(data.message);
      if (data.message) setShowMessageFeedback(true);
    } catch {
      toast.error("Erreur de génération IA, utilisation du fallback");
      setMessageContent(
        `Bonjour ${lead.firstName},\n\nJ'ai découvert votre parcours chez ${lead.company} et je suis impressionné par votre approche. Chez JARVIS, nous aidons les entreprises comme la vôtre à automatiser les tâches répétitives grâce à l'IA.\n\nSeriez-vous disponible pour un échange de 15 minutes cette semaine ?`
      );
    } finally {
      setIsGenerating(false);
      setMessageFeedback("");
    }
  }, [lead, messageContent]);

  const handleSendMessage = useCallback(async () => {
    if (!messageContent.trim()) return;
    setIsSending(true);
    try {
      const result = await sendDirectMessage(lead.id, messageContent.trim());
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Message envoy\u00e9 \u00e0 ${lead.firstName} ${lead.lastName}`);
      setShowMessageModal(false);
      setMessageContent("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l\u2019envoi");
    } finally {
      setIsSending(false);
    }
  }, [lead.id, lead.firstName, lead.lastName, messageContent, router]);

  const scoreLead = useCallback(async () => {
    setIsScoring(true);
    try {
      const res = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: {
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            title: lead.title,
            company: lead.company,
            linkedinUrl: lead.linkedinUrl,
            score: lead.score,
            status: lead.status,
            stage: lead.stage,
            tags: lead.tags,
            notes: lead.notes,
            enrichmentData: lead.enrichmentData,
          },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Score API error (${res.status})`);
      }
      const data = await res.json();
      const scoringDetail = {
        ...(data.detail || {}),
        categorie: data.categorie,
        confidence: data.confidence,
        cas_limite: data.cas_limite,
        ajustement_ia: data.ajustement_ia,
        justification: data.justification,
      };
      setLead((prev) => ({
        ...prev,
        score: data.score,
        enrichmentData: {
          ...prev.enrichmentData,
          scoring_detail: scoringDetail,
        },
      }));
      setScoringBreakdown(scoringDetail);
      toast.success(`Score mis à jour : ${data.score}/100 (${data.categorie || data.category})`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du scoring");
    } finally {
      setIsScoring(false);
    }
  }, [lead, router]);

  const enrichLead = useCallback(async () => {
    setIsEnriching(true);
    try {
      const res = await fetch("/api/ai/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: {
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            title: lead.title,
            company: lead.company,
            linkedinUrl: lead.linkedinUrl,
          },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur API (${res.status})`);
      }
      const data = await res.json();

      // Merge full response with existing enrichmentData (preserve scoring_detail)
      const enrichFields = { ...data };
      delete enrichFields.usage;
      delete enrichFields.warning;
      const enrichmentData = {
        ...lead.enrichmentData,
        ...enrichFields,
      };

      // Update local state (+ stage si auto-corrigé, + score si auto-scoré)
      const stateUpdates: Partial<typeof lead> = { enrichmentData };
      if (data.stageUpdated) {
        stateUpdates.stage = data.stageUpdated as LeadStage;
      }
      if (data.autoScore && typeof data.autoScore.score === "number") {
        stateUpdates.score = data.autoScore.score;
        // Update scoring_detail in enrichmentData
        stateUpdates.enrichmentData = {
          ...enrichmentData,
          scoring_detail: (data.autoScore as Record<string, unknown>).detail || enrichmentData?.scoring_detail,
        };
      }
      setLead((prev) => ({ ...prev, ...stateUpdates }));

      // Toast message
      const parts: string[] = [];
      parts.push(`Enrichissement termin\u00e9`);
      if (data.autoScore?.score != null) {
        parts.push(`score: ${data.autoScore.score}/100 (${data.autoScore.categorie || "N/A"})`);
      }
      if (data.stageUpdated) {
        parts.push(`stage: ${LEAD_STAGES[data.stageUpdated as keyof typeof LEAD_STAGES]?.label || data.stageUpdated}`);
      }
      if (!data.autoScore && !data.stageUpdated) {
        parts.push(`confiance: ${data.confidence || "N/A"}`);
      }
      toast.success(parts.join(" - "));
      if (data.warning) {
        toast.warning(data.warning);
      }

      // Refresh server data
      router.refresh();
    } catch (err) {
      console.error("Enrichment error:", err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'enrichissement");
    } finally {
      setIsEnriching(false);
    }
  }, [lead, router]);

  const statusBadge = getStatusBadge(lead.status);
  const stageLabel = LEAD_STAGES[lead.stage as keyof typeof LEAD_STAGES]?.label || lead.stage;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/pipeline"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au pipeline
      </Link>

      {/* Header Card - Premium */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="bg-card p-6">
          <div className="flex items-start justify-between">
            {/* Left: Avatar & Info */}
            <div className="flex gap-5">
              <Avatar className="h-20 w-20 border-4 border-card">
                {lead.enrichmentData?.linkedin_profile?.profile_picture_url && (
                  <AvatarImage
                    src={lead.enrichmentData.linkedin_profile.profile_picture_url}
                    alt={lead.displayName}
                  />
                )}
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {lead.displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold">
                    {lead.displayName}
                  </h1>
                  {lead.enrichmentData?.linkedin_profile?.is_premium && (
                    <Badge variant="outline" className="rounded-full text-amber-600 border-amber-300 bg-amber-50">
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  )}
                  {lead.enrichmentData?.linkedin_profile?.is_open_profile === true && (
                    <Badge variant="outline" className="rounded-full text-emerald-600 border-emerald-300 bg-emerald-50">
                      <Unlock className="h-3 w-3 mr-1" />
                      Open Profile
                    </Badge>
                  )}
                  <Badge variant={statusBadge.variant} className="rounded-full">{statusBadge.label}</Badge>
                  <Badge variant="outline" className="rounded-full">{stageLabel}</Badge>
                </div>
                {lead.enrichmentData?.linkedin_profile?.headline ? (
                  <p className="text-lg text-muted-foreground">{lead.enrichmentData.linkedin_profile.headline}</p>
                ) : (
                  <p className="text-lg text-muted-foreground">
                    {lead.title} <span className="text-foreground/60">chez</span>{" "}
                    <span className="font-medium text-foreground">{lead.company}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {lead.enrichmentData?.linkedin_profile?.network_distance && (
                    <Badge variant="outline" className="text-xs rounded-full">
                      {(lead.enrichmentData.linkedin_profile.network_distance === "FIRST" || lead.enrichmentData.linkedin_profile.network_distance === "FIRST_DEGREE") ? "1er degr\u00e9" :
                       (lead.enrichmentData.linkedin_profile.network_distance === "SECOND" || lead.enrichmentData.linkedin_profile.network_distance === "SECOND_DEGREE") ? "2e degr\u00e9" :
                       (lead.enrichmentData.linkedin_profile.network_distance === "THIRD" || lead.enrichmentData.linkedin_profile.network_distance === "THIRD_DEGREE") ? "3e degr\u00e9" :
                       lead.enrichmentData.linkedin_profile.network_distance}
                    </Badge>
                  )}
                  {lead.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs rounded-full">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Score & Actions */}
            <div className="flex items-start gap-6">
              {/* Score Circle */}
              <div className="text-center">
                <div
                  className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full ${getScoreColor(lead.score)} text-white`}
                >
                  <span className="text-3xl font-semibold">{lead.score}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Score</p>
              </div>

              {/* Actions */}
              <TooltipProvider>
                <div className="flex flex-col gap-2">
                  {!isOwner && (
                    <p className="text-xs text-muted-foreground text-right">
                      Propri&eacute;taire : {lead.ownerName}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {isOwner ? (
                      <Button
                        variant="accent"
                        onClick={() => setShowMessageModal(true)}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Envoyer un message
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="accent" disabled>
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Envoyer un message
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Seul le propri&eacute;taire peut envoyer un message</TooltipContent>
                      </Tooltip>
                    )}
                    {lead.linkedinUrl ? (
                      <Button variant="outline" asChild>
                        <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer">
                          <Linkedin className="mr-2 h-4 w-4" />
                          LinkedIn
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={openFindLinkedIn} disabled={lkLoading}>
                        {lkLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Linkedin className="mr-2 h-4 w-4" />
                        )}
                        Trouver le LinkedIn
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="flex-1">
                            <Plus className="mr-2 h-4 w-4" />
                            Ajouter &agrave; s&eacute;quence
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {sequences.map((seq) => (
                            <DropdownMenuItem
                              key={seq.id}
                              onClick={() => setShowSequenceModal(true)}
                            >
                              <span>{seq.name}</span>
                              <Badge variant="outline" className="ml-auto text-xs rounded-full">
                                {seq.stats.activeLeads} actifs
                              </Badge>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Plus className="mr-2 h-4 w-4" />
                            Nouvelle s&eacute;quence
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button variant="outline" className="w-full" disabled>
                              <Plus className="mr-2 h-4 w-4" />
                              Ajouter &agrave; s&eacute;quence
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Seul le propri&eacute;taire peut ajouter ce lead &agrave; une s&eacute;quence</TooltipContent>
                      </Tooltip>
                    )}
                    {isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">
                            Changer statut
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {Object.entries(LEAD_STATUSES).map(([key, status]) => (
                            <DropdownMenuItem
                              key={key}
                              onClick={async () => {
                                const result = await updateLead(lead.id, { status: key });
                                if (result.success) {
                                  setLead((prev) => ({ ...prev, status: key as LeadStatus }));
                                  toast.success(`Statut changé : ${status.label}`);
                                  router.refresh();
                                } else {
                                  toast.error(result.error || "Erreur lors du changement de statut");
                                }
                              }}
                            >
                              {status.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="outline" disabled>
                              Changer statut
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Seul le propri&eacute;taire peut changer le statut</TooltipContent>
                      </Tooltip>
                    )}
                    {isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">
                            {stageLabel}
                            <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {Object.entries(LEAD_STAGES).map(([key, stage]) => (
                            <DropdownMenuItem
                              key={key}
                              onClick={async () => {
                                const result = await updateLead(lead.id, { stage: key });
                                if (result.success) {
                                  setLead((prev) => ({ ...prev, stage: key as LeadStage }));
                                  toast.success(`Stage chang\u00e9 : ${stage.label}`);
                                  router.refresh();
                                } else {
                                  toast.error(result.error || "Erreur lors du changement de stage");
                                }
                              }}
                            >
                              {stage.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="outline" disabled>
                              {stageLabel}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Seul le propri&eacute;taire peut changer le stage</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {isOwner && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer le lead
                      </Button>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Contact & Enrichment */}
        <div className="space-y-6">
          {/* Score Breakdown (inline, toujours visible si scoring_detail existe) */}
          {scoringBreakdown && (
            <ScoreBreakdownCard
              breakdown={scoringBreakdown}
              isOwner={isOwner}
              isScoring={isScoring}
              onRescore={scoreLead}
            />
          )}

          {/* Contact Info */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Contact
              </h3>
            </div>
            <div className="px-6 pb-6 space-y-3">
              {lead.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`mailto:${lead.email}`}
                    className="hover:underline text-accent"
                  >
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${lead.phone}`} className="hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.linkedinUrl ? (
                <div className="flex items-center gap-3 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={lead.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-accent truncate"
                  >
                    {lead.linkedinUrl.replace(/^https?:\/\/(www\.|fr\.)?linkedin\.com\/in\//, "")}
                  </a>
                </div>
              ) : (
                <button
                  onClick={openFindLinkedIn}
                  disabled={lkLoading}
                  className="flex items-center gap-3 text-sm text-accent hover:underline disabled:opacity-50"
                >
                  <Linkedin className="h-4 w-4" />
                  {"Trouver le LinkedIn"}
                </button>
              )}
            </div>
          </div>

          {/* Contact enrichi Icypeas */}
          {lead.enrichmentData?.email_enrichment && (
            <IcypeasContactCard emailEnrichment={lead.enrichmentData.email_enrichment as IcypeasEmailEnrichment} />
          )}

          {/* Données Icypeas bonus */}
          {lead.enrichmentData?.email_enrichment && (
            <IcypeasBonusCard emailEnrichment={lead.enrichmentData.email_enrichment as IcypeasEmailEnrichment} />
          )}

          {/* Enrichment Summary */}
          {lead.enrichmentData?.summary && (
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                <p className="text-sm italic text-foreground/80">
                  {lead.enrichmentData.summary}
                </p>
              </div>
            </div>
          )}

          {/* Company Enrichment */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                Entreprise
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={enrichLead}
                    disabled={isEnriching}
                    className="ml-auto text-xs h-7 px-2"
                  >
                    {isEnriching ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    {isEnriching ? "Enrichissement..." : "Enrichir"}
                  </Button>
                )}
                {!isOwner && (
                  <Badge variant="outline" className="ml-auto text-xs rounded-full">
                    <Sparkles className="mr-1 h-3 w-3" />
                    Perplexity
                  </Badge>
                )}
              </h3>
            </div>
            <div className="px-6 pb-6 space-y-4">
              {lead.company && (
                <div className="flex items-center gap-3 text-sm">
                  <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{lead.company}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{lead.enrichmentData?.company?.size || "Non renseign\u00e9"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{lead.enrichmentData?.company?.location || "Non renseign\u00e9"}</span>
              </div>
              {!!lead.enrichmentData?.company?.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`https://${lead.enrichmentData?.company?.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {lead.enrichmentData?.company?.website}
                  </a>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" />
                    Secteur
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {lead.enrichmentData?.company?.industry || "N/A"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Funding
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {lead.enrichmentData?.company?.funding || "N/A"}
                  </p>
                </div>
              </div>
              {lead.enrichmentData?.company?.revenue && (
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    Revenue estim&eacute;
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {lead.enrichmentData.company.revenue}
                  </p>
                </div>
              )}
              {lead.enrichmentData?.company?.description && (
                <p className="text-sm text-muted-foreground italic">
                  &quot;{lead.enrichmentData?.company?.description}&quot;
                </p>
              )}
              {lead.enrichmentData?.company?.news && lead.enrichmentData.company.news.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Actualit&eacute;s r&eacute;centes
                    </p>
                    <div className="space-y-1.5">
                      {lead.enrichmentData.company.news.map((item, i) => (
                        <p key={i} className="text-sm text-muted-foreground pl-3 border-l-2 border-accent/30">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Signal enrichissement */}
          {lead.enrichmentData?.signal && (
            <div className="bg-card rounded-lg border border-border">
              <div className="p-6 pb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Signal
                  {lead.enrichmentData.signal.type && (
                    <Badge
                      variant={
                        (SIGNAL_TYPES[lead.enrichmentData.signal.type as keyof typeof SIGNAL_TYPES]?.color as "default" | "secondary" | "destructive" | "warning" | "accent") || "secondary"
                      }
                      className="rounded-full text-xs ml-1"
                    >
                      {SIGNAL_TYPES[lead.enrichmentData.signal.type as keyof typeof SIGNAL_TYPES]?.label || lead.enrichmentData.signal.type.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {lead.enrichmentData.signal.source === "gojiberry" && (
                    <Badge variant="outline" className="rounded-full text-xs ml-1 gap-1">
                      Gojiberry
                      {lead.enrichmentData.signal.gojiberry_score != null && (
                        <span className="font-mono">{lead.enrichmentData.signal.gojiberry_score}/3</span>
                      )}
                    </Badge>
                  )}
                </h3>
              </div>
              <div className="px-6 pb-6 space-y-2">
                {lead.enrichmentData.signal.detail && (
                  <p className="text-sm text-muted-foreground">
                    {lead.enrichmentData.signal.detail}
                  </p>
                )}
                {lead.enrichmentData.signal.intent_keyword && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mot-cl&eacute; :</span>
                    <Badge variant="secondary" className="text-xs">{lead.enrichmentData.signal.intent_keyword}</Badge>
                  </div>
                )}
                {lead.enrichmentData.signal.intent_post_url && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Post :</span>
                    <a
                      href={lead.enrichmentData.signal.intent_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline truncate max-w-[300px]"
                    >
                      {lead.enrichmentData.signal.intent_post_url}
                    </a>
                  </div>
                )}
                {lead.enrichmentData.signal.intent_post_content && (
                  <div className="rounded-md bg-muted/50 p-3 mt-2">
                    <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                      {lead.enrichmentData.signal.intent_post_content}
                    </p>
                  </div>
                )}
                {lead.enrichmentData.signal.import_date && (
                  <p className="text-xs text-muted-foreground">
                    D&eacute;tect&eacute; le {lead.enrichmentData.signal.import_date}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Ancienneté poste (toujours visible si disponible) */}
          {lead.enrichmentData?.person?.anciennete_poste_mois != null && (
            <div className="flex items-center gap-2 text-sm bg-muted rounded-lg p-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>En poste depuis <strong>{lead.enrichmentData.person.anciennete_poste_mois} mois</strong></span>
            </div>
          )}

          {/* Contexte LinkedIn (collapsible) */}
          <LeadContextPanel
            linkedin_profile={lead.enrichmentData?.linkedin_profile}
            person={lead.enrichmentData?.person}
            linkedin_posts={lead.enrichmentData?.linkedin_posts}
          />
        </div>

        {/* Right Column - Dossier + Notes + Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dossier d'attaque */}
          <DossierCardOrPlaceholder
            dossier={lead.enrichmentData?.dossier}
            onEnrich={enrichLead}
            isEnriching={isEnriching}
            isOwner={isOwner}
          />

          {/* Notes - Editable */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 pb-3 flex flex-row items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Notes
              </h3>
              {!isEditingNotes ? (
                isOwner ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingNotes(true)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Modifier
                  </Button>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="ghost" size="sm" disabled>
                            <Plus className="mr-1 h-4 w-4" />
                            Modifier
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Seul le propri&eacute;taire peut modifier les notes</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              ) : (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={async () => {
                    const result = await updateLead(lead.id, { notes });
                    if (result.success) {
                      setLead((prev) => ({ ...prev, notes }));
                      setIsEditingNotes(false);
                      toast.success("Notes enregistrées");
                      router.refresh();
                    } else {
                      toast.error(result.error || "Erreur lors de la sauvegarde");
                    }
                  }}
                >
                  <Save className="mr-1 h-4 w-4" />
                  Enregistrer
                </Button>
              )}
            </div>
            <div className="px-6 pb-6">
              {isEditingNotes ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ajoutez des notes sur ce lead..."
                  className="min-h-[120px] resize-none"
                />
              ) : notes ? (
                <p className="text-sm whitespace-pre-wrap">{notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aucune note. Cliquez sur &quot;Modifier&quot; pour en ajouter.
                </p>
              )}
              {!isEditingNotes && notes && (
                <p className="text-xs text-muted-foreground mt-3">
                  Derni&egrave;re modification : {lead.updatedAt ? formatTimelineDate(lead.updatedAt.toISOString()) : "inconnue"}
                </p>
              )}
            </div>
          </div>

          {/* Timeline History */}
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Historique des interactions
              </h3>
            </div>
            <div className="px-6 pb-6">
              {history.length > 0 ? (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                  {/* Timeline events */}
                  <div className="space-y-6">
                    {[...history].reverse().map((event) => {
                      const isFailed = event.status === "failed";
                      return (
                        <div key={event.id} className="relative flex gap-4">
                          {/* Icon circle */}
                          <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-card border-2 border-border">
                            {getTimelineIcon(event.actionType)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm flex items-center gap-2">
                                {ACTION_TYPE_DESCRIPTIONS[event.actionType] || event.actionType}
                                {isFailed && (
                                  <Badge variant="destructive" className="text-[10px]">&Eacute;chec</Badge>
                                )}
                              </p>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatTimelineDate(event.createdAt.toISOString())}
                              </span>
                            </div>
                            {(event.generatedMessage || event.finalMessage) && (
                              <div className={`mt-2 rounded-lg p-3 ${isFailed ? "bg-destructive/10 border border-destructive/20" : "bg-muted"}`}>
                                <p className="text-sm text-muted-foreground">
                                  {event.finalMessage || event.generatedMessage}
                                </p>
                                {isFailed && event.errorMessage && (
                                  <p className="text-xs text-destructive mt-2">{event.errorMessage}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Aucune interaction enregistr&eacute;e pour ce lead.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Add to Sequence Modal */}
      <Dialog open={showSequenceModal} onOpenChange={(open) => { setShowSequenceModal(open); if (!open) setSelectedSequenceId(null); }}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Ajouter &agrave; une s&eacute;quence</DialogTitle>
            <DialogDescription>
              {lead.displayName} sera ajout&eacute;(e) &agrave; la s&eacute;quence s&eacute;lectionn&eacute;e et recevra les messages automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {sequences.filter(s => s.status === 'active' || s.status === 'draft').map((seq) => (
              <div
                key={seq.id}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSequenceId === seq.id
                    ? "border-accent bg-accent/5"
                    : "border-border hover:bg-muted"
                }`}
                onClick={() => setSelectedSequenceId(seq.id)}
              >
                <div>
                  <p className="font-medium">{seq.name}</p>
                  <p className="text-sm text-muted-foreground">{seq.steps.length} &eacute;tapes &bull; {seq.persona}</p>
                </div>
                <Badge variant="outline" className="rounded-full">{seq.stats.responseRate}% r&eacute;ponse</Badge>
              </div>
            ))}
            {sequences.filter(s => s.status === 'active' || s.status === 'draft').length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Aucune s&eacute;quence disponible.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSequenceModal(false)}>
              Annuler
            </Button>
            <Button
              variant="accent"
              disabled={!selectedSequenceId || addingToSequence}
              onClick={async () => {
                if (!selectedSequenceId) return;
                setAddingToSequence(true);
                try {
                  const result = await addLeadToSequence(selectedSequenceId, lead.id);
                  if (result.success) {
                    toast.success(`${lead.firstName} ajouté(e) à la séquence`);
                    setShowSequenceModal(false);
                    setSelectedSequenceId(null);
                    router.refresh();
                  } else {
                    toast.error(result.error || "Erreur");
                  }
                } catch {
                  toast.error("Erreur serveur");
                } finally {
                  setAddingToSequence(false);
                }
              }}
            >
              {addingToSequence ? "Ajout..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Modal */}
      <Dialog open={showMessageModal} onOpenChange={(open) => { setShowMessageModal(open); if (!open) { setMessageContent(""); setShowMessageFeedback(false); setMessageFeedback(""); } }}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Envoyer un message</DialogTitle>
            <DialogDescription>
              Envoyez un message LinkedIn &agrave; {lead.displayName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={`Bonjour ${lead.firstName},\n\n...`}
              className="min-h-[200px]"
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
            />
            <div className="flex items-center justify-between mt-3">
              <Button variant="ghost" size="sm" onClick={() => generateAIMessage()} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    G&eacute;n&eacute;ration...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    G&eacute;n&eacute;rer avec l&apos;IA
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">{messageContent.length}/1500 caract&egrave;res</span>
            </div>

            {/* Feedback input for refining AI generation */}
            {showMessageFeedback && messageContent && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Ajuster : plus court, angle diff&eacute;rent..."
                  className="flex-1 h-8 rounded-lg bg-muted/50 border border-border px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent"
                  value={messageFeedback}
                  onChange={(e) => setMessageFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && messageFeedback.trim()) {
                      generateAIMessage(messageFeedback);
                    }
                  }}
                  maxLength={200}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-accent hover:text-accent"
                  onClick={() => generateAIMessage(messageFeedback || undefined)}
                  disabled={isGenerating || !messageFeedback.trim()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMessageModal(false)}>
              Annuler
            </Button>
            <Button variant="accent" onClick={handleSendMessage} disabled={!messageContent.trim() || isSending}>
              {isSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSending ? "Envoi en cours..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) setShowDeleteDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Supprimer le lead
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{lead.displayName}</strong> ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLead}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog résolution LinkedIn (web + Unipile) */}
      <Dialog open={lkOpen} onOpenChange={setLkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Trouver le LinkedIn</DialogTitle>
            <DialogDescription>
              {`${lead.displayName}${lead.company ? ` · ${lead.company}` : ""}`}
            </DialogDescription>
          </DialogHeader>

          {lkLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {"Recherche en cours…"}
            </div>
          ) : lkCandidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {"Aucun candidat trouvé."}
            </div>
          ) : (
            <div className="space-y-2">
              {lkCandidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.name || "—"}</span>
                      <Badge variant={c.score >= 0.6 ? "accent" : "secondary"} className="shrink-0">
                        {`${Math.round(c.score * 100)}%`}
                      </Badge>
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {c.source === "web" ? "web" : "Unipile"}
                      </Badge>
                      {c.agreement && (
                        <span className="shrink-0 text-xs font-medium text-success">
                          {"✓ concordance"}
                        </span>
                      )}
                    </div>
                    {c.headline && (
                      <div className="truncate text-xs text-muted-foreground">{c.headline}</div>
                    )}
                    {c.profileUrl && (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs text-accent hover:underline"
                      >
                        {c.profileUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => confirmLinkedInCandidate(c)}
                    disabled={!c.profileUrl || lkAttaching !== null}
                  >
                    {lkAttaching === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirmer"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
