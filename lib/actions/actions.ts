// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type {
  ActionWithLead,
  DailyActionsStats,
  QuotaUsage,
} from "@/types/actions";
import type { UpdateTables } from "@/types/database";
import { mapDbActionWithLead } from "@/lib/mappers";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import {
  calculateSchedule,
  loadUserSchedulingSettings,
  getTodayQuotaCounts,
} from "@/lib/scheduling";
import { headers } from "next/headers";

export async function getTodayActions(): Promise<
  ActionResult<{
    actions: ActionWithLead[];
    stats: DailyActionsStats;
    quotas: QuotaUsage;
  }>
> {
  try {
    const { supabase, user } = await getAuthUser();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const selectFields =
      "*, leads(id, first_name, last_name, title, company, linkedin_url, score, enrichment_data)";

    // 1. Today's actions (all statuses)
    const { data: todayData, error: todayError } = await supabase
      .from("actions")
      .select(selectFields)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .order("created_at", { ascending: true });

    if (todayError) throw todayError;

    // 2. Carried-over actionable actions from the last 7 days
    //    (pending/validated/email_recommended that were created before today)
    const { data: carryOverData, error: carryOverError } = await supabase
      .from("actions")
      .select(selectFields)
      .in("status", ["pending", "validated", "email_recommended"])
      .gte("created_at", sevenDaysAgo.toISOString())
      .lt("created_at", today.toISOString())
      .order("created_at", { ascending: true });

    if (carryOverError) throw carryOverError;

    // Merge: carry-over first (older, more urgent), then today's
    const allData = [...(carryOverData ?? []), ...(todayData ?? [])];

    const actions = allData.map((row) =>
      mapDbActionWithLead(
        row as Parameters<typeof mapDbActionWithLead>[0]
      )
    );

    const stats: DailyActionsStats = {
      total: actions.length,
      pending: actions.filter((a) => a.status === "pending").length,
      validated: actions.filter((a) => a.status === "validated").length,
      sent: actions.filter((a) => a.status === "sent").length,
      failed: actions.filter((a) => a.status === "failed").length,
    };

    // Quotas must remain today-only to avoid inflating with carried-over actions
    const settings = await loadUserSchedulingSettings(supabase, user.id);
    const todayQuotaCounts = await getTodayQuotaCounts(supabase, user.id);
    const quotas: QuotaUsage = {
      invitations: {
        used: todayQuotaCounts.invitations,
        limit: settings.dailyInvitationsLimit,
      },
      messages: {
        used: todayQuotaCounts.messages,
        limit: settings.dailyMessagesLimit,
      },
      visits: {
        used: todayQuotaCounts.visits,
        limit: settings.dailyVisitsLimit,
      },
    };

    return { success: true, data: { actions, stats, quotas } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function validateAction(
  actionId: string,
  finalMessage?: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    // Load the action to get its type
    const { data: action } = await supabase
      .from("actions")
      .select("action_type")
      .eq("id", actionId)
      .single();

    if (!action) throw new Error("Action introuvable");

    // Calculate scheduled_at with non-uniform distribution
    const settings = await loadUserSchedulingSettings(supabase, user.id);
    const todayQuotas = await getTodayQuotaCounts(supabase, user.id);

    // Get existing validated + sent actions for scheduling baseline
    // Include "sent" so the scheduler knows about recently-sent actions
    // and doesn't schedule new ones too close (anti-detection)
    const { data: existingActions } = await supabase
      .from("actions")
      .select("action_type, scheduled_at, sent_at, status")
      .eq("user_id", user.id)
      .in("status", ["validated", "sent"])
      .not("scheduled_at", "is", null);

    const existingScheduled = (existingActions ?? [])
      .filter((a) => a.scheduled_at)
      .map((a) => ({
        actionType: a.action_type,
        scheduledAt: new Date(a.status === "sent" && a.sent_at ? a.sent_at : a.scheduled_at!),
      }));

    const { scheduled, rejected } = calculateSchedule(
      [{ id: actionId, actionType: action.action_type }],
      existingScheduled,
      settings,
      todayQuotas
    );

    if (rejected.length > 0) {
      return { success: false, error: rejected[0].reason };
    }

    const scheduledAt = scheduled[0].scheduledAt.toISOString();

    const updates: UpdateTables<"actions"> = {
      status: "validated",
      validated_at: new Date().toISOString(),
      scheduled_at: scheduledAt,
      ...(finalMessage !== undefined ? { final_message: finalMessage } : {}),
    };

    const { error } = await supabase
      .from("actions")
      .update(updates as never)
      .eq("id", actionId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Batch-validate multiple actions in a single server call.
 * Scheduling is computed sequentially so each action sees the previous ones.
 */
export async function validateActions(
  actionIds: string[]
): Promise<ActionResult<{ validated: number; failed: number }>> {
  try {
    const { supabase, user } = await getAuthUser();

    if (!actionIds.length) return { success: true, data: { validated: 0, failed: 0 } };

    // Load actions to validate
    const { data: actionsToValidate } = await supabase
      .from("actions")
      .select("id, action_type, status")
      .in("id", actionIds)
      .eq("status", "pending");

    if (!actionsToValidate?.length) {
      return { success: true, data: { validated: 0, failed: 0 } };
    }

    // Load settings + quotas once
    const settings = await loadUserSchedulingSettings(supabase, user.id);
    const todayQuotas = await getTodayQuotaCounts(supabase, user.id);

    // Get already-validated + sent actions for scheduling baseline
    // Include "sent" so the scheduler respects anti-detection delays vs recent sends
    const { data: existingActions } = await supabase
      .from("actions")
      .select("action_type, scheduled_at, sent_at, status")
      .eq("user_id", user.id)
      .in("status", ["validated", "sent"])
      .not("scheduled_at", "is", null);

    const existingScheduled = (existingActions ?? [])
      .filter((a) => a.scheduled_at)
      .map((a) => ({
        actionType: a.action_type,
        scheduledAt: new Date(a.status === "sent" && a.sent_at ? a.sent_at : a.scheduled_at!),
      }));

    // Compute schedule for ALL actions at once (sequential awareness)
    const scheduleInputs = actionsToValidate.map((a) => ({
      id: a.id,
      actionType: a.action_type,
    }));

    const { scheduled, rejected } = calculateSchedule(
      scheduleInputs,
      existingScheduled,
      settings,
      todayQuotas
    );

    const now = new Date().toISOString();
    let validated = 0;
    let failed = rejected.length;

    // Batch update all scheduled actions
    for (const s of scheduled) {
      const { error } = await supabase
        .from("actions")
        .update({
          status: "validated",
          validated_at: now,
          scheduled_at: s.scheduledAt.toISOString(),
        } as never)
        .eq("id", s.id);

      if (error) {
        failed++;
      } else {
        validated++;
      }
    }

    return { success: true, data: { validated, failed } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function cancelAction(actionId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    // Guard: cannot cancel already sent or processing actions
    const { data: current } = await supabase
      .from("actions")
      .select("status")
      .eq("id", actionId)
      .single();

    if (current?.status === "sent" || current?.status === "processing") {
      return {
        success: false,
        error: "Impossible d\u2019annuler une action d\u00e9j\u00e0 envoy\u00e9e ou en cours d\u2019envoi",
      };
    }

    const { error } = await supabase
      .from("actions")
      .update({ status: "cancelled" } as never)
      .eq("id", actionId);
    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function rescheduleAction(
  actionId: string,
  newDate: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    // Guard: only pending or failed actions can be rescheduled
    const { data: current } = await supabase
      .from("actions")
      .select("status")
      .eq("id", actionId)
      .single();

    if (current?.status !== "pending" && current?.status !== "failed") {
      return {
        success: false,
        error: "Seules les actions en attente ou \u00e9chou\u00e9es peuvent \u00eatre reprogramm\u00e9es",
      };
    }

    const scheduledAt = new Date(newDate);
    scheduledAt.setHours(9, 0, 0, 0); // Default to 9h on the target day

    const { error } = await supabase
      .from("actions")
      .update({
        scheduled_at: scheduledAt.toISOString(),
        status: "pending",
      } as never)
      .eq("id", actionId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getLeadHistory(
  leadId: string
): Promise<ActionResult<ActionWithLead[]>> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase
      .from("actions")
      .select(
        "*, leads(id, first_name, last_name, title, company, linkedin_url, score, enrichment_data)"
      )
      .eq("lead_id", leadId)
      .in("status", ["sent", "failed"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: (data ?? []).map((row) =>
        mapDbActionWithLead(
          row as Parameters<typeof mapDbActionWithLead>[0]
        )
      ),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Manually trigger the generate-actions cron for all users.
 * Useful when actions haven't been generated yet (e.g. sequence launched after
 * the morning cron ran, or cron didn't execute).
 */
export async function triggerGenerateActions(): Promise<
  ActionResult<{ generated: number }>
> {
  try {
    await getAuthUser(); // Auth guard

    const cronSecret = process.env.CRON_SECRET;

    // Build absolute URL from the incoming request headers
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const proto = headersList.get("x-forwarded-proto") || "http";
    const baseUrl = `${proto}://${host}`;

    const res = await fetch(`${baseUrl}/api/crons/generate-actions`, {
      method: "GET",
      headers: {
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cron returned ${res.status}: ${body}`);
    }

    const data = await res.json();
    const totalGenerated =
      data.results?.reduce(
        (s: number, r: { generated: number }) => s + r.generated,
        0
      ) ?? 0;

    return { success: true, data: { generated: totalGenerated } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
