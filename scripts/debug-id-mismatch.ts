import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const KHALIL_ACCOUNT_ID = "8bGZCi3mQw2LgAiGGuInqw";
const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Pull Khalil's old invited leads
  const { data } = await supabase
    .from("leads")
    .select("first_name, last_name, linkedin_url")
    .eq("user_id", KHALIL_USER_ID)
    .eq("stage", "invited")
    .ilike("first_name", "%Gilles%");
  console.log("DB leads matching 'Gilles':");
  console.log(data);

  // Fetch Unipile sent invitations and find Gilles
  const all: any[] = [];
  let cursor: string | null | undefined;
  do {
    const url = new URL(`${UNIPILE_BASE_URL}/users/invite/sent`);
    url.searchParams.set("account_id", KHALIL_ACCOUNT_ID);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": UNIPILE_API_KEY, Accept: "application/json" },
    });
    const d: any = await res.json();
    all.push(...d.items);
    cursor = d.cursor;
  } while (cursor);

  const gillesInvitations = all.filter((i) =>
    (i.invited_user ?? "").toLowerCase().includes("gilles")
  );
  console.log("\nUnipile invitations with 'gilles':");
  for (const i of gillesInvitations) {
    console.log(
      `  - ${i.invited_user} | public_id=${i.invited_user_public_id} | sent=${i.parsed_datetime}`
    );
  }

  // Also check Andreas, Mohamed, Florent
  for (const name of ["Andreas", "Mohamed", "Florent", "Marion", "Quentin"]) {
    const matches = all.filter((i) =>
      (i.invited_user ?? "").toLowerCase().includes(name.toLowerCase())
    );
    console.log(`\nUnipile '${name}': ${matches.length} match(es)`);
    for (const i of matches) {
      console.log(
        `  - ${i.invited_user} | public_id=${i.invited_user_public_id}`
      );
    }
  }
}

main().catch(console.error);
