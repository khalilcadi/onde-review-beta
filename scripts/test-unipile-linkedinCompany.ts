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

  const { data: la } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", khalilId)
    .eq("status", "active")
    .single();

  const { getUnipileClient } = await import("@/lib/unipile/client");
  const client = getUnipileClient();

  // Test 3 company IDs
  const testIds = [
    { id: "109481041", name: "TBM Partners (Thomas Martin actuel)" },
    { id: "86747256", name: "Revolia" },
    { id: "27099046", name: "ComeUp" },
  ];

  for (const t of testIds) {
    console.log(`\n=== ${t.name} (id=${t.id}) ===`);
    try {
      const res = (await client.linkedinCompany(t.id, la!.unipile_account_id)) as Record<string, unknown>;
      console.log("Keys:", Object.keys(res));
      console.log(JSON.stringify(res, null, 2));
    } catch (err) {
      console.error("FAIL:", err instanceof Error ? err.message : err);
    }
  }
}

main().catch(console.error);
