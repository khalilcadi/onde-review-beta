// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { Lead } from "@/types/leads";
import type { Tables } from "@/types/database";
import type { LeadWithOwner } from "@/lib/mappers";
import { mapDbLeadToLead } from "@/lib/mappers";

type LeadRow = Tables<"leads">;

// Helper: fetch profiles map { userId → fullName }
async function getProfilesMap(
  supabase: ReturnType<Awaited<ReturnType<typeof getAuthUser>>["supabase"]>
): Promise<Map<string, string>> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name");

  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, p.full_name ?? "Inconnu");
  }
  return map;
}

function toLeadWithOwner(row: LeadRow, profilesMap: Map<string, string>): LeadWithOwner {
  return {
    ...mapDbLeadToLead(row),
    ownerName: profilesMap.get(row.user_id) ?? "Inconnu",
  };
}

// --- READ ---

export async function getLeads(userId?: string): Promise<ActionResult<LeadWithOwner[]>> {
  try {
    const { supabase } = await getAuthUser();

    let query = supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const [{ data, error }, profilesMap] = await Promise.all([
      query,
      getProfilesMap(supabase),
    ]);

    if (error) throw error;

    return {
      success: true,
      data: (data ?? []).map((row) => toLeadWithOwner(row as LeadRow, profilesMap)),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getLeadById(
  id: string
): Promise<ActionResult<LeadWithOwner>> {
  try {
    const { supabase } = await getAuthUser();

    const [{ data, error }, profilesMap] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single(),
      getProfilesMap(supabase),
    ]);

    if (error) throw error;

    return {
      success: true,
      data: toLeadWithOwner(data as LeadRow, profilesMap),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// --- CREATE (avec anti-doublon linkedin_url) ---

export async function createLead(input: {
  firstName?: string;
  lastName?: string;
  linkedinUrl: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  enrichmentData?: Record<string, unknown>;
}): Promise<ActionResult<Lead>> {
  try {
    const { supabase, user } = await getAuthUser();

    // Anti-doublon: check linkedin_url
    const { data: existing, error: dupError } = await supabase
      .from("leads")
      .select("id")
      .eq("linkedin_url", input.linkedinUrl)
      .maybeSingle();

    if (dupError) {
      console.error("Anti-doublon query error:", dupError.message);
    }

    if (existing) {
      return {
        success: false,
        error: "Ce lead existe déjà dans le pipeline",
      };
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        first_name: input.firstName || "",
        last_name: input.lastName || "",
        linkedin_url: input.linkedinUrl,
        title: input.title,
        company: input.company,
        email: input.email,
        phone: input.phone,
        tags: input.tags ?? [],
        ...(input.enrichmentData ? { enrichment_data: input.enrichmentData } : {}),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: mapDbLeadToLead(data as LeadRow) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// --- UPDATE (RLS enforce ownership) ---

export async function updateLead(
  id: string,
  updates: {
    status?: string;
    stage?: string;
    tags?: string[];
    notes?: string;
    score?: number;
    title?: string;
    company?: string;
    email?: string;
    phone?: string;
    enrichment_data?: Record<string, unknown>;
  }
): Promise<ActionResult<Lead>> {
  try {
    const { supabase } = await getAuthUser();

    const row: Record<string, unknown> = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.stage !== undefined) row.stage = updates.stage;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (updates.score !== undefined) row.score = updates.score;
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.company !== undefined) row.company = updates.company;
    if (updates.email !== undefined) row.email = updates.email;
    if (updates.phone !== undefined) row.phone = updates.phone;
    if (updates.enrichment_data !== undefined) row.enrichment_data = updates.enrichment_data;

    const { data, error } = await supabase
      .from("leads")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: mapDbLeadToLead(data as LeadRow) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// --- DELETE (RLS enforce ownership) ---

export async function deleteLead(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteLeads(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) throw error;
    return { success: true, data: { deleted: ids.length } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
