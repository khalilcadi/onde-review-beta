"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Eye,
  UserPlus,
  MessageSquare,
  Mail,
  Phone,
  Send,
  Trash2,
  Play,
  Pause,
  MoreHorizontal,
  Users,
  TrendingUp,
  MessageCircle,
  Target,
  GitBranch,
  X,
  Sparkles,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateSequence as serverUpdateSequence,
  updateStep as serverUpdateStep,
  addStep as serverAddStep,
  deleteStep as serverDeleteStep,
  addLeadToSequence,
  removeLeadFromSequence,
  getSequenceStepStats,
} from "@/lib/actions/sequences";
import type { SequenceStepStats } from "@/lib/actions/sequences";
import { getLeads } from "@/lib/actions/leads";
import type { SequenceStep } from "@/types/sequences";
import type { LeadWithOwner } from "@/lib/mappers";

// ─── Types ───────────────────────────────────────────────────────────────────

type StepType = "visit" | "invitation" | "message" | "inmail" | "whatsapp" | "email";

interface SequenceNode {
  id: string;
  stepType: StepType;
  delayDays: number;
  generationMode: "ai" | "template";
  template: string;
  condition?: {
    type: string;
    label: string;
    yesBranch: SequenceNode[];
    noBranch: SequenceNode[];
  };
}

interface SequenceLeadInfo {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  title?: string;
  company?: string;
  linkedinUrl: string;
  hasEnrichment: boolean;
  currentStep: number;
  status: string;
}

interface SequenceDetailClientProps {
  sequenceId: string;
  currentUserId: string;
  initialSequence: {
    id: string;
    name: string;
    persona: string;
    status: "active" | "paused";
    stats: {
      totalLeads: number;
      activeLeads: number;
      completedLeads: number;
      exitedLeads: number;
      responseRate: number;
      conversionRate: number;
      avgResponseTime: string;
    };
  } | null;
  initialSteps?: SequenceStep[];
  initialLeads?: SequenceLeadInfo[];
}

// ─── Config ──────────────────────────────────────────────────────────────────

const STEP_TYPES: Record<StepType, { label: string; icon: typeof Eye; color: string }> = {
  visit: { label: "Visite profil", icon: Eye, color: "text-gray-500" },
  invitation: { label: "Invitation", icon: UserPlus, color: "text-blue-500" },
  message: { label: "Message", icon: MessageSquare, color: "text-green-500" },
  inmail: { label: "InMail", icon: Mail, color: "text-purple-500" },
  whatsapp: { label: "WhatsApp", icon: Phone, color: "text-emerald-500" },
  email: { label: "Email", icon: Send, color: "text-orange-500" },
};

const CONDITIONS_BY_STEP: Record<string, { type: string; label: string }[]> = {
  invitation: [
    { type: "invitation_accepted", label: "Invitation acceptée ?" },
  ],
  message: [
    { type: "message_replied", label: "A répondu ?" },
    { type: "message_read", label: "Message lu ?" },
  ],
  inmail: [
    { type: "message_replied", label: "A répondu ?" },
    { type: "message_read", label: "Message lu ?" },
  ],
  visit: [
    { type: "profile_visited", label: "A visité en retour ?" },
  ],
  whatsapp: [
    { type: "message_replied", label: "A répondu ?" },
  ],
  email: [
    { type: "message_replied", label: "A répondu ?" },
    { type: "message_read", label: "Email ouvert ?" },
  ],
};

// ─── Helpers: convert DB steps to/from SequenceNode ─────────────────────────

function stepsToNodes(steps: SequenceStep[]): SequenceNode[] {
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step) => {
      const node: SequenceNode = {
        id: step.id,
        stepType: step.stepType as StepType,
        delayDays: step.delayDays,
        generationMode: step.generationMode as "ai" | "template",
        template: step.template || "",
      };
      if (step.condition) {
        node.condition = {
          type: step.condition.type,
          label: step.condition.label || step.condition.type,
          yesBranch: [],
          noBranch: [],
        };
      }
      return node;
    });
}

const DEFAULT_SEQUENCE = {
  id: "",
  name: "Nouvelle séquence",
  persona: "",
  status: "draft" as const,
  stats: {
    totalLeads: 0,
    activeLeads: 0,
    completedLeads: 0,
    exitedLeads: 0,
    responseRate: 0,
    conversionRate: 0,
    avgResponseTime: "N/A",
  },
};

// ─── Recursive helpers (immutable) ───────────────────────────────────────────

function updateNodeInTree(nodes: SequenceNode[], nodeId: string, updates: Partial<SequenceNode>): SequenceNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates };
    }
    if (node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: updateNodeInTree(node.condition.yesBranch, nodeId, updates),
          noBranch: updateNodeInTree(node.condition.noBranch, nodeId, updates),
        },
      };
    }
    return node;
  });
}

function removeNodeFromTree(nodes: SequenceNode[], nodeId: string): SequenceNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.condition) {
        return {
          ...node,
          condition: {
            ...node.condition,
            yesBranch: removeNodeFromTree(node.condition.yesBranch, nodeId),
            noBranch: removeNodeFromTree(node.condition.noBranch, nodeId),
          },
        };
      }
      return node;
    });
}

function addConditionToNode(nodes: SequenceNode[], nodeId: string, condType: string, condLabel: string): SequenceNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        condition: {
          type: condType,
          label: condLabel,
          yesBranch: [],
          noBranch: [],
        },
      };
    }
    if (node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: addConditionToNode(node.condition.yesBranch, nodeId, condType, condLabel),
          noBranch: addConditionToNode(node.condition.noBranch, nodeId, condType, condLabel),
        },
      };
    }
    return node;
  });
}

function removeConditionFromNode(nodes: SequenceNode[], nodeId: string): SequenceNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      const { ...rest } = node;
      delete rest.condition;
      return rest;
    }
    if (node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: removeConditionFromNode(node.condition.yesBranch, nodeId),
          noBranch: removeConditionFromNode(node.condition.noBranch, nodeId),
        },
      };
    }
    return node;
  });
}

function updateConditionType(nodes: SequenceNode[], nodeId: string, condType: string, condLabel: string): SequenceNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId && node.condition) {
      return {
        ...node,
        condition: { ...node.condition, type: condType, label: condLabel },
      };
    }
    if (node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: updateConditionType(node.condition.yesBranch, nodeId, condType, condLabel),
          noBranch: updateConditionType(node.condition.noBranch, nodeId, condType, condLabel),
        },
      };
    }
    return node;
  });
}

function addStepToBranch(nodes: SequenceNode[], parentId: string, branch: "yes" | "no", newStep: SequenceNode): SequenceNode[] {
  return nodes.map((node) => {
    if (node.id === parentId && node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: branch === "yes" ? [...node.condition.yesBranch, newStep] : node.condition.yesBranch,
          noBranch: branch === "no" ? [...node.condition.noBranch, newStep] : node.condition.noBranch,
        },
      };
    }
    if (node.condition) {
      return {
        ...node,
        condition: {
          ...node.condition,
          yesBranch: addStepToBranch(node.condition.yesBranch, parentId, branch, newStep),
          noBranch: addStepToBranch(node.condition.noBranch, parentId, branch, newStep),
        },
      };
    }
    return node;
  });
}

function makeNewStep(): SequenceNode {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stepType: "message",
    delayDays: 2,
    generationMode: "ai",
    template: "",
  };
}

function isTempId(id: string): boolean {
  return id.startsWith("tmp-");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SequenceDetailClient({ sequenceId, currentUserId, initialSequence, initialSteps = [], initialLeads = [] }: SequenceDetailClientProps) {
  const [nodes, setNodes] = useState<SequenceNode[]>(() => stepsToNodes(initialSteps));
  const [sequence, setSequence] = useState(initialSequence || DEFAULT_SEQUENCE);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(sequence.name);
  const [leads, setLeads] = useState<SequenceLeadInfo[]>(initialLeads);
  const [isEnrichingAll, setIsEnrichingAll] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [showAddLeadsModal, setShowAddLeadsModal] = useState(false);
  const [allLeads, setAllLeads] = useState<LeadWithOwner[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [addingLeadId, setAddingLeadId] = useState<string | null>(null);
  const [showEnrolledLeadsModal, setShowEnrolledLeadsModal] = useState(false);
  const [removingLeadId, setRemovingLeadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("builder");
  const [stepStats, setStepStats] = useState<SequenceStepStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (activeTab !== "data" || stepStats) return;
    setLoadingStats(true);
    getSequenceStepStats(sequenceId).then((res) => {
      if (res.success) setStepStats(res.data);
      setLoadingStats(false);
    });
  }, [activeTab, sequenceId, stepStats]);

  const unenrichedLeads = leads.filter((l) => !l.hasEnrichment);
  const enrichedCount = leads.length - unenrichedLeads.length;

  const handleBatchEnrich = useCallback(async () => {
    if (unenrichedLeads.length === 0) return;
    setIsEnrichingAll(true);
    setEnrichProgress({ done: 0, total: unenrichedLeads.length });

    try {
      const res = await fetch("/api/ai/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: unenrichedLeads.map((l) => ({
            id: l.id,
            firstName: l.firstName,
            lastName: l.lastName,
            title: l.title,
            company: l.company,
            linkedinUrl: l.linkedinUrl,
          })),
        }),
      });

      if (!res.ok) throw new Error("Erreur API enrichissement");
      const data = await res.json();

      const successCount = data.results.filter(
        (r: { success: boolean }) => r.success
      ).length;

      // Update local state
      const enrichedIds = new Set(
        data.results
          .filter((r: { success: boolean }) => r.success)
          .map((r: { leadId: string }) => r.leadId)
      );
      setLeads((prev) =>
        prev.map((l) =>
          enrichedIds.has(l.id) ? { ...l, hasEnrichment: true } : l
        )
      );
      setEnrichProgress({ done: successCount, total: unenrichedLeads.length });

      if (successCount === unenrichedLeads.length) {
        toast.success(
          `${successCount} lead${successCount > 1 ? "s" : ""} enrichi${successCount > 1 ? "s" : ""}`
        );
      } else {
        toast.warning(
          `${successCount}/${unenrichedLeads.length} leads enrichis`
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'enrichissement"
      );
    } finally {
      setIsEnrichingAll(false);
    }
  }, [unenrichedLeads]);

  const toggleStatus = async () => {
    const oldStatus = sequence.status;
    const newStatus = oldStatus === "active" ? "paused" as const : "active" as const;
    setSequence((s) => ({ ...s, status: newStatus }));
    const result = await serverUpdateSequence(sequenceId, { status: newStatus });
    if (result.success) {
      toast.success(newStatus === "active" ? "Séquence activée" : "Séquence mise en pause");
    } else {
      setSequence((s) => ({ ...s, status: oldStatus }));
      toast.error(result.error || "Erreur lors de la mise à jour");
    }
  };

  const saveName = async () => {
    const oldName = sequence.name;
    setSequence((s) => ({ ...s, name: editedName }));
    setIsEditing(false);
    const result = await serverUpdateSequence(sequenceId, { name: editedName });
    if (result.success) {
      toast.success("Nom mis à jour");
    } else {
      setSequence((s) => ({ ...s, name: oldName }));
      setIsEditing(true);
      toast.error(result.error || "Erreur lors de la sauvegarde du nom");
    }
  };

  const handleUpdateNode = async (nodeId: string, updates: Partial<SequenceNode>) => {
    const previousNodes = [...nodes];
    setNodes((prev) => updateNodeInTree(prev, nodeId, updates));
    // Skip DB call for steps not yet persisted
    if (isTempId(nodeId)) return;
    // Persist to DB
    const dbUpdates: Record<string, unknown> = {};
    if (updates.stepType !== undefined) dbUpdates.stepType = updates.stepType;
    if (updates.delayDays !== undefined) dbUpdates.delayDays = updates.delayDays;
    if (updates.generationMode !== undefined) dbUpdates.generationMode = updates.generationMode;
    if (updates.template !== undefined) dbUpdates.template = updates.template || null;
    if (Object.keys(dbUpdates).length > 0) {
      const result = await serverUpdateStep(nodeId, dbUpdates);
      if (!result.success) {
        setNodes(previousNodes);
        toast.error("Erreur sauvegarde: " + result.error);
      }
    }
  };

  const handleRemoveNode = async (nodeId: string) => {
    const previousNodes = [...nodes];
    setNodes((prev) => removeNodeFromTree(prev, nodeId));
    // Skip DB call for steps not yet persisted
    if (isTempId(nodeId)) return;
    const result = await serverDeleteStep(nodeId);
    if (!result.success) {
      setNodes(previousNodes);
      toast.error("Erreur suppression: " + result.error);
    }
  };

  const handleAddCondition = async (nodeId: string, stepType: StepType) => {
    const available = CONDITIONS_BY_STEP[stepType];
    if (!available || available.length === 0) return;
    const defaultCond = available[0];
    setNodes((prev) => addConditionToNode(prev, nodeId, defaultCond.type, defaultCond.label));
    if (!isTempId(nodeId)) {
      const result = await serverUpdateStep(nodeId, { condition: JSON.stringify({ type: defaultCond.type, label: defaultCond.label }) });
      if (!result.success) toast.error("Erreur sauvegarde condition: " + result.error);
    }
  };

  const handleRemoveCondition = async (nodeId: string) => {
    setNodes((prev) => removeConditionFromNode(prev, nodeId));
    if (!isTempId(nodeId)) {
      const result = await serverUpdateStep(nodeId, { condition: null });
      if (!result.success) toast.error("Erreur suppression condition: " + result.error);
    }
  };

  const handleUpdateCondition = async (nodeId: string, condType: string, condLabel: string) => {
    setNodes((prev) => updateConditionType(prev, nodeId, condType, condLabel));
    if (!isTempId(nodeId)) {
      const result = await serverUpdateStep(nodeId, { condition: JSON.stringify({ type: condType, label: condLabel }) });
      if (!result.success) toast.error("Erreur sauvegarde condition: " + result.error);
    }
  };

  const handleAddToBranch = async (parentId: string, branch: "yes" | "no") => {
    const tempNode = makeNewStep();
    setNodes((prev) => addStepToBranch(prev, parentId, branch, tempNode));
    const result = await serverAddStep(sequenceId, {
      stepType: tempNode.stepType,
      delayDays: tempNode.delayDays,
      generationMode: tempNode.generationMode,
    });
    if (result.success) {
      setNodes((prev) => updateNodeInTree(prev, tempNode.id, { id: result.data.id } as Partial<SequenceNode>));
    } else {
      toast.error("Erreur ajout étape: " + result.error);
      setNodes((prev) => removeNodeFromTree(prev, tempNode.id));
    }
  };

  const handleAddRootStep = async () => {
    const tempNode = makeNewStep();
    setNodes((prev) => [...prev, tempNode]);
    const result = await serverAddStep(sequenceId, {
      stepType: tempNode.stepType,
      delayDays: tempNode.delayDays,
      generationMode: tempNode.generationMode,
    });
    if (result.success) {
      // Replace temp ID with real DB ID
      setNodes((prev) => prev.map((n) => n.id === tempNode.id ? { ...n, id: result.data.id } : n));
    } else {
      toast.error("Erreur ajout étape: " + result.error);
      setNodes((prev) => prev.filter((n) => n.id !== tempNode.id));
    }
  };

  const handleOpenAddLeads = async () => {
    setShowAddLeadsModal(true);
    setLoadingLeads(true);
    try {
      const result = await getLeads();
      if (result.success) {
        // Filter: only current user's leads, exclude those already in sequence
        const existingIds = new Set(leads.map((l) => l.id));
        setAllLeads(result.data.filter((l) => l.userId === currentUserId && !existingIds.has(l.id)));
      }
    } catch {
      toast.error("Erreur chargement des leads");
    } finally {
      setLoadingLeads(false);
    }
  };

  const handleAddLeadToSequence = async (leadId: string, lead: LeadWithOwner) => {
    setAddingLeadId(leadId);
    try {
      const result = await addLeadToSequence(sequenceId, leadId);
      if (result.success) {
        toast.success(`${lead.displayName} ajouté(e) à la séquence`);
        setLeads((prev) => [...prev, {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          displayName: lead.displayName,
          title: lead.title,
          company: lead.company,
          linkedinUrl: lead.linkedinUrl,
          hasEnrichment: !!lead.enrichmentData,
          currentStep: 0,
          status: "active",
        }]);
        setAllLeads((prev) => prev.filter((l) => l.id !== leadId));
      } else {
        toast.error(result.error || "Erreur ajout lead");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setAddingLeadId(null);
    }
  };

  const handleRemoveLeadFromSequence = async (leadId: string, leadName: string) => {
    setRemovingLeadId(leadId);
    try {
      const result = await removeLeadFromSequence(sequenceId, leadId);
      if (result.success) {
        toast.success(`${leadName} retiré(e) de la séquence`);
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
      } else {
        toast.error(result.error || "Erreur retrait lead");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setRemovingLeadId(null);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

  function renderStepCard(node: SequenceNode, stepNumber: string) {
    const StepConfig = STEP_TYPES[node.stepType];
    const Icon = StepConfig.icon;
    const availableConditions = CONDITIONS_BY_STEP[node.stepType] || [];
    const hasCondition = !!node.condition;

    return (
      <div className="w-80 bg-card rounded-lg border border-border transition-all duration-200">
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {stepNumber}
              </div>
              <Icon className={`h-4 w-4 ${StepConfig.color}`} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoveNode(node.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Type + Delay */}
          <div className="flex items-center gap-2 mb-3">
            <Select
              value={node.stepType}
              onValueChange={(value) =>
                handleUpdateNode(node.id, { stepType: value as StepType })
              }
            >
              <SelectTrigger className="h-8 text-xs w-[130px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STEP_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-1.5">
                      <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                      {config.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <span className="text-xs text-muted-foreground">J+</span>
              <input
                type="number"
                min="0"
                value={node.delayDays}
                onChange={(e) =>
                  handleUpdateNode(node.id, { delayDays: parseInt(e.target.value) || 0 })
                }
                className="w-8 bg-transparent text-center text-xs font-medium focus:outline-none"
              />
            </div>
          </div>

          {/* Generation Mode Toggle — invitations are sent without message */}
          {node.stepType !== "visit" && node.stepType !== "invitation" && (
            <div className="space-y-2">
              {/* Segmented toggle: IA / Template */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    node.generationMode === "ai"
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handleUpdateNode(node.id, { generationMode: "ai" })}
                >
                  <Sparkles className="h-3 w-3" />
                  IA
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    node.generationMode === "template"
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handleUpdateNode(node.id, { generationMode: "template" })}
                >
                  <FileText className="h-3 w-3" />
                  Template
                </button>
              </div>

              {/* AI mode: info box */}
              {node.generationMode === "ai" && (
                <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
                  <Sparkles className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    L&apos;IA g&eacute;n&eacute;rera un message personnalis&eacute; pour chaque lead, bas&eacute; sur son profil et votre offre.
                  </p>
                </div>
              )}

              {/* Template mode: textarea + variable chips */}
              {node.generationMode === "template" && (
                <div className="space-y-2">
                  <textarea
                    value={node.template}
                    onChange={(e) => handleUpdateNode(node.id, { template: e.target.value })}
                    placeholder="&Eacute;crivez votre template..."
                    className="w-full min-h-[80px] rounded-lg bg-muted border-0 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  />
                  <div className="flex flex-wrap gap-1">
                    {["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}"].map((variable) => (
                      <button
                        key={variable}
                        className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                        onClick={() =>
                          handleUpdateNode(node.id, {
                            template: (node.template || "") + variable,
                          })
                        }
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                  {!node.template?.trim() && (
                    <p className="text-xs text-amber-600">
                      Template vide &mdash; l&apos;IA sera utilis&eacute;e par d&eacute;faut.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add condition button */}
          {!hasCondition && availableConditions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs text-muted-foreground hover:text-accent"
              onClick={() => handleAddCondition(node.id, node.stepType)}
            >
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              Ajouter une condition
            </Button>
          )}
        </div>
      </div>
    );
  }

  function renderConditionDiamond(node: SequenceNode) {
    if (!node.condition) return null;
    const availableConditions = CONDITIONS_BY_STEP[node.stepType] || [];

    return (
      <div className="relative flex flex-col items-center">
        {/* Diamond shape */}
        <div className="relative">
          <div className="w-44 h-44 flex items-center justify-center" style={{ transform: "scale(0.5)", margin: "-22px 0" }}>
            <div className="w-full h-full rounded-2xl border-2 border-warning bg-warning-light rotate-45 flex items-center justify-center shadow-sm">
              <div className="-rotate-45 text-center px-2">
                {availableConditions.length > 1 ? (
                  <Select
                    value={node.condition.type}
                    onValueChange={(value) => {
                      const cond = availableConditions.find((c) => c.type === value);
                      if (cond) handleUpdateCondition(node.id, cond.type, cond.label);
                    }}
                  >
                    <SelectTrigger className="h-7 w-[140px] text-xs border-warning bg-warning-light">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableConditions.map((cond) => (
                        <SelectItem key={cond.type} value={cond.type}>
                          {cond.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs font-medium text-amber-800">
                    {node.condition.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Remove condition button */}
          <button
            className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors shadow-sm"
            onClick={() => handleRemoveCondition(node.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  function renderBranch(parentId: string, branchType: "yes" | "no", branchNodes: SequenceNode[], depth: number, counterPrefix: string) {
    const isYes = branchType === "yes";
    const lineColor = isYes ? "bg-green-300" : "bg-red-300";

    return (
      <div className="flex flex-col items-center min-w-[320px]">
        {/* Badge */}
        <Badge className={`rounded-full text-xs px-3 py-0.5 ${isYes ? "bg-success-light text-success" : "bg-destructive/10 text-destructive"}`}>
          {isYes ? "OUI" : "NON"}
        </Badge>
        {/* Connector down */}
        <div className={`w-0.5 h-6 ${lineColor}`} />
        {/* Branch nodes */}
        {branchNodes.length > 0 ? (
          renderNodes(branchNodes, depth + 1, counterPrefix)
        ) : (
          <div className="w-80 rounded-lg border-2 border-dashed border-border p-6 text-center">
            <p className="text-xs text-muted-foreground mb-2">Aucune &eacute;tape</p>
          </div>
        )}
        {/* Add step to branch */}
        <div className={`w-0.5 h-4 ${lineColor}`} />
        <Button
          variant="outline"
          size="sm"
          className={`text-xs rounded-full border-dashed ${isYes ? "border-green-300 text-green-700 hover:bg-green-50" : "border-red-300 text-red-700 hover:bg-red-50"}`}
          onClick={() => handleAddToBranch(parentId, branchType)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Ajouter &eacute;tape
        </Button>
      </div>
    );
  }

  function renderNodes(nodeList: SequenceNode[], depth: number, counterPrefix: string): React.ReactNode {
    return (
      <div className="flex flex-col items-center">
        {nodeList.map((node, index) => {
          const stepNum = counterPrefix ? `${counterPrefix}.${index + 1}` : `${index + 1}`;
          return (
            <div key={node.id} className="flex flex-col items-center">
              {/* Vertical connector between steps */}
              {index > 0 && (
                <div className="w-0.5 h-6 bg-border" />
              )}

              {/* Step card */}
              {renderStepCard(node, stepNum)}

              {/* Condition + branches */}
              {node.condition && (
                <>
                  {/* Connector to diamond */}
                  <div className="w-0.5 h-4 bg-border" />

                  {/* Diamond */}
                  {renderConditionDiamond(node)}

                  {/* Horizontal split connector */}
                  <div className="flex items-start w-full justify-center" style={{ minWidth: "680px" }}>
                    <div className="w-1/2 h-6 border-t-2 border-r-2 border-dashed border-border rounded-tr-xl" />
                    <div className="w-1/2 h-6 border-t-2 border-l-2 border-dashed border-border rounded-tl-xl" />
                  </div>

                  {/* Branches */}
                  <div className="flex gap-8 justify-center">
                    {renderBranch(node.id, "yes", node.condition.yesBranch, depth, `${stepNum}A`)}
                    {renderBranch(node.id, "no", node.condition.noBranch, depth, `${stepNum}B`)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6 min-w-0">
        {/* Back Button */}
        <Link
          href="/sequences"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux s&eacute;quences
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-2xl font-semibold bg-transparent border-b-2 border-primary focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <Button size="sm" onClick={saveName}>
                  OK
                </Button>
              </div>
            ) : (
              <h1
                className="text-2xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => setIsEditing(true)}
                title="Cliquer pour modifier"
              >
                {sequence.name}
              </h1>
            )}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full">{sequence.persona}</Badge>
              <Badge className={`rounded-full ${sequence.status === "active" ? "bg-success-light text-success" : "bg-muted text-muted-foreground"}`}>
                {sequence.status === "active" ? "Active" : "En pause"}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={sequence.status === "active" ? "outline" : "accent"}
              onClick={toggleStatus}
            >
              {sequence.status === "active" ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Mettre en pause
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Activer
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info("Fonctionnalité à venir")}>Dupliquer</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Fonctionnalité à venir")}>Exporter</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info("Fonctionnalité à venir")}>Supprimer</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Flow Chart / Data Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="bg-card rounded-lg border border-border">
            <div className="flex items-center justify-between p-6 pb-4">
              <div className="flex items-center gap-2">
                {activeTab === "builder" ? <GitBranch className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}
                <h2 className="text-base font-semibold leading-none tracking-tight">
                  {activeTab === "builder" ? "Builder de s\u00e9quence" : "Donn\u00e9es de la s\u00e9quence"}
                </h2>
              </div>
              <TabsList>
                <TabsTrigger value="builder">Builder</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="builder" className="mt-0">
              <div className="px-6 pb-6">
                <div className="overflow-x-auto pb-8">
                  <div className="flex flex-col items-center min-w-fit py-4">
                    {renderNodes(nodes, 0, "")}

                    {/* Add root step */}
                    <div className="w-0.5 h-6 bg-border" />
                    <Button
                      variant="outline"
                      className="border-dashed w-80 rounded-lg"
                      onClick={handleAddRootStep}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter une &eacute;tape
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="mt-0">
              <div className="px-6 pb-6">
                {loadingStats ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : stepStats ? (
                  <div className="space-y-6">
                    {/* Steps funnel */}
                    <div className="space-y-3">
                      {stepStats.steps.map((step) => {
                        const total = step.waiting + step.completed;
                        const pct = stepStats.totalLeads > 0 ? Math.round((total / stepStats.totalLeads) * 100) : 0;
                        const StepConfig = STEP_TYPES[step.stepType as StepType];
                        const Icon = StepConfig?.icon ?? Eye;
                        const color = StepConfig?.color ?? "text-gray-500";

                        return (
                          <div key={step.stepId} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                                  {step.stepOrder}
                                </div>
                                <Icon className={`h-4 w-4 ${color}`} />
                                <span className="font-medium">{StepConfig?.label ?? step.stepType}</span>
                              </div>
                              <span className="text-muted-foreground tabular-nums">
                                {total} prospect{total > 1 ? "s" : ""}
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{step.waiting} en attente</span>
                              <span>{step.completed} compl&eacute;t&eacute;{step.completed > 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals */}
                    <div className="border-t border-border pt-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-semibold">{stepStats.totalLeads}</p>
                          <p className="text-xs text-muted-foreground">Total leads</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-semibold text-success">{stepStats.completedLeads}</p>
                          <p className="text-xs text-muted-foreground">Termin&eacute;s</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-semibold text-accent">{stepStats.respondedLeads}</p>
                          <p className="text-xs text-muted-foreground">R&eacute;pondu</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    Aucune donn&eacute;e disponible.
                  </p>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Sidebar Stats */}
      <div className="w-80 space-y-4 hidden xl:block shrink-0">
        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 pb-2">
            <h2 className="text-base font-semibold leading-none tracking-tight">Statistiques</h2>
          </div>
          <div className="p-6 pt-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Total leads
                </div>
                <span className="font-semibold">{sequence.stats.totalLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Play className="h-4 w-4 text-accent" />
                  Actifs
                </div>
                <span className="font-semibold text-accent">{sequence.stats.activeLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-4 w-4 text-success" />
                  Compl&eacute;t&eacute;s
                </div>
                <span className="font-semibold text-success">{sequence.stats.completedLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Pause className="h-4 w-4 text-muted-foreground" />
                  Sortis
                </div>
                <span className="font-semibold text-muted-foreground">{sequence.stats.exitedLeads}</span>
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  Taux de r&eacute;ponse
                </div>
                <span className="font-semibold">{sequence.stats.responseRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Conversion
                </div>
                <span className="font-semibold">{sequence.stats.conversionRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  Temps r&eacute;ponse moy.
                </div>
                <span className="font-semibold text-sm">{sequence.stats.avgResponseTime}</span>
              </div>
            </div>
          </div>
        </div>
        {leads.length > 0 && (
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 pb-2">
              <h2 className="text-base font-semibold leading-none tracking-tight">Enrichissement</h2>
            </div>
            <div className="p-6 pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Leads enrichis</span>
                <span className="font-semibold">
                  {enrichedCount}/{leads.length}
                </span>
              </div>
              {unenrichedLeads.length > 0 ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg bg-warning-light p-3">
                    <AlertCircle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-warning">
                      {unenrichedLeads.length} lead{unenrichedLeads.length > 1 ? "s" : ""} non enrichi{unenrichedLeads.length > 1 ? "s" : ""} &mdash; les messages seront moins personnalis&eacute;s
                    </p>
                  </div>
                  <Button
                    variant="accent"
                    className="w-full rounded-lg"
                    onClick={handleBatchEnrich}
                    disabled={isEnrichingAll}
                  >
                    {isEnrichingAll ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enrichissement {enrichProgress.done}/{enrichProgress.total}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Enrichir tous les leads
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-success-light p-3">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <p className="text-xs text-success">
                    Tous les leads sont enrichis
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 pb-2">
            <h2 className="text-base font-semibold leading-none tracking-tight">Actions rapides</h2>
          </div>
          <div className="p-6 pt-4 space-y-2">
            <Button variant="outline" className="w-full justify-start rounded-lg" onClick={handleOpenAddLeads}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter des leads
            </Button>
            <Button variant="outline" className="w-full justify-start rounded-lg" onClick={() => setShowEnrolledLeadsModal(true)}>
              <Users className="mr-2 h-4 w-4" />
              Voir les leads inscrits ({leads.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Enrolled Leads Modal */}
      <Dialog open={showEnrolledLeadsModal} onOpenChange={setShowEnrolledLeadsModal}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Leads inscrits dans la séquence</DialogTitle>
            <DialogDescription>
              {leads.length} lead{leads.length > 1 ? "s" : ""} inscrit{leads.length > 1 ? "s" : ""} — {nodes.length} step{nodes.length > 1 ? "s" : ""} dans la séquence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
            {leads.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Aucun lead inscrit dans cette séquence.
              </p>
            ) : (
              leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{lead.displayName}</p>
                      <Badge variant={
                        lead.status === "active" ? "default" :
                        lead.status === "completed" ? "secondary" :
                        lead.status === "responded" ? "default" :
                        "outline"
                      } className={`text-xs ${
                        lead.status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        lead.status === "completed" ? "bg-blue-100 text-blue-700 border-blue-200" :
                        lead.status === "responded" ? "bg-violet-100 text-violet-700 border-violet-200" :
                        lead.status === "paused" ? "bg-amber-100 text-amber-700 border-amber-200" :
                        "bg-gray-100 text-gray-600 border-gray-200"
                      }`}>
                        {lead.status === "active" ? "Actif" :
                         lead.status === "completed" ? "Terminé" :
                         lead.status === "responded" ? "A répondu" :
                         lead.status === "paused" ? "En pause" :
                         lead.status === "exited" ? "Sorti" : lead.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {lead.title}{lead.company ? ` @ ${lead.company}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Step {lead.currentStep + 1}/{nodes.length}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-2 shrink-0"
                    disabled={removingLeadId === lead.id}
                    onClick={() => handleRemoveLeadFromSequence(lead.id, `${lead.firstName} ${lead.lastName}`)}
                  >
                    {removingLeadId === lead.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnrolledLeadsModal(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Leads Modal */}
      <Dialog open={showAddLeadsModal} onOpenChange={setShowAddLeadsModal}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Ajouter des leads &agrave; la s&eacute;quence</DialogTitle>
            <DialogDescription>
              S&eacute;lectionnez les leads &agrave; ajouter &agrave; cette s&eacute;quence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
            {loadingLeads ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Aucun lead disponible &agrave; ajouter.
              </p>
            ) : (
              allLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-medium">{lead.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.title}{lead.company ? ` @ ${lead.company}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={addingLeadId === lead.id}
                    onClick={() => handleAddLeadToSequence(lead.id, lead)}
                  >
                    {addingLeadId === lead.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLeadsModal(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
