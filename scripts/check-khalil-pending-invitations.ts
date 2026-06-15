/**
 * Script: List Khalil's pending invitations (sent but not yet accepted)
 * with how long ago each was sent.
 *
 * Usage: npx tsx scripts/check-khalil-pending-invitations.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

function formatAge(sentAt: Date, now: Date): string {
  const diffMs = now.getTime() - sentAt.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffD > 0) {
    const remH = diffH - diffD * 24;
    return `${diffD}j ${remH}h`;
  }
  if (diffH > 0) {
    const remMin = diffMin - diffH * 60;
    return `${diffH}h ${remMin}min`;
  }
  return `${diffMin}min`;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all invitations sent by Khalil, joined with lead info
  const { data: actions, error } = await supabase
    .from("actions")
    .select(
      `
      id,
      sent_at,
      status,
      lead:leads!inner(id, first_name, last_name, company, stage, linkedin_url)
    `
    )
    .eq("user_id", KHALIL_USER_ID)
    .eq("action_type", "invitation")
    .eq("status", "sent")
    .order("sent_at", { ascending: true });

  if (error || !actions) {
    console.error("DB error:", error?.message);
    process.exit(1);
  }

  // Filter: lead still in stage 'invited' (not yet connected/responded)
  const pending = actions.filter((a: any) => a.lead?.stage === "invited");

  const now = new Date();

  console.log(`\nKhalil - Invitations envoyees en attente: ${pending.length}\n`);
  console.log(
    "Nom".padEnd(32) +
      " | " +
      "Entreprise".padEnd(30) +
      " | " +
      "Envoyee le".padEnd(19) +
      " | " +
      "Il y a"
  );
  console.log("-".repeat(110));

  const buckets: Record<string, number> = {
    "< 24h": 0,
    "1-3j": 0,
    "3-7j": 0,
    "7-14j": 0,
    "> 14j": 0,
  };

  for (const a of pending) {
    const sentAt = a.sent_at ? new Date(a.sent_at) : null;
    if (!sentAt) continue;
    const lead: any = a.lead;
    const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
    const company = lead.company ?? "";
    const sentStr = sentAt.toISOString().replace("T", " ").slice(0, 16);
    const age = formatAge(sentAt, now);
    console.log(
      name.slice(0, 32).padEnd(32) +
        " | " +
        company.slice(0, 30).padEnd(30) +
        " | " +
        sentStr.padEnd(19) +
        " | " +
        age
    );

    const diffDays = (now.getTime() - sentAt.getTime()) / (86400000);
    if (diffDays < 1) buckets["< 24h"]++;
    else if (diffDays < 3) buckets["1-3j"]++;
    else if (diffDays < 7) buckets["3-7j"]++;
    else if (diffDays < 14) buckets["7-14j"]++;
    else buckets["> 14j"]++;
  }

  console.log("\n===== RECAP PAR ANCIENNETE =====");
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(8)} : ${v}`);
  }

  if (pending.length > 0) {
    const oldest = pending[0] as any;
    const newest = pending[pending.length - 1] as any;
    console.log(
      `\n  Plus ancienne : ${formatAge(new Date(oldest.sent_at), now)} (${oldest.lead.first_name} ${oldest.lead.last_name})`
    );
    console.log(
      `  Plus recente  : ${formatAge(new Date(newest.sent_at), now)} (${newest.lead.first_name} ${newest.lead.last_name})`
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
