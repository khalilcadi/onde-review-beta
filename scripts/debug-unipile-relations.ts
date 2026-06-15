import { config } from "dotenv";
config({ path: ".env.local" });

const KHALIL_ACCOUNT_ID = "8bGZCi3mQw2LgAiGGuInqw";
const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

async function main() {
  const url = new URL(`${UNIPILE_BASE_URL}/users/relations`);
  url.searchParams.set("account_id", KHALIL_ACCOUNT_ID);
  url.searchParams.set("limit", "3");
  const res = await fetch(url.toString(), {
    headers: { "X-API-KEY": UNIPILE_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(res.status, await res.text());
    process.exit(1);
  }
  const data: any = await res.json();
  console.log("Top-level keys:", Object.keys(data));
  console.log("Items count:", data.items?.length);
  console.log("Cursor:", data.cursor);
  console.log("\n--- First item ---");
  console.log(JSON.stringify(data.items?.[0], null, 2));
  console.log("\n--- Second item ---");
  console.log(JSON.stringify(data.items?.[1], null, 2));
}

main().catch(console.error);
