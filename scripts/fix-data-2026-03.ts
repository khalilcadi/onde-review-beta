/**
 * One-time data fix script — March 2026
 *
 * Fixes:
 * 1. Delete orphan actions (lead_id=null, old tests)
 * 2. Delete Ludwig's manual test action (ba0fa98b)
 * 3. Insert missing profile for Ludwig (ce3c55fd)
 * 4. Delete duplicate step_order=3 + unwanted visit step in Khalil's sequence
 *
 * USAGE:
 *   npx tsx scripts/fix-data-2026-03.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== Fix Data — March 2026 ===\n");

  // ─── 1. Delete orphan actions (lead_id IS NULL) ─────────────────────────
  {
    const { data, error } = await supabase
      .from("actions")
      .delete()
      .is("lead_id", null)
      .select("id");

    if (error) {
      console.error("Error deleting orphan actions:", error.message);
    } else {
      console.log(`1. Deleted ${data?.length ?? 0} orphan actions (lead_id=null)`);
    }
  }

  // ─── 2. Delete Ludwig's manual test action ──────────────────────────────
  {
    const { data, error } = await supabase
      .from("actions")
      .delete()
      .eq("id", "ba0fa98b-7454-4465-94c0-f10cde3e2729")
      .select("id");

    if (error) {
      console.error("Error deleting Ludwig test action:", error.message);
    } else {
      console.log(`2. Deleted ${data?.length ?? 0} Ludwig test action (ba0fa98b)`);
    }
  }

  // ─── 3. Insert missing profile for Ludwig (ce3c55fd) ───────────────────
  {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: "ce3c55fd-8ccb-4330-b9d5-e21857b6ffdb",
        full_name: "Ludwig",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    if (error) {
      console.error("Error upserting Ludwig profile:", error.message);
    } else {
      console.log("3. Ludwig profile upserted (ce3c55fd)");
    }
  }

  // ─── 4. Fix Khalil's sequence: delete duplicate + unwanted visit ───────
  {
    // Delete duplicate step_order=3 (762498cd)
    const { data: d1, error: e1 } = await supabase
      .from("sequence_steps")
      .delete()
      .eq("id", "762498cd-83b8-43ce-98ef-a62b0fdccce8")
      .select("id");

    if (e1) {
      console.error("Error deleting duplicate step:", e1.message);
    } else {
      console.log(`4a. Deleted ${d1?.length ?? 0} duplicate step_order=3 (762498cd)`);
    }

    // Delete unwanted visit at step_order=6 (a2634209)
    const { data: d2, error: e2 } = await supabase
      .from("sequence_steps")
      .delete()
      .eq("id", "a2634209-d6cd-46f1-b9cf-0b75e3fd5382")
      .select("id");

    if (e2) {
      console.error("Error deleting unwanted visit step:", e2.message);
    } else {
      console.log(`4b. Deleted ${d2?.length ?? 0} unwanted visit step_order=6 (a2634209)`);
    }

    // Verify remaining steps
    const { data: remaining } = await supabase
      .from("sequence_steps")
      .select("id, step_type, step_order, delay_days")
      .eq("sequence_id", "30d6a99b-d235-4acb-a70b-44fdbabeecfa")
      .order("step_order", { ascending: true });

    console.log("4c. Remaining steps for Khalil sequence:");
    for (const s of remaining ?? []) {
      console.log(`    step_order=${s.step_order}: ${s.step_type} (delay=${s.delay_days}j)`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
