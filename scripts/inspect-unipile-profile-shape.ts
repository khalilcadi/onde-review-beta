/**
 * Récupère le profile Unipile complet pour Thomas Martin (lead test) et dump
 * tout work_experience pour repérer comment extraire l'ID/identifier de la
 * company actuelle (et passer à linkedinCompany()).
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

  const { data: la } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", khalilId)
    .eq("status", "active")
    .single();

  if (!la?.unipile_account_id) {
    console.log("Pas de compte LinkedIn actif");
    return;
  }

  const { getUnipileClient, extractLinkedInIdentifier } = await import("@/lib/unipile/client");
  const client = getUnipileClient();

  const identifier = "thomas-martin"; // le lead Thomas Martin (Elevate Conseil)
  console.log(`\nFetching profile: ${identifier}\n`);

  const profile = (await client.getUserProfile(identifier, la.unipile_account_id, {
    linkedinSections: "*",
  })) as Record<string, unknown>;

  console.log("=== TOP-LEVEL KEYS ===");
  console.log(Object.keys(profile));

  console.log("\n=== work_experience (full) ===");
  console.log(JSON.stringify(profile.work_experience, null, 2));

  console.log("\n=== experience (full) ===");
  console.log(JSON.stringify(profile.experience, null, 2));

  // Specifically dump first experience entry to see all available keys
  const exp = (profile.work_experience || profile.experience) as Array<Record<string, unknown>> | undefined;
  if (exp && exp.length > 0) {
    console.log("\n=== first experience entry keys ===");
    console.log(Object.keys(exp[0]));
  }

  // Also try a second known good profile
  console.log("\n\n=== TESTING with julien-rousseau (another batch lead) ===");
  const profile2 = (await client.getUserProfile("julien-rousseau", la.unipile_account_id, {
    linkedinSections: "*",
  })) as Record<string, unknown>;
  const exp2 = (profile2.work_experience || profile2.experience) as Array<Record<string, unknown>> | undefined;
  if (exp2 && exp2.length > 0) {
    console.log("first experience entry:");
    console.log(JSON.stringify(exp2[0], null, 2));
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
