/**
 * preview-m1-v11-7d.ts — DRY-preview V11 (axe client) sur les 7 D retenus.
 * LECTURE + LLM uniquement. AUCUN envoi, AUCUNE écriture DB, AUCUN enrôlement.
 *
 * Cible : 7 entreprises D retenues (Socialclub, Kreads, Ace, ONYX, inDigital,
 * Apikom, Starclick), 1 lead par entreprise, tag yann-connections.
 * MODE LEAN : enrichmentData forcé à null → contexte = CSV seul (firstName /
 * company / jobTitle), PAS de visite, PAS d'enrichissement.
 *
 * Chemin de génération = EXACTEMENT celui de prod (buildLeadContext +
 * buildUserPrompt + callAI → Claude), comme le cron generate-actions en M1.
 *
 * USAGE : npx tsx scripts/preview-m1-v11-7d.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const M1_ACTION_TYPE = "message";

// Tokens de matching (lowercase, sur company). Ordre = ordre d'affichage voulu.
const TARGET_TOKENS = [
  "socialclub",
  "kreads",
  "ace",
  "onyx",
  "indigital",
  "apikom",
  "starclick",
];

function matchToken(company: string | null | undefined): string | null {
  const co = (company || "").trim().toLowerCase();
  if (!co) return null;
  for (const tok of TARGET_TOKENS) {
    if (co.includes(tok)) return tok;
  }
  return null;
}

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeMessage } = await import(
    "@/lib/ai/lead-context"
  );
  const { humanizeMessage, applyAntiBloc } = await import("@/lib/humanize");
  const { callAI } = await import("@/lib/ai/service");

  // Pipeline prod EXACT : sanitize → humanize → anti-bloc (en dernier).
  const finishMsg = (raw: string) => applyAntiBloc(humanizeMessage(sanitizeMessage(raw), M1_ACTION_TYPE));
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("leads")
    .select(
      "id, user_id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at"
    )
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[preview-m1-v11-7d] Erreur lecture leads :", error.message);
    process.exit(1);
  }

  // 1 lead par token cible (le 1er rencontré), dans l'ordre de TARGET_TOKENS.
  const byToken = new Map<string, (typeof rows)[number]>();
  for (const r of rows || []) {
    const tok = matchToken(r.company);
    if (tok && !byToken.has(tok)) byToken.set(tok, r);
  }

  const leadsOrdered = TARGET_TOKENS.map((tok) => ({ tok, row: byToken.get(tok) }));
  const missing = leadsOrdered.filter((x) => !x.row).map((x) => x.tok);

  console.log(
    `\n[preview-m1-v11-7d] DRY V11 (axe client) — ${byToken.size}/${TARGET_TOKENS.length} cibles trouvées. enrichmentData=null (LEAN). Aucun envoi, écriture, enrôlement.`
  );
  if (missing.length) console.log(`  ⚠️ tokens introuvables en DB : ${missing.join(", ")}`);

  let ok = 0;
  let fail = 0;
  let idx = 0;

  for (const { tok, row } of leadsOrdered) {
    if (!row) continue;
    idx++;

    // MODE LEAN : enrichmentData forcé à null → aucun bloc enrichi, aucune visite.
    const lead: LeadForGeneration = {
      id: row.id,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      title: row.title,
      company: row.company,
      linkedinUrl: row.linkedin_url ?? "",
      score: row.score,
      status: row.status,
      stage: row.stage,
      tags: row.tags,
      notes: row.notes,
      enrichmentData: null,
    };

    console.log("\n" + "─".repeat(72));
    console.log(
      `#${idx} [${tok}]  ${lead.firstName} ${lead.lastName}`.trim() +
        `  ·  ${lead.title || "—"}  ·  ${lead.company || "—"}`
    );
    console.log("─".repeat(72));

    const sequenceStepObj = { current: 1, total: 1, previousMessages: [] as string[] };
    const runtimeContext = buildLeadContext(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj);
    const userPrompt = buildUserPrompt(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj, {
      withReasoning: true,
    });

    try {
      const aiResult = await callAI({
        userId: row.user_id,
        agentId: "prospection",
        runtimeContext,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
        temperature: 0.7,
        supabaseOverride: supabase,
        icpSegment: undefined,
        sequenceStep: 1,
        metadata: { leadId: lead.id, preview: "preview-m1-v11-7d" },
      });

      const parsed = parseGenerationResponse(aiResult.text, /* isFirstContact */ true);
      if (!parsed.m1) {
        console.log("⚠️  Réponse non-M1 ou non parsable :\n", aiResult.text, "\n");
        fail++;
        continue;
      }
      const m1 = parsed.m1;
      m1.variante_a.message = finishMsg(m1.variante_a.message);
      m1.variante_b.message = finishMsg(m1.variante_b.message);

      const wc = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;
      console.log(`\n  persona déduit : ${m1.persona || "—"}  ·  canal : ${m1.canal} (recommandé : ${m1.canal_recommande})`);
      console.log(`\n  ▸ Variante A — ${m1.variante_a.angle || "—"} (${wc(m1.variante_a.message)} mots)`);
      console.log(indent(m1.variante_a.message || "(vide)"));
      console.log(`\n  ▸ Variante B — ${m1.variante_b.angle || "—"} (${wc(m1.variante_b.message)} mots)`);
      console.log(indent(m1.variante_b.message || "(vide)"));
      console.log(`\n  reasoning : ${m1.reasoning || "—"}`);
      ok++;
    } catch (err) {
      console.log(`⚠️  Échec génération : ${err instanceof Error ? err.message : String(err)}`);
      fail++;
    }
  }

  console.log("\n" + "═".repeat(72));
  console.log(
    `[preview-m1-v11-7d] Terminé — ${ok} généré(s), ${fail} échec(s). Aucun envoi, aucune écriture, aucun enrôlement.`
  );
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    │ ${l}`).join("\n");
}

main().catch((err) => {
  console.error("[preview-m1-v11-7d] Erreur fatale :", err);
  process.exit(1);
});
