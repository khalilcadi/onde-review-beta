/**
 * Test: extract people who interacted with the 10 posts from search "prospection automatisée"
 *
 * Usage:
 *   UNIPILE_API_KEY='...' npx tsx scripts/test-post-interactions.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });

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
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "X-API-KEY": apiKey!,
        Accept: "application/json",
        ...(body && method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, ok: res.ok, json, text };
  }

  // -- 1. Get account --
  console.log("=== POST INTERACTIONS EXTRACTION ===\n");
  const accRes = await rawFetch("GET", "/accounts");
  if (!accRes.ok) { console.error("Failed to list accounts:", accRes.status); process.exit(1); }
  const accounts = accRes.json?.items || accRes.json || [];
  const linkedinAcc = accounts.find(
    (a: { provider?: string }) => a.provider === "LINKEDIN"
  ) || accounts[0];
  const accountId = linkedinAcc.id;
  console.log(`Account: ${accountId} (${linkedinAcc.name})\n`);

  // -- 2. Search posts --
  console.log("Searching posts: \"prospection automatisée\" (past_month)...\n");
  const searchRes = await rawFetch("POST", "/linkedin/search", {
    api: "classic",
    category: "posts",
    keywords: "prospection automatisée",
    sort_by: "date",
    date_posted: "past_month",
  }, { account_id: accountId });

  if (!searchRes.ok) {
    console.error("Search failed:", searchRes.status, searchRes.text.slice(0, 300));
    process.exit(1);
  }

  const posts = (searchRes.json?.items || []).slice(0, 10);
  console.log(`Got ${posts.length} posts. Extracting interactions...\n`);

  // -- 3. For each post, get reactions + comments --
  interface Person {
    name: string;
    headline: string;
    profile_url: string;
    public_identifier: string;
    interaction_type: string; // "reaction" | "comment"
    reaction_type: string;    // "LIKE", "PRAISE", etc. or ""
    comment_text: string;
    post_author: string;
    post_id: string;
    post_text_preview: string;
  }

  const allPeople: Person[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const postId = post.id;
    const postAuthor = post.author?.name || "?";
    const postPreview = (post.text || "").slice(0, 80).replace(/\n/g, " ");

    console.log(`[${i + 1}/10] ${postAuthor} — ${post.reaction_counter} reactions, ${post.comment_counter} comments`);

    // -- Reactions --
    if (post.reaction_counter > 0) {
      const reactRes = await rawFetch("GET", `/posts/${postId}/reactions`, undefined, {
        account_id: accountId,
        limit: "100",
      });

      if (reactRes.ok) {
        const reactions = reactRes.json?.items || reactRes.json || [];

        // Dump raw first reaction for structure analysis (only for first post)
        if (i === 0 && reactions.length > 0) {
          console.log("  [DEBUG] Raw first reaction:");
          console.log(JSON.stringify(reactions[0], null, 2));
        }

        for (const r of reactions) {
          const author = r.author || r;
          allPeople.push({
            name: author.name || author.first_name || "",
            headline: author.headline || "",
            profile_url: author.profile_url || author.public_profile_url || "",
            public_identifier: author.public_identifier || "",
            interaction_type: "reaction",
            reaction_type: r.type || r.reaction_type || "",
            comment_text: "",
            post_author: postAuthor,
            post_id: postId,
            post_text_preview: postPreview,
          });
        }
        console.log(`  Reactions: ${reactions.length} people extracted`);
      } else {
        console.log(`  Reactions: ERROR ${reactRes.status} — ${reactRes.text.slice(0, 150)}`);
      }
    }

    // -- Comments (try social_id URN, fallback to numeric id) --
    if (post.comment_counter > 0) {
      const socialId = post.social_id || postId;
      const commentRes = await rawFetch("GET", `/posts/${encodeURIComponent(socialId)}/comments`, undefined, {
        account_id: accountId,
        limit: "100",
      });

      if (commentRes.ok) {
        const comments = commentRes.json?.items || commentRes.json || [];

        // Dump raw first comment for structure analysis (only for first post with comments)
        if (comments.length > 0 && allPeople.filter(p => p.interaction_type === "comment").length === 0) {
          console.log("  [DEBUG] Raw first comment:");
          console.log(JSON.stringify(comments[0], null, 2));
        }

        for (const c of comments) {
          // Comments: author is a string (name), details in author_details
          const details = c.author_details || {};
          allPeople.push({
            name: (typeof c.author === "string" ? c.author : details.name) || "",
            headline: details.headline || "",
            profile_url: details.profile_url || "",
            public_identifier: details.public_identifier || "",
            interaction_type: "comment",
            reaction_type: "",
            comment_text: (c.text || "").slice(0, 200).replace(/\n/g, " "),
            post_author: postAuthor,
            post_id: postId,
            post_text_preview: postPreview,
          });
        }
        console.log(`  Comments: ${comments.length} people extracted`);
      } else {
        console.log(`  Comments: ERROR ${commentRes.status} — ${commentRes.text.slice(0, 150)}`);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n--- TOTAL: ${allPeople.length} interactions extracted ---\n`);

  // -- 4. Deduplicate by name + interaction_type --
  const uniqueKey = (p: Person) => `${p.name}__${p.interaction_type}__${p.post_id}`;
  const seen = new Set<string>();
  const deduped = allPeople.filter(p => {
    const k = uniqueKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`After dedup: ${deduped.length} unique interactions\n`);

  // -- 5. Export CSV --
  function csvEscape(val: unknown): string {
    if (val === null || val === undefined) return "";
    const s = String(val).replace(/\r?\n/g, " ").replace(/"/g, '""');
    return `"${s}"`;
  }

  const csvRows = [
    "name,headline,profile_url,public_identifier,interaction_type,reaction_type,comment_text,post_author,post_id,post_text_preview",
  ];

  for (const p of deduped) {
    csvRows.push([
      csvEscape(p.name),
      csvEscape(p.headline),
      csvEscape(p.profile_url),
      csvEscape(p.public_identifier),
      csvEscape(p.interaction_type),
      csvEscape(p.reaction_type),
      csvEscape(p.comment_text),
      csvEscape(p.post_author),
      csvEscape(p.post_id),
      csvEscape(p.post_text_preview),
    ].join(","));
  }

  const csvPath = resolve(process.cwd(), "scripts/linkedin-post-interactions.csv");
  writeFileSync(csvPath, "\uFEFF" + csvRows.join("\n"), "utf-8");
  console.log(`CSV exported: ${csvPath}`);
  console.log(`${deduped.length} rows (unique person+interaction+post)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
