"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import { getUnipileClient } from "@/lib/unipile/client";
import { createServerClient } from "@/lib/supabase/server";
import type { UnipileCookieAuthInput } from "@/lib/unipile/types";

// =============================================================================
// LinkedIn Account Management (Server Actions)
// =============================================================================

export interface LinkedInAccountInfo {
  id: string;
  unipileAccountId: string;
  status: string | null;
  accountType: string | null;
  createdAt: string;
}

/**
 * Get the current user's linked LinkedIn account from DB.
 */
export async function getLinkedInAccount(): Promise<
  ActionResult<LinkedInAccountInfo | null>
> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("linkedin_accounts")
      .select("id, unipile_account_id, status, account_type, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: data.id,
        unipileAccountId: data.unipile_account_id,
        status: data.status,
        accountType: data.account_type,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Generate a Hosted Auth link for LinkedIn connection via Unipile.
 * The user should be redirected to the returned URL.
 */
export async function connectLinkedIn(
  origin: string
): Promise<ActionResult<{ authUrl: string }>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: existing } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const client = getUnipileClient();
    const successUrl = `${origin}/api/linkedin/auth/callback?success=true`;
    const failureUrl = `${origin}/api/linkedin/auth/callback?success=false`;

    const input = existing?.unipile_account_id
      ? {
          type: "reconnect" as const,
          account_id: existing.unipile_account_id,
          success_redirect_url: successUrl,
          failure_redirect_url: failureUrl,
        }
      : {
          type: "create" as const,
          provider: "LINKEDIN" as const,
          success_redirect_url: successUrl,
          failure_redirect_url: failureUrl,
        };

    const result = await client.createHostedAuthLink(input);
    return { success: true, data: { authUrl: result.url } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Connect a LinkedIn account via session cookie (li_at).
 * No redirect needed — user pastes their li_at cookie directly.
 */
export async function connectLinkedInWithCookies(
  liAt: string,
  userAgent: string
): Promise<ActionResult<LinkedInAccountInfo>> {
  try {
    const { supabase, user } = await getAuthUser();
    const client = getUnipileClient();

    const input: UnipileCookieAuthInput = {
      provider: "LINKEDIN",
      access_token: liAt,
      user_agent: userAgent,
    };

    const result = await client.connectWithCookies(input);

    // Save directly with the authenticated supabase client (same session)
    const saveResult = await saveLinkedInAccount(user.id, result.account_id, supabase);
    if (!saveResult.success) throw new Error(saveResult.error);

    return {
      success: true,
      data: {
        id: result.account_id,
        unipileAccountId: result.account_id,
        status: "active",
        accountType: "linkedin",
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Save/update a LinkedIn account mapping after successful Hosted Auth.
 * Called by the auth callback route.
 */
export async function saveLinkedInAccount(
  userId: string,
  unipileAccountId: string,
  supabaseClient?: ReturnType<typeof createServerClient>
): Promise<ActionResult> {
  try {
    const supabase = supabaseClient ?? createServerClient();

    // Check if user already has a linked account
    const { data: existing } = await supabase
      .from("linkedin_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      // Update existing entry
      const { error } = await supabase
        .from("linkedin_accounts")
        .update({
          unipile_account_id: unipileAccountId,
          status: "active",
          account_type: "linkedin",
        })
        .eq("user_id", userId);

      if (error) throw error;
    } else {
      // Insert new entry
      const { error } = await supabase.from("linkedin_accounts").insert({
        user_id: userId,
        unipile_account_id: unipileAccountId,
        status: "active",
        account_type: "linkedin",
      });

      if (error) throw error;
    }

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Disconnect LinkedIn: remove the DB mapping and optionally delete the Unipile account.
 */
export async function disconnectLinkedIn(): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    // Get the unipile_account_id before deleting
    const { data: account } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Delete from DB
    const { error } = await supabase
      .from("linkedin_accounts")
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;

    // Optionally remove from Unipile (best effort)
    if (account?.unipile_account_id) {
      try {
        const client = getUnipileClient();
        await client.deleteAccount(account.unipile_account_id);
      } catch {
        // Non-critical: account removed from DB even if Unipile delete fails
        console.warn(
          "[LinkedIn] Failed to delete Unipile account:",
          account.unipile_account_id
        );
      }
    }

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Check the live status of the user's LinkedIn account via Unipile API.
 * Updates the DB status if it changed.
 */
export async function getLinkedInAccountStatus(): Promise<
  ActionResult<{ status: string; isConnected: boolean }>
> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: account } = await supabase
      .from("linkedin_accounts")
      .select("unipile_account_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      return {
        success: true,
        data: { status: "not_linked", isConnected: false },
      };
    }

    const client = getUnipileClient();
    const unipileAccount = await client.getAccount(
      account.unipile_account_id
    );

    // Unipile doesn't return a top-level status — derive it from sources
    const sources = unipileAccount.sources ?? [];
    const allOk = sources.length > 0 && sources.every((s) => s.status === "OK");
    const derivedStatus = allOk ? "active" : "error";

    // Update DB if status changed
    if (derivedStatus !== account.status) {
      await supabase
        .from("linkedin_accounts")
        .update({ status: derivedStatus })
        .eq("user_id", user.id);
    }

    return {
      success: true,
      data: {
        status: derivedStatus,
        isConnected: allOk,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get the Unipile account ID for a given user. Used by send route and sync.
 */
export async function getUnipileAccountIdForUser(
  userId: string
): Promise<string | null> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return data?.unipile_account_id ?? null;
}

// =============================================================================
// Sync LinkedIn Account from Unipile
// =============================================================================

/**
 * Sync an existing Unipile LinkedIn account to the local DB.
 * Useful when the account exists in Unipile but the DB entry is missing.
 */
export async function syncLinkedInFromUnipile(): Promise<
  ActionResult<LinkedInAccountInfo>
> {
  try {
    const { supabase, user } = await getAuthUser();

    // Check if already linked
    const { data: existing } = await supabase
      .from("linkedin_accounts")
      .select("id, unipile_account_id, status, account_type, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return {
        success: true,
        data: {
          id: existing.id,
          unipileAccountId: existing.unipile_account_id,
          status: existing.status,
          accountType: existing.account_type,
          createdAt: existing.created_at,
        },
      };
    }

    // Fetch accounts from Unipile
    const client = getUnipileClient();
    const result = await client.listAccounts({ limit: 10 });

    // Find a LinkedIn account
    const linkedInAccount = result.items.find(
      (a) => a.type?.toLowerCase() === "linkedin" || a.sources?.some((s) => s.type?.toLowerCase() === "linkedin")
    );

    if (!linkedInAccount) {
      return {
        success: false,
        error: "Aucun compte LinkedIn trouvé dans Unipile",
      };
    }

    // Save to DB
    const { data: saved, error } = await supabase
      .from("linkedin_accounts")
      .insert({
        user_id: user.id,
        unipile_account_id: linkedInAccount.id,
        status: "active",
        account_type: "linkedin",
      })
      .select("id, unipile_account_id, status, account_type, created_at")
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        id: saved.id,
        unipileAccountId: saved.unipile_account_id,
        status: saved.status,
        accountType: saved.account_type,
        createdAt: saved.created_at,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// Inbox Sync
// =============================================================================

export interface SyncResult {
  synced: number;
  newConversations: number;
  newMessages: number;
}

/**
 * Sync conversations from Unipile into the local DB.
 * Matches attendees with existing leads by LinkedIn URL.
 */
export async function syncInbox(): Promise<ActionResult<SyncResult>> {
  try {
    const { supabase, user } = await getAuthUser();

    const accountId = await getUnipileAccountIdForUser(user.id);
    if (!accountId) {
      return {
        success: false,
        error: "Aucun compte LinkedIn connecté",
      };
    }

    const client = getUnipileClient();
    let newConversations = 0;
    let newMessages = 0;
    let synced = 0;

    // Fetch chats from Unipile (paginated, first page)
    const chatsResponse = await client.listChats({
      account_id: accountId,
      limit: 50,
    });

    for (const chat of chatsResponse.items) {
      synced++;

      // Resolve attendee info (first non-self attendee)
      const otherAttendee = chat.attendees?.find((a) => !a.is_self);
      const attendeeName = otherAttendee?.name || null;
      const attendeeProfileUrl = otherAttendee?.profile_url || null;

      // Check if conversation exists by unipile_chat_id
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, updated_at")
        .eq("unipile_chat_id", chat.id)
        .maybeSingle();

      let conversationId: string;

      if (existingConv) {
        conversationId = existingConv.id;
        // Update attendee info if missing
        if (attendeeName) {
          await supabase
            .from("conversations")
            .update({
              attendee_name: attendeeName,
              attendee_profile_url: attendeeProfileUrl,
            })
            .eq("id", conversationId)
            .is("attendee_name", null);
        }
      } else {
        // Try to match lead by attendee profile URL
        const leadId = await matchLeadByAttendees(supabase, chat.attendees);

        const { data: newConv, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            lead_id: leadId,
            channel: "linkedin",
            unipile_chat_id: chat.id,
            status: "unread",
            attendee_name: attendeeName,
            attendee_profile_url: attendeeProfileUrl,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("[Sync] Failed to create conversation:", insertError);
          continue;
        }

        conversationId = newConv.id;
        newConversations++;
      }

      // Fetch messages for this chat
      const messagesResponse = await client.getChatMessages(chat.id, {
        limit: 20,
      });

      // Get all existing message timestamps to deduplicate
      const { data: existingMsgs } = await supabase
        .from("messages")
        .select("timestamp")
        .eq("conversation_id", conversationId);

      const existingTimestamps = new Set(
        (existingMsgs ?? []).map((m) => new Date(m.timestamp).getTime())
      );

      // Insert all missing messages (both older and newer)
      for (const msg of messagesResponse.items) {
        const msgTimestamp = new Date(msg.timestamp).getTime();
        if (existingTimestamps.has(msgTimestamp)) continue;

        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          direction: msg.is_sender ? "outbound" : "inbound",
          content: msg.text ?? "",
          timestamp: msg.timestamp,
        });

        if (!msgError) {
          newMessages++;
        }
      }

      // Update conversation status if there are new inbound messages
      if (newMessages > 0) {
        await supabase
          .from("conversations")
          .update({
            status: "unread",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
    }

    return {
      success: true,
      data: { synced, newConversations, newMessages },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// Single Conversation Sync (respects LinkedIn rate limits)
// =============================================================================

/**
 * Sync messages for a single conversation from Unipile.
 * Only 1 API call (getChatMessages) — safe for LinkedIn limits.
 */
export async function syncConversation(
  conversationId: string
): Promise<ActionResult<{ newMessages: number }>> {
  try {
    const { supabase, user } = await getAuthUser();

    // 1. Get conversation with unipile_chat_id
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, unipile_chat_id, user_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conv) {
      return { success: false, error: "Conversation introuvable" };
    }
    if (conv.user_id !== user.id) {
      return { success: false, error: "Acc\u00e8s non autoris\u00e9" };
    }
    if (!conv.unipile_chat_id) {
      return { success: false, error: "Conversation non li\u00e9e \u00e0 LinkedIn" };
    }

    const client = getUnipileClient();

    // 2. Fetch chat details (attendees) + messages from Unipile
    try {
      const chatDetails = await client.getChat(conv.unipile_chat_id);
      const otherAttendee = chatDetails.attendees?.find((a) => !a.is_self);
      if (otherAttendee?.name) {
        await supabase
          .from("conversations")
          .update({
            attendee_name: otherAttendee.name,
            attendee_profile_url: otherAttendee.profile_url || null,
          })
          .eq("id", conversationId)
          .is("attendee_name", null);
      }
    } catch {
      // Non-critical: continue with messages sync even if chat details fail
    }

    const messagesResponse = await client.getChatMessages(conv.unipile_chat_id, {
      limit: 50,
    });

    // 3. Get all existing message timestamps to deduplicate (old + new)
    const { data: existingMsgs } = await supabase
      .from("messages")
      .select("timestamp")
      .eq("conversation_id", conversationId);

    const existingTimestamps = new Set(
      (existingMsgs ?? []).map((m) => new Date(m.timestamp).getTime())
    );

    // 4. Insert all missing messages (both older and newer)
    let newMessages = 0;
    for (const msg of messagesResponse.items) {
      const msgTimestamp = new Date(msg.timestamp).getTime();
      if (existingTimestamps.has(msgTimestamp)) continue;

      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: msg.is_sender ? "outbound" : "inbound",
        content: msg.text ?? "",
        timestamp: msg.timestamp,
      });

      if (!msgError) newMessages++;
    }

    // 5. Update conversation timestamp
    if (newMessages > 0) {
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return { success: true, data: { newMessages } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Try to match a lead by comparing attendee profile URLs with leads.linkedin_url.
 */
async function matchLeadByAttendees(
  supabase: ReturnType<typeof createServerClient>,
  attendees: Array<{ profile_url?: string; is_self: boolean }>
): Promise<string | null> {
  for (const attendee of attendees) {
    if (attendee.is_self || !attendee.profile_url) continue;

    // Extract the LinkedIn identifier from the profile URL
    const identifier = extractIdentifierFromUrl(attendee.profile_url);
    if (!identifier) continue;

    const { data } = await supabase
      .from("leads")
      .select("id")
      .ilike("linkedin_url", `%${identifier}%`)
      .limit(1)
      .maybeSingle();

    if (data) return data.id;
  }

  return null;
}

function extractIdentifierFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1].replace(/\/$/, "") : null;
}
