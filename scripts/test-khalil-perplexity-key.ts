/**
 * Test Khalil's Perplexity API key directly
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../lib/crypto";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", "%khalil%");
  const khalilId = profiles![0].id;

  const { data: keys } = await supabase
    .from("user_api_keys")
    .select("perplexity_key_encrypted")
    .eq("user_id", khalilId)
    .single();

  if (!keys?.perplexity_key_encrypted) {
    console.log("Pas de clé Perplexity");
    return;
  }

  let plain: string;
  try {
    plain = decrypt(keys.perplexity_key_encrypted);
  } catch (err) {
    console.log("Décryptage FAIL :", err instanceof Error ? err.message : err);
    return;
  }
  console.log(`Clé décryptée OK : ${plain.slice(0, 8)}...${plain.slice(-4)} (length=${plain.length})`);

  // Test direct API call
  console.log("\nTest API Perplexity...");
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${plain}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: "Réponds juste 'OK'" }],
      max_tokens: 10,
    }),
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  const text = await response.text();
  console.log(`Body (1000 chars): ${text.slice(0, 1000)}`);
}

main().catch(console.error);
