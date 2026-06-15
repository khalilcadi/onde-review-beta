/**
 * Scheduling engine — Session I
 *
 * Calculates scheduled_at timestamps with:
 * - Non-uniform distribution (bursts of 2-3 actions, then gaps)
 * - Anti-detection delay compliance (DECISIONS.md §3.7)
 * - Daily quota enforcement
 * - Working hours constraint (9h-19h, configurable timezone)
 */

import { getRequiredDelay, DEFAULT_SETTINGS, WARMUP_SCHEDULE } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserSchedulingSettings {
  startHour: number;
  endHour: number;
  activeDays: readonly string[];
  timezone: string;
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
  dailyInvitationsLimit: number;
  dailyMessagesLimit: number;
  dailyVisitsLimit: number;
}

export interface QuotaCounts {
  invitations: number;
  messages: number;
  visits: number;
}

interface ScheduleInput {
  id: string;
  actionType: string;
}

interface ScheduleResult {
  scheduled: Array<{ id: string; scheduledAt: Date }>;
  rejected: Array<{ id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Action reordering — minimize slow transitions
// ---------------------------------------------------------------------------

/**
 * Reorders actions to minimize the number of "slow" transitions (15-min floor)
 * by clustering actions optimally before scheduling.
 *
 * Strategy:
 * 1. Build a V↔I alternating chain (every transition is fast: 1-3 min)
 * 2. Append leftover visits OR invitations (whichever side has more)
 * 3. Append all messages/inmails as a single cluster at the end
 *    (this incurs ONE slow boundary transition instead of 2 per scattered message)
 *
 * Rationale: each message placed in the middle of a V/I chain creates TWO slow
 * transitions (in and out). Clustering messages at the end means only ONE
 * VI→M boundary is slow — the M→M chain inside the cluster is unavoidable
 * regardless of position.
 *
 * Math: for N messages,
 *   - Distributed: ~2N slow transitions
 *   - Clustered:   1 boundary + (N-1) intra-cluster = N slow transitions
 *
 * Single-action and 2-action inputs are returned as-is (no opportunity).
 */
export function reorderForOptimalChaining<T extends { actionType: string }>(
  actions: T[]
): T[] {
  if (actions.length <= 1) return actions;

  const visits: T[] = [];
  const invits: T[] = [];
  const messages: T[] = [];
  const others: T[] = [];

  for (const a of actions) {
    if (a.actionType === "visit") visits.push(a);
    else if (a.actionType === "invitation") invits.push(a);
    else if (a.actionType === "message" || a.actionType === "inmail") {
      messages.push(a);
    } else {
      others.push(a);
    }
  }

  const result: T[] = [];

  // 1. Build V↔I alternating chain (maximizes fast transitions)
  while (visits.length && invits.length) {
    result.push(visits.shift()!);
    result.push(invits.shift()!);
  }

  // 2. Append whichever side has leftovers (V→V or I→I will be slow,
  //    but unavoidable since the other bucket is empty)
  result.push(...visits, ...invits);

  // 3. Append messages as a single cluster (1 boundary penalty vs 2N scattered)
  result.push(...messages);

  // 4. Append unknown types (whatsapp, email, etc.) as-is
  result.push(...others);

  return result;
}

// ---------------------------------------------------------------------------
// Main scheduling function
// ---------------------------------------------------------------------------

/**
 * Calculate scheduled_at for a batch of actions.
 * Non-uniform distribution: bursts of 2-3 actions clustered together,
 * then longer gaps between bursts.
 *
 * Actions are reordered internally via reorderForOptimalChaining() to
 * minimize the number of slow anti-detection transitions. The output
 * preserves IDs so callers can map results back regardless of order.
 */
export function calculateSchedule(
  actions: ScheduleInput[],
  existingScheduled: Array<{ actionType: string; scheduledAt: Date }>,
  settings: UserSchedulingSettings,
  todayQuotaUsed: QuotaCounts
): ScheduleResult {
  const scheduled: ScheduleResult["scheduled"] = [];
  const rejected: ScheduleResult["rejected"] = [];

  // Running quota tracker
  const runningQuota = { ...todayQuotaUsed };

  // Find the last scheduled action (for anti-detection baseline)
  let lastScheduledAt = 0;
  let lastActionType = "message";

  if (existingScheduled.length > 0) {
    const sorted = [...existingScheduled].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );
    const last = sorted[sorted.length - 1];
    lastScheduledAt = last.scheduledAt.getTime();
    lastActionType = last.actionType;
  }

  // Burst pattern state
  let burstSize = randomInt(2, 3);
  let burstCounter = 0;

  const now = Date.now();
  const todayStart = getTodayWindowStart(settings);
  let windowEnd = getTodayWindowEnd(settings);

  // Start from the latest of: now, last scheduled + delay, or today's window start
  let cursor = Math.max(now, lastScheduledAt, todayStart);

  // Reorder actions for optimal chaining BEFORE iterating
  const orderedActions = reorderForOptimalChaining(actions);

  for (const action of orderedActions) {
    // 1. Check quota
    const quotaKey = getQuotaKey(action.actionType);
    const limit = getQuotaLimit(quotaKey, settings);
    if (runningQuota[quotaKey] >= limit) {
      rejected.push({ id: action.id, reason: `Quota ${quotaKey} dépassé (${limit}/jour)` });
      continue;
    }

    // 2. Calculate interval (non-uniform burst pattern)
    let intervalMs: number;
    if (burstCounter < burstSize) {
      // In-burst: tight cluster
      const minMs = settings.intervalMinSeconds * 1000;
      intervalMs = minMs + Math.random() * (minMs * 0.5);
      burstCounter++;
    } else {
      // Between bursts: longer gap
      const maxMs = settings.intervalMaxSeconds * 1000;
      intervalMs = maxMs * 3 + Math.random() * (maxMs * 2);
      burstCounter = 0;
      burstSize = randomInt(2, 3);
    }

    // 3. Anti-detection floor
    const antiDetectionMs = getRequiredDelay(lastActionType, action.actionType);
    intervalMs = Math.max(intervalMs, antiDetectionMs);

    // 4. Calculate timestamp
    let scheduledAt = cursor + intervalMs;

    // 5. Clamp to working hours
    if (scheduledAt > windowEnd) {
      // Roll to next active day
      const nextStart = getNextActiveDayStart(settings);
      if (nextStart) {
        // Add small random jitter to start of next day (0-15 min)
        scheduledAt = nextStart + Math.random() * 15 * 60 * 1000;
        // Update window end to match the rolled-over day so subsequent
        // actions in the same batch compare against the correct end-of-day
        const workingHoursMs = (settings.endHour - settings.startHour) * 60 * 60 * 1000;
        windowEnd = nextStart + workingHoursMs;
      } else {
        // No more active days this week — reject
        rejected.push({ id: action.id, reason: "Hors plage horaire active" });
        continue;
      }
    }

    // Ensure we don't schedule before the window start
    if (scheduledAt < todayStart && scheduledAt > now) {
      scheduledAt = todayStart + Math.random() * 5 * 60 * 1000;
    }

    scheduled.push({ id: action.id, scheduledAt: new Date(scheduledAt) });

    // Update tracking
    cursor = scheduledAt;
    lastActionType = action.actionType;
    runningQuota[quotaKey]++;
  }

  return { scheduled, rejected };
}

// ---------------------------------------------------------------------------
// Timezone & working hours helpers
// ---------------------------------------------------------------------------

/**
 * Check if today is an active day for the given settings.
 */
export function isActiveDay(
  activeDays: readonly string[],
  timezone: string
): boolean {
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  });
  const dayStr = formatter.format(now).toLowerCase().slice(0, 3);
  return activeDays.includes(dayStr) || activeDays.includes(dayNames[new Date().getDay()]);
}

/**
 * Check if the current time is within working hours in the given timezone.
 */
export function isWithinWorkingHours(
  startHour: number,
  endHour: number,
  timezone: string
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  const currentHour = parseInt(formatter.format(now), 10);
  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Get the start of today's working window as a Unix timestamp.
 */
function getTodayWindowStart(settings: UserSchedulingSettings): number {
  return getTimestampForHour(settings.startHour, settings.timezone);
}

/**
 * Get the end of today's working window as a Unix timestamp.
 */
function getTodayWindowEnd(settings: UserSchedulingSettings): number {
  return getTimestampForHour(settings.endHour, settings.timezone);
}

/**
 * Convert a given hour (in the user's timezone) to a UTC timestamp for today.
 */
function getTimestampForHour(hour: number, timezone: string): number {
  const now = new Date();
  // Format today's date in the target timezone
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  });
  const dateStr = dateFormatter.format(now); // YYYY-MM-DD

  // Create a date string in the target timezone and convert to UTC
  // Use a temporary date to calculate the UTC offset
  const tempDate = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`);

  // Get the offset by comparing formatted hour with UTC hour
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });

  // Simple approach: set hours in local representation
  const targetDate = new Date(now);
  const currentTzHour = parseInt(utcFormatter.format(now), 10);
  const utcHour = now.getUTCHours();
  const offset = currentTzHour - utcHour; // timezone offset in hours

  targetDate.setUTCHours(hour - offset, 0, 0, 0);
  return targetDate.getTime();
}

/**
 * Get the start timestamp of the next active working day.
 * Returns null if no active day found in next 7 days.
 */
function getNextActiveDayStart(
  settings: UserSchedulingSettings
): number | null {
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dayName = dayNames[futureDate.getDay()];
    if (settings.activeDays.includes(dayName)) {
      // Return start hour of that day
      const dateFormatter = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: settings.timezone,
      });
      const dateStr = dateFormatter.format(futureDate);
      const utcFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: settings.timezone,
      });
      const currentTzHour = parseInt(utcFormatter.format(new Date()), 10);
      const utcHour = new Date().getUTCHours();
      const offset = currentTzHour - utcHour;

      const targetDate = new Date(`${dateStr}T00:00:00Z`);
      targetDate.setUTCHours(settings.startHour - offset, 0, 0, 0);
      return targetDate.getTime();
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Quota helpers
// ---------------------------------------------------------------------------

type QuotaKey = keyof QuotaCounts;

function getQuotaKey(actionType: string): QuotaKey {
  switch (actionType) {
    case "invitation":
      return "invitations";
    case "visit":
      return "visits";
    default:
      return "messages"; // message, inmail, etc.
  }
}

function getQuotaLimit(key: QuotaKey, settings: UserSchedulingSettings): number {
  switch (key) {
    case "invitations":
      return settings.dailyInvitationsLimit;
    case "visits":
      return settings.dailyVisitsLimit;
    case "messages":
      return settings.dailyMessagesLimit;
  }
}

/**
 * Count how many actions have been sent/validated today for each type.
 */
export async function getTodayQuotaCounts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<QuotaCounts> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: actions } = await supabase
    .from("actions")
    .select("action_type, status")
    .eq("user_id", userId)
    .in("status", ["sent", "validated"])
    .gte("created_at", today.toISOString())
    .lt("created_at", tomorrow.toISOString());

  const list = actions ?? [];

  return {
    invitations: list.filter((a) => a.action_type === "invitation").length,
    messages: list.filter(
      (a) => a.action_type === "message" || a.action_type === "inmail"
    ).length,
    visits: list.filter((a) => a.action_type === "visit").length,
  };
}

/**
 * Load user settings merged with defaults, formatted for the scheduling engine.
 */
export async function loadUserSchedulingSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserSchedulingSettings> {
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  const s = (settingsRow?.settings ?? {}) as Record<string, unknown>;

  const settings: UserSchedulingSettings = {
    startHour: (s.start_hour as number) ?? DEFAULT_SETTINGS.start_hour,
    endHour: (s.end_hour as number) ?? DEFAULT_SETTINGS.end_hour,
    activeDays:
      (s.active_days as string[]) ?? DEFAULT_SETTINGS.active_days,
    timezone: (s.timezone as string) || DEFAULT_SETTINGS.timezone,
    intervalMinSeconds:
      (s.interval_min_seconds as number) ??
      DEFAULT_SETTINGS.interval_min_seconds,
    intervalMaxSeconds:
      (s.interval_max_seconds as number) ??
      DEFAULT_SETTINGS.interval_max_seconds,
    dailyInvitationsLimit:
      (s.daily_invitations_limit as number) ??
      DEFAULT_SETTINGS.daily_invitations_limit,
    dailyMessagesLimit:
      (s.daily_messages_limit as number) ??
      DEFAULT_SETTINGS.daily_messages_limit,
    dailyVisitsLimit:
      (s.daily_visits_limit as number) ??
      DEFAULT_SETTINGS.daily_visits_limit,
  };

  // Apply warm-up caps if the LinkedIn account has warmup_start_date set
  const { data: linkedinAccount } = await supabase
    .from("linkedin_accounts")
    .select("warmup_start_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (linkedinAccount?.warmup_start_date) {
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(linkedinAccount.warmup_start_date).getTime()) /
        (24 * 60 * 60 * 1000)
    );

    // Find the matching warm-up tier (day 0 = first day)
    const warmupTier = WARMUP_SCHEDULE.find((t) => accountAgeDays <= t.maxDay);
    if (warmupTier) {
      settings.dailyInvitationsLimit = Math.min(
        settings.dailyInvitationsLimit,
        warmupTier.invitations
      );
      settings.dailyMessagesLimit = Math.min(
        settings.dailyMessagesLimit,
        warmupTier.messages
      );
      settings.dailyVisitsLimit = Math.min(
        settings.dailyVisitsLimit,
        warmupTier.visits
      );
    }
  }

  return settings;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
