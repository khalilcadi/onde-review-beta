import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const KHALIL = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

const TARGETS = [
  { firstName: "Cyrille", lastName: "GORMAND" },
  { firstName: "Joël", lastName: "ABREU" },
  { firstName: "JEAN SEBASTIEN", lastName: "WAGNER" },
];

async function main() {
  for (const t of TARGETS) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, first_name, last_name, stage, status")
      .eq("user_id", KHALIL)
      .eq("first_name", t.firstName)
      .eq("last_name", t.lastName)
      .single();
    if (!lead) {
      console.log(`${t.firstName} → introuvable`);
      continue;
    }
    const { data: sl } = await supabase
      .from("sequence_leads")
      .select("current_step, status, sequences(name, status)")
      .eq("lead_id", lead.id);
    const { data: actions } = await supabase
      .from("actions")
      .select("action_type, status, step_id, sequence_steps(step_order, step_type), created_at, sent_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });
    console.log(`\n=== ${lead.first_name} ${lead.last_name} ===`);
    console.log(`stage: ${lead.stage} | status: ${lead.status}`);
    console.log(`sequence_leads:`, JSON.stringify(sl, null, 2));
    console.log(`actions (${actions?.length}):`);
    actions?.forEach((a) => {
      const s = a.sequence_steps as any;
      console.log(
        `  - [${a.status}] ${a.action_type} step_order=${s?.step_order} (${s?.step_type})  created=${a.created_at?.slice(0, 16)}  sent=${a.sent_at?.slice(0, 16) ?? "—"}`
      );
    });
  }
}
main().catch(console.error);
