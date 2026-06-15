/**
 * Test: Send ONE invitation via the corrected Unipile endpoint
 *
 * Usage:
 *   npx tsx scripts/test-send-invitation.ts <account-id> <linkedin-slug>
 *
 * Example:
 *   npx tsx scripts/test-send-invitation.ts abc123 john-doe-456
 *
 * Requires: UNIPILE_API_KEY + UNIPILE_DSN in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getUnipileClient } = await import("../lib/unipile/client");

  const accountId = process.argv[2];
  const slug = process.argv[3];

  if (!accountId || !slug) {
    console.error(
      "Usage: npx tsx scripts/test-send-invitation.ts <account-id> <linkedin-slug>"
    );
    console.error(
      "Example: npx tsx scripts/test-send-invitation.ts abc123 john-doe-456"
    );
    process.exit(1);
  }

  if (!process.env.UNIPILE_API_KEY) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const client = getUnipileClient();

  // Step 1: Get profile to retrieve provider_id
  console.log(`\n1) Fetching profile for slug: ${slug} ...`);
  const profile = await client.getUserProfile(slug, accountId);
  console.log(`   ✓ Name: ${profile.first_name} ${profile.last_name}`);
  console.log(`   ✓ provider_id: ${profile.provider_id}`);
  console.log(`   ✓ network_distance: ${profile.network_distance}`);
  console.log(`   ✓ is_relationship: ${profile.is_relationship}`);

  if (profile.is_relationship || profile.network_distance === "1") {
    console.log(`\n⚠ Already connected — skipping invitation test.`);
    return;
  }

  if (!profile.provider_id) {
    console.error(`\n✗ No provider_id in profile response — cannot invite.`);
    process.exit(1);
  }

  // Step 2: Send invitation via corrected endpoint
  console.log(`\n2) Sending invitation via POST /users/invite ...`);
  console.log(`   Body: { account_id: "${accountId}", provider_id: "${profile.provider_id}" }`);

  try {
    await client.sendInvitation({
      account_id: accountId,
      provider_id: profile.provider_id,
    });
    console.log(`\n✓ SUCCESS — Invitation sent!`);
  } catch (err: unknown) {
    const error = err as Error & { status?: number; detail?: string };
    console.error(`\n✗ FAILED — ${error.message}`);
    if (error.status) console.error(`   Status: ${error.status}`);
    if (error.detail) console.error(`   Detail: ${error.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message ?? err);
  process.exit(1);
});
