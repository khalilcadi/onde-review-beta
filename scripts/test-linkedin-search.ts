/**
 * Test LinkedIn search via Unipile API.
 *
 * Usage:
 *   npx tsx scripts/test-linkedin-search.ts [keywords]
 *
 * Default keywords: "directeur marketing"
 * If successful, runs a second search with "head of growth".
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

interface SearchItem {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  profile_url?: string;
  location?: string;
  profile_picture_url?: string;
  current_positions?: unknown;
  [key: string]: unknown;
}

async function main() {
  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";

  if (!apiKey) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const baseUrl = `https://${dsn}/api/v1`;

  // -- Helper: raw fetch --
  async function rawFetch(method: string, path: string, body?: unknown, params: Record<string, string> = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = {
      "X-API-KEY": apiKey!,
      Accept: "application/json",
    };
    if (body && method !== "GET") {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  }

  // -- 1. Auto-detect LinkedIn account --
  console.log("=== LINKEDIN SEARCH TEST ===\n");
  console.log(`DSN: ${dsn}\n`);

  console.log("1) Detecting LinkedIn account...");
  const accountsRes = await rawFetch("GET", "/accounts");
  if (!accountsRes.ok) {
    console.error("   Failed to list accounts:", accountsRes.status, accountsRes.text.slice(0, 300));
    process.exit(1);
  }
  const accounts = accountsRes.json?.items || accountsRes.json || [];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.error("   No accounts found.");
    process.exit(1);
  }

  const linkedinAcc = accounts.find(
    (a: { provider?: string; status?: string }) =>
      a.provider === "LINKEDIN" && (a.status === "OK" || a.status === "CONNECTED" || a.status === "active")
  ) || accounts.find((a: { provider?: string }) => a.provider === "LINKEDIN") || accounts[0];

  const accountId = linkedinAcc.id;
  console.log(`   Using account: ${accountId} (${linkedinAcc.name || linkedinAcc.identifier || "?"}) — status: ${linkedinAcc.status}\n`);

  // -- 2. Search function --
  async function searchLinkedIn(keywords: string) {
    console.log(`--- Search: "${keywords}" ---\n`);

    // account_id goes in query param per Unipile docs
    const body = {
      api: "classic",
      category: "people",
      keywords,
    };

    console.log(`   POST /linkedin/search?account_id=${accountId}`);
    console.log(`   Body: ${JSON.stringify(body)}\n`);

    const res = await rawFetch("POST", "/linkedin/search", body, { account_id: accountId });

    if (!res.ok) {
      console.error(`   ERROR ${res.status}:`, res.text.slice(0, 500));
      return null;
    }

    const data = res.json;

    // Log raw structure keys
    console.log(`   Response top-level keys: ${Object.keys(data || {}).join(", ")}`);

    const items: SearchItem[] = data?.items || data?.results || (Array.isArray(data) ? data : []);
    const paging = data?.paging;
    const total = paging?.total_count ?? data?.total ?? items.length;

    console.log(`   Total results: ${total}`);
    console.log(`   Items returned: ${items.length}`);
    if (paging) console.log(`   Paging: start=${paging.start}, page_count=${paging.page_count}, total=${paging.total_count}`);
    if (data?.cursor) console.log(`   Cursor (next page): ${String(data.cursor).slice(0, 50)}...`);
    console.log("");

    if (items.length > 0) {
      // Show first 10 results
      const display = items.slice(0, 10);
      for (let i = 0; i < display.length; i++) {
        const item = display[i];
        console.log(`   [${i + 1}] ${item.name || `${item.first_name || ""} ${item.last_name || ""}`.trim() || "—"}`);
        if (item.headline) console.log(`       Headline: ${item.headline}`);
        if (item.location) console.log(`       Location: ${item.location}`);
        if (item.profile_url) console.log(`       URL: ${item.profile_url}`);
        if (item.current_positions) console.log(`       Positions: ${JSON.stringify(item.current_positions)}`);
        console.log("");
      }
    }

    // Dump full first item for structure analysis
    if (items.length > 0) {
      console.log("   --- Full first item (structure analysis) ---");
      console.log(JSON.stringify(items[0], null, 2));
      console.log("");
    }

    return data;
  }

  // -- 3. Run searches --
  const keywords1 = process.argv[2] || "directeur marketing";
  const result1 = await searchLinkedIn(keywords1);

  if (result1) {
    console.log("\n========================================\n");
    await searchLinkedIn("head of growth");
  }

  console.log("=== DONE ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
