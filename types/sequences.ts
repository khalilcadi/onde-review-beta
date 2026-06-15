export interface Sequence {
  id: string;
  userId: string;
  name: string;
  persona?: string;
  status: SequenceStatus;
  stats: SequenceStats;
  steps: SequenceStep[];
  createdAt: Date;
}

export type SequenceStatus = "active" | "paused" | "draft" | "archived";

export interface SequenceStats {
  totalLeads: number;
  activeLeads: number;
  completedLeads: number;
  responseRate: number;
  conversionRate: number;
}

export type GenerationMode = "ai" | "template";

export interface SequenceStep {
  id: string;
  sequenceId: string;
  stepType: StepType;
  delayDays: number;
  generationMode: GenerationMode;
  template?: string;
  condition?: StepCondition;
  stepOrder: number;
}

export type StepType =
  | "visit"
  | "invitation"
  | "message"
  | "inmail"
  | "whatsapp"
  | "email";

export interface StepCondition {
  type: StepConditionType;
  label: string;
}

export type StepConditionType =
  | "always"
  | "invitation_accepted"
  | "message_replied"
  | "message_read"
  | "profile_visited";

export interface SequenceLead {
  id: string;
  sequenceId: string;
  leadId: string;
  currentStep: number;
  status: SequenceLeadStatus;
  enteredAt: Date;
}

export type SequenceLeadStatus =
  | "active"
  | "paused"
  | "completed"
  | "responded"
  | "exited";
