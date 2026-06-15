/**
 * Test Unipile: Profile Visitors + Invitations (sent & received)
 *
 * Usage:
 *   npx tsx scripts/test-visitors-invitations.ts <account-id>
 *
 * Requires: UNIPILE_API_KEY + UNIPILE_DSN in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getUnipileClient } = await import("../lib/unipile/client");

  const accountId = process.argv[2];

  if (!accountId) {
    console.error("Usage: npx tsx scripts/test-visitors-invitations.ts <account-id>");
    process.exit(1);
  }

  if (!process.env.UNIPILE_API_KEY) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const client = getUnipileClient();

  // =========================================================================
  // 1. PROFILE VISITORS (raw Voyager endpoint)
  // =========================================================================
  console.log("=".repeat(70));
  console.log("1) PROFILE VISITORS — wvmpCards");
  console.log("=".repeat(70));

  try {
    const raw = await client.linkedinRaw({
      account_id: accountId,
      request_url: "https://www.linkedin.com/voyager/api/identity/wvmpCards",
    });

    // Save full raw response
    const fs = await import("fs");
    const outPath = resolve(process.cwd(), "scripts/visitors-raw-response.json");
    fs.writeFileSync(outPath, JSON.stringify(raw, null, 2));
    console.log(`\nFull raw response saved to: ${outPath}`);

    // Quick analysis
    const data = raw as Record<string, unknown>;
    const elements = (data?.data as Record<string, unknown>)?.elements;
    if (Array.isArray(elements)) {
      console.log(`\nTop-level elements count: ${elements.length}`);

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as Record<string, unknown>;
        const value = el.value as Record<string, unknown> | null;
        if (!value) continue;
        const valueType = Object.keys(value)[0];
        console.log(`\n  Element ${i}: ${valueType}`);

        // If it's the WvmpViewersCard, dig in
        if (valueType?.includes("WvmpViewersCard")) {
          const card = value[valueType] as Record<string, unknown>;
          const insightCards = card.insightCards as unknown[];
          console.log(`    insightCards count: ${insightCards?.length ?? 0}`);

          if (Array.isArray(insightCards)) {
            for (const ic of insightCards) {
              const icVal = (ic as Record<string, unknown>).value as Record<string, unknown>;
              if (!icVal) continue;
              const icType = Object.keys(icVal)[0];
              const shortType = icType?.split(".").pop();
              console.log(`    - ${shortType}`);

              // Summary card: count viewers + date range
              if (shortType === "WvmpSummaryInsightCard") {
                const summary = icVal[icType] as Record<string, unknown>;
                const cards = summary.cards as unknown[];
                const pctChange = summary.numViewsChangeInPercentage;
                console.log(`      viewers count: ${cards?.length ?? 0}`);
                console.log(`      % change: ${pctChange}`);

                // Timestamps range
                if (Array.isArray(cards) && cards.length > 0) {
                  const timestamps: number[] = [];
                  for (const c of cards) {
                    const urn = (c as Record<string, unknown>).objectUrn as string;
                    const match = urn?.match(/,(\d+)\)/);
                    if (match) timestamps.push(parseInt(match[1]));
                  }
                  if (timestamps.length > 0) {
                    timestamps.sort((a, b) => a - b);
                    const oldest = new Date(timestamps[0]);
                    const newest = new Date(timestamps[timestamps.length - 1]);
                    const rangeDays = Math.round((newest.getTime() - oldest.getTime()) / 86_400_000);
                    console.log(`      oldest visit: ${oldest.toISOString()} (${oldest.toLocaleDateString("fr-FR")})`);
                    console.log(`      newest visit: ${newest.toISOString()} (${newest.toLocaleDateString("fr-FR")})`);
                    console.log(`      date range: ${rangeDays} days`);
                  }
                }
              }
            }
          }
        }
      }
    } else {
      console.log("\nUnexpected structure — check visitors-raw-response.json");
      console.log("Top-level keys:", Object.keys(data));
    }
  } catch (err) {
    console.error("Visitors fetch failed:", (err as Error).message);
  }

  // =========================================================================
  // 2. SENT INVITATIONS
  // =========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("2) SENT INVITATIONS");
  console.log("=".repeat(70));

  try {
    const sent = await client.getSentInvitations({
      account_id: accountId,
      limit: 10,
    });

    console.log(`\nTotal items returned: ${sent.items?.length ?? 0}`);
    console.log(`Has more: ${sent.has_more}`);
    if (sent.cursor) console.log(`Cursor: ${sent.cursor}`);

    if (sent.items?.length > 0) {
      console.log("\nFirst invitation keys:", Object.keys(sent.items[0]));
      console.log("\n--- Last 5 sent invitations ---");
      for (const inv of sent.items.slice(0, 5)) {
        const raw = inv as unknown as Record<string, unknown>;
        console.log(`\n  ID: ${raw.id}`);
        console.log(`  Status: ${raw.status}`);
        console.log(`  Created: ${raw.created_at}`);
        console.log(`  Message: ${raw.message || "(no message)"}`);
        if (raw.invitee) {
          const invitee = raw.invitee as Record<string, unknown>;
          console.log(`  Invitee: ${invitee.first_name} ${invitee.last_name}`);
          console.log(`  Invitee headline: ${invitee.headline || "(none)"}`);
          console.log(`  Invitee provider_id: ${invitee.provider_id || "(none)"}`);
          console.log(`  Invitee profile_url: ${invitee.profile_url || "(none)"}`);
        }
        // Log all extra keys
        const knownKeys = new Set(["id", "object", "provider", "status", "message", "created_at", "invitee"]);
        const extra = Object.keys(raw).filter(k => !knownKeys.has(k));
        if (extra.length > 0) {
          console.log(`  Extra fields: ${extra.join(", ")}`);
          for (const k of extra) {
            console.log(`    ${k}: ${JSON.stringify(raw[k]).slice(0, 200)}`);
          }
        }
      }

      // Save full response
      const fs = await import("fs");
      const outPath = resolve(process.cwd(), "scripts/sent-invitations-raw.json");
      fs.writeFileSync(outPath, JSON.stringify(sent, null, 2));
      console.log(`\nFull response saved to: ${outPath}`);
    }
  } catch (err) {
    console.error("Sent invitations failed:", (err as Error).message);
  }

  // =========================================================================
  // 3. RECEIVED INVITATIONS
  // =========================================================================
  console.log("\n" + "=".repeat(70));
  console.log("3) RECEIVED INVITATIONS");
  console.log("=".repeat(70));

  try {
    const received = await client.getReceivedInvitations({
      account_id: accountId,
      limit: 10,
    });

    console.log(`\nTotal items returned: ${received.items?.length ?? 0}`);
    console.log(`Has more: ${received.has_more}`);

    if (received.items?.length > 0) {
      console.log("\nFirst invitation keys:", Object.keys(received.items[0]));
      console.log("\n--- Last 5 received invitations ---");
      for (const inv of received.items.slice(0, 5)) {
        const raw = inv as unknown as Record<string, unknown>;
        console.log(`\n  ID: ${raw.id}`);
        console.log(`  Status: ${raw.status}`);
        console.log(`  Created: ${raw.created_at}`);
        console.log(`  Message: ${raw.message || "(no message)"}`);
        if (raw.invitee) {
          const invitee = raw.invitee as Record<string, unknown>;
          console.log(`  From: ${invitee.first_name} ${invitee.last_name}`);
          console.log(`  Headline: ${invitee.headline || "(none)"}`);
          console.log(`  Profile URL: ${invitee.profile_url || "(none)"}`);
        }
      }

      // Save full response
      const fs = await import("fs");
      const outPath = resolve(process.cwd(), "scripts/received-invitations-raw.json");
      fs.writeFileSync(outPath, JSON.stringify(received, null, 2));
      console.log(`\nFull response saved to: ${outPath}`);
    }
  } catch (err) {
    console.error("Received invitations failed:", (err as Error).message);
  }

  console.log("\n" + "=".repeat(70));
  console.log("DONE — Check the JSON files in scripts/ for full data");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message ?? err);
  process.exit(1);
});
