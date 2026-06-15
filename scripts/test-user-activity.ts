/**
 * Test: can we get a prospect's liked/commented posts via Unipile?
 *
 * Tests multiple endpoint patterns to see what works.
 * Uses a real prospect from the previous search results.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
  if (!apiKey) { console.error("Missing UNIPILE_API_KEY"); process.exit(1); }

  const baseUrl = `https://${dsn}/api/v1`;

  async function tryEndpoint(label: string, method: string, path: string, params: Record<string, string> = {}, body?: unknown) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    console.log(`\n--- ${label} ---`);
    console.log(`${method} ${url.pathname}${url.search}`);
    if (body) console.log(`Body: ${JSON.stringify(body)}`);

    const res = await fetch(url.toString(), {
      method,
      headers: {
        "X-API-KEY": apiKey!,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!res.ok) {
      console.log(`  ERROR ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    console.log(`  OK ${res.status}`);
    const items = json?.items || [];
    console.log(`  Keys: ${Object.keys(json || {}).join(", ")}`);
    console.log(`  Items: ${items.length}`);

    if (items.length > 0) {
      console.log(`  First item keys: ${Object.keys(items[0]).join(", ")}`);
      console.log(`  First item (truncated):`);
      console.log(JSON.stringify(items[0], null, 2).slice(0, 600));
    }
    return json;
  }

  // -- Get account --
  const accRes = await fetch(`${baseUrl}/accounts`, { headers: { "X-API-KEY": apiKey, Accept: "application/json" } });
  const accounts = ((await accRes.json()) as { items?: Array<{ id: string; provider?: string; name?: string }> }).items || [];
  const acc = accounts.find(a => a.provider === "LINKEDIN") || accounts[0];
  const accountId = acc.id;
  console.log(`Account: ${accountId} (${acc.name})`);

  // -- Pick a prospect from the reactions we extracted --
  // Obafemi Agnoun — provider_id known from reaction data
  const prospectProviderId = "ACoAAFgvVNoBQLtvSMRmiBq7ZsgriIa44TtRaO8";
  // Also try Jérémy Nicolas via slug
  const prospectSlug = "jérémy-nicolas";

  // First get the prospect's profile
  console.log("\n=== STEP 1: Get prospect profiles ===");

  // Via slug
  const profileRes = await tryEndpoint(
    "Profile via slug",
    "GET", `/users/${encodeURIComponent(prospectSlug)}`,
    { account_id: accountId }
  );

  // Via provider_id
  const profileRes2 = await tryEndpoint(
    "Profile via provider_id",
    "GET", `/users/${prospectProviderId}`,
    { account_id: accountId }
  );

  const providerId = profileRes2?.provider_id || profileRes?.provider_id || prospectProviderId;
  console.log(`\nProvider ID to test: ${providerId}`);

  // -- Test all possible endpoints --
  console.log("\n=== STEP 2: Test activity endpoints ===");

  // 2a. Own account's reactions (baseline — should work)
  await tryEndpoint(
    "Own reactions: GET /users/reactions",
    "GET", "/users/reactions",
    { account_id: accountId, limit: "3" }
  );

  // 2b. Own account's comments (baseline)
  await tryEndpoint(
    "Own comments: GET /users/comments",
    "GET", "/users/comments",
    { account_id: accountId, limit: "3" }
  );

  // 2c. Prospect's posts (already known to work with provider_id)
  if (providerId) {
    await tryEndpoint(
      `Prospect posts: GET /users/${providerId}/posts`,
      "GET", `/users/${providerId}/posts`,
      { account_id: accountId, limit: "3" }
    );

    // 2d. Try prospect's reactions via provider_id
    await tryEndpoint(
      `Prospect reactions: GET /users/${providerId}/reactions`,
      "GET", `/users/${providerId}/reactions`,
      { account_id: accountId, limit: "10" }
    );

    // 2e. Try prospect's comments via provider_id
    await tryEndpoint(
      `Prospect comments: GET /users/${providerId}/comments`,
      "GET", `/users/${providerId}/comments`,
      { account_id: accountId, limit: "10" }
    );

    // 2f. Try with linkedin_sections=activity on profile
    await tryEndpoint(
      `Profile with activity sections`,
      "GET", `/users/${providerId}`,
      { account_id: accountId, linkedin_sections: "activity,recent_activity" }
    );
  }

  // 2g. Try memberAction endpoint (mentioned in client)
  if (providerId) {
    await tryEndpoint(
      `LinkedIn memberAction`,
      "POST", `/linkedin/member_action`,
      { account_id: accountId },
      { provider_id: providerId, action: "get_activity" }
    );
  }

  // 2h. Try LinkedIn raw endpoint for activity
  if (providerId) {
    await tryEndpoint(
      `LinkedIn raw: profile activity`,
      "POST", `/linkedin/raw`,
      { account_id: accountId },
      { url: `/voyager/api/identity/profileActivities?profileUrn=urn:li:fsd_profile:${providerId}&count=10` }
    );
  }

  console.log("\n=== DONE ===");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
