import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

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

  const { callOpenAIWebSearch } = await import("@/lib/ai/service");

  console.log("Test web_search sur 'TBM Partners' (Thomas Martin)...\n");
  const start = Date.now();
  const res = await callOpenAIWebSearch({
    userId: khalilId,
    agentId: "enrichissement",
    instructions:
      "Tu es un analyste B2B. Réponds UNIQUEMENT en JSON strict avec ce format :\n" +
      `{ "news": ["news 1", "news 2"], "funding": "info levée si trouvée sinon null", "recent_events": "1-2 phrases sur des actus business des 6 derniers mois sinon null" }\n` +
      "Date du jour : 2026-04-27. NE renseigne que des faits VÉRIFIABLES par tes sources web. Sinon mets null.",
    prompt:
      "Cherche les actualités business récentes (6 derniers mois) sur l'entreprise française 'TBM Partners' (TBM Partners FR, formation B2B, IA, secteur conseil), notamment : levées de fonds, lancements produits, embauches notables, presse.",
    modelOverride: "gpt-5",
    metadata: { test: true, action: "test_websearch" },
    supabaseOverride: supabase as never,
  });
  const elapsed = Math.round((Date.now() - start) / 1000);

  console.log(`✅ ${elapsed}s | tokens: in=${res.usage.inputTokens} out=${res.usage.outputTokens} | cost=$${res.usage.estimatedCostUsd}`);
  console.log("\n=== TEXT ===");
  console.log(res.text);
  console.log("\n=== SOURCES ===");
  console.log(res.sources);
}

main().catch((err) => {
  console.error("[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
