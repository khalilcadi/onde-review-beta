/**
 * Test end-to-end du NOUVEAU pipeline dossier d'attaque — READ-ONLY (aucune écriture DB).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-dossier-e2e.ts
 *
 * Web search via Claude Sonnet (callClaudeWebSearch) — PAS OpenAI (pas de crédits).
 * Étapes : 1) top leads  2) dump enrichment  3) buildDossierInput  4) 3 web searches
 *          5) simule web_research  6) agent dossier_attaque  7) raw  8) parse  9) verify
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { buildDossierInput } from "../lib/ai/lead-context";
import { callAI, callClaudeWebSearch } from "../lib/ai/service";
import type { AgentId } from "../lib/ai/prompts/defaults";

const SONNET = "claude-sonnet-4-6";

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function hr(title: string) { console.log(bold(`\n${"═".repeat(70)}\n${title}\n${"═".repeat(70)}`)); }

function extractLastJsonObject(text: string): string | null {
  let depth = 0, start = -1, inStr = false, esc = false;
  let last: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { if (depth > 0) { depth--; if (depth === 0 && start !== -1) { last = text.slice(start, i + 1); start = -1; } } }
  }
  return last;
}

/** Mirror de parseWebJson (enrich/route.ts) : direct → fence ```json``` → dernier {...}. */
function extractJson(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string) => { try { return JSON.parse(s.trim()) as Record<string, unknown>; } catch { return null; } };
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const direct = tryParse(stripped);
  if (direct) return direct;
  const fences = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  if (fences.length > 0) {
    const f = tryParse(fences[fences.length - 1][1]);
    if (f) return f;
  }
  const lastObj = extractLastJsonObject(raw);
  if (lastObj) { const o = tryParse(lastObj); if (o) return o; }
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ============================================================ STEP 1
  hr("STEP 1 — Top 5 leads in-ICP (décideur + secteur conseil/tech) par nb de posts");

  const { data: candidates, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, user_id, enrichment_data")
    .not("enrichment_data", "is", null)
    .limit(2000);
  if (error) throw new Error(`Query failed: ${error.message}`);

  const titleRe = /directeur|director|ceo|dg|founder/i;
  const companyRe = /conseil|consulting|esn|digital|tech/i;

  const ranked = (candidates || [])
    .map((l) => {
      const ed = (l.enrichment_data || {}) as Record<string, unknown>;
      const posts = ed.linkedin_posts;
      const n = Array.isArray(posts) ? posts.length : 0;
      return { lead: l, ed, n };
    })
    .filter((x) => x.n > 0 && titleRe.test(x.lead.title || "") && companyRe.test(x.lead.company || ""))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  if (ranked.length === 0) throw new Error("Aucun lead in-ICP avec linkedin_posts trouvé.");

  ranked.forEach((x, i) => {
    console.log(
      `${i === 0 ? green("▶") : " "} ${bold(`${x.lead.first_name ?? ""} ${x.lead.last_name ?? ""}`.trim())} @ ${x.lead.company ?? "?"} ` +
      dim(`— ${x.n} posts — id=${x.lead.id}`)
    );
  });

  const top = ranked[0];
  const lead = top.lead;
  const ed = top.ed;
  const userId = lead.user_id!;
  const leadArg = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    title: lead.title,
    company: lead.company,
    linkedin_url: lead.linkedin_url,
  };

  // ============================================================ STEP 2
  hr("STEP 2 — enrichment_data du top lead (linkedin_posts tronqués à 100c)");

  const edForPrint = JSON.parse(JSON.stringify(ed)) as Record<string, unknown>;
  if (Array.isArray(edForPrint.linkedin_posts)) {
    edForPrint.linkedin_posts = (edForPrint.linkedin_posts as Array<Record<string, unknown>>).map((p) => ({
      ...p,
      text: typeof p.text === "string" ? p.text.slice(0, 100) : p.text,
    }));
  }
  console.log(JSON.stringify(edForPrint, null, 2));

  // ============================================================ STEP 3
  hr("STEP 3 — buildDossierInput() (SANS web_research)");
  const inputNoWeb = buildDossierInput(leadArg, ed);
  console.log(inputNoWeb);

  // ============================================================ STEP 4
  hr("STEP 4 — 3 web searches via Claude Haiku (mirror enrich/route.ts Step 3)");
  if (!lead.company) {
    console.log(yellow("⚠ Pas de company → les 3 requêtes seraient skippées en prod. On tente quand même C."));
  }
  const company = lead.company || "";
  const fullName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();

  // Mêmes queries + instructions que la route (prompt = requête, instructions = schéma JSON)
  const queryA = `${company} Pappers Verif effectifs CA structure juridique`;
  const queryB = `"${company}" actualités presse 2025 recrutement partenariat`;
  const queryC = `"${fullName}" ${company} LinkedIn signaux`;
  const instrA = 'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"effectif": "...|null", "ca": "...|null", "structure_capitalistique": "...|null", "code_naf": "...|null", "date_creation": "...|null"}. Mets null pour chaque champ non trouvé.';
  const instrB = 'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"presse": [{"titre": "...", "resume": "...", "date": "AAAA-MM-JJ|null"}]}. Tableau vide si rien de pertinent.';
  const instrC = 'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"signaux": [{"type": "...", "description": "...", "date": "AAAA-MM-JJ|null"}]}. Tableau vide si rien de pertinent.';

  // NB: web searches sur Haiku (bucket de rate-limit séparé de Sonnet). Le dossier
  // reste sur Sonnet. La limite 429 observée est PAR MODÈLE (claude-sonnet-4-6).
  const meta = { leadId: lead.id, action: "test_web_research_claude" };
  const run = (prompt: string, instructions: string, label: string) =>
    callClaudeWebSearch({ userId, agentId: "enrichissement" as AgentId, prompt, instructions, metadata: meta, supabaseOverride: supabase })
      .then((r) => { console.log(green(`✓ ${label} ok`) + dim(` (${r.sources.length} sources, $${r.usage.estimatedCostUsd.toFixed(4)})`)); return r; })
      .catch((e) => { console.log(red(`✗ ${label} failed: ${e instanceof Error ? e.message : e}`)); return null; });

  const [resA, resB, resC] = await Promise.allSettled([run(queryA, instrA, "Query A (societe)"), run(queryB, instrB, "Query B (presse)"), run(queryC, instrC, "Query C (signaux)")]);

  const valA = resA.status === "fulfilled" ? resA.value : null;
  const valB = resB.status === "fulfilled" ? resB.value : null;
  const valC = resC.status === "fulfilled" ? resC.value : null;

  console.log(cyan("\n--- Raw Query A ---")); console.log(valA?.text ?? "(null)");
  console.log(cyan("\n--- Raw Query B ---")); console.log(valB?.text ?? "(null)");
  console.log(cyan("\n--- Raw Query C ---")); console.log(valC?.text ?? "(null)");

  // ============================================================ STEP 5
  hr("STEP 5 — web_research simulé (depuis les 3 résultats)");

  const parsedA = valA ? extractJson(valA.text) : null;
  const parsedB = valB ? extractJson(valB.text) : null;
  const parsedC = valC ? extractJson(valC.text) : null;

  const societe = parsedA
    ? {
        effectif: (parsedA.effectif as string) || undefined,
        ca: (parsedA.ca as string) || undefined,
        structure_capitalistique: (parsedA.structure_capitalistique as string) || undefined,
        code_naf: (parsedA.code_naf as string) || undefined,
        date_creation: (parsedA.date_creation as string) || undefined,
        source: valA!.sources[0] || "claude_web_search",
      }
    : undefined;
  const presse = Array.isArray(parsedB?.presse)
    ? (parsedB!.presse as Array<Record<string, unknown>>).map((it) => ({
        titre: (it.titre as string) || "",
        resume: (it.resume as string) || "",
        date: (it.date as string) || undefined,
        source: (it.source as string) || valB!.sources[0] || "claude_web_search",
      }))
    : [];
  const signaux = Array.isArray(parsedC?.signaux)
    ? (parsedC!.signaux as Array<Record<string, unknown>>).map((it) => ({
        type: (it.type as string) || "",
        description: (it.description as string) || "",
        date: (it.date as string) || undefined,
        source: (it.source as string) || valC!.sources[0] || "claude_web_search",
      }))
    : [];

  const web_research = {
    ...(societe ? { societe } : {}),
    presse,
    signaux,
    searched_at: new Date().toISOString(),
  };
  console.log(JSON.stringify(web_research, null, 2));

  // ============================================================ STEP 6
  hr("STEP 6 — Agent dossier_attaque (web_research injecté)");
  const edWithWeb = { ...ed, web_research };
  const dossierInput = buildDossierInput(leadArg, edWithWeb);
  console.log(dim("--- buildDossierInput (AVEC web_research) ---"));
  console.log(dossierInput);

  console.log(dim("\n--- Appel agent (Claude Sonnet)... ---"));
  const callDossier = () =>
    callAI({
      userId,
      agentId: "dossier_attaque" as AgentId,
      messages: [{ role: "user", content: dossierInput }],
      maxTokens: 3000,
      temperature: 0.3,
      modelOverride: SONNET,
      metadata: { leadId: lead.id, action: "test_dossier_attaque" },
      supabaseOverride: supabase,
    });
  let dossierResponse: Awaited<ReturnType<typeof callDossier>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      dossierResponse = await callDossier();
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < 3) {
        console.log(yellow(`⚠ 429 rate limit (Sonnet) — attente 65s puis retry (${attempt}/2)...`));
        await new Promise((r) => setTimeout(r, 65000));
        continue;
      }
      throw e;
    }
  }
  if (!dossierResponse) throw new Error("Dossier call failed after retries");

  // ============================================================ STEP 7
  hr("STEP 7 — Réponse brute de l'agent");
  console.log(dossierResponse.text);
  console.log(dim(`\n(tokens in=${dossierResponse.usage.inputTokens} out=${dossierResponse.usage.outputTokens} — $${dossierResponse.usage.estimatedCostUsd.toFixed(4)})`));
  writeFileSync("scripts/e2e-raw.txt", dossierResponse.text, "utf8"); // dump systématique (diag truncation)

  // ============================================================ STEP 8
  hr("STEP 8 — JSON.parse (robuste : direct → fence → dernier {...})");
  const dossier = extractJson(dossierResponse.text);
  if (dossier) {
    console.log(green("✓ SUCCESS — parsed dossier object:"));
    console.log(JSON.stringify(dossier, null, 2));
    console.log(dim(`\nFields (${Object.keys(dossier).length}): ${Object.keys(dossier).join(", ")}`));
  } else {
    console.log(red("✗ FAILURE — extraction JSON impossible (réponse probablement tronquée)."));
    console.log(yellow(`out tokens=${dossierResponse.usage.outputTokens} — First 500 chars:`));
    console.log(dossierResponse.text.slice(0, 500));
  }

  // ============================================================ STEP 9
  hr("STEP 9 — Vérification des champs");
  if (!dossier) {
    console.log(red("Aucun dossier parsé — vérification impossible."));
    process.exit(1);
  }
  const requiredNonNull = ["mecanisme", "question_ouverte", "signal_declencheur", "formalite", "voix", "canal_recommande", "angle_qualite", "objectif_reponse"];
  const nullableAllowed = ["accroche_pivot", "corps_message", "hypothese_assumee", "reserves"];

  let allOk = true;
  console.log(bold("Required (non-null) :"));
  for (const f of requiredNonNull) {
    const v = dossier[f];
    const ok = v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");
    if (!ok) allOk = false;
    console.log(`  ${ok ? green("✓") : red("✗")} ${f} = ${JSON.stringify(v)?.slice(0, 70) ?? "undefined"}`);
  }
  console.log(bold("Nullable (autorisés null) :"));
  for (const f of nullableAllowed) {
    const v = dossier[f];
    console.log(`  ${dim("•")} ${f} = ${JSON.stringify(v)?.slice(0, 70) ?? "undefined"}`);
  }

  console.log(allOk ? green(bold("\n✅ Tous les champs requis sont présents et non-null.")) : red(bold("\n❌ Des champs requis manquent ou sont null (voir ci-dessus).")));

  // Dump complet (évite la troncature console)
  const report = {
    lead: { id: lead.id, name: fullName, company: lead.company },
    raw_response: dossierResponse.text,
    parsed: dossier,
    verification: {
      requiredNonNull: requiredNonNull.map((f) => ({ field: f, value: dossier![f] ?? null, ok: dossier![f] != null && !(typeof dossier![f] === "string" && (dossier![f] as string).trim() === "") })),
      nullableAllowed: nullableAllowed.map((f) => ({ field: f, value: dossier![f] ?? null })),
      allRequiredOk: allOk,
    },
  };
  writeFileSync("scripts/e2e-result.json", JSON.stringify(report, null, 2), "utf8");
  console.log(dim("\n→ Rapport complet écrit dans scripts/e2e-result.json"));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(red(`\nFATAL: ${e instanceof Error ? e.stack : e}`)); process.exit(1); });
