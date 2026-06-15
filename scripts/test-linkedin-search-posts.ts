/**
 * Test LinkedIn POSTS search via Unipile API.
 *
 * Usage:
 *   npx tsx scripts/test-linkedin-search-posts.ts
 *
 * Runs two searches:
 *   1. "prospection automatisée" — past month
 *   2. "outbound B2B" — past week
 */

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });

interface PostItem {
  id?: string;
  text?: string;
  author?: {
    name?: string;
    headline?: string;
    profile_url?: string;
  };
  reaction_counter?: number;
  comment_counter?: number;
  repost_counter?: number;
  date?: string;
  share_url?: string;
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
  console.log("=== LINKEDIN POSTS SEARCH TEST ===\n");
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
  console.log(`   Account: ${accountId} (${linkedinAcc.name || linkedinAcc.identifier || "?"}) — status: ${linkedinAcc.status}\n`);

  // -- 2. Search posts function --
  async function searchPosts(keywords: string, datePeriod: string) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`SEARCH: "${keywords}" — period: ${datePeriod}`);
    console.log(`${"=".repeat(60)}\n`);

    const body = {
      api: "classic",
      category: "posts",
      keywords,
      sort_by: "date",
      date_posted: datePeriod,
    };

    console.log(`POST /linkedin/search?account_id=${accountId}`);
    console.log(`Body: ${JSON.stringify(body, null, 2)}\n`);

    const res = await rawFetch("POST", "/linkedin/search", body, { account_id: accountId });

    if (!res.ok) {
      console.error(`ERROR ${res.status}:`, res.text.slice(0, 500));
      return null;
    }

    const data = res.json;

    // Log raw structure
    console.log(`Response keys: ${Object.keys(data || {}).join(", ")}`);

    const items: PostItem[] = data?.items || data?.results || (Array.isArray(data) ? data : []);
    const paging = data?.paging || data?.pagination || {};
    const totalCount = paging?.total_count ?? data?.total_count ?? data?.total ?? items.length;

    console.log(`Total count (paging): ${totalCount}`);
    console.log(`Items returned: ${items.length}\n`);

    if (items.length === 0) {
      console.log("No posts found.\n");

      // Dump raw response for debugging
      console.log("--- Raw response (first 1000 chars) ---");
      console.log(JSON.stringify(data, null, 2).slice(0, 1000));
      return data;
    }

    // -- Display structured summary --
    console.log(`--- Top ${Math.min(items.length, 15)} posts ---\n`);

    const display = items.slice(0, 15);
    for (let i = 0; i < display.length; i++) {
      const post = display[i];

      // Author info — adapt to whatever structure Unipile returns
      const authorName = post.author?.name
        || (post as Record<string, unknown>).author_name
        || "Unknown";
      const authorHeadline = post.author?.headline
        || (post as Record<string, unknown>).author_headline
        || "";

      // Post text (truncated)
      const fullText = post.text || (post as Record<string, unknown>).content || "";
      const textStr = typeof fullText === "string" ? fullText : JSON.stringify(fullText);
      const truncated = textStr.length > 200 ? textStr.slice(0, 200) + "…" : textStr;

      // Engagement
      const reactions = post.reaction_counter ?? (post as Record<string, unknown>).reactions ?? "?";
      const comments = post.comment_counter ?? (post as Record<string, unknown>).comments ?? "?";
      const reposts = post.repost_counter ?? (post as Record<string, unknown>).reposts ?? "?";

      // Date & URL
      const date = post.date || (post as Record<string, unknown>).created_at || "?";
      const url = post.share_url || (post as Record<string, unknown>).url || "";

      console.log(`[${i + 1}] ${authorName}`);
      if (authorHeadline) console.log(`    ${authorHeadline}`);
      console.log(`    📅 ${date}`);
      console.log(`    💬 "${truncated}"`);
      console.log(`    👍 ${reactions}  💭 ${comments}  🔄 ${reposts}`);
      if (url) console.log(`    🔗 ${url}`);
      console.log("");
    }

    // Dump first raw item for structure analysis
    console.log("--- Raw first item (structure analysis) ---");
    console.log(JSON.stringify(items[0], null, 2));
    console.log("");

    return data;
  }

  // -- 3. Run both searches --
  const result1 = await searchPosts("prospection automatisée", "past_month");

  if (result1) {
    // -- Export CSV for search 1 --
    const items = result1.items || [];
    const csvRows: string[] = [];

    // Header — all available fields
    csvRows.push([
      "id",
      "type",
      "provider",
      "social_id",
      "is_repost",
      "parsed_datetime",
      "date_relative",
      "author_name",
      "author_headline",
      "author_public_identifier",
      "author_id",
      "author_is_company",
      "author_profile_picture_url",
      "text",
      "reaction_counter",
      "comment_counter",
      "repost_counter",
      "impressions_counter",
      "share_url",
      "mentions",
      "attachments_count",
      "attachments_types",
      "can_post_comments",
      "can_react",
      "can_share",
    ].join(","));

    // Escape CSV field: wrap in quotes, double internal quotes
    function csvEscape(val: unknown): string {
      if (val === null || val === undefined) return "";
      const s = String(val).replace(/\r?\n/g, " ").replace(/"/g, '""');
      return `"${s}"`;
    }

    const slice = items.slice(0, 10);
    for (const post of slice) {
      const author = post.author || {} as Record<string, unknown>;
      const perms = post.permissions || {} as Record<string, unknown>;
      const attachments = Array.isArray(post.attachments) ? post.attachments : [];
      const mentions = Array.isArray(post.mentions) ? post.mentions : [];

      csvRows.push([
        csvEscape(post.id),
        csvEscape(post.type),
        csvEscape(post.provider),
        csvEscape(post.social_id),
        csvEscape(post.is_repost),
        csvEscape(post.parsed_datetime),
        csvEscape(post.date),
        csvEscape(author.name),
        csvEscape(author.headline),
        csvEscape(author.public_identifier),
        csvEscape(author.id),
        csvEscape(author.is_company),
        csvEscape(author.profile_picture_url),
        csvEscape(post.text),
        csvEscape(post.reaction_counter),
        csvEscape(post.comment_counter),
        csvEscape(post.repost_counter),
        csvEscape(post.impressions_counter),
        csvEscape(post.share_url),
        csvEscape(mentions.map((m: { url?: string }) => m.url).join(" | ")),
        csvEscape(attachments.length),
        csvEscape(attachments.map((a: { type?: string }) => a.type).join(" | ")),
        csvEscape(perms.can_post_comments),
        csvEscape(perms.can_react),
        csvEscape(perms.can_share),
      ].join(","));
    }

    const csvPath = resolve(process.cwd(), "scripts/linkedin-posts-prospection-automatisee.csv");
    writeFileSync(csvPath, "\uFEFF" + csvRows.join("\n"), "utf-8");
    console.log(`\n CSV exported: ${csvPath} (${slice.length} posts)\n`);

    // -- Search 2 --
    const result2 = await searchPosts("outbound B2B", "past_week");
    if (!result2) {
      console.log("Second search failed, but first succeeded.");
    }
  }

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
