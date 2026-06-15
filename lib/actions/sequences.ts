// @ts-nocheck
"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { Tables } from "@/types/database";
import type { Sequence, SequenceStep } from "@/types/sequences";
import { mapDbSequenceToSequence, mapDbStepToStep } from "@/lib/mappers";

type SeqRow = Tables<"sequences">;
type StepRow = Tables<"sequence_steps">;

export async function getSequences(): Promise<ActionResult<Sequence[]>> {
  try {
    const { supabase } = await getAuthUser();

    const { data: seqRows, error: seqErr } = await supabase
      .from("sequences")
      .select("*")
      .order("created_at", { ascending: false });

    if (seqErr) throw seqErr;

    const rows = (seqRows ?? []) as SeqRow[];
    const seqIds = rows.map((s) => s.id);

    let stepRows: StepRow[] = [];

    if (seqIds.length > 0) {
      const { data, error: stepErr } = await supabase
        .from("sequence_steps")
        .select("*")
        .in("sequence_id", seqIds)
        .order("step_order", { ascending: true });

      if (stepErr) throw stepErr;
      stepRows = (data ?? []) as StepRow[];
    }

    const stepsBySeq = new Map<string, StepRow[]>();
    for (const step of stepRows) {
      const list = stepsBySeq.get(step.sequence_id) ?? [];
      list.push(step);
      stepsBySeq.set(step.sequence_id, list);
    }

    const sequences = rows.map((row) =>
      mapDbSequenceToSequence(row, stepsBySeq.get(row.id) ?? [])
    );

    return { success: true, data: sequences };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getSequenceById(
  id: string
): Promise<ActionResult<Sequence>> {
  try {
    const { supabase } = await getAuthUser();

    const { data: seqRow, error: seqErr } = await supabase
      .from("sequences")
      .select("*")
      .eq("id", id)
      .single();

    if (seqErr) throw seqErr;

    const { data: steps, error: stepErr } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", id)
      .order("step_order", { ascending: true });

    if (stepErr) throw stepErr;

    return {
      success: true,
      data: mapDbSequenceToSequence(
        seqRow as SeqRow,
        (steps ?? []) as StepRow[]
      ),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function createSequence(input: {
  name: string;
  persona?: string;
}): Promise<ActionResult<Sequence>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("sequences")
      .insert({
        user_id: user.id,
        name: input.name,
        persona: input.persona,
        status: "draft",
        stats: {
          totalLeads: 0,
          activeLeads: 0,
          completedLeads: 0,
          responseRate: 0,
          conversionRate: 0,
        },
      })
      .select()
      .single();

    if (error) throw error;
    const seqRow = data as SeqRow;

    const defaultSteps = [
      {
        sequence_id: seqRow.id,
        step_type: "visit",
        delay_days: 0,
        generation_mode: "ai",
        step_order: 1,
      },
      {
        sequence_id: seqRow.id,
        step_type: "invitation",
        delay_days: 1,
        generation_mode: "ai",
        step_order: 2,
      },
      {
        sequence_id: seqRow.id,
        step_type: "message",
        delay_days: 3,
        generation_mode: "ai",
        step_order: 3,
      },
    ];

    const { data: steps, error: stepErr } = await supabase
      .from("sequence_steps")
      .insert(defaultSteps)
      .select();

    if (stepErr) throw stepErr;

    return {
      success: true,
      data: mapDbSequenceToSequence(seqRow, (steps ?? []) as StepRow[]),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function updateSequence(
  id: string,
  updates: {
    name?: string;
    persona?: string;
    status?: string;
  }
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    const row: Record<string, unknown> = {};
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.persona !== undefined) row.persona = updates.persona;
    if (updates.status !== undefined) row.status = updates.status;

    const { error } = await supabase
      .from("sequences")
      .update(row as Tables<"sequences">)
      .eq("id", id);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteSequence(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase.from("sequences").delete().eq("id", id);
    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function addStep(
  sequenceId: string,
  step: {
    stepType: string;
    delayDays: number;
    generationMode?: string;
    template?: string;
  }
): Promise<ActionResult<SequenceStep>> {
  try {
    const { supabase } = await getAuthUser();

    // Compute step_order server-side from DB (source of truth)
    const { data: maxRow } = await supabase
      .from("sequence_steps")
      .select("step_order")
      .eq("sequence_id", sequenceId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newStepOrder = (maxRow?.step_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("sequence_steps")
      .insert({
        sequence_id: sequenceId,
        step_type: step.stepType,
        delay_days: step.delayDays,
        generation_mode: step.generationMode || "ai",
        template: step.template,
        step_order: newStepOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: mapDbStepToStep(data as StepRow) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function updateStep(
  stepId: string,
  updates: {
    stepType?: string;
    delayDays?: number;
    generationMode?: string;
    template?: string | null;
    condition?: string | null;
  }
): Promise<ActionResult<SequenceStep>> {
  try {
    const { supabase } = await getAuthUser();

    const row: Record<string, unknown> = {};
    if (updates.stepType !== undefined) row.step_type = updates.stepType;
    if (updates.delayDays !== undefined) row.delay_days = updates.delayDays;
    if (updates.generationMode !== undefined) row.generation_mode = updates.generationMode;
    if (updates.template !== undefined) row.template = updates.template;
    if (updates.condition !== undefined) row.condition = updates.condition;

    const { data, error } = await supabase
      .from("sequence_steps")
      .update(row)
      .eq("id", stepId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: mapDbStepToStep(data as StepRow) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteStep(stepId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    // Get the step's sequence_id before deleting
    const { data: step } = await supabase
      .from("sequence_steps")
      .select("sequence_id")
      .eq("id", stepId)
      .single();

    const { error } = await supabase
      .from("sequence_steps")
      .delete()
      .eq("id", stepId);
    if (error) throw error;

    // Re-index step_order for remaining steps in the sequence
    if (step?.sequence_id) {
      const { data: remaining } = await supabase
        .from("sequence_steps")
        .select("id")
        .eq("sequence_id", step.sequence_id)
        .order("step_order", { ascending: true });

      if (remaining?.length) {
        for (let i = 0; i < remaining.length; i++) {
          await supabase
            .from("sequence_steps")
            .update({ step_order: i + 1 })
            .eq("id", remaining[i].id);
        }
      }
    }

    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function addLeadToSequence(
  sequenceId: string,
  leadId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    // Check if lead already in sequence
    const { data: existing } = await supabase
      .from("sequence_leads")
      .select("id")
      .eq("sequence_id", sequenceId)
      .eq("lead_id", leadId)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "Ce lead est déjà dans cette séquence" };
    }

    const { error } = await supabase
      .from("sequence_leads")
      .insert({
        sequence_id: sequenceId,
        lead_id: leadId,
        current_step: 0,
        status: "active",
      });

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface SequenceLead {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  title?: string;
  company?: string;
  linkedinUrl: string;
  hasEnrichment: boolean;
  currentStep: number;
  status: string;
}

export async function getSequenceLeads(
  sequenceId: string
): Promise<ActionResult<SequenceLead[]>> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase
      .from("sequence_leads")
      .select("lead_id, current_step, status, leads(id, first_name, last_name, title, company, linkedin_url, enrichment_data)")
      .eq("sequence_id", sequenceId);

    if (error) throw error;

    const leads: SequenceLead[] = (data ?? [])
      .filter((row: Record<string, unknown>) => row.leads)
      .map((row: Record<string, unknown>) => {
        const l = row.leads as Record<string, unknown>;
        const firstName = (l.first_name as string) ?? "";
        const lastName = (l.last_name as string) ?? "";
        const linkedinUrl = (l.linkedin_url as string) ?? "";
        const full = `${firstName} ${lastName}`.trim();
        let displayName = full;
        if (!displayName) {
          const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
          displayName = match ? match[1].replace(/-/g, " ") : "Lead inconnu";
        }
        return {
          id: l.id as string,
          firstName,
          lastName,
          displayName,
          title: (l.title as string) ?? undefined,
          company: (l.company as string) ?? undefined,
          linkedinUrl,
          hasEnrichment: !!l.enrichment_data,
          currentStep: (row.current_step as number) ?? 0,
          status: (row.status as string) ?? "active",
        };
      });

    return { success: true, data: leads };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface StepStat {
  stepId: string;
  stepOrder: number;
  stepType: string;
  waiting: number;
  completed: number;
}

export interface SequenceStepStats {
  steps: StepStat[];
  totalLeads: number;
  completedLeads: number;
  respondedLeads: number;
}

export async function getSequenceStepStats(
  sequenceId: string
): Promise<ActionResult<SequenceStepStats>> {
  try {
    const { supabase } = await getAuthUser();

    const { data: steps, error: stepErr } = await supabase
      .from("sequence_steps")
      .select("id, step_type, step_order")
      .eq("sequence_id", sequenceId)
      .order("step_order", { ascending: true });

    if (stepErr) throw stepErr;

    const { data: seqLeads, error: slErr } = await supabase
      .from("sequence_leads")
      .select("current_step, status")
      .eq("sequence_id", sequenceId);

    if (slErr) throw slErr;

    const allLeads = seqLeads ?? [];
    const stepStats = (steps ?? []).map((step) => {
      const waiting = allLeads.filter(
        (sl) => sl.status === "active" && sl.current_step === step.step_order - 1
      ).length;
      const completed = allLeads.filter(
        (sl) => sl.current_step >= step.step_order
      ).length;
      return {
        stepId: step.id,
        stepOrder: step.step_order,
        stepType: step.step_type,
        waiting,
        completed,
      };
    });

    return {
      success: true,
      data: {
        steps: stepStats,
        totalLeads: allLeads.length,
        completedLeads: allLeads.filter((sl) => sl.status === "completed").length,
        respondedLeads: allLeads.filter((sl) => sl.status === "responded").length,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function removeLeadFromSequence(
  sequenceId: string,
  leadId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();

    const { error } = await supabase
      .from("sequence_leads")
      .delete()
      .eq("sequence_id", sequenceId)
      .eq("lead_id", leadId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
