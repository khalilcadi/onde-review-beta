"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import { getDecryptedApiKey } from "./settings";
import { getUnipileClient } from "@/lib/unipile/client";
import { getLinkedInAccount } from "./linkedin";
import type { LinkedInAccountInfo } from "./linkedin";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// =============================================================================
// Types
// =============================================================================

export interface EnvCheckResult {
  checks: Array<{
    name: string;
    label: string;
    present: boolean;
  }>;
}

export interface SupabaseTestResult {
  connected: boolean;
  latencyMs: number;
}

export interface UnipileTestResult {
  connected: boolean;
  accountCount: number;
  accounts: Array<{
    id: string;
    name: string;
    status: string;
    type: string;
  }>;
}

export interface ApiKeyTestResult {
  present: boolean;
  valid: boolean | null;
  error?: string;
}

export interface LinkedInDiagResult {
  hasAccount: boolean;
  status: string | null;
  accountType: string | null;
}

// =============================================================================
// 1. Check Environment Variables
// =============================================================================

const ENV_VARS = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase Anon Key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", label: "Service Role Key" },
  { name: "ENCRYPTION_KEY", label: "Encryption Key" },
  { name: "UNIPILE_API_KEY", label: "Unipile API Key" },
  { name: "CRON_SECRET", label: "Cron Secret" },
] as const;

export async function checkEnvironment(): Promise<
  ActionResult<EnvCheckResult>
> {
  try {
    await getAuthUser();

    const checks = ENV_VARS.map((v) => ({
      name: v.name,
      label: v.label,
      present: Boolean(process.env[v.name]),
    }));

    return { success: true, data: { checks } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// 2. Test Supabase Connection
// =============================================================================

export async function testSupabaseConnection(): Promise<
  ActionResult<SupabaseTestResult>
> {
  try {
    const { supabase } = await getAuthUser();

    const start = Date.now();
    const { error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;

    if (error) throw error;

    return {
      success: true,
      data: { connected: true, latencyMs },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// 3. Test Unipile Connection
// =============================================================================

export async function testUnipileConnection(): Promise<
  ActionResult<UnipileTestResult>
> {
  try {
    await getAuthUser();

    const client = getUnipileClient();
    const result = await client.listAccounts({ limit: 10 });

    return {
      success: true,
      data: {
        connected: true,
        accountCount: result.items.length,
        accounts: result.items.map((a) => ({
          id: a.id,
          name: a.name ?? "Sans nom",
          status: a.status ?? a.sources?.[0]?.status ?? "unknown",
          type: a.type ?? a.sources?.[0]?.type ?? "unknown",
        })),
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// 4. Test API Key (Claude / OpenAI / Perplexity)
// =============================================================================

export async function testApiKey(
  keyType: "claude" | "openai" | "perplexity"
): Promise<ActionResult<ApiKeyTestResult>> {
  try {
    const { user } = await getAuthUser();

    const apiKey = await getDecryptedApiKey(user.id, keyType);
    if (!apiKey) {
      return {
        success: true,
        data: { present: false, valid: null },
      };
    }

    try {
      switch (keyType) {
        case "claude": {
          const anthropic = new Anthropic({ apiKey });
          await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          });
          break;
        }
        case "openai": {
          const openai = new OpenAI({ apiKey });
          await openai.models.list();
          break;
        }
        case "perplexity": {
          const pplx = new OpenAI({
            apiKey,
            baseURL: "https://api.perplexity.ai",
          });
          await pplx.chat.completions.create({
            model: "sonar",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          });
          break;
        }
      }

      return {
        success: true,
        data: { present: true, valid: true },
      };
    } catch (testErr) {
      return {
        success: true,
        data: {
          present: true,
          valid: false,
          error: (testErr as Error).message,
        },
      };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =============================================================================
// 5. Get LinkedIn Status
// =============================================================================

export async function getLinkedInStatus(): Promise<
  ActionResult<LinkedInDiagResult>
> {
  try {
    const result = await getLinkedInAccount();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const account: LinkedInAccountInfo | null = result.data;

    if (!account) {
      return {
        success: true,
        data: {
          hasAccount: false,
          status: null,
          accountType: null,
        },
      };
    }

    return {
      success: true,
      data: {
        hasAccount: true,
        status: account.status,
        accountType: account.accountType,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
