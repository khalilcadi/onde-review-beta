// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { Lead } from "@/types/leads";
import { mapDbLeadToLead } from "@/lib/mappers";

export interface ListWithCount {
  id: string;
  name: string;
  leadsCount: number;
  createdAt: string;
}

export interface ListWithLeads extends ListWithCount {
  leads: Lead[];
}

export async function getLists(): Promise<ActionResult<ListWithCount[]>> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase
      .from("lists")
      .select("*, list_leads(count)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const lists: ListWithCount[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      leadsCount:
        (row.list_leads as unknown as { count: number }[])?.[0]?.count ?? 0,
      createdAt: row.created_at,
    }));

    return { success: true, data: lists };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getListWithLeads(
  listId: string
): Promise<ActionResult<ListWithLeads>> {
  try {
    const { supabase } = await getAuthUser();

    const { data: listRow, error: listErr } = await supabase
      .from("lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (listErr) throw listErr;

    const { data: junctionRows, error: jErr } = await supabase
      .from("list_leads")
      .select("lead_id")
      .eq("list_id", listId);

    if (jErr) throw jErr;

    const leadIds = (junctionRows ?? []).map((r) => r.lead_id);
    let leads: Lead[] = [];

    if (leadIds.length > 0) {
      const { data: leadRows, error: lErr } = await supabase
        .from("leads")
        .select("*")
        .in("id", leadIds);

      if (lErr) throw lErr;
      leads = (leadRows ?? []).map(mapDbLeadToLead);
    }

    return {
      success: true,
      data: {
        id: listRow.id,
        name: listRow.name,
        leadsCount: leads.length,
        createdAt: listRow.created_at,
        leads,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function createList(
  name: string
): Promise<ActionResult<ListWithCount>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("lists")
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (error) throw error;
    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        leadsCount: 0,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function renameList(
  id: string,
  name: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase
      .from("lists")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteList(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase.from("lists").delete().eq("id", id);
    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function addLeadsToList(
  listId: string,
  leadIds: string[]
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const rows = leadIds.map((lead_id) => ({ list_id: listId, lead_id }));

    const { error } = await supabase
      .from("list_leads")
      .upsert(rows, { ignoreDuplicates: true });

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function removeLeadFromList(
  listId: string,
  leadId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    const { error } = await supabase
      .from("list_leads")
      .delete()
      .eq("list_id", listId)
      .eq("lead_id", leadId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
