/**
 * Extract current M2 actions in daily queue (status pending/validated),
 * detect which ones are relance vs dernier_message, and dump full generated messages.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

async function main() {
  // Get all pending/validated actions (message/inmail)
  const { data: actions } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", USER_ID)
    .in("action_type", ["message", "inmail"])
    .in("status", ["pending", "validated", "processing"])
    .order("created_at", { ascending: false });

  if (!actions?.length) {
    console.log("Aucune action message/inmail pending.");
    return;
  }

  console.log(`\n📦 ${actions.length} actions pending/validated trouvées.\n`);

  // For each, determine if it's M2 relance or dernier_message
  const output: any[] = [];

  for (const a of actions) {
    // Count previous sent messages for this lead + sequence
    const { data: prevSent } = await supabase
      .from("actions")
      .select("id, generated_message, final_message, sent_at, step_id")
      .eq("lead_id", a.lead_id)
      .eq("sequence_id", a.sequence_id)
      .in("action_type", ["message", "inmail"])
      .eq("status", "sent")
      .order("sent_at", { ascending: true });

    // Skip M1 (no previous sent)
    if (!prevSent?.length) continue;

    // Get step info
    const { data: step } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("id", a.step_id)
      .single();

    const { data: allSteps } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", a.sequence_id)
      .order("step_order");

    const messageSteps = (allSteps || []).filter(s => ["message", "inmail"].includes(s.step_type));
    const lastMessageStep = messageSteps[messageSteps.length - 1];
    const isLast = step?.step_order === lastMessageStep?.step_order;
    const situation = isLast ? "dernier_message" : "relance";

    // Get lead info
    const { data: lead } = await supabase
      .from("leads")
      .select("first_name, last_name, title, company, tags, enrichment_data, score, status")
      .eq("id", a.lead_id)
      .single();

    const ed: any = lead?.enrichment_data || {};
    const segment = ed.scoring_detail?.segment_icp || "?";
    const signalType = ed.signal?.type || "?";
    const bioLen = ed.linkedin_profile?.about?.length || 0;

    output.push({
      action_id: a.id,
      status: a.status,
      created_at: a.created_at,
      lead: lead ? `${lead.first_name} ${lead.last_name} (${lead.title} @ ${lead.company}) — score ${lead.score}` : "?",
      lead_id: a.lead_id,
      situation,
      step_order: step?.step_order,
      total_message_steps: messageSteps.length,
      previousMessagesCount: prevSent.length,
      segment,
      signalType,
      bioLen,
      generated_message: a.generated_message,
      generation_reasoning: a.generation_reasoning,
      generation_data: a.generation_data,
      previousMessages: prevSent.map(p => p.final_message || p.generated_message),
    });
  }

  console.log(`➜ ${output.length} actions M2 (pending/validated) :\n`);
  for (const o of output) {
    console.log(`${"─".repeat(80)}`);
    console.log(`Lead : ${o.lead}`);
    console.log(`Action : ${o.action_id} | status=${o.status} | created=${o.created_at}`);
    console.log(`Situation : ${o.situation} | step ${o.step_order}/${o.total_message_steps} | prev=${o.previousMessagesCount}`);
    console.log(`Segment : ${o.segment} | Signal : ${o.signalType} | Bio : ${o.bioLen} chars`);
    console.log(`\nMessage généré :`);
    console.log(o.generated_message);
    console.log(`\nReasoning : ${o.generation_reasoning}`);
    console.log(`\nMessages précédents envoyés :`);
    o.previousMessages.forEach((m: string, i: number) => console.log(`  ${i + 1}. ${m}`));
  }

  // Dump
  fs.writeFileSync(path.resolve(process.cwd(), "audit-m2-pending.json"), JSON.stringify(output, null, 2));
  console.log(`\n✅ Dump: audit-m2-pending.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
