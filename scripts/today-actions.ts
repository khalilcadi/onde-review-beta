/**
 * Liste les actions du jour pour Khalil.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

async function main() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data: actions, error } = await supabase
    .from("actions")
    .select(
      `id, action_type, status, scheduled_at, sent_at, validated_at, created_at, generated_message, final_message, error_message,
       lead:leads (first_name, last_name, company),
       sequence:sequences (name),
       step:sequence_steps (step_order, step_type)`
    )
    .eq("user_id", USER_ID)
    .or(
      `scheduled_at.gte.${startOfDay.toISOString()},and(scheduled_at.is.null,created_at.gte.${startOfDay.toISOString()})`
    )
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error(error);
    return;
  }

  if (!actions?.length) {
    console.log("Aucune action pour aujourd'hui.");
    return;
  }

  console.log(`\n=== ${actions.length} actions aujourd'hui ===\n`);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const a of actions) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byType[a.action_type] = (byType[a.action_type] || 0) + 1;
  }
  console.log("Par statut :", byStatus);
  console.log("Par type   :", byType);
  console.log("");

  for (const a of actions) {
    const lead = Array.isArray(a.lead) ? a.lead[0] : a.lead;
    const seq = Array.isArray(a.sequence) ? a.sequence[0] : a.sequence;
    const step = Array.isArray(a.step) ? a.step[0] : a.step;
    const name = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : "?";
    const company = lead?.company ?? "";
    const sched = a.scheduled_at ? new Date(a.scheduled_at).toISOString().slice(11, 16) : "—";
    const sent = a.sent_at ? new Date(a.sent_at).toISOString().slice(11, 16) : "—";
    const stepLabel = step ? `step${step.step_order}` : "?";
    console.log(
      `[${a.status.padEnd(11)}] ${a.action_type.padEnd(10)} ${sched} → sent ${sent}  ${name} (${company})  ${seq?.name ?? "?"} / ${stepLabel}`
    );
    if (a.error_message) {
      console.log(`              ⚠ ${a.error_message.slice(0, 120)}`);
    }
  }
}

main().catch(console.error);
