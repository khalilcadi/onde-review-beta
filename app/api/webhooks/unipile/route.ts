import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createServiceClient,
  type ServiceClient,
} from "@/lib/supabase/service";
import type { UnipileWebhookEvent } from "@/lib/unipile/types";

/**
 * POST /api/webhooks/unipile
 * Receives webhook events from Unipile (new messages, new relations, account status).
 *
 * Uses service_role client to bypass RLS since there is no user session.
 * Always returns 200 to prevent Unipile retries.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as UnipileWebhookEvent;
    const { event, data } = body;

    console.log(`[Webhook Unipile] Event: ${event}`, {
      accountId: data?.account_id ?? "N/A",
      chatId: data?.chat_id ?? "N/A",
    });

    if (!data?.account_id) {
      console.warn(`[Webhook Unipile] No account_id in payload for event: ${event}`);
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();

    // Find the user who owns this Unipile account
    const userId = await findUserByAccountId(
      supabase,
      data.account_id
    );

    switch (event) {
      case "message.received":
        await handleNewMessage(supabase, data, userId);
        break;

      case "relation.created":
        await handleNewRelation(supabase, data, userId);
        break;

      case "account.status_changed":
        await handleAccountStatusChange(supabase, data);
        break;

      default:
        console.log(`[Webhook Unipile] Unhandled event: ${event}`);
    }
  } catch (err) {
    // Always return 200 — log errors but never fail
    console.error("[Webhook Unipile] Processing error:", err);
  }

  return NextResponse.json({ received: true });
}

// =============================================================================
// Event Handlers
// =============================================================================

async function handleNewMessage(
  supabase: ServiceClient,
  data: UnipileWebhookEvent["data"],
  userId: string | null
) {
  if (!userId || !data.chat_id) return;

  const message = data.message;
  if (!message) {
    console.warn("[Webhook] message.received but no message data");
    return;
  }

  // Find or create conversation by unipile_chat_id
  let conversationId: string;
  let resolvedLeadId: string | null = null;

  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, lead_id")
    .eq("unipile_chat_id", data.chat_id)
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
    resolvedLeadId = existingConv.lead_id;
  } else {
    // Try to match lead by sender profile
    const matchedLeadId = await matchLeadBySenderId(supabase, message.sender_id);

    // Resolve attendee name from chat details (best effort)
    let attendeeName: string | null = null;
    let attendeeProfileUrl: string | null = null;
    if (data.chat_id) {
      try {
        const { getUnipileClient } = await import("@/lib/unipile/client");
        const client = getUnipileClient();
        const chatDetails = await client.getChat(data.chat_id);
        const otherAttendee = chatDetails.attendees?.find((a) => !a.is_self);
        attendeeName = otherAttendee?.name || null;
        attendeeProfileUrl = otherAttendee?.profile_url || null;
      } catch {
        // Non-critical: conversation will show without attendee name
      }
    }

    const { data: newConv, error: insertError } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        lead_id: matchedLeadId,
        channel: "linkedin",
        unipile_chat_id: data.chat_id,
        status: "unread",
        attendee_name: attendeeName,
        attendee_profile_url: attendeeProfileUrl,
      })
      .select("id, lead_id")
      .single();

    if (insertError) {
      console.error("[Webhook] Failed to create conversation:", insertError);
      return;
    }

    conversationId = newConv.id;
    resolvedLeadId = newConv.lead_id;
  }

  // Insert the message — upsert sur (conversation_id, timestamp) pour idempotence
  // (Unipile peut renvoyer le même webhook plusieurs fois)
  const { error: msgError } = await supabase.from("messages").upsert(
    {
      conversation_id: conversationId,
      direction: message.is_sender ? "outbound" : "inbound",
      content: message.text,
      timestamp: message.timestamp,
    },
    { onConflict: "conversation_id,timestamp", ignoreDuplicates: true }
  );

  if (msgError) {
    console.error("[Webhook] Failed to upsert message:", msgError);
    return;
  }

  // Update conversation status and timestamp
  await supabase
    .from("conversations")
    .update({
      status: message.is_sender ? "read" : "unread",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  // If inbound message and lead exists, update lead stage
  if (!message.is_sender) {
    if (resolvedLeadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("stage")
        .eq("id", resolvedLeadId)
        .maybeSingle();

      if (
        lead &&
        (lead.stage === "invited" ||
          lead.stage === "connected" ||
          lead.stage === "in_sequence")
      ) {
        await supabase
          .from("leads")
          .update({
            stage: "responded",
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolvedLeadId);
      }

      // Also update sequence_leads status if applicable
      await supabase
        .from("sequence_leads")
        .update({ status: "responded" })
        .eq("lead_id", resolvedLeadId)
        .eq("status", "active");

      // Cancel all pending/validated actions for this lead to avoid
      // sending a follow-up after the lead already responded
      const { data: cancelled } = await supabase
        .from("actions")
        .update({ status: "cancelled" })
        .eq("lead_id", resolvedLeadId)
        .in("status", ["pending", "validated"])
        .select("id");

      if (cancelled?.length) {
        console.log(
          `[Webhook] Cancelled ${cancelled.length} pending action(s) for lead ${resolvedLeadId} after response`
        );
      }
    }
  }
}

async function handleNewRelation(
  supabase: ServiceClient,
  data: UnipileWebhookEvent["data"],
  userId: string | null
) {
  if (!userId) return;

  const relation = data.relation;
  if (!relation?.profile_url) {
    console.warn("[Webhook] relation.created but no profile_url");
    return;
  }

  // Extract public slug from webhook profile_url (e.g. "john-doe")
  const identifier = extractIdentifier(relation.profile_url);
  if (!identifier) return;

  // Strategy 1: Direct match by slug (works for normalized URLs)
  let lead: { id: string; stage: string } | null = null;
  let matchStrategy = "slug";

  const { data: slugMatch } = await supabase
    .from("leads")
    .select("id, stage")
    .eq("user_id", userId)
    .ilike("linkedin_url", `%${identifier}%`)
    .maybeSingle();

  lead = slugMatch;

  // Strategy 2: Resolve via Unipile API if slug match failed
  // Handles leads imported with URN-style URLs (ACwAAA...)
  if (!lead && data.account_id) {
    try {
      const { getUnipileClient } = await import("@/lib/unipile/client");
      const client = getUnipileClient();
      const profile = await client.getUserProfile(identifier, data.account_id);

      // Search by provider_id (URN) which matches the URN in stored linkedin_url
      if (profile.provider_id) {
        const { data: urnMatch } = await supabase
          .from("leads")
          .select("id, stage")
          .eq("user_id", userId)
          .ilike("linkedin_url", `%${profile.provider_id}%`)
          .maybeSingle();

        if (urnMatch) {
          lead = urnMatch;
          matchStrategy = "urn-fallback";

          // Normalize the URL for future direct matches
          if (profile.public_identifier) {
            const normalizedUrl = `https://www.linkedin.com/in/${profile.public_identifier}`;
            await supabase
              .from("leads")
              .update({ linkedin_url: normalizedUrl })
              .eq("id", urnMatch.id);
            console.log(
              `[Webhook] Lead ${urnMatch.id} linkedin_url normalized to slug: ${profile.public_identifier}`
            );
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Webhook] Fallback API lookup failed for ${identifier}:`, msg);
    }
  }

  // Update lead stage
  const PRE_CONNECTION_STAGES = ["to_invite", "invited"];
  if (lead && PRE_CONNECTION_STAGES.includes(lead.stage)) {
    await supabase
      .from("leads")
      .update({
        stage: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    console.log(
      `[Webhook] Lead ${lead.id} stage updated: ${lead.stage} → connected (match: ${matchStrategy})`
    );

    // Connection accepted: advance any active sequence past its invitation step
    // so the next cron run generates the M1 message action.
    await advancePastInvitationStep(supabase, lead.id);
  } else if (lead) {
    console.log(
      `[Webhook] relation.created for lead ${lead.id} but stage is "${lead.stage}", skipping`
    );
  } else {
    console.warn(
      `[Webhook] relation.created but no matching lead for identifier: ${identifier}`
    );
  }
}

async function handleAccountStatusChange(
  supabase: ServiceClient,
  data: UnipileWebhookEvent["data"]
) {
  const accountStatus = data.account;
  if (!accountStatus) return;

  await supabase
    .from("linkedin_accounts")
    .update({ status: accountStatus.status.toLowerCase() })
    .eq("unipile_account_id", data.account_id);

  console.log(
    `[Webhook] Account ${data.account_id} status → ${accountStatus.status}`
  );
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * When a connection is accepted, advance any active sequence_lead for this lead
 * whose current step is an 'invitation' step, so the next cron generates the M1
 * message action instead of leaving the lead stuck at the invitation step.
 *
 * Mirrors the correlated SQL:
 *   UPDATE sequence_leads SET current_step = current_step + 1
 *   WHERE lead_id = {lead_id} AND status = 'active'
 *     AND id IN (SELECT sl.id FROM sequence_leads sl
 *                JOIN sequence_steps ss ON ss.sequence_id = sl.sequence_id
 *                  AND ss.step_order = sl.current_step
 *                WHERE sl.lead_id = {lead_id} AND sl.status = 'active'
 *                  AND ss.step_type = 'invitation')
 */
async function advancePastInvitationStep(
  supabase: ServiceClient,
  leadId: string
) {
  // Active sequence_leads for this lead
  const { data: seqLeads } = await supabase
    .from("sequence_leads")
    .select("id, sequence_id, current_step")
    .eq("lead_id", leadId)
    .eq("status", "active");

  if (!seqLeads?.length) return;

  for (const sl of seqLeads) {
    // Is the current step an invitation step?
    const { data: step } = await supabase
      .from("sequence_steps")
      .select("id")
      .eq("sequence_id", sl.sequence_id)
      .eq("step_order", sl.current_step)
      .eq("step_type", "invitation")
      .maybeSingle();

    if (!step) continue;

    await supabase
      .from("sequence_leads")
      .update({ current_step: sl.current_step + 1 })
      .eq("id", sl.id);

    console.log(
      `[Webhook] sequence_lead ${sl.id} advanced past invitation step (${sl.current_step} → ${sl.current_step + 1})`
    );
  }
}

async function findUserByAccountId(
  supabase: ServiceClient,
  unipileAccountId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("linkedin_accounts")
    .select("user_id")
    .eq("unipile_account_id", unipileAccountId)
    .maybeSingle();

  return data?.user_id ?? null;
}

async function matchLeadBySenderId(
  supabase: ServiceClient,
  senderId?: string
): Promise<string | null> {
  if (!senderId) return null;

  // Attempt to find a lead whose linkedin_url contains the sender identifier
  const { data } = await supabase
    .from("leads")
    .select("id")
    .ilike("linkedin_url", `%${senderId}%`)
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

function extractIdentifier(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/$/, "") : null;
}
