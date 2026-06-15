/**
 * Audit script — Dumps the last N prospection generations with full context.
 *
 * USAGE:
 *   npx tsx scripts/audit-generations.ts [limit]
 *   Default limit: 10
 *
 * OUTPUT:
 *   - Console: summary per generation (sections present, signal, mode probable)
 *   - File: audit-output.json (full data for deep inspection)
 *
 * PREREQUISITES:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const limit = parseInt(process.argv[2] || "10", 10);

interface AuditEntry {
  id: string;
  created_at: string;
  agent_id: string;
  model_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  estimated_cost: number;
  input_text: string | null;
  output_text: string | null;
  metadata: Record<string, unknown> | null;
  lead: {
    id: string;
    first_name: string;
    last_name: string;
    title: string | null;
    company: string | null;
    linkedin_url: string;
    score: number;
    status: string;
    stage: string;
    tags: string[] | null;
    notes: string | null;
    enrichment_data: Record<string, unknown> | null;
  } | null;
}

function detectSections(inputText: string | null): string[] {
  if (!inputText) return [];
  const sections: string[] = [];
  if (inputText.includes("## Lead")) sections.push("Lead");
  if (inputText.includes("## Entreprise")) sections.push("Entreprise");
  if (inputText.includes("## Profil LinkedIn")) sections.push("Profil LinkedIn");
  if (inputText.includes("## Parcours")) sections.push("Parcours");
  if (inputText.includes("## Signal enrichissement")) sections.push("Signal");
  if (inputText.includes("## Posts récents")) sections.push("Posts");
  if (/## Résumé enrichissement/i.test(inputText)) sections.push("Résumé");
  if (inputText.includes("## Scoring IA")) sections.push("Scoring");
  if (inputText.includes("## Action")) sections.push("Action");
  return sections;
}

function detectSignalType(inputText: string | null): string {
  if (!inputText) return "N/A";
  const match = inputText.match(/- Type : (INBOUND|POST_DOULEUR|POST_SUJET|ACTUALITE|SIGNAL_FAIBLE|FROID)/);
  return match ? match[1] : "ABSENT";
}

function detectActionType(inputText: string | null): string {
  if (!inputText) return "N/A";
  const match = inputText.match(/- Type : (invitation|message|inmail)/);
  return match ? match[1] : "N/A";
}

function detectStage(inputText: string | null): string {
  if (!inputText) return "N/A";
  const match = inputText.match(/- Stage : (\w+)/);
  return match ? match[1] : "N/A";
}

function enrichmentQuality(enrichData: Record<string, unknown> | null): string {
  if (!enrichData) return "NONE";
  const keys = Object.keys(enrichData);
  const hasCompany = !!enrichData.company;
  const hasPerson = !!enrichData.person;
  const hasProfile = !!enrichData.linkedin_profile;
  const hasSignal = !!enrichData.signal;
  const hasScoring = !!enrichData.scoring_detail;
  const hasSummary = !!enrichData.summary;

  const score = [hasCompany, hasPerson, hasProfile, hasSignal, hasScoring, hasSummary].filter(Boolean).length;
  if (score >= 5) return "RICH";
  if (score >= 3) return "PARTIAL";
  if (score >= 1) return "MINIMAL";
  return "NONE";
}

async function main() {
  console.log(`\n🔍 Audit des ${limit} dernières générations prospection...\n`);

  // 1. Query ai_usage for prospection generations
  const { data: usageRows, error: usageError } = await supabase
    .from("ai_usage")
    .select("*")
    .eq("agent_id", "prospection")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (usageError) {
    console.error("Error querying ai_usage:", usageError.message);
    process.exit(1);
  }

  if (!usageRows || usageRows.length === 0) {
    console.log("Aucune génération prospection trouvée dans ai_usage.");
    process.exit(0);
  }

  console.log(`${usageRows.length} générations trouvées.\n`);

  // 2. For each, fetch associated lead
  const entries: AuditEntry[] = [];

  for (const row of usageRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const leadId = meta?.leadId as string | undefined;
    let lead: AuditEntry["lead"] = null;

    if (leadId) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data")
        .eq("id", leadId)
        .single();

      if (leadRow) {
        lead = {
          id: leadRow.id,
          first_name: leadRow.first_name ?? "",
          last_name: leadRow.last_name ?? "",
          title: leadRow.title,
          company: leadRow.company,
          linkedin_url: leadRow.linkedin_url,
          score: leadRow.score ?? 0,
          status: leadRow.status ?? "cold",
          stage: leadRow.stage ?? "to_invite",
          tags: leadRow.tags,
          notes: leadRow.notes,
          enrichment_data: leadRow.enrichment_data as Record<string, unknown> | null,
        };
      }
    }

    entries.push({
      id: row.id,
      created_at: row.created_at,
      agent_id: row.agent_id,
      model_id: row.model_id,
      provider: row.provider,
      input_tokens: row.input_tokens ?? 0,
      output_tokens: row.output_tokens ?? 0,
      cached_tokens: row.cached_tokens ?? 0,
      estimated_cost: row.estimated_cost ? parseFloat(String(row.estimated_cost)) : 0,
      input_text: row.input_text,
      output_text: row.output_text,
      metadata: meta,
      lead,
    });
  }

  // 3. Console summary
  console.log("═".repeat(100));
  console.log("  #  │ Date                │ Lead                        │ Action     │ Signal       │ Sections        │ Enrichment │ Tokens");
  console.log("─".repeat(100));

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const date = e.created_at ? new Date(e.created_at).toISOString().slice(0, 16).replace("T", " ") : "N/A";
    const leadName = e.lead ? `${e.lead.first_name} ${e.lead.last_name}`.slice(0, 25).padEnd(25) : "Unknown".padEnd(25);
    const actionType = (e.metadata?.actionType as string || detectActionType(e.input_text)).padEnd(10);
    const signal = detectSignalType(e.input_text).padEnd(14);
    const sections = detectSections(e.input_text);
    const sectionCount = `${sections.length}/9`.padEnd(15);
    const enrichQuality = enrichmentQuality(e.lead?.enrichment_data ?? null).padEnd(10);
    const tokens = `${e.input_tokens}/${e.output_tokens}${e.cached_tokens > 0 ? ` (${e.cached_tokens} cached)` : ""}`;

    console.log(`  ${String(i + 1).padStart(2)} │ ${date} │ ${leadName} │ ${actionType} │ ${signal} │ ${sectionCount} │ ${enrichQuality} │ ${tokens}`);
  }

  console.log("═".repeat(100));

  // 4. Detail per generation
  console.log("\n\n📝 DETAIL DES MESSAGES GENERES\n");

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const leadName = e.lead ? `${e.lead.first_name} ${e.lead.last_name}` : "Unknown";
    const sections = detectSections(e.input_text);
    const missingSections = ["Lead", "Entreprise", "Profil LinkedIn", "Parcours", "Signal", "Posts", "Résumé", "Scoring", "Action"]
      .filter(s => !sections.includes(s));

    console.log(`\n${"─".repeat(80)}`);
    console.log(`#${i + 1} — ${leadName} (${e.lead?.title ?? "N/A"} @ ${e.lead?.company ?? "N/A"})`);
    console.log(`Date: ${e.created_at} | Modèle: ${e.model_id} | Action: ${e.metadata?.actionType || "N/A"}`);
    console.log(`Stage: ${e.lead?.stage ?? "N/A"} | Score: ${e.lead?.score ?? 0} | Status: ${e.lead?.status ?? "N/A"}`);
    console.log(`Signal: ${detectSignalType(e.input_text)} | Enrichment quality: ${enrichmentQuality(e.lead?.enrichment_data ?? null)}`);
    console.log(`Sections présentes: [${sections.join(", ")}]`);
    if (missingSections.length > 0) {
      console.log(`Sections ABSENTES: [${missingSections.join(", ")}]`);
    }
    console.log(`Tokens: in=${e.input_tokens} out=${e.output_tokens} cached=${e.cached_tokens} cost=$${e.estimated_cost.toFixed(4)}`);

    // Show enrichment data summary if available
    if (e.lead?.enrichment_data) {
      const ed = e.lead.enrichment_data;
      const company = ed.company as Record<string, unknown> | undefined;
      const person = ed.person as Record<string, unknown> | undefined;
      const signal = ed.signal as Record<string, unknown> | undefined;
      const scoring = ed.scoring_detail as Record<string, unknown> | undefined;
      const profile = ed.linkedin_profile as Record<string, unknown> | undefined;

      console.log(`\nEnrichment data disponible:`);
      if (company) {
        console.log(`  Company: size=${company.size ?? "null"}, industry=${company.industry ?? "null"}, revenue=${company.revenue ?? "null"}, news=${Array.isArray(company.news) ? company.news.length + " items" : "null"}`);
      }
      if (person) {
        const posts = person.recentPosts as unknown[];
        console.log(`  Person: interests=${Array.isArray(person.interests) ? person.interests.length + " items" : "null"}, posts=${Array.isArray(posts) ? posts.length + " items" : "null"}, anciennete=${person.anciennete_poste_mois ?? "null"}`);
      }
      if (profile) {
        console.log(`  Profile: headline=${profile.headline ? "yes" : "null"}, about=${profile.about ? "yes" : "null"}, is_creator=${profile.is_creator ?? "null"}, followers=${profile.follower_count ?? "null"}`);
      }
      if (signal) {
        console.log(`  Signal: type=${signal.type ?? "null"}, detail=${String(signal.detail ?? "null").slice(0, 80)}`);
      }
      if (scoring) {
        console.log(`  Scoring: fit=${scoring.fit_score ?? "null"}/40, intent=${scoring.intent_score ?? "null"}/40, timing=${scoring.timing_score ?? "null"}/20, categorie=${scoring.categorie ?? "null"}`);
      }
    }

    console.log(`\n📨 MESSAGE GENERE:`);
    console.log(`"${e.output_text || "(vide)"}"`);
    console.log(`\nLongueur: ${(e.output_text || "").length} caractères`);
  }

  // 5. Global stats
  console.log(`\n\n${"═".repeat(80)}`);
  console.log("📊 STATISTIQUES GLOBALES\n");

  const enrichmentLevels = entries.map(e => enrichmentQuality(e.lead?.enrichment_data ?? null));
  const signals = entries.map(e => detectSignalType(e.input_text));
  const avgInputTokens = entries.reduce((s, e) => s + e.input_tokens, 0) / entries.length;
  const avgOutputTokens = entries.reduce((s, e) => s + e.output_tokens, 0) / entries.length;
  const avgCachedTokens = entries.reduce((s, e) => s + e.cached_tokens, 0) / entries.length;
  const totalCost = entries.reduce((s, e) => s + e.estimated_cost, 0);
  const avgMsgLength = entries.reduce((s, e) => s + (e.output_text || "").length, 0) / entries.length;

  console.log(`Enrichment quality: RICH=${enrichmentLevels.filter(l => l === "RICH").length}, PARTIAL=${enrichmentLevels.filter(l => l === "PARTIAL").length}, MINIMAL=${enrichmentLevels.filter(l => l === "MINIMAL").length}, NONE=${enrichmentLevels.filter(l => l === "NONE").length}`);
  console.log(`Signals: ${Array.from(new Set(signals)).map(s => `${s}=${signals.filter(x => x === s).length}`).join(", ")}`);
  console.log(`Avg tokens: input=${Math.round(avgInputTokens)}, output=${Math.round(avgOutputTokens)}, cached=${Math.round(avgCachedTokens)}`);
  console.log(`Avg message length: ${Math.round(avgMsgLength)} chars`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  // 6. Write full dump
  const outputPath = path.resolve(process.cwd(), "audit-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`\n✅ Full audit data written to: ${outputPath}`);
  console.log(`   Open this file to inspect input_text (runtimeContext sent to LLM) per generation.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
