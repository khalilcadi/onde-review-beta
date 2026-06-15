// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import { encrypt, decrypt } from "@/lib/crypto";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// --- SETTINGS ---

export async function getSettings(): Promise<
  ActionResult<{
    settings: Record<string, unknown>;
    hasClaudeKey: boolean;
    hasOpenaiKey: boolean;
    hasPerplexityKey: boolean;
  }>
> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: keysRow } = await supabase
      .from("user_api_keys")
      .select(
        "claude_key_encrypted, openai_key_encrypted, perplexity_key_encrypted"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const dbSettings = settingsRow?.settings as Record<string, unknown> | null;
    const settings = dbSettings
      ? { ...DEFAULT_SETTINGS, ...dbSettings }
      : { ...DEFAULT_SETTINGS };

    return {
      success: true,
      data: {
        settings,
        hasClaudeKey: Boolean(keysRow?.claude_key_encrypted),
        hasOpenaiKey: Boolean(keysRow?.openai_key_encrypted),
        hasPerplexityKey: Boolean(keysRow?.perplexity_key_encrypted),
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function updateSettings(
  newSettings: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("user_settings").upsert(
      { user_id: user.id, settings: newSettings },
      { onConflict: "user_id" }
    );

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// --- API KEYS ---

export async function saveApiKey(
  keyType: "claude" | "openai" | "perplexity",
  plainKey: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();
    const encryptedKey = encrypt(plainKey);

    const columnMap: Record<string, string> = {
      claude: "claude_key_encrypted",
      openai: "openai_key_encrypted",
      perplexity: "perplexity_key_encrypted",
    };

    const { error } = await supabase.from("user_api_keys").upsert(
      { user_id: user.id, [columnMap[keyType]]: encryptedKey },
      { onConflict: "user_id" }
    );

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteApiKey(
  keyType: "claude" | "openai" | "perplexity"
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const columnMap: Record<string, string> = {
      claude: "claude_key_encrypted",
      openai: "openai_key_encrypted",
      perplexity: "perplexity_key_encrypted",
    };

    const { error } = await supabase
      .from("user_api_keys")
      .update({ [columnMap[keyType]]: null })
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// --- DECRYPTED API KEY (used by AI service) ---

const KEY_COLUMN_MAP: Record<string, string> = {
  claude: "claude_key_encrypted",
  openai: "openai_key_encrypted",
  perplexity: "perplexity_key_encrypted",
};

export async function getDecryptedApiKey(
  userId: string,
  keyType: "claude" | "openai" | "perplexity",
  supabaseOverride?: SupabaseClient<Database>
): Promise<string | null> {
  const supabase = supabaseOverride ?? createServerClient();
  const col = KEY_COLUMN_MAP[keyType];

  const { data } = await supabase
    .from("user_api_keys")
    .select(col)
    .eq("user_id", userId)
    .maybeSingle();

  const encrypted = data?.[col as keyof typeof data] as string | null;
  if (!encrypted) return null;

  return decrypt(encrypted);
}

// --- PROMPTS ---

export async function getUserPrompt(
  agentId: string
): Promise<ActionResult<string | null>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data } = await supabase
      .from("user_prompts")
      .select("content")
      .eq("user_id", user.id)
      .eq("agent_id", agentId)
      .maybeSingle();

    return { success: true, data: data?.content ?? null };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function saveUserPrompt(
  agentId: string,
  content: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("user_prompts").upsert(
      { user_id: user.id, agent_id: agentId, content },
      { onConflict: "user_id,agent_id" }
    );

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function resetUserPrompt(
  agentId: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("user_prompts")
      .delete()
      .eq("user_id", user.id)
      .eq("agent_id", agentId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
