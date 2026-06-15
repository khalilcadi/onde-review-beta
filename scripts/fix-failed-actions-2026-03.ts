/**
 * One-time fix script: Reschedule failed actions from March 24, 2026
 *
 * These actions failed due to transient Unipile connectivity issues
 * (Disconnected / SERVER_ERROR) between 08:15–09:55 UTC.
 *
 * USAGE:
 *   npx tsx scripts/fix-failed-actions-2026-03.ts
 *
 * PREREQUISITES:
 *   - .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  // 1. Find failed actions from March 24 with transient errors
  const { data: failedActions, error: selectError } = await supabase
    .from("actions")
    .select("id, user_id, lead_id, action_type, error_message, created_at")
    .eq("status", "failed")
    .gte("created_at", "2026-03-24T00:00:00Z")
    .lt("created_at", "2026-03-25T00:00:00Z")
    .or(
      "error_message.ilike.%Disconnected%,error_message.ilike.%SERVER_ERROR%"
    );

  if (selectError) {
    console.error("Error querying failed actions:", selectError.message);
    process.exit(1);
  }

  if (!failedActions?.length) {
    console.log("No failed actions found matching criteria.");
    return;
  }

  console.log(`Found ${failedActions.length} failed actions to reschedule:\n`);
  for (const a of failedActions) {
    console.log(
      `  - ${a.id} | ${a.action_type} | ${a.error_message?.slice(0, 80)}`
    );
  }

  // 2. Update them to validated with scheduled_at tomorrow 07:30 UTC (09:30 Paris)
  const actionIds = failedActions.map((a) => a.id);
  const { error: updateError, count } = await supabase
    .from("actions")
    .update({
      status: "validated",
      error_message: null,
      scheduled_at: "2026-03-26T07:30:00Z",
      validated_at: new Date().toISOString(),
    })
    .in("id", actionIds);

  if (updateError) {
    console.error("Error updating actions:", updateError.message);
    process.exit(1);
  }

  console.log(
    `\nSuccessfully rescheduled ${actionIds.length} actions for 2026-03-26 07:30 UTC.`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
