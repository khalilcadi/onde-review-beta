/**
 * Shared LinkedIn action execution logic — Session I
 *
 * Extracted from app/api/linkedin/send/route.ts to be reusable
 * by both the send API route and the send-actions cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseFragments, getFragmentDelay } from "@/lib/humanize";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// We use the client instance type rather than importing the class directly
type UnipileClientInstance = ReturnType<
  typeof import("@/lib/unipile/client").getUnipileClient
>;

export interface ExecuteLinkedInActionOptions {
  client: UnipileClientInstance;
  supabase: SupabaseClient<Database>;
  actionType: string;
  identifier: string;
  accountId: string;
  message: string;
  leadId: string | null;
  userId: string;
  leadStage: string;
}

/**
 * Execute a LinkedIn action via Unipile and update related DB records.
 * Handles: visit, invitation, message, inmail.
 * Updates lead stage and conversation records as needed.
 */
export async function executeLinkedInAction(
  options: ExecuteLinkedInActionOptions
): Promise<void> {
  const {
    client,
    supabase,
    actionType,
    identifier,
    accountId,
    message,
    leadId,
    userId,
    leadStage,
  } = options;

  switch (actionType) {
    case "visit": {
      await client.getUserProfile(identifier, accountId);
      break;
    }

    case "invitation": {
      // Warm-up: visit profile first (natural LinkedIn behavior)
      const profile = await client.getUserProfile(identifier, accountId);

      // Check if already connected via Unipile response.
      // Canonical value observed in production is "FIRST_DEGREE".
      const nd = (profile.network_distance || "").toUpperCase().trim();
      const alreadyConnected =
        profile.is_relationship === true ||
        ["FIRST", "FIRST_DEGREE", "DISTANCE_1", "1", "1ST"].includes(nd);

      // Check our DB stage too (covers cases where Unipile data is stale)
      const CONNECTED_STAGES = ["connected", "in_sequence", "responded", "meeting", "closed"];
      const dbConnected = CONNECTED_STAGES.includes(leadStage);

      if (alreadyConnected || dbConnected) {
        // Update lead stage if our DB was out of sync
        if (leadId && !dbConnected) {
          await supabase
            .from("leads")
            .update({ stage: "connected", updated_at: new Date().toISOString() })
            .eq("id", leadId);
        }
        console.log(
          `[Execute] Lead ${leadId} already connected (unipile=${alreadyConnected}, db=${dbConnected}), skipping invitation`
        );
        return; // Cron will mark "sent" and advance sequence
      }

      const providerId = profile.provider_id;
      if (!providerId) {
        throw new Error(`Cannot resolve provider_id for ${identifier}`);
      }

      // Normalize linkedin_url to public slug for future webhook matching
      if (profile.public_identifier && leadId) {
        const normalizedUrl = `https://www.linkedin.com/in/${profile.public_identifier}`;
        await supabase
          .from("leads")
          .update({ linkedin_url: normalizedUrl })
          .eq("id", leadId);
      }

      await client.sendInvitation({
        account_id: accountId,
        provider_id: providerId,
        message: message || undefined,
      });

      if (leadStage === "to_invite" && leadId) {
        await supabase
          .from("leads")
          .update({ stage: "invited", updated_at: new Date().toISOString() })
          .eq("id", leadId);
      }
      break;
    }

    case "message":
    case "inmail": {
      const fragments = parseFragments(message);

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("unipile_chat_id")
        .eq("lead_id", leadId!)
        .eq("channel", "linkedin")
        .not("unipile_chat_id", "is", null)
        .maybeSingle();

      let chatId: string;

      if (existingConv?.unipile_chat_id) {
        chatId = existingConv.unipile_chat_id;
        await client.sendMessage(chatId, { text: fragments[0] });
      } else {
        // Resolve the LinkedIn profile to get the provider_id
        // createChat needs the provider_id, not the LinkedIn slug
        const profile = await client.getUserProfile(identifier, accountId);
        const attendeeId = profile.provider_id;
        if (!attendeeId) {
          throw new Error(`Impossible de résoudre le provider_id pour ${identifier}`);
        }

        const newChat = await client.createChat({
          account_id: accountId,
          attendees_ids: [attendeeId],
          text: fragments[0],
        });
        // Unipile createChat returns { chat_id, message_id }, not { id }
        chatId = newChat.chat_id ?? newChat.id;

        if (leadId) {
          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("lead_id", leadId)
            .eq("channel", "linkedin")
            .maybeSingle();

          if (conv) {
            await supabase
              .from("conversations")
              .update({ unipile_chat_id: chatId })
              .eq("id", conv.id);
          } else {
            await supabase.from("conversations").insert({
              user_id: userId,
              lead_id: leadId,
              channel: "linkedin",
              unipile_chat_id: chatId,
              status: "read",
            });
          }
        }
      }

      // Send remaining fragments with humanized delays
      for (let i = 1; i < fragments.length; i++) {
        await sleep(getFragmentDelay());
        await client.sendMessage(chatId, { text: fragments[i] });
      }

      if (
        leadId &&
        (leadStage === "connected" || leadStage === "in_sequence")
      ) {
        await supabase
          .from("leads")
          .update({
            stage: "in_sequence",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
      break;
    }

    default:
      throw new Error(`Type d'action non supporté : ${actionType}`);
  }
}

/**
 * Mark an action as failed in the database.
 */
export async function markActionFailed(
  supabase: SupabaseClient<Database>,
  actionId: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from("actions")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", actionId);
}

/**
 * Advance a lead to the next step in a sequence, or mark completed.
 * Called after an action is successfully sent.
 */
export async function advanceSequenceStep(
  supabase: SupabaseClient<Database>,
  sequenceId: string,
  leadId: string,
  completedStepId: string
): Promise<void> {
  // Get the step_order of the completed step
  const { data: step } = await supabase
    .from("sequence_steps")
    .select("step_order")
    .eq("id", completedStepId)
    .single();

  if (!step) return;

  // Check if there is a next step
  const { data: nextStep } = await supabase
    .from("sequence_steps")
    .select("id")
    .eq("sequence_id", sequenceId)
    .gt("step_order", step.step_order)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextStep) {
    // Advance to the completed step_order (next step will be picked up by cron)
    await supabase
      .from("sequence_leads")
      .update({ current_step: step.step_order })
      .eq("sequence_id", sequenceId)
      .eq("lead_id", leadId)
      .eq("status", "active");
  } else {
    // No more steps — sequence completed for this lead
    await supabase
      .from("sequence_leads")
      .update({ current_step: step.step_order, status: "completed" })
      .eq("sequence_id", sequenceId)
      .eq("lead_id", leadId)
      .eq("status", "active");
  }
}
