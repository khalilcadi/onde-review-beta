import { config } from "dotenv";
config({ path: ".env.local" });

const KHALIL_ACCOUNT_ID = "8bGZCi3mQw2LgAiGGuInqw";
const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

async function main() {
  const all: any[] = [];
  let cursor: string | null | undefined;
  let pages = 0;
  do {
    const url = new URL(`${UNIPILE_BASE_URL}/users/invite/sent`);
    url.searchParams.set("account_id", KHALIL_ACCOUNT_ID);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": UNIPILE_API_KEY, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(res.status, await res.text());
      process.exit(1);
    }
    const data: any = await res.json();
    all.push(...data.items);
    cursor = data.cursor;
    pages++;
    if (pages > 50) break;
  } while (cursor);

  console.log(`Total invitations: ${all.length} (over ${pages} pages)`);

  // Sort by parsed_datetime
  const sorted = all
    .filter((i) => i.parsed_datetime)
    .sort((a, b) => new Date(a.parsed_datetime).getTime() - new Date(b.parsed_datetime).getTime());

  console.log(`Oldest: ${sorted[0]?.parsed_datetime} - ${sorted[0]?.invited_user}`);
  console.log(`Newest: ${sorted[sorted.length - 1]?.parsed_datetime} - ${sorted[sorted.length - 1]?.invited_user}`);

  // Distribution by week
  const now = Date.now();
  const buckets: Record<string, number> = {
    "0-7d": 0,
    "7-14d": 0,
    "14-21d": 0,
    "21-30d": 0,
    "30-60d": 0,
    "60-90d": 0,
    ">90d": 0,
  };
  for (const i of sorted) {
    const ageDays = (now - new Date(i.parsed_datetime).getTime()) / 86400000;
    if (ageDays < 7) buckets["0-7d"]++;
    else if (ageDays < 14) buckets["7-14d"]++;
    else if (ageDays < 21) buckets["14-21d"]++;
    else if (ageDays < 30) buckets["21-30d"]++;
    else if (ageDays < 60) buckets["30-60d"]++;
    else if (ageDays < 90) buckets["60-90d"]++;
    else buckets[">90d"]++;
  }
  console.log("\nDistribution by age:");
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(8)} : ${v}`);
  }

  // Check if any of the 38 unmatched leads' identifiers are present
  const unmatched = [
    "gilles-haumont", "andreas-kozanitis", "stephane-le-lionnais",
    "sylvain-delahodde", "joseph-gonnachon", "florent-ribaut",
    "mohamed-kortaia",
  ];
  const idx = new Set(all.map((i) => i.invited_user_public_id?.toLowerCase()).filter(Boolean));
  console.log("\nSpot check unmatched names in Unipile sent index:");
  for (const id of unmatched) {
    const present = [...idx].some((k) => k.includes(id.split("-")[0]));
    console.log(`  ${id.padEnd(30)} : ${present ? "FOUND (partial)" : "NOT FOUND"}`);
  }
}

main().catch(console.error);
