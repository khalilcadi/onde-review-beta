import type { Tables } from "@/types/database";
import type {
  Lead,
  LeadStatus,
  LeadStage,
  LeadEnrichment,
} from "@/types/leads";
import type {
  Action,
  ActionWithLead,
  ActionType,
  ActionStatus,
} from "@/types/actions";
import type {
  Sequence,
  SequenceStep,
  SequenceStats,
  SequenceStatus,
  StepType,
  StepCondition,
  GenerationMode,
} from "@/types/sequences";

// ---- Lead with owner name (for Pipeline) ----

export interface LeadWithOwner extends Lead {
  ownerName: string;
}

// ---- LEADS ----

/** Build a display name from available data, fallback to LinkedIn URL slug */
function buildDisplayName(firstName: string, lastName: string, linkedinUrl?: string): string {
  const full = `${firstName} ${lastName}`.trim();
  if (full) return full;
  // Fallback: extract from LinkedIn URL (e.g. linkedin.com/in/jean-dupont → jean-dupont)
  if (linkedinUrl) {
    const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (match) return match[1].replace(/-/g, " ");
  }
  return "Lead inconnu";
}

export function mapDbLeadToLead(row: Tables<"leads">): Lead {
  const firstName = row.first_name ?? "";
  const lastName = row.last_name ?? "";
  return {
    id: row.id,
    userId: row.user_id,
    firstName,
    lastName,
    displayName: buildDisplayName(firstName, lastName, row.linkedin_url ?? undefined),
    title: row.title ?? undefined,
    company: row.company ?? undefined,
    linkedinUrl: row.linkedin_url ?? "",
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    score: row.score,
    status: row.status as LeadStatus,
    stage: row.stage as LeadStage,
    tags: row.tags ?? [],
    notes: row.notes ?? undefined,
    enrichmentData: (row.enrichment_data as unknown as LeadEnrichment) ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function mapDbLeadToLeadWithOwner(
  row: Tables<"leads"> & {
    profiles: { full_name: string | null } | null;
  }
): LeadWithOwner {
  return {
    ...mapDbLeadToLead(row),
    ownerName: row.profiles?.full_name ?? "Inconnu",
  };
}

// ---- ACTIONS ----

export function mapDbActionToAction(row: Tables<"actions">): Action {
  return {
    id: row.id,
    userId: row.user_id,
    leadId: row.lead_id ?? "",
    sequenceId: row.sequence_id ?? undefined,
    stepId: row.step_id ?? undefined,
    actionType: row.action_type as ActionType,
    status: row.status as ActionStatus,
    generatedMessage: row.generated_message ?? undefined,
    finalMessage: row.final_message ?? undefined,
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : undefined,
    validatedAt: row.validated_at ? new Date(row.validated_at) : undefined,
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
    errorMessage: row.error_message ?? undefined,
    generationReasoning: row.generation_reasoning ?? undefined,
    generationData: row.generation_data ? (row.generation_data as unknown as Action["generationData"]) : undefined,
    createdAt: new Date(row.created_at),
  };
}

type DbActionWithLeadJoin = Tables<"actions"> & {
  leads: Pick<
    Tables<"leads">,
    "id" | "first_name" | "last_name" | "title" | "company" | "linkedin_url" | "score" | "enrichment_data"
  > | null;
};

export function mapDbActionWithLead(row: DbActionWithLeadJoin): ActionWithLead {
  const action = mapDbActionToAction(row);
  const firstName = row.leads?.first_name ?? "";
  const lastName = row.leads?.last_name ?? "";
  return {
    ...action,
    lead: {
      id: row.leads?.id ?? "",
      firstName,
      lastName,
      displayName: buildDisplayName(firstName, lastName, row.leads?.linkedin_url ?? undefined),
      title: row.leads?.title ?? undefined,
      company: row.leads?.company ?? undefined,
      linkedinUrl: row.leads?.linkedin_url ?? "",
      score: row.leads?.score ?? 0,
      hasEnrichment: !!row.leads?.enrichment_data,
    },
  };
}

// ---- SEQUENCES ----

export function mapDbSequenceToSequence(
  row: Tables<"sequences">,
  steps: Tables<"sequence_steps">[]
): Sequence {
  const defaultStats: SequenceStats = {
    totalLeads: 0,
    activeLeads: 0,
    completedLeads: 0,
    responseRate: 0,
    conversionRate: 0,
  };

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    persona: row.persona ?? undefined,
    status: row.status as SequenceStatus,
    stats: (row.stats as unknown as SequenceStats) ?? defaultStats,
    steps: steps
      .sort((a, b) => a.step_order - b.step_order)
      .map(mapDbStepToStep),
    createdAt: new Date(row.created_at),
  };
}

export function mapDbStepToStep(row: Tables<"sequence_steps">): SequenceStep {
  let condition: StepCondition | undefined;
  if (row.condition) {
    try {
      condition = JSON.parse(row.condition) as StepCondition;
    } catch {
      condition = undefined;
    }
  }

  return {
    id: row.id,
    sequenceId: row.sequence_id,
    stepType: row.step_type as StepType,
    delayDays: row.delay_days,
    generationMode: (row.generation_mode as GenerationMode) || "ai",
    template: row.template ?? undefined,
    condition,
    stepOrder: row.step_order,
  };
}
