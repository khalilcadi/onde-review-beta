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
    .select("id, full_name");

  console.log(`${profiles?.length} profils total :`);
  for (const p of profiles || []) {
    console.log(`  ${p.id} | ${p.full_name}`);
  }

  console.log("\nai_usage count par user (last 7d) :");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  for (const p of profiles || []) {
    const { count } = await supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.id)
      .gte("created_at", sevenDaysAgo);
    console.log(`  ${(p.full_name || "—").padEnd(30)} → ${count ?? 0}`);
  }

  const { data: recent } = await supabase
    .from("ai_usage")
    .select("user_id, created_at, agent_id, metadata")
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("\nLes 3 plus récentes ai_usage (any user) :");
  for (const r of recent || []) {
    const md = r.metadata as Record<string, unknown>;
    console.log(`  ${r.created_at} | user_id=${r.user_id} | ${r.agent_id} | leadId=${md?.leadId || "—"}`);
  }
}

main().catch(console.error);
