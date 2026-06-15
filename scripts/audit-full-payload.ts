/**
 * Reconstruct the FULL payload sent to the LLM for a specific generation.
 *
 * USAGE:
 *   npx tsx scripts/audit-full-payload.ts [index]
 *   index: 0 = most recent, 1 = second most recent, etc. Default: 0
 *
 * Shows EXACTLY what Claude receives:
 *   system[0] = Agent prompt + RAG blocs (CACHED)
 *   system[1] = Runtime context (lead data)
 *   messages[0] = User prompt
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const index = parseInt(process.argv[2] || "0", 10);

// ---- Reconstruct RAG context (same logic as lib/rag/context.ts) ----

interface RagSection {
  heading: string;
  content: string[];
}

interface RagBloc {
  source_file: string;
  bloc_id: string;
  title: string;
  sections: RagSection[];
  metadata: Record<string, unknown>;
}

function formatBlocAsText(bloc: RagBloc): string {
  const lines: string[] = [];
  lines.push(`### ${bloc.title}`);
  lines.push("");
  for (const section of bloc.sections) {
    if (section.heading) {
      lines.push(`**${section.heading}**`);
    }
    if (section.content.length > 0) {
      lines.push(section.content.join("\n"));
    }
  }
  return lines.join("\n");
}

const RAG_AGENT_MAPPING: Record<string, string[]> = {
  prospection_m1: ["icp_segments", "pain_points", "messaging_angles", "offre_produit"],
  prospection_m2: ["icp_segments", "pain_points", "messaging_angles", "offre_produit", "qualification"],
  scoring: ["icp_segments", "pain_points", "qualification"],
  enrichissement: ["icp_segments"],
  conversational: ["icp_segments", "pain_points", "messaging_angles", "offre_produit", "qualification"],
};

async function buildRagContext(agentId: string): Promise<string> {
  const blocIds = RAG_AGENT_MAPPING[agentId] || [];
  if (blocIds.length === 0) return "";

  const knowledgeDir = path.resolve(process.cwd(), "knowledge");
  const blocs: RagBloc[] = [];

  for (const blocId of blocIds) {
    const filePath = path.join(knowledgeDir, `${blocId}.json`);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      blocs.push(JSON.parse(raw));
    } catch {
      console.warn(`  [warn] Could not load RAG bloc: ${blocId}`);
    }
  }

  if (blocs.length === 0) return "";

  const sections = blocs.map(formatBlocAsText);
  return `---\n\n## BASE DE CONNAISSANCES (RAG)\n\n${sections.join("\n\n---\n\n")}\n\n---\nFin de la base de connaissances.`;
}

// ---- Load agent prompt (from defaults.ts source) ----

async function loadAgentPrompt(): Promise<string> {
  const defaultsPath = path.resolve(process.cwd(), "lib/ai/prompts/defaults.ts");
  const source = fs.readFileSync(defaultsPath, "utf-8");

  // Extract prospection prompt from the template literal
  const match = source.match(/prospection:\s*`([\s\S]*?)`\s*,\s*\n\s*\/\//);
  if (!match) {
    console.warn("Could not extract prospection prompt from defaults.ts");
    return "[PROMPT NOT FOUND]";
  }

  // Unescape template literal
  return match[1].replace(/\\`/g, "`").replace(/\\\$/g, "$");
}

async function main() {
  console.log(`\n🔬 Reconstruction du payload complet pour la génération #${index + 1}...\n`);

  // 1. Get the ai_usage row
  const { data: rows, error } = await supabase
    .from("ai_usage")
    .select("*")
    .eq("agent_id", "prospection")
    .order("created_at", { ascending: false })
    .range(index, index);

  if (error || !rows?.length) {
    console.error("Could not find generation at index", index);
    process.exit(1);
  }

  const row = rows[0];
  const inputText = row.input_text || "";
  const outputText = row.output_text || "";

  // 2. Parse input_text to separate context from user message
  const contextUserSplit = inputText.split("\n---\n\n[user]\n");
  const runtimeContext = contextUserSplit[0]?.replace("[Context]\n", "") || inputText;
  const userMessage = contextUserSplit[1] || "[user message not found in input_text]";

  // 3. Build system prompt = agent prompt + RAG
  const agentPrompt = await loadAgentPrompt();
  const ragContext = await buildRagContext("prospection");
  const basePrompt = `${agentPrompt}\n\n${ragContext}`;

  // 4. Output
  const separator = "═".repeat(100);
  const thinSep = "─".repeat(100);

  console.log(separator);
  console.log("📅 Date:", row.created_at);
  console.log("🤖 Modèle:", row.model_id || "undefined");
  console.log("💰 Coût:", `$${parseFloat(String(row.estimated_cost || 0)).toFixed(4)}`);
  console.log("📊 Tokens: input=" + row.input_tokens, "output=" + row.output_tokens, "cached=" + row.cached_tokens);
  console.log(separator);

  // system[0] — CACHED
  console.log("\n\n" + separator);
  console.log("📦 SYSTEM BLOCK 0 — CACHED (Agent Prompt + RAG)");
  console.log(`   Taille estimée: ~${Math.round(basePrompt.length / 4)} tokens`);
  console.log(separator);
  console.log(basePrompt);

  // system[1] — NOT CACHED
  console.log("\n\n" + separator);
  console.log("📦 SYSTEM BLOCK 1 — NOT CACHED (Runtime Context = données lead)");
  console.log(`   Taille estimée: ~${Math.round(runtimeContext.length / 4)} tokens`);
  console.log(separator);
  console.log(runtimeContext);

  // user message
  console.log("\n\n" + separator);
  console.log("💬 USER MESSAGE");
  console.log(separator);
  console.log(userMessage);

  // output
  console.log("\n\n" + separator);
  console.log("📨 LLM OUTPUT (message généré)");
  console.log(separator);
  console.log(outputText);
  console.log(`\nLongueur: ${outputText.length} caractères`);

  // Stats
  console.log("\n\n" + separator);
  console.log("📊 ANALYSE");
  console.log(thinSep);

  const promptChars = agentPrompt.length;
  const ragChars = ragContext.length;
  const contextChars = runtimeContext.length;
  const userChars = userMessage.length;
  const totalChars = promptChars + ragChars + contextChars + userChars;

  console.log(`Agent prompt:   ${promptChars.toLocaleString()} chars (${(promptChars / totalChars * 100).toFixed(1)}%)`);
  console.log(`RAG context:    ${ragChars.toLocaleString()} chars (${(ragChars / totalChars * 100).toFixed(1)}%)`);
  console.log(`Lead context:   ${contextChars.toLocaleString()} chars (${(contextChars / totalChars * 100).toFixed(1)}%)`);
  console.log(`User message:   ${userChars.toLocaleString()} chars (${(userChars / totalChars * 100).toFixed(1)}%)`);
  console.log(`Total:          ${totalChars.toLocaleString()} chars`);
  console.log(`\nRatio prompt+RAG vs lead: ${((promptChars + ragChars) / contextChars).toFixed(1)}x`);
  console.log(`(Le LLM reçoit ${((promptChars + ragChars) / contextChars).toFixed(1)}x plus d'instructions que de données lead)`);

  // Write full payload to file
  const outputPath = path.resolve(process.cwd(), "audit-full-payload.txt");
  const fullContent = [
    "=" .repeat(100),
    "SYSTEM BLOCK 0 — CACHED (Agent Prompt + RAG)",
    "=".repeat(100),
    basePrompt,
    "",
    "=".repeat(100),
    "SYSTEM BLOCK 1 — NOT CACHED (Runtime Context)",
    "=".repeat(100),
    runtimeContext,
    "",
    "=".repeat(100),
    "USER MESSAGE",
    "=".repeat(100),
    userMessage,
    "",
    "=".repeat(100),
    "LLM OUTPUT",
    "=".repeat(100),
    outputText,
  ].join("\n");

  fs.writeFileSync(outputPath, fullContent, "utf-8");
  console.log(`\n✅ Full payload written to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
