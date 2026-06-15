export interface M1GenerationData {
  variante_a: { message: string; angle: string };
  variante_b: { message: string; angle: string };
  canal: "linkedin" | "email" | "none";
  canal_recommande: "linkedin" | "email";
  persona: string;
  reasoning: string;
}

export interface M2GenerationData {
  message: string;
  objet: string | null;
  type: "reponse" | "relance" | "dernier_message";
  canal: "linkedin" | "email";
  ton: "direct" | "empathique" | "leger";
  reasoning: string;
}

export interface Action {
  id: string;
  userId: string;
  leadId: string;
  sequenceId?: string;
  stepId?: string;
  actionType: ActionType;
  status: ActionStatus;
  generatedMessage?: string;
  finalMessage?: string;
  scheduledAt?: Date;
  validatedAt?: Date;
  sentAt?: Date;
  errorMessage?: string;
  generationReasoning?: string;
  generationData?: M1GenerationData | M2GenerationData | null;
  createdAt: Date;
}

export type ActionType =
  | "visit"
  | "invitation"
  | "message"
  | "inmail"
  | "whatsapp"
  | "email";

export type ActionStatus =
  | "pending"
  | "validated"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "email_recommended";

export interface ActionWithLead extends Action {
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    title?: string;
    company?: string;
    linkedinUrl: string;
    score: number;
    hasEnrichment: boolean;
  };
}

export interface DailyActionsStats {
  total: number;
  pending: number;
  validated: number;
  sent: number;
  failed: number;
}

export interface QuotaUsage {
  invitations: {
    used: number;
    limit: number;
  };
  messages: {
    used: number;
    limit: number;
  };
  visits: {
    used: number;
    limit: number;
  };
}
