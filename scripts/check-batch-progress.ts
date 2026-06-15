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

  const KHALIL = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, enrichment_data")
    .eq("user_id", KHALIL)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z");

  if (!leads) return;

  let withSize = 0;
  let withProfile = 0;
  let withNews = 0;
  const noSize: string[] = [];

  for (const l of leads) {
    const ed = (l.enrichment_data as Record<string, unknown>) || {};
    const company = ed.company as Record<string, unknown> | undefined;
    if (company?.size) withSize++;
    else noSize.push(`${l.first_name} ${l.last_name}`);
    if (ed.linkedin_profile) withProfile++;
    if (company?.news) withNews++;
  }

  console.log(`Total batch 2026-04-23 : ${leads.length}`);
  console.log(`Avec linkedin_profile  : ${withProfile}`);
  console.log(`Avec company.size      : ${withSize}  ← enrichi nouveau flow`);
  console.log(`Avec company.news      : ${withNews}  ← OpenAI web_search done`);
  console.log(`\nReste à enrichir       : ${leads.length - withSize}`);
  if (noSize.length > 0 && noSize.length <= 20) {
    console.log("\nLeads sans company.size :");
    noSize.slice(0, 20).forEach((n) => console.log(`  - ${n}`));
  }
}

main().catch(console.error);
