"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { RagBloc } from "@/lib/rag/types";
import type { RagBlocId } from "@/lib/rag/mapping";
import { listAvailableBlocs, clearRagCache } from "@/lib/rag/context";
import type { Json } from "@/types/database";

// Summary of a RAG bloc (for listing)
export interface RagBlocSummary {
  id: RagBlocId;
  title: string;
  sectionCount: number;
}

// Get all available RAG blocs with summary info
export async function getRagBlocs(): Promise<ActionResult<RagBlocSummary[]>> {
  try {
    await getAuthUser();
    const blocs = await listAvailableBlocs();
    return { success: true, data: blocs };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Get full content of a specific RAG bloc from knowledge/*.json
export async function getRagBlocContent(
  blocId: string
): Promise<ActionResult<RagBloc>> {
  try {
    await getAuthUser();
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "knowledge", `${blocId}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    const bloc: RagBloc = JSON.parse(content);
    return { success: true, data: bloc };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Get user RAG overrides from DB (user_rag_data table)
export async function getUserRagOverrides(): Promise<
  ActionResult<Record<string, Json>>
> {
  try {
    const { supabase, user } = await getAuthUser();
    const { data, error } = await supabase
      .from("user_rag_data")
      .select("data_type, content")
      .eq("user_id", user.id);

    if (error) throw error;

    const overrides: Record<string, Json> = {};
    for (const row of data || []) {
      overrides[row.data_type] = row.content;
    }
    return { success: true, data: overrides };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Save a user RAG override for a specific bloc
export async function saveRagOverride(
  blocId: string,
  content: Json
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();
    const { error } = await supabase.from("user_rag_data").upsert(
      {
        user_id: user.id,
        data_type: blocId,
        content,
      },
      { onConflict: "user_id,data_type" }
    );

    if (error) throw error;
    clearRagCache();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Reset (delete) a user RAG override, reverting to code defaults
export async function resetRagOverride(
  blocId: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();
    const { error } = await supabase
      .from("user_rag_data")
      .delete()
      .eq("user_id", user.id)
      .eq("data_type", blocId);

    if (error) throw error;
    clearRagCache();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
