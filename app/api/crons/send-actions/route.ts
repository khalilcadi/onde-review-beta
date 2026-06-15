/**
 * GET /api/crons/send-actions
 *
 * Send cron (every 2 min during working hours) — sends validated actions via Unipile.
 * Queries actions with status='validated' AND scheduled_at <= now(),
 * checks anti-detection delays, executes via Unipile, and advances sequence steps.
 *
 * Vercel cron schedule: every 2 min, 7-19 UTC, weekdays (covers CET/CEST)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getUnipileClient,
  extractLinkedInIdentifier,
  UnipileApiError,
} from "@/lib/unipile/client";
import {
  executeLinkedInAction,
  markActionFailed,
  advanceSequenceStep,
} from "@/lib/unipile/execute";
import { getRequiredDelay } from "@/lib/constants";
import { isWithinWorkingHours, loadUserSchedulingSettings } from "@/lib/scheduling";

export const maxDuration = 60; // 1 min for send cron

// ---------------------------------------------------------------------------
// CRON_SECRET verification
// ---------------------------------------------------------------------------

function verifyCronSecret(req: NextRequest): Response | null {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[Send Cron] CRON_SECRET not configured");
    return null; // Allow in dev without secret
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  // Patch 4 — Jitter d'exécution : 0–30s aléatoire pour casser l'empreinte "toutes les 2 min"
  const jitterMs = Math.floor(Math.random() * 30_000);
  await new Promise((resolve) => setTimeout(resolve, jitterMs));

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Recovery: reset orphaned 'processing' actions older than 10 minutes back to 'validated'
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: orphanedRows } = await supabase
      .from("actions")
      .select("id")
      .eq("status", "processing")
      .lt("created_at", tenMinutesAgo);

    if (orphanedRows?.length) {
      const orphanIds = orphanedRows.map((r) => r.id);
      await supabase
        .from("actions")
        .update({ status: "validated" } as never)
        .in("id", orphanIds);
      console.log(
        `[Send Cron] Recovered ${orphanIds.length} orphaned processing actions`
      );
    }

    // Patch 1 — Lock atomique : select then update to 'processing' before execution.
    // Step 1: Find validated actions ready to send
    const { data: readyActions, error: selectError } = await supabase
      .from("actions")
      .select(
        "id, user_id, lead_id, action_type, status, generated_message, final_message, sequence_id, step_id, scheduled_at, retry_count"
      )
      .eq("status", "validated")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (selectError) throw selectError;

    // Step 2: Lock them by updating to 'processing'
    const actionIds = (readyActions ?? []).map((a) => a.id);
    if (actionIds.length > 0) {
      await supabase
        .from("actions")
        .update({ status: "processing" } as never)
        .in("id", actionIds);
    }

    const actions = readyActions;
    const error = selectError;

    if (!actions?.length) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 0,
        failed: 0,
        message: "No actions ready to send",
      });
    }

    // Group actions by user_id
    const actionsByUser: Record<string, typeof actions> = {};
    for (const action of actions) {
      if (!actionsByUser[action.user_id]) {
        actionsByUser[action.user_id] = [];
      }
      actionsByUser[action.user_id].push(action);
    }

    for (const userId of Object.keys(actionsByUser)) {
      const userActions = actionsByUser[userId];
      // Check working hours for this user
      const settings = await loadUserSchedulingSettings(supabase, userId);
      const withinHours = isWithinWorkingHours(
        settings.startHour,
        settings.endHour,
        settings.timezone
      );
      console.log(
        `[Send Cron] User ${userId}: workingHours=${withinHours} (${settings.startHour}-${settings.endHour} ${settings.timezone}), actions=${userActions.length}`
      );
      if (!withinHours) {
        skipped += userActions.length;
        continue;
      }

      // Get Unipile account for this user
      const { data: linkedinAccount } = await supabase
        .from("linkedin_accounts")
        .select("unipile_account_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (!linkedinAccount?.unipile_account_id) {
        for (const action of userActions) {
          await markActionFailed(
            supabase,
            action.id,
            "Aucun compte LinkedIn connecté"
          );
          failed++;
        }
        continue;
      }

      // Get last sent action for anti-detection tracking
      const { data: lastSent } = await supabase
        .from("actions")
        .select("sent_at, action_type")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let lastSentAt = lastSent?.sent_at
        ? new Date(lastSent.sent_at).getTime()
        : 0;
      let lastSentType = lastSent?.action_type || "message";

      // Process each action sequentially (anti-detection ordering)
      for (const action of userActions) {
        try {
          // Anti-detection delay check
          if (lastSentAt > 0) {
            const timeSinceMs = Date.now() - lastSentAt;
            const requiredDelay = getRequiredDelay(
              lastSentType,
              action.action_type
            );

            if (timeSinceMs < requiredDelay) {
              console.log(
                `[Send Cron] Skipping action ${action.id} (${action.action_type}): anti-detection delay ${Math.round(timeSinceMs / 1000)}s < ${Math.round(requiredDelay / 1000)}s required`
              );
              skipped++;
              continue; // Will be picked up in next cron run
            }
          }

          // Load lead data
          if (!action.lead_id) {
            await markActionFailed(supabase, action.id, "Action sans lead_id");
            failed++;
            continue;
          }

          const { data: lead } = await supabase
            .from("leads")
            .select("linkedin_url, first_name, last_name, stage")
            .eq("id", action.lead_id)
            .single();

          if (!lead?.linkedin_url) {
            await markActionFailed(
              supabase,
              action.id,
              "Lead sans URL LinkedIn"
            );
            failed++;
            continue;
          }

          // Execute via Unipile
          const client = getUnipileClient();
          const identifier = extractLinkedInIdentifier(lead.linkedin_url);
          const message =
            action.final_message || action.generated_message || "";

          await executeLinkedInAction({
            client,
            supabase,
            actionType: action.action_type,
            identifier,
            accountId: linkedinAccount.unipile_account_id,
            message,
            leadId: action.lead_id,
            userId,
            leadStage: lead.stage,
          });

          // Mark as sent
          const sentAt = new Date().toISOString();
          await supabase
            .from("actions")
            .update({ status: "sent", sent_at: sentAt })
            .eq("id", action.id);

          // Update anti-detection tracking for next iteration
          lastSentAt = Date.now();
          lastSentType = action.action_type;
          sent++;

          // Advance sequence step if this is a sequence action
          if (action.sequence_id && action.step_id) {
            await advanceSequenceStep(
              supabase,
              action.sequence_id,
              action.lead_id,
              action.step_id
            );
          }
        } catch (err) {
          const isUnipileError = err instanceof UnipileApiError;
          const httpStatus = isUnipileError ? (err as UnipileApiError).status : 0;
          const errorMsg = isUnipileError
            ? `Unipile: ${(err as UnipileApiError).message}${(err as UnipileApiError).detail ? ` (${(err as UnipileApiError).detail})` : ""}`
            : err instanceof Error
              ? err.message
              : String(err);

          const currentRetry = action.retry_count ?? 0;
          const MAX_RETRIES = 3;

          // Check if error is transient (5xx, network errors)
          const isTransient =
            httpStatus >= 500 ||
            /Disconnected|ECONNRESET|ETIMEDOUT/i.test(errorMsg);

          if (httpStatus === 429) {
            // Rate limit: increment retry_count, revert to validated, BREAK
            console.warn(`[Send Cron] 429 rate-limited for user ${userId} — reverting action ${action.id} (retry ${currentRetry + 1})`);
            await supabase
              .from("actions")
              .update({
                status: "validated",
                retry_count: currentRetry + 1,
                error_message: `RATE_LIMITED (attempt ${currentRetry + 1}): ${errorMsg}`,
              })
              .eq("id", action.id);
            skipped++;
            break;
          }

          if (httpStatus === 422) {
            // Business error: fail permanent
            console.warn(`[Send Cron] 422 cannot_resend_yet for user ${userId} — permanent fail`);
            await markActionFailed(supabase, action.id, `CANNOT_RESEND: ${errorMsg}`);
            failed++;
            break;
          }

          if (isTransient) {
            if (currentRetry < MAX_RETRIES) {
              // Transient error with retries left: revert to validated for next cron run
              console.warn(`[Send Cron] Transient error for action ${action.id} (retry ${currentRetry + 1}/${MAX_RETRIES}): ${errorMsg}`);
              await supabase
                .from("actions")
                .update({
                  status: "validated",
                  retry_count: currentRetry + 1,
                  error_message: `RETRY ${currentRetry + 1}/${MAX_RETRIES}: ${errorMsg}`,
                })
                .eq("id", action.id);
              skipped++;
            } else {
              // Max retries exceeded: fail permanent
              console.error(`[Send Cron] Max retries (${MAX_RETRIES}) exceeded for action ${action.id}: ${errorMsg}`);
              await markActionFailed(supabase, action.id, `FAILED_AFTER_${MAX_RETRIES}_RETRIES: ${errorMsg}`);
              failed++;
            }
            break;
          }

          // Client errors (400/401/403/404): fail permanent, continue other actions
          await markActionFailed(supabase, action.id, errorMsg);
          failed++;
        }
      }
    }

    // Unlock any actions still in 'processing' (skipped by anti-detection or working hours)
    if (actionIds.length > 0) {
      const { data: stillProcessing } = await supabase
        .from("actions")
        .select("id")
        .in("id", actionIds)
        .eq("status", "processing");

      if (stillProcessing?.length) {
        await supabase
          .from("actions")
          .update({ status: "validated" } as never)
          .in("id", stillProcessing.map((a) => a.id));
        console.log(
          `[Send Cron] Unlocked ${stillProcessing.length} skipped actions back to validated`
        );
      }
    }

    console.log(
      `[Send Cron] Done: ${sent} sent, ${skipped} skipped, ${failed} failed`
    );

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      failed,
      timestamp: now,
    });
  } catch (err) {
    console.error("[Send Cron] Fatal error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
