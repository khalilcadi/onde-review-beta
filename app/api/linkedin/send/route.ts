import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
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
import { getUnipileAccountIdForUser } from "@/lib/actions/linkedin";

/**
 * POST /api/linkedin/send
 * Sends a LinkedIn action (message, invitation, visit) via Unipile.
 *
 * Body: { actionId: string }
 *
 * Flow:
 * 1. Auth + ownership check
 * 2. Validate action status
 * 3. Anti-detection delay check
 * 4. Execute via Unipile
 * 5. Update action status
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { actionId } = body as { actionId: string };

    if (!actionId) {
      return NextResponse.json(
        { error: "actionId requis" },
        { status: 400 }
      );
    }

    // 2. Load action, verify ownership
    const { data: action, error: actionError } = await supabase
      .from("actions")
      .select("id, user_id, lead_id, action_type, status, generated_message, final_message, sequence_id, step_id")
      .eq("id", actionId)
      .single();

    if (actionError || !action) {
      return NextResponse.json(
        { error: "Action introuvable" },
        { status: 404 }
      );
    }

    if (action.user_id !== user.id) {
      return NextResponse.json(
        { error: "Action non autorisée" },
        { status: 403 }
      );
    }

    if (action.status !== "validated") {
      return NextResponse.json(
        { error: `Action non validée (status: ${action.status})` },
        { status: 400 }
      );
    }

    // Load lead data separately
    let lead: { linkedin_url: string | null; first_name: string | null; last_name: string | null; stage: string } | null = null;
    if (action.lead_id) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("linkedin_url, first_name, last_name, stage")
        .eq("id", action.lead_id)
        .single();
      lead = leadData;
    }

    // 3. Get Unipile account
    const unipileAccountId = await getUnipileAccountIdForUser(user.id);
    if (!unipileAccountId) {
      return NextResponse.json(
        { error: "Aucun compte LinkedIn connecté" },
        { status: 400 }
      );
    }

    // 4. Anti-detection check
    const { data: lastSentAction } = await supabase
      .from("actions")
      .select("sent_at, action_type")
      .eq("user_id", user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSentAction?.sent_at) {
      const timeSinceLastMs =
        Date.now() - new Date(lastSentAction.sent_at).getTime();
      const requiredDelay = getRequiredDelay(
        lastSentAction.action_type,
        action.action_type
      );

      if (timeSinceLastMs < requiredDelay) {
        const retryAfter = Math.ceil(
          (requiredDelay - timeSinceLastMs) / 1000
        );
        return NextResponse.json(
          {
            error: "too_soon",
            retryAfter,
            message: `Délai anti-détection : attendez ${retryAfter}s`,
          },
          { status: 429 }
        );
      }
    }

    // 5. Execute via Unipile
    if (!lead?.linkedin_url) {
      await markActionFailed(supabase, actionId, "Lead sans URL LinkedIn");
      return NextResponse.json(
        { error: "Lead sans URL LinkedIn" },
        { status: 400 }
      );
    }

    const client = getUnipileClient();
    const identifier = extractLinkedInIdentifier(lead.linkedin_url);
    const message = action.final_message || action.generated_message || "";

    try {
      await executeLinkedInAction({
        client,
        supabase,
        actionType: action.action_type,
        identifier,
        accountId: unipileAccountId,
        message,
        leadId: action.lead_id,
        userId: user.id,
        leadStage: lead.stage,
      });

      // 6. Mark action as sent
      const sentAt = new Date().toISOString();
      await supabase
        .from("actions")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", actionId);

      // 7. Advance sequence step if this is a sequence action
      if (action.sequence_id && action.step_id && action.lead_id) {
        await advanceSequenceStep(
          supabase,
          action.sequence_id,
          action.lead_id,
          action.step_id
        );
      }

      return NextResponse.json({
        data: { actionId, status: "sent", sentAt },
      });
    } catch (err) {
      // Unipile API error
      const errorMsg =
        err instanceof UnipileApiError
          ? `Unipile: ${err.message}${err.detail ? ` (${err.detail})` : ""}`
          : (err as Error).message;

      await markActionFailed(supabase, actionId, errorMsg);

      return NextResponse.json(
        { error: errorMsg },
        {
          status:
            err instanceof UnipileApiError ? err.status : 500,
        }
      );
    }
  } catch (error) {
    console.error("[LinkedIn Send] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
