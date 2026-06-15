/**
 * Explore what Unipile returns for a LinkedIn profile + posts.
 *
 * Usage:
 *   npx tsx scripts/explore-unipile-profile.ts <linkedin-url> <account-id>
 *
 * Example:
 *   npx tsx scripts/explore-unipile-profile.ts \
 *     "https://www.linkedin.com/in/john-doe-123/" \
 *     "YOUR_UNIPILE_ACCOUNT_ID"
 *
 * Requires: UNIPILE_API_KEY in .env.local
 */

// Load env BEFORE any other import (ESM hoists imports, so use require)
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

// Dynamic import to ensure env vars are set before client module loads
async function main() {
  const { getUnipileClient, extractLinkedInIdentifier } = await import("../lib/unipile/client");
  const linkedinUrl = process.argv[2];
  const accountId = process.argv[3];

  if (!linkedinUrl || !accountId) {
    console.error(
      "Usage: npx tsx scripts/explore-unipile-profile.ts <linkedin-url> <account-id>"
    );
    console.error(
      'Example: npx tsx scripts/explore-unipile-profile.ts "https://www.linkedin.com/in/john-doe/" "acc_xxx"'
    );
    process.exit(1);
  }

  if (!process.env.UNIPILE_API_KEY) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  let identifier: string;
  try {
    identifier = extractLinkedInIdentifier(linkedinUrl);
  } catch {
    console.error("Invalid LinkedIn URL:", linkedinUrl);
    process.exit(1);
  }

  console.log("=== UNIPILE PROFILE + POSTS DISCOVERY ===");
  console.log("LinkedIn URL  :", linkedinUrl);
  console.log("Identifier    :", identifier);
  console.log("Account ID    :", accountId);
  console.log("");

  const client = getUnipileClient();

  // ── 1. Profile WITHOUT linkedin_sections ─────────────────────────────────────
  console.log("1) Fetching profile (basic)...");
  const basicProfile = await client.getUserProfile(identifier, accountId);
  console.log("\n=== BASIC PROFILE — top-level keys ===");
  console.log("Keys:", Object.keys(basicProfile));
  const basicRaw = basicProfile as unknown as Record<string, unknown>;
  console.log("headline:", basicRaw.headline || "(absent)");
  console.log("about:", basicRaw.about ? String(basicRaw.about).slice(0, 200) + "..." : "(absent)");
  console.log("profile_picture_url:", basicRaw.profile_picture_url || "(absent)");
  console.log("experience count:", Array.isArray(basicRaw.experience) ? (basicRaw.experience as unknown[]).length : "(absent)");
  console.log("skills count:", Array.isArray(basicRaw.skills) ? (basicRaw.skills as unknown[]).length : "(absent)");

  // ── 2. Profile WITH linkedin_sections=* ──────────────────────────────────────
  console.log("\n\n2) Fetching profile (linkedin_sections=*)...");
  const fullProfile = await client.getUserProfile(identifier, accountId, {
    linkedinSections: "*",
  });
  console.log("\n=== FULL PROFILE (linkedin_sections=*) — top-level keys ===");
  console.log("Keys:", Object.keys(fullProfile));
  const fullRaw = fullProfile as unknown as Record<string, unknown>;

  // Compare which keys are new
  const basicKeys = new Set(Object.keys(basicProfile));
  const newKeys = Object.keys(fullProfile).filter((k) => !basicKeys.has(k));
  console.log("\nNew keys with linkedin_sections=*:", newKeys.length > 0 ? newKeys : "(none — same keys)");

  // ── 3. Full field inventory ──────────────────────────────────────────────────
  console.log("\n=== FULL PROFILE — ALL FIELDS ===");
  const scalarFields = [
    "id", "object", "provider", "provider_id", "member_urn",
    "first_name", "last_name", "headline", "public_identifier",
    "profile_url", "profile_picture_url", "profile_picture_url_large",
    "background_picture_url", "location", "about", "company",
    "connections_count", "follower_count", "followers_count",
    "shared_connections_count", "network_distance",
    "is_open_profile", "is_premium", "is_influencer", "is_creator",
    "is_relationship", "is_self", "primary_locale",
  ] as const;

  for (const f of scalarFields) {
    const val = fullRaw[f];
    const present = val !== undefined && val !== null;
    const display = present
      ? typeof val === "string" && val.length > 100
        ? JSON.stringify(val.slice(0, 100) + "...")
        : JSON.stringify(val)
      : "(absent)";
    console.log(`  ${present ? "✓" : "✗"} ${f.padEnd(30)} ${display}`);
  }

  // ── 4. Array fields ──────────────────────────────────────────────────────────
  console.log("\n=== ARRAY / OBJECT FIELDS ===");
  const arrayFields = [
    "experience", "education", "skills", "languages",
    "certifications", "volunteering_experience", "projects",
    "hashtags", "websites", "honors", "posts",
  ];
  for (const f of arrayFields) {
    const arr = fullRaw[f];
    if (Array.isArray(arr)) {
      console.log(`  ✓ ${f} (${arr.length} items)`);
      if (arr.length > 0) {
        console.log("    Keys of first item:", Object.keys(arr[0] as object));
        console.log("    First item:", JSON.stringify(arr[0], null, 4).split("\n").map((l: string) => "      " + l).join("\n"));
      }
    } else if (arr !== undefined && arr !== null) {
      console.log(`  ~ ${f}: not array, type=${typeof arr}:`, JSON.stringify(arr).slice(0, 200));
    } else {
      console.log(`  ✗ ${f} (absent)`);
    }
  }

  // ── 5. Unexpected extra fields ───────────────────────────────────────────────
  const knownFields = new Set([...scalarFields, ...arrayFields]);
  const extraKeys = Object.keys(fullRaw).filter((k) => !knownFields.has(k));
  if (extraKeys.length > 0) {
    console.log("\n=== UNEXPECTED EXTRA FIELDS ===");
    for (const k of extraKeys) {
      const v = JSON.stringify(fullRaw[k]);
      console.log(`  ! ${k}: ${v && v.length > 200 ? v.slice(0, 200) + "..." : v}`);
    }
  }

  // ── 6. User posts via /users/{identifier}/posts ──────────────────────────────
  console.log("\n\n3) Fetching posts via /users/{identifier}/posts (limit=5)...");
  try {
    const postsResponse = await client.getUserPostsByIdentifier(
      identifier,
      accountId,
      5
    );
    console.log("\n=== USER POSTS ===");
    console.log("has_more:", postsResponse.has_more);
    console.log("items count:", postsResponse.items?.length || 0);

    if (postsResponse.items?.length > 0) {
      for (let i = 0; i < postsResponse.items.length; i++) {
        const post = postsResponse.items[i];
        const postRaw = post as unknown as Record<string, unknown>;
        console.log(`\n  --- Post ${i + 1} ---`);
        console.log("  Keys:", Object.keys(postRaw));
        console.log("  id:", postRaw.id);
        console.log("  text:", typeof postRaw.text === "string" ? postRaw.text.slice(0, 200) + (postRaw.text.length > 200 ? "..." : "") : postRaw.text);
        console.log("  timestamp:", postRaw.timestamp);
        console.log("  reactions_count:", postRaw.reactions_count);
        console.log("  comments_count:", postRaw.comments_count);

        // Log any extra keys
        const knownPostKeys = new Set(["id", "object", "provider", "text", "author_id", "timestamp", "reactions_count", "comments_count"]);
        const extraPostKeys = Object.keys(postRaw).filter((k) => !knownPostKeys.has(k));
        if (extraPostKeys.length > 0) {
          console.log("  Extra keys:", extraPostKeys);
          for (const k of extraPostKeys) {
            const v = JSON.stringify(postRaw[k]);
            console.log(`    ${k}: ${v && v.length > 150 ? v.slice(0, 150) + "..." : v}`);
          }
        }
      }
    } else {
      console.log("  (no posts returned)");
    }
  } catch (err) {
    console.error("  Posts fetch failed:", err instanceof Error ? err.message : err);
  }

  // ── 7. Comparison: getUserPosts (own) vs getUserPostsByIdentifier ─────────
  console.log("\n\n4) For comparison: getUserPosts (own account posts, limit=3)...");
  try {
    const ownPosts = await client.getUserPosts({
      account_id: accountId,
      limit: 3,
    });
    console.log("Own posts count:", ownPosts.items?.length || 0);
    if (ownPosts.items?.length > 0) {
      console.log("First own post keys:", Object.keys(ownPosts.items[0] as object));
    }
  } catch (err) {
    console.error("  Own posts fetch failed:", err instanceof Error ? err.message : err);
  }

  // ── 8. Summary ───────────────────────────────────────────────────────────────
  console.log("\n\n=== SUMMARY: What to store per lead ===");
  console.log("profile_picture_url:", fullRaw.profile_picture_url ? "YES" : "NO");
  console.log("profile_picture_url_large:", fullRaw.profile_picture_url_large ? "YES" : "NO");
  console.log("headline:", fullRaw.headline ? "YES" : "NO");
  console.log("about/summary:", fullRaw.about ? "YES (" + String(fullRaw.about).length + " chars)" : "NO");
  console.log("location:", fullRaw.location ? "YES" : "NO");
  console.log("experience:", Array.isArray(fullRaw.experience) ? `YES (${(fullRaw.experience as unknown[]).length} items)` : "NO");
  console.log("education:", Array.isArray(fullRaw.education) ? `YES (${(fullRaw.education as unknown[]).length} items)` : "NO");
  console.log("skills:", Array.isArray(fullRaw.skills) ? `YES (${(fullRaw.skills as unknown[]).length} items)` : "NO");
  console.log("languages:", Array.isArray(fullRaw.languages) ? `YES (${(fullRaw.languages as unknown[]).length} items)` : "NO");
  console.log("websites:", Array.isArray(fullRaw.websites) ? `YES (${(fullRaw.websites as unknown[]).length} items)` : "NO");
  console.log("is_premium:", fullRaw.is_premium);
  console.log("is_open_profile:", fullRaw.is_open_profile);
  console.log("connections_count:", fullRaw.connections_count);
  console.log("follower_count:", fullRaw.follower_count);
  console.log("network_distance:", fullRaw.network_distance);
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message ?? err);
  process.exit(1);
});
