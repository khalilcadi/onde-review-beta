/**
 * preview-m1-segC.ts — Génération DRY du M1 réel sur 2-3 leads seg_C (persona
 * agency_creative, JAMAIS tournée en live). Lecture seule, AUCUN envoi, AUCUNE
 * écriture DB, AUCUN enrôlement.
 *
 * Diffère de preview-m1.ts : on ne sélectionne PAS depuis les enrôlés (les seg_C
 * ne sont pas enrôlés). On cible directement les leads presort:C enrichis dont le
 * segment_icp calculé === "C", variés par entreprise.
 *
 * Chemin de génération = EXACTEMENT celui de prod (buildLeadContext + buildUserPrompt
 * + callAI → buildSystemPromptParts → Claude), comme le cron generate-actions.
 *
 * USAGE : npx tsx scripts/preview-m1-segC.ts [N]   (N = nb leads, défaut 3)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const N_PREVIEW = Math.max(1, Math.min(parseInt(process.argv[2] || "3", 10) || 3, 5));
const M1_ACTION_TYPE = "message";

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}
function computedSeg(ed: any): string | null {
  return ed?.scoring_detail?.segment_icp ?? null;
}
function isEnriched(ed: any): boolean {
  return !!(ed && typeof ed === "object" && "enriched_at" in ed);
}

/** Sélectionne jusqu'à n leads d'entreprises distinctes (variété de personnalisation). */
function pickVariedByCompany<T extends { company?: string | null }>(leads: T[], n: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const l of leads) {
    if (out.length >= n) break;
    const co = (l.company || "").trim().toLowerCase();
    if (seen.has(co)) continue;
    seen.add(co);
    out.push(l);
  }
  for (const l of leads) {
    if (out.length >= n) break;
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeMessage } = await import(
    "@/lib/ai/lead-context"
  );
  const { humanizeMessage, applyAntiBloc } = await import("@/lib/humanize");
  const { callAI } = await import("@/lib/ai/service");

  // Pipeline prod EXACT : sanitize → humanize → anti-bloc (en dernier).
  const finishMsg = (raw: string) =>
    applyAntiBloc(humanizeMessage(sanitizeMessage(raw), M1_ACTION_TYPE));
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, user_id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[preview-m1-segC] Erreur lecture leads :", error.message);
    process.exit(1);
  }

  // Cible : presort:C, enrichis, segment_icp calculé === "C".
  const segC = (rows || []).filter(
    (r) => presortSeg(r.enrichment_data) === "C" && isEnriched(r.enrichment_data) && computedSeg(r.enrichment_data) === "C"
  );
  const leads = pickVariedByCompany(segC, N_PREVIEW);

  console.log(
    `\n[preview-m1-segC] ${segC.length} lead(s) seg_C (computed=C) éligible(s) → ${leads.length} prévisualisé(s) — DRY (aucun envoi, écriture, enrôlement).\n`
  );
  if (leads.length === 0) {
    console.log("[preview-m1-segC] Aucun lead seg_C computed=C à prévisualiser. Fin.");
    return;
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];
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
      enrichmentData: row.enrichment_data as LeadForGeneration["enrichmentData"],
    };
    const segment = lead.enrichmentData?.scoring_detail?.segment_icp ?? "?";

    console.log("─".repeat(72));
    console.log(
      `#${i + 1}  ${lead.firstName} ${lead.lastName}`.trim() +
        `  ·  ${lead.title || "—"}  ·  ${lead.company || "—"}  ·  seg ${segment}`
    );
    console.log("─".repeat(72));

    const sequenceStepObj = { current: 1, total: 1, previousMessages: [] as string[] };
    const runtimeContext = buildLeadContext(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj);
    const userPrompt = buildUserPrompt(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj, { withReasoning: true });
    const icpSegment = lead.enrichmentData?.scoring_detail?.segment_icp;

    try {
      const aiResult = await callAI({
        userId: row.user_id,
        agentId: "prospection",
        runtimeContext,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
        temperature: 0.7,
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: 1,
        metadata: { leadId: lead.id, preview: "preview-m1-segC" },
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
      console.log(`\n  persona déduit : ${m1.persona || "—"}`);
      console.log(`  canal          : ${m1.canal} (recommandé : ${m1.canal_recommande})`);
      console.log(`\n  ▸ Variante A — ${m1.variante_a.angle || "—"} (${wc(m1.variante_a.message)} mots)`);
      console.log(indent(m1.variante_a.message || "(vide)"));
      console.log(`\n  ▸ Variante B — ${m1.variante_b.angle || "—"} (${wc(m1.variante_b.message)} mots)`);
      console.log(indent(m1.variante_b.message || "(vide)"));
      console.log(`\n  reasoning : ${m1.reasoning || "—"}\n`);
      ok++;
    } catch (err) {
      console.log(`⚠️  Échec génération : ${err instanceof Error ? err.message : String(err)}\n`);
      fail++;
    }
  }

  console.log("═".repeat(72));
  console.log(`[preview-m1-segC] Terminé — ${ok} généré(s), ${fail} échec(s). Aucun envoi, aucune écriture, aucun enrôlement.`);
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    │ ${l}`).join("\n");
}

main().catch((err) => {
  console.error("[preview-m1-segC] Erreur fatale :", err);
  process.exit(1);
});
