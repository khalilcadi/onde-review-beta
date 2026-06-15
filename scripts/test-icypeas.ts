import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { searchEmail, pollResult } from "../lib/icypeas/client";

async function main() {
  console.log("=== Test Icypeas Email Search ===\n");

  const firstName = "Pierre";
  const lastName = "Landoin";
  const domain = "icypeas.com";

  console.log(`Searching: ${firstName} ${lastName} @ ${domain}`);
  const searchId = await searchEmail(firstName, lastName, domain, "test-script");

  if (!searchId) {
    console.error("Search failed — no searchId returned.");
    process.exit(1);
  }

  console.log(`Search ID: ${searchId}`);
  console.log("Polling result (max 5 attempts, 3s interval)...\n");

  const result = await pollResult(searchId);

  if (!result) {
    console.error("Poll returned null — timeout or error.");
    process.exit(1);
  }

  console.log("=== Full Result ===");
  console.log(JSON.stringify(result, null, 2));

  const item = result.items?.[0];
  if (item) {
    console.log("\n=== Summary ===");
    console.log(`Status: ${item.status}`);
    console.log(`Emails: ${item.results.emails.map((e) => `${e.email} (${e.certainty})`).join(", ") || "none"}`);
    console.log(`Phones: ${item.results.phones.join(", ") || "none"}`);
    console.log(`Gender: ${item.results.gender}`);
    console.log(`LinkedIn: ${item.results.li || "none"}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
