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

  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, linkedin_url, company")
    .eq("user_id", khalilId)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z");

  console.log(`${leads?.length} leads du 2026-04-23\n`);

  const stats = {
    withLinkedinUrl: 0,
    withoutLinkedinUrl: 0,
    withCompany: 0,
    withoutCompany: 0,
  };
  const noUrl: string[] = [];
  for (const l of leads || []) {
    if (l.linkedin_url) stats.withLinkedinUrl++;
    else { stats.withoutLinkedinUrl++; noUrl.push(`${l.first_name} ${l.last_name}`); }
    if (l.company) stats.withCompany++;
    else stats.withoutCompany++;
  }
  console.log("Pré-requis enrichissement :");
  console.log(`  avec LinkedIn URL  : ${stats.withLinkedinUrl}`);
  console.log(`  sans LinkedIn URL  : ${stats.withoutLinkedinUrl}`);
  console.log(`  avec company       : ${stats.withCompany}`);
  console.log(`  sans company       : ${stats.withoutCompany}`);
  if (noUrl.length) console.log(`  exemples sans URL  :`, noUrl.slice(0, 5));

  // Check env vars needed
  console.log("\nEnv vars requises pour batch local :");
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UNIPILE_API_KEY", "UNIPILE_DSN", "ICYPEAS_API_KEY", "ENCRYPTION_KEY"]) {
    console.log(`  ${k.padEnd(35)} : ${process.env[k] ? "✅" : "❌ MANQUANT"}`);
  }
}

main().catch(console.error);
