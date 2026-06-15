/**
 * Search LinkedIn via Unipile and export all results to CSV.
 *
 * Usage:
 *   npx tsx scripts/export-linkedin-search-csv.ts [keywords] [max-results]
 *
 * Default: "directeur marketing", 10 results
 */

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
  if (!apiKey) { console.error("Missing UNIPILE_API_KEY"); process.exit(1); }

  const baseUrl = `https://${dsn}/api/v1`;
  const keywords = process.argv[2] || "directeur marketing";
  const maxResults = parseInt(process.argv[3] || "10", 10);

  async function rawFetch(method: string, path: string, body?: unknown, params: Record<string, string> = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { "X-API-KEY": apiKey!, Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, ok: res.ok, json, text };
  }

  // Detect account
  const accountsRes = await rawFetch("GET", "/accounts");
  if (!accountsRes.ok) { console.error("Failed to list accounts:", accountsRes.status); process.exit(1); }
  const accounts = accountsRes.json?.items || accountsRes.json || [];
  const linkedinAcc = accounts.find(
    (a: { provider?: string; status?: string }) => a.provider === "LINKEDIN"
  ) || accounts[0];
  const accountId = linkedinAcc.id;
  console.log(`Account: ${accountId} (${linkedinAcc.name || "?"})`);

  // Paginate search
  const allItems: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  while (allItems.length < maxResults) {
    const body: Record<string, unknown> = { api: "classic", category: "people", keywords };
    if (cursor) body.cursor = cursor;

    console.log(`Fetching page ${Math.floor(allItems.length / 3) + 1}... (${allItems.length}/${maxResults} so far)`);
    const res = await rawFetch("POST", "/linkedin/search", body, { account_id: accountId });

    if (!res.ok) { console.error(`ERROR ${res.status}:`, res.text.slice(0, 300)); break; }

    const items = res.json?.items || [];
    if (items.length === 0) break;

    allItems.push(...items);
    cursor = res.json?.cursor;
    if (!cursor) break;

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 1500));
  }

  const results = allItems.slice(0, maxResults);
  console.log(`\nTotal collected: ${results.length}\n`);

  // Collect all unique keys across all items
  const allKeys = new Set<string>();
  for (const item of results) {
    for (const key of Object.keys(item)) allKeys.add(key);
  }
  const columns = Array.from(allKeys).sort();

  // Build CSV
  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [columns.join(",")];
  for (const item of results) {
    csvLines.push(columns.map(col => escapeCsv(item[col])).join(","));
  }

  const outputPath = resolve(process.cwd(), "scripts/linkedin-search-directeur-marketing.csv");
  writeFileSync(outputPath, csvLines.join("\n"), "utf-8");
  console.log(`CSV saved: ${outputPath}`);
  console.log(`Columns: ${columns.join(", ")}`);

  // Preview
  console.log("\nPreview:");
  for (const item of results) {
    console.log(`  - ${item.name} | ${item.headline} | ${item.location}`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
