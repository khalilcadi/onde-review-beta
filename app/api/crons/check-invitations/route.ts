/**
 * GET /api/crons/check-invitations
 *
 * Daily cron (8h UTC = 10h Paris, weekdays) — checks if invited leads have
 * accepted their LinkedIn invitation by querying Unipile's getUserProfile.
 *
 * This is a safety net for the webhook `relation.created` which can be missed.
 * The same sync logic also runs inside generate-actions (pre-generation).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncAcceptedInvitations } from "@/lib/unipile/sync-relations";

export const maxDuration = 120; // 2 min

// ---------------------------------------------------------------------------
// CRON_SECRET verification
// ---------------------------------------------------------------------------

function verifyCronSecret(req: NextRequest): Response | null {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[Check Invitations] CRON_SECRET not configured");
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

  const supabase = createServiceClient();
  let totalChecked = 0;
  let totalTransitioned = 0;
  const allErrors: string[] = [];

  try {
    const { data: linkedinAccounts, error: accountsError } = await supabase
      .from("linkedin_accounts")
      .select("user_id, unipile_account_id")
      .eq("status", "active");

    if (accountsError) throw accountsError;
    if (!linkedinAccounts?.length) {
      return NextResponse.json({
        success: true,
        checked: 0,
        transitioned: 0,
        message: "No active LinkedIn accounts",
      });
    }

    for (const account of linkedinAccounts) {
      try {
        const result = await syncAcceptedInvitations(
          supabase,
          account.user_id,
          account.unipile_account_id
        );

        totalChecked += result.checked;
        totalTransitioned += result.transitioned;
        allErrors.push(...result.errors);
      } catch (userErr) {
        const msg =
          userErr instanceof Error ? userErr.message : String(userErr);
        console.warn(
          `[Check Invitations] Error processing user ${account.user_id}:`,
          msg
        );
        allErrors.push(`user ${account.user_id}: ${msg}`);
      }
    }

    console.log(
      `[Check Invitations] Done: ${totalChecked} checked, ${totalTransitioned} transitioned, ${allErrors.length} errors`
    );

    return NextResponse.json({
      success: true,
      checked: totalChecked,
      transitioned: totalTransitioned,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (err) {
    console.error("[Check Invitations] Fatal error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
