// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";

export interface ConversationWithMessages {
  id: string;
  leadId: string | null;
  leadName: string;
  leadTitle: string;
  leadProfilePictureUrl: string | null;
  leadLinkedInUrl: string | null;
  channel: string;
  status: string;
  unreadCount: number;
  messages: {
    id: string;
    direction: string;
    content: string;
    timestamp: string;
  }[];
  lastMessage: string;
  updatedAt: string;
}

export async function getConversations(): Promise<
  ActionResult<ConversationWithMessages[]>
> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase
      .from("conversations")
      .select(
        "*, leads(first_name, last_name, title, company, linkedin_url, enrichment_data), messages(id, direction, content, timestamp)"
      )
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const conversations: ConversationWithMessages[] = (data ?? []).map(
      (row: any) => { // eslint-disable-line
        const lead = row.leads as {
          first_name: string;
          last_name: string;
          title: string | null;
          company: string | null;
          linkedin_url: string | null;
          enrichment_data: any | null;
        } | null;

        const msgs = (
          (row.messages as unknown as {
            id: string;
            direction: string;
            content: string;
            timestamp: string;
          }[]) ?? []
        ).sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const titleParts = [lead?.title, lead?.company]
          .filter(Boolean)
          .join(" @ ");

        // Name resolution: lead name > attendee_name > "Contact"
        const leadName = lead
          ? `${lead.first_name} ${lead.last_name}`
          : row.attendee_name || "Contact";

        // LinkedIn URL: from lead or from attendee_profile_url
        const linkedInUrl = lead?.linkedin_url || row.attendee_profile_url || null;

        return {
          id: row.id,
          leadId: row.lead_id,
          leadName,
          leadTitle: titleParts,
          leadProfilePictureUrl: lead?.enrichment_data?.linkedin_profile?.profile_picture_url || null,
          leadLinkedInUrl: linkedInUrl,
          channel: row.channel,
          status: row.status,
          unreadCount: row.status === "unread" ? 1 : 0,
          messages: msgs,
          lastMessage:
            msgs.length > 0 ? msgs[msgs.length - 1].content : "",
          updatedAt: row.updated_at,
        };
      }
    );

    return { success: true, data: conversations };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function markConversationRead(
  id: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    const { error } = await supabase
      .from("conversations")
      .update({ status: "read" } as never)
      .eq("id", id);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content,
    });

    if (error) throw error;

    // Also send via Unipile if the conversation has a unipile_chat_id
    const { data: conv } = await supabase
      .from("conversations")
      .select("unipile_chat_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conv?.unipile_chat_id) {
      try {
        const { getUnipileClient } = await import("@/lib/unipile/client");
        const client = getUnipileClient();
        await client.sendMessage(conv.unipile_chat_id, { text: content });
      } catch (unipileErr) {
        // Non-critical: message saved locally even if Unipile send fails
        console.error("[sendMessage] Unipile send failed:", unipileErr);
      }
    }

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// Direct Message Send (from Lead Detail Page)
// =============================================================================

/**
 * Send a direct LinkedIn message from the lead detail page.
 * Creates the conversation + message records and an action for history tracking.
 */
export async function sendDirectMessage(
  leadId: string,
  content: string
): Promise<ActionResult<{ actionId: string; conversationId: string }>> {
  try {
    const { supabase, user } = await getAuthUser();

    // 1. Load lead + ownership check
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, user_id, linkedin_url, stage, first_name, last_name")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return { success: false, error: "Lead introuvable" };
    }
    if (lead.user_id !== user.id) {
      return { success: false, error: "Seul le propri\u00e9taire peut envoyer un message" };
    }

    // 2. Validate linkedin_url
    if (!lead.linkedin_url) {
      return { success: false, error: "Ce lead n\u2019a pas d\u2019URL LinkedIn" };
    }

    // 3. Get Unipile account
    const { getUnipileAccountIdForUser } = await import("@/lib/actions/linkedin");
    const unipileAccountId = await getUnipileAccountIdForUser(user.id);
    if (!unipileAccountId) {
      return { success: false, error: "Aucun compte LinkedIn connect\u00e9. Allez dans Settings > API Keys." };
    }

    // 4. Extract LinkedIn identifier + get client
    const { getUnipileClient, extractLinkedInIdentifier } = await import("@/lib/unipile/client");
    const identifier = extractLinkedInIdentifier(lead.linkedin_url);
    const client = getUnipileClient();

    // 5. Execute via Unipile (sends message + upserts conversation + updates lead stage)
    const { executeLinkedInAction } = await import("@/lib/unipile/execute");
    await executeLinkedInAction({
      client,
      supabase,
      actionType: "message",
      identifier,
      accountId: unipileAccountId,
      message: content,
      leadId: lead.id,
      userId: user.id,
      leadStage: lead.stage ?? "connected",
    });

    // 6. Get the conversation record (created/updated by executeLinkedInAction)
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)
      .eq("channel", "linkedin")
      .maybeSingle();

    // 7. Insert outbound message record
    if (conv) {
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        direction: "outbound",
        content,
      });

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString(), status: "read" })
        .eq("id", conv.id);
    }

    // 8. Create action record for history/timeline
    const now = new Date().toISOString();
    const { data: actionRecord } = await supabase
      .from("actions")
      .insert({
        user_id: user.id,
        lead_id: leadId,
        action_type: "message",
        status: "sent",
        final_message: content,
        validated_at: now,
        sent_at: now,
      })
      .select("id")
      .single();

    return {
      success: true,
      data: {
        actionId: actionRecord?.id ?? "",
        conversationId: conv?.id ?? "",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de l\u2019envoi du message";
    console.error("[sendDirectMessage] Error:", err);
    return { success: false, error: message };
  }
}
