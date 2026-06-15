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

  const { data: lead } = await supabase
    .from("leads")
    .select("first_name, last_name, score, status, stage, enrichment_data")
    .eq("id", "e5cf50e5-6560-4fd8-82dc-2d2a43fe52b9")
    .single();

  console.log(`${lead?.first_name} ${lead?.last_name}`);
  console.log(`score: ${lead?.score} | status: ${lead?.status} | stage: ${lead?.stage}`);
  const ed = lead?.enrichment_data as Record<string, unknown>;
  console.log(`\nClés enrichment_data : ${Object.keys(ed).join(", ")}`);
  console.log(`\nlinkedin_profile :`);
  console.log(JSON.stringify(ed.linkedin_profile, null, 2));
  console.log(`\nsignal :`, ed.signal);
  console.log(`\nhook_recommande :`, ed.hook_recommande);
  console.log(`\nperson :`, ed.person);
  console.log(`\nscoring_detail :`, ed.scoring_detail);
}

main().catch(console.error);
