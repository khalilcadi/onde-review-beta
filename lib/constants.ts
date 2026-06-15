// Warm-up schedule: progressive quota ramp for new LinkedIn accounts
// Applied when linkedin_accounts.warmup_start_date is set (non-null)
export const WARMUP_SCHEDULE = [
  { maxDay: 2, invitations: 5, messages: 8, visits: 10 },
  { maxDay: 5, invitations: 10, messages: 15, visits: 18 },
] as const;

export const DEFAULT_SETTINGS = {
  // Quotas LinkedIn (steady state)
  daily_invitations_limit: 18,
  daily_messages_limit: 25,
  daily_visits_limit: 25,
  pause_on_quota: true,
  quota_alert_threshold: 80,

  // Intervalles anti-détection
  interval_min_seconds: 120, // 2 min
  interval_max_seconds: 480, // 8 min
  randomize_intervals: true,

  // Horaires
  active_days: ["mon", "tue", "wed", "thu", "fri"] as const,
  start_hour: 9,
  end_hour: 19,
  timezone: "Europe/Paris",
  daily_generation_hour: 6,

  // IA
  ai_provider: "claude" as const,
  ai_model: "claude-opus-4-6",
  default_model: "claude-opus-4-6", // legacy alias
  temperature: 0.7,
  max_message_length: 1500,
  language: "fr",

  // Notifications
  notify_new_response: "immediate" as const,
  notify_hot_lead: true,
  hot_lead_threshold: 70,
  daily_recap: true,
  daily_recap_hour: 18,
};

export const LEAD_STATUSES = {
  cold: { label: "Froid", color: "secondary" },
  warm: { label: "Tiède", color: "warning" },
  hot: { label: "Chaud", color: "destructive" },
  converted: { label: "Converti", color: "success" },
  lost: { label: "Perdu", color: "secondary" },
} as const;

export const LEAD_STAGES = {
  to_invite: { label: "À inviter", order: 1 },
  invited: { label: "Invitation envoyée", order: 2 },
  connected: { label: "Connecté", order: 3 },
  in_sequence: { label: "En séquence", order: 4 },
  responded: { label: "A répondu", order: 5 },
  meeting: { label: "RDV planifié", order: 6 },
  closed: { label: "Fermé", order: 7 },
} as const;

export const SIGNAL_TYPES = {
  INBOUND: { label: "Inbound", color: "default" as const, source: "system" },
  POST_DOULEUR: { label: "Post Douleur", color: "destructive" as const, source: "system" },
  POST_SUJET: { label: "Post Sujet", color: "default" as const, source: "system" },
  ACTUALITE: { label: "Actualit\u00e9", color: "warning" as const, source: "system" },
  SIGNAL_FAIBLE: { label: "Signal Faible", color: "secondary" as const, source: "system" },
  FROID: { label: "Froid", color: "secondary" as const, source: "system" },
  ENGAGEMENT_KEYWORD: { label: "Keyword", color: "accent" as const, source: "gojiberry" },
  ENGAGEMENT_EXPERT: { label: "Expert", color: "default" as const, source: "gojiberry" },
  NEW_ROLE: { label: "Nouveau poste", color: "warning" as const, source: "gojiberry" },
  ICP_TOP_ACTIVE: { label: "Top 5% Actif", color: "secondary" as const, source: "gojiberry" },
  COMPETITOR_ENGAGEMENT: { label: "Concurrent", color: "destructive" as const, source: "gojiberry" },
} as const;

export const ACTION_TYPES = {
  visit: { label: "Visite profil", icon: "Eye" },
  invitation: { label: "Invitation", icon: "UserPlus" },
  message: { label: "Message", icon: "MessageSquare" },
  inmail: { label: "InMail", icon: "Mail" },
  whatsapp: { label: "WhatsApp", icon: "Phone" },
  email: { label: "Email", icon: "AtSign" },
} as const;

export const ACTION_STATUSES = {
  pending: { label: "En attente", color: "secondary" },
  validated: { label: "Validé", color: "accent" },
  processing: { label: "En cours", color: "secondary" },
  sent: { label: "Envoyé", color: "success" },
  failed: { label: "Échoué", color: "destructive" },
  cancelled: { label: "Annulé", color: "secondary" },
} as const;

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/actions", label: "Actions du jour", icon: "CheckSquare" },
  { href: "/pipeline", label: "Pipeline", icon: "Users" },
  { href: "/sequences", label: "Séquences", icon: "GitBranch" },
  { href: "/lists", label: "Listes", icon: "List" },
  { href: "/inbox", label: "Inbox", icon: "Inbox" },
  { href: "/cockpit", label: "Cockpit IA", icon: "Bot" },
] as const;

export const SETTINGS_NAV_ITEMS = [
  { href: "/settings", label: "Général", icon: "Settings" },
  { href: "/settings/api-keys", label: "Clés API", icon: "Key" },
  { href: "/settings/prompts", label: "Prompts IA", icon: "FileText" },
  { href: "/settings/usage", label: "Usage IA", icon: "BarChart3" },
  { href: "/settings/team", label: "Équipe", icon: "Users" },
] as const;

// =============================================================================
// Status → Badge variant mapping
// =============================================================================

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "accent";

export function getLeadStatusBadge(status: string): {
  label: string;
  variant: BadgeVariant;
} {
  const entry = LEAD_STATUSES[status as keyof typeof LEAD_STATUSES];
  return entry
    ? { label: entry.label, variant: entry.color as BadgeVariant }
    : { label: status, variant: "secondary" };
}

export function getActionStatusBadge(status: string): {
  label: string;
  variant: BadgeVariant;
} {
  const entry = ACTION_STATUSES[status as keyof typeof ACTION_STATUSES];
  return entry
    ? { label: entry.label, variant: entry.color as BadgeVariant }
    : { label: status, variant: "secondary" };
}

// =============================================================================
// Scoring thresholds (aligned with scoring prompt v4.2)
// =============================================================================

export const SCORING_THRESHOLDS = {
  HOT: 70,
  WARM: 45,
  COLD: 25,
} as const;

export const SCORING_CATEGORIES = {
  HOT: { label: "Hot", minScore: 70, action: "Contact sous 24h" },
  WARM: { label: "Warm", minScore: 45, action: "Contact cette semaine" },
  COLD: { label: "Cold", minScore: 25, action: "Nurturing uniquement" },
  NO_GO: { label: "No Go", minScore: 0, action: "Archiver" },
} as const;

export const MESSAGE_LIMITS = {
  prospect: 300,
  connected: 500,
} as const;

export const TONE_RULES = {
  default: "vouvoiement",
  override: "Tutoiement uniquement si Notes ou Tags l'indiquent explicitement",
} as const;

// =============================================================================
// Anti-detection LinkedIn (DECISIONS.md §3.7)
// =============================================================================
//
// All delays are now expressed as { min, max } ranges.
// getRequiredDelay() picks a uniform random value inside the range — no
// extra jitter on top, so the range itself defines the full spread.
//
// Tuning rationale (vs. industry benchmarks Lemlist/Waalaxy/HeyReach):
//   - V→V, I→I, M→V, M→I       : 4-8 min  (very human, scrolling/clicking)
//   - V→M, I→M, M→M             : 8-18 min (writing a message takes time)
//   - V↔I (paired)              : 1-3 min  (natural human gesture)
//   - inmail is normalized → treated as message
//
// All transitions are still way more conservative than Lemlist (30s-2 min)
// or Waalaxy (1-3 min). LinkedIn detects volume/h and volume/day, not the
// exact interval between two consecutive actions.

type DelayValue = { min: number; max: number };

const MIN = 60_000;

export const ANTI_DETECTION_DELAYS: Record<string, DelayValue> = {
  // Message-heavy transitions (writing takes time): 8-18 min
  message_to_message:    { min: 8 * MIN,  max: 18 * MIN },
  visit_to_message:      { min: 8 * MIN,  max: 18 * MIN },
  invitation_to_message: { min: 8 * MIN,  max: 18 * MIN },

  // After a message, scrolling/clicking is faster: 4-8 min
  message_to_visit:      { min: 4 * MIN,  max: 8 * MIN },
  message_to_invitation: { min: 4 * MIN,  max: 8 * MIN },

  // Same-type loops (browsing pattern): 4-8 min
  visit_to_visit:           { min: 4 * MIN,  max: 8 * MIN },
  invitation_to_invitation: { min: 4 * MIN,  max: 8 * MIN },

  // Visit ↔ invitation: natural human gesture, kept at 1-3 min
  visit_to_invitation: { min: 1 * MIN, max: 3 * MIN },
  invitation_to_visit: { min: 1 * MIN, max: 3 * MIN },
};

/** Fallback delay for unknown action-type pairs (conservative). */
const DEFAULT_DELAY: DelayValue = { min: 8 * MIN, max: 18 * MIN };

/**
 * Normalize action types: inmail behaves like message for anti-detection
 * (both are written/sent and trigger LinkedIn's messaging surveillance).
 */
function normalizeActionType(type: string): string {
  return type === "inmail" ? "message" : type;
}

export function getRequiredDelay(
  lastActionType: string,
  newActionType: string
): number {
  const last = normalizeActionType(lastActionType);
  const next = normalizeActionType(newActionType);
  const key = `${last}_to_${next}`;
  const delay = ANTI_DETECTION_DELAYS[key] ?? DEFAULT_DELAY;
  return delay.min + Math.random() * (delay.max - delay.min);
}
