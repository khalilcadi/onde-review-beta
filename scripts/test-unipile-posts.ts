/**
 * Test all possible ways to fetch posts from Unipile.
 *
 * Usage:
 *   npx tsx scripts/test-unipile-posts.ts <linkedin-url> [account-id]
 *
 * If account-id is omitted, the script will auto-detect it from connected accounts.
 *
 * Example:
 *   npx tsx scripts/test-unipile-posts.ts \
 *     "https://www.linkedin.com/in/john-doe-123/"
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const linkedinUrl = process.argv[2];
  let accountId = process.argv[3];

  if (!linkedinUrl) {
    console.error("Usage: npx tsx scripts/test-unipile-posts.ts <linkedin-url> [account-id]");
    process.exit(1);
  }

  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";

  if (!apiKey) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const baseUrl = `https://${dsn}/api/v1`;

  // Helper to make raw requests
  async function rawFetch(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    console.log(`  → ${url.toString()}`);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey!,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 500) };
  }

  // Extract identifier from LinkedIn URL
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  const identifier = match ? match[1].replace(/\/$/, "") : linkedinUrl;

  console.log("=== UNIPILE POSTS TEST ===");
  console.log(`DSN: ${dsn}`);
  console.log(`Identifier: ${identifier}`);
  console.log("");

  // ── 0. List all connected accounts & auto-detect ──
  console.log("0) Listing all connected Unipile accounts...");
  const accountsRes = await rawFetch("/accounts");
  if (!accountsRes.ok) {
    console.error("   Failed to list accounts:", accountsRes.status, accountsRes.text);
    process.exit(1);
  }
  const accounts = accountsRes.json?.items || accountsRes.json || [];
  if (Array.isArray(accounts) && accounts.length > 0) {
    console.log(`   Found ${accounts.length} account(s):`);
    for (const acc of accounts) {
      console.log(`   - ID: ${acc.id} | Provider: ${acc.provider} | Status: ${acc.status} | Name: ${acc.name || acc.identifier || "?"}`);
    }
    // Auto-detect: pick the first LINKEDIN account with status OK
    if (!accountId) {
      const linkedinAcc = accounts.find(
        (a: { provider?: string; status?: string }) =>
          a.provider === "LINKEDIN" && (a.status === "OK" || a.status === "CONNECTED" || a.status === "active")
      ) || accounts.find((a: { provider?: string }) => a.provider === "LINKEDIN") || accounts[0];
      accountId = linkedinAcc.id;
      console.log(`   → Auto-selected account: ${accountId} (${linkedinAcc.provider} / ${linkedinAcc.status})`);
    } else {
      const found = accounts.find((a: { id?: string }) => a.id === accountId);
      if (found) {
        console.log(`   → Provided account found: ${found.id} (${found.provider} / ${found.status})`);
      } else {
        console.warn(`   ⚠ Provided account_id "${accountId}" NOT FOUND in accounts list!`);
        console.warn(`   → Using first available account instead.`);
        accountId = accounts[0].id;
      }
    }
  } else {
    console.error("   No accounts found! Is UNIPILE_API_KEY correct?");
    console.error("   Raw response:", accountsRes.text);
    process.exit(1);
  }
  console.log(`   Account ID: ${accountId}`);
  console.log("");

  // ── 1. First, get profile to find provider_id / member_urn ──
  console.log("1) Fetching profile to get provider_id...");
  const profileRes = await rawFetch(`/users/${identifier}`, { account_id: accountId });
  if (!profileRes.ok) {
    console.error("   Profile fetch failed:", profileRes.status, profileRes.text);
    console.log("");
    console.log("   Trying without account_id...");
    const profileRes2 = await rawFetch(`/users/${identifier}`);
    if (!profileRes2.ok) {
      console.error("   Also failed without account_id:", profileRes2.status, profileRes2.text);
      console.log("\n   ⚠ Cannot fetch profile. Skipping profile-dependent tests.");
      console.log("   Continuing with direct posts tests...\n");
    }
  }
  const profile = profileRes.json;
  const providerId = profile?.provider_id || null;
  const memberUrn = profile?.member_urn || null;
  const publicId = profile?.public_identifier || null;
  console.log(`   provider_id: ${providerId}`);
  console.log(`   member_urn: ${memberUrn}`);
  console.log(`   public_identifier: ${publicId}`);
  console.log("");

  // ── 2. Test: GET /users/{linkedin-slug}/posts ──
  console.log("2) GET /users/{linkedin-slug}/posts");
  const test2 = await rawFetch(`/users/${identifier}/posts`, {
    account_id: accountId,
    limit: "5",
  });
  console.log(`   Status: ${test2.status} ${test2.ok ? "OK" : "FAIL"}`);
  if (test2.ok) {
    console.log(`   Items: ${test2.json?.items?.length || 0}`);
    if (test2.json?.items?.length > 0) {
      console.log("   First post:", JSON.stringify(test2.json.items[0]).slice(0, 300));
    }
  } else {
    console.log(`   Error: ${test2.text}`);
  }
  console.log("");

  // ── 3. Test: GET /users/{provider_id}/posts ──
  if (providerId) {
    console.log("3) GET /users/{provider_id}/posts");
    const test3 = await rawFetch(`/users/${providerId}/posts`, {
      account_id: accountId,
      limit: "5",
    });
    console.log(`   Status: ${test3.status} ${test3.ok ? "OK" : "FAIL"}`);
    if (test3.ok) {
      console.log(`   Items: ${test3.json?.items?.length || 0}`);
      if (test3.json?.items?.length > 0) {
        console.log("   First post:", JSON.stringify(test3.json.items[0]).slice(0, 300));
      }
    } else {
      console.log(`   Error: ${test3.text}`);
    }
    console.log("");
  }

  // ── 4. Test: GET /users/{member_urn}/posts ──
  if (memberUrn) {
    console.log("4) GET /users/{member_urn}/posts");
    // URL-encode the URN
    const test4 = await rawFetch(`/users/${encodeURIComponent(memberUrn)}/posts`, {
      account_id: accountId,
      limit: "5",
    });
    console.log(`   Status: ${test4.status} ${test4.ok ? "OK" : "FAIL"}`);
    if (test4.ok) {
      console.log(`   Items: ${test4.json?.items?.length || 0}`);
    } else {
      console.log(`   Error: ${test4.text}`);
    }
    console.log("");
  }

  // ── 5. Test: GET /users/posts (own posts, for comparison) ──
  console.log("5) GET /users/posts (own account posts)");
  const test5 = await rawFetch(`/users/posts`, {
    account_id: accountId,
    limit: "3",
  });
  console.log(`   Status: ${test5.status} ${test5.ok ? "OK" : "FAIL"}`);
  if (test5.ok) {
    console.log(`   Items: ${test5.json?.items?.length || 0}`);
    if (test5.json?.items?.length > 0) {
      const post = test5.json.items[0];
      console.log("   First own post keys:", Object.keys(post));
      console.log("   social_id:", post.social_id || "(absent)");
      console.log("   id:", post.id);
      console.log("   text:", typeof post.text === "string" ? post.text.slice(0, 150) + "..." : post.text);
    }
  } else {
    console.log(`   Error: ${test5.text}`);
  }
  console.log("");

  // ── 6. Test: LinkedIn search for posts ──
  const searchName = profile?.first_name && profile?.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : identifier.replace(/-/g, " ");
  console.log(`6) GET /linkedin/search (posts by "${searchName}")`);
  const test6 = await rawFetch(`/linkedin/search`, {
    account_id: accountId,
    type: "posts",
    query: searchName,
    limit: "5",
  });
  console.log(`   Status: ${test6.status} ${test6.ok ? "OK" : "FAIL"}`);
  if (test6.ok) {
    const items = test6.json?.items || test6.json?.results || [];
    console.log(`   Results: ${Array.isArray(items) ? items.length : "N/A"}`);
    if (Array.isArray(items) && items.length > 0) {
      console.log("   First result keys:", Object.keys(items[0]));
      console.log("   First result:", JSON.stringify(items[0]).slice(0, 300));
    }
  } else {
    console.log(`   Error: ${test6.text}`);
  }
  console.log("");

  // ── 7. Test: GET /users/{identifier}/posts without account_id ──
  console.log("7) GET /users/{slug}/posts WITHOUT account_id");
  const test7 = await rawFetch(`/users/${identifier}/posts`, { limit: "5" });
  console.log(`   Status: ${test7.status} ${test7.ok ? "OK" : "FAIL"}`);
  if (test7.ok) {
    console.log(`   Items: ${test7.json?.items?.length || 0}`);
  } else {
    console.log(`   Error: ${test7.text}`);
  }
  console.log("");

  // ── 8. Try with full LinkedIn URL as identifier ──
  console.log("8) GET /users/{full-linkedin-url}/posts");
  const test8 = await rawFetch(`/users/${encodeURIComponent(linkedinUrl)}/posts`, {
    account_id: accountId,
    limit: "5",
  });
  console.log(`   Status: ${test8.status} ${test8.ok ? "OK" : "FAIL"}`);
  if (test8.ok) {
    console.log(`   Items: ${test8.json?.items?.length || 0}`);
  } else {
    console.log(`   Error: ${test8.text}`);
  }
  console.log("");

  // ── 9. Test: GET /posts with author filter (if provider_id available) ──
  if (providerId) {
    console.log("9) GET /posts?author_id={provider_id}");
    const test9 = await rawFetch(`/posts`, {
      account_id: accountId,
      author_id: providerId,
      limit: "5",
    });
    console.log(`   Status: ${test9.status} ${test9.ok ? "OK" : "FAIL"}`);
    if (test9.ok) {
      const items = test9.json?.items || [];
      console.log(`   Items: ${items.length}`);
      if (items.length > 0) {
        console.log("   First post keys:", Object.keys(items[0]));
        console.log("   First post:", JSON.stringify(items[0]).slice(0, 300));
      }
    } else {
      console.log(`   Error: ${test9.text}`);
    }
    console.log("");
  }

  // ── 10. Test: GET /linkedin/search with keyword "from:" syntax ──
  console.log(`10) GET /linkedin/search (posts "from:${identifier}")`);
  const test10 = await rawFetch(`/linkedin/search`, {
    account_id: accountId,
    type: "posts",
    query: `from:${identifier}`,
    limit: "5",
  });
  console.log(`   Status: ${test10.status} ${test10.ok ? "OK" : "FAIL"}`);
  if (test10.ok) {
    const items = test10.json?.items || test10.json?.results || [];
    console.log(`   Results: ${Array.isArray(items) ? items.length : "N/A"}`);
    if (Array.isArray(items) && items.length > 0) {
      console.log("   First result:", JSON.stringify(items[0]).slice(0, 300));
    }
  } else {
    console.log(`   Error: ${test10.text}`);
  }
  console.log("");

  // ── Summary ──
  console.log("=== SUMMARY ===");
  const results: { test: string; status: string }[] = [];
  results.push({ test: "1. Profile fetch", status: profileRes.ok ? "OK" : "FAIL" });
  results.push({ test: "2. /users/{slug}/posts", status: test2.ok ? `OK (${test2.json?.items?.length || 0} items)` : "FAIL" });
  results.push({ test: "5. /users/posts (own)", status: test5.ok ? `OK (${test5.json?.items?.length || 0} items)` : "FAIL" });
  results.push({ test: "6. /linkedin/search posts", status: test6.ok ? "OK" : "FAIL" });
  results.push({ test: "7. /users/{slug}/posts no acct", status: test7.ok ? "OK" : "FAIL" });
  results.push({ test: "8. /users/{url}/posts", status: test8.ok ? "OK" : "FAIL" });
  results.push({ test: "10. /linkedin/search from:", status: test10.ok ? "OK" : "FAIL" });
  for (const r of results) {
    console.log(`  ${r.status.startsWith("OK") ? "✓" : "✗"} ${r.test} → ${r.status}`);
  }
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message ?? err);
  process.exit(1);
});
