/**
 * All ai_usage today for Khalil, ordered chronologically
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", "%khalil%");
  const khalilId = profiles![0].id;

  const { data: rows, error } = await supabase
    .from("ai_usage")
    .select("created_at, agent_id, provider, metadata")
    .eq("user_id", khalilId)
    .order("created_at", { ascending: false })
    .limit(30);

  console.log(`Khalil id=${khalilId}`);
  console.log("error:", error);
  console.log(`${rows?.length || 0} dernières traces ai_usage Khalil\n`);

  for (const r of rows || []) {
    const md = r.metadata as Record<string, unknown>;
    console.log(
      `${r.created_at} | ${(r.agent_id || "").padEnd(15)} | ${(r.provider || "").padEnd(10)} | ${String(md?.action || "—").padEnd(25)} | leadId=${md?.leadId || "—"}`
    );
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
