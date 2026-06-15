/**
 * Test: boolean search capabilities via Unipile LinkedIn search
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
  if (!apiKey) { console.error("Missing UNIPILE_API_KEY"); process.exit(1); }

  const baseUrl = `https://${dsn}/api/v1`;

  async function search(label: string, body: Record<string, unknown>, accountId: string) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TEST: ${label}`);
    console.log(`Body: ${JSON.stringify(body)}`);
    console.log(`${"=".repeat(60)}`);

    const url = new URL(`${baseUrl}/linkedin/search`);
    url.searchParams.set("account_id", accountId);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "X-API-KEY": apiKey!, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!res.ok) {
      console.log(`ERROR ${res.status}: ${text.slice(0, 300)}`);
      return;
    }

    const items = json?.items || [];
    const total = json?.paging?.total_count ?? items.length;
    console.log(`Status: ${res.status} — Total: ${total}, Returned: ${items.length}`);

    // Show first 3 results
    for (let i = 0; i < Math.min(3, items.length); i++) {
      const item = items[i];
      const author = item.author?.name || item.name || "?";
      const headline = item.author?.headline || item.headline || "";
      const textPreview = (item.text || "").slice(0, 100).replace(/\n/g, " ");
      console.log(`  [${i + 1}] ${author} — ${headline.slice(0, 80)}`);
      if (textPreview) console.log(`      "${textPreview}..."`);
    }
  }

  // Get account
  const accRes = await fetch(`${baseUrl}/accounts`, { headers: { "X-API-KEY": apiKey, Accept: "application/json" } });
  const accounts = (await accRes.json() as { items?: Array<{ id: string; provider?: string; name?: string }> }).items || [];
  const acc = accounts.find(a => a.provider === "LINKEDIN") || accounts[0];
  console.log(`Account: ${acc.id} (${acc.name})\n`);

  // -- 1. Simple keyword --
  await search("Simple keyword", {
    api: "classic", category: "posts", keywords: "prospection automatisée", date_posted: "past_week",
  }, acc.id);

  // -- 2. OR operator --
  await search("OR operator: prospection OR outbound", {
    api: "classic", category: "posts", keywords: "prospection OR outbound", date_posted: "past_week",
  }, acc.id);

  // -- 3. AND operator --
  await search("AND operator: prospection AND IA", {
    api: "classic", category: "posts", keywords: "prospection AND IA", date_posted: "past_week",
  }, acc.id);

  // -- 4. NOT operator --
  await search("NOT operator: prospection NOT spam", {
    api: "classic", category: "posts", keywords: "prospection NOT spam", date_posted: "past_week",
  }, acc.id);

  // -- 5. Quotes (exact phrase) --
  await search('Exact phrase: "prospection automatisée"', {
    api: "classic", category: "posts", keywords: '"prospection automatisée"', date_posted: "past_week",
  }, acc.id);

  // -- 6. Combo: quotes + OR --
  await search('Combo: "prospection automatisée" OR "outbound B2B"', {
    api: "classic", category: "posts", keywords: '"prospection automatisée" OR "outbound B2B"', date_posted: "past_week",
  }, acc.id);

  // -- 7. Posts with author filter --
  await search("Author filter: keywords + author.keywords", {
    api: "classic", category: "posts", keywords: "prospection", author: { keywords: "CEO" }, date_posted: "past_month",
  }, acc.id);

  // -- 8. Posts with content_type filter --
  await search("Content type: images only", {
    api: "classic", category: "posts", keywords: "prospection automatisée", content_type: "images", date_posted: "past_month",
  }, acc.id);

  // -- 9. People search with boolean --
  await search("People: directeur AND marketing AND agence", {
    api: "classic", category: "people", keywords: "directeur AND marketing AND agence",
  }, acc.id);

  // -- 10. People with network_distance --
  await search("People: network 2nd degree", {
    api: "classic", category: "people", keywords: "directeur marketing agence", network_distance: [2],
  }, acc.id);

  console.log("\n=== ALL TESTS DONE ===");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
