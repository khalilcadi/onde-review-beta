/**
 * preview-m2-relance.ts — Génération DRY de la relance T2 (situation "relance")
 * sur 2 leads. Lecture seule du contexte lead, AUCUN envoi, AUCUNE écriture DB,
 * AUCUN enrôlement.
 *
 * Objectif : vérifier le FIX du prompt prospection_m2 (GATE 1). La T2 doit être
 * une relance LÉGÈRE qui s'APPUIE sur le T1 (remonte le fil) sans redéballer la
 * douleur ni poser de question d'introspection.
 *
 * Anti-prod-read : on NE lit PAS les messages réellement envoyés. On synthétise
 * un T1 représentatif (M1 v10, voix Yann) que l'on injecte dans previousMessages,
 * exactement comme le cron passe les messages précédents. Le chemin de génération
 * (buildLeadContext + buildUserPrompt + callAI → M2 relance) est celui de prod.
 *
 * USAGE : npx tsx scripts/preview-m2-relance.ts [N]   (N = nb leads, défaut 2)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const N_PREVIEW = Math.max(1, Math.min(parseInt(process.argv[2] || "2", 10) || 2, 4));
const M2_ACTION_TYPE = "message";

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

/** T1 représentatif (M1 v10, voix Yann, offre-first + friction embarquée). Synthétisé, pas lu en DB. */
function syntheticT1(firstName: string, company: string): string {
  const studio = company || "ton studio";
  return `salut ${firstName}, je lance Onde Review, une bêta gratuite pour la validation créa — au lieu des allers-retours par mail et des versions éparpillées entre WeTransfer et Drive, les retours clients arrivent posés au bon endroit. vous êtes sur Google Drive chez ${studio} ?`;
}

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeMessage } = await import("@/lib/ai/lead-context");
  const { humanizeMessage, applyAntiBloc } = await import("@/lib/humanize");
  const { callAI } = await import("@/lib/ai/service");

  // Pipeline prod EXACT : sanitize → humanize → anti-bloc (en dernier).
  const finishMsg = (raw: string) =>
    applyAntiBloc(humanizeMessage(sanitizeMessage(raw), M2_ACTION_TYPE));
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, user_id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[preview-m2-relance] Erreur lecture leads :", error.message);
    process.exit(1);
  }

  const enriched = (rows || []).filter((r) => isEnriched(r.enrichment_data));
  const leads = pickVariedByCompany(enriched, N_PREVIEW);

  console.log(
    `\n[preview-m2-relance] ${enriched.length} lead(s) enrichi(s) → ${leads.length} prévisualisé(s) — DRY (T2 relance, T1 synthétisé, aucun envoi/écriture/enrôlement).\n`
  );
  if (leads.length === 0) {
    console.log("[preview-m2-relance] Aucun lead enrichi à prévisualiser. Fin.");
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

    // T1 synthétisé injecté comme message précédent (comme le cron : previousMessages).
    const t1 = syntheticT1(lead.firstName, lead.company || "");
    console.log("\n  ▸ T1 (synthétisé, anchor) :");
    console.log(indent(t1));

    // M2 = previousMessages non vide → situation relance, sequenceStep 2.
    // total: 3 → l'étape 2 est une VRAIE relance intermédiaire (T2), pas la dernière (T3).
    const sequenceStepObj = { current: 2, total: 3, previousMessages: [t1] };
    const runtimeContext = buildLeadContext(lead, M2_ACTION_TYPE, undefined, undefined, sequenceStepObj);
    const userPrompt = buildUserPrompt(lead, M2_ACTION_TYPE, undefined, undefined, sequenceStepObj, { withReasoning: true });
    const icpSegment = lead.enrichmentData?.scoring_detail?.segment_icp;

    try {
      const aiResult = await callAI({
        userId: row.user_id,
        agentId: "prospection",
        runtimeContext,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: 2,
        m2Situation: "relance",
        metadata: { leadId: lead.id, preview: "preview-m2-relance" },
      });

      const parsed = parseGenerationResponse(aiResult.text, /* isM1 */ false);
      if (!parsed.m2) {
        console.log("\n⚠️  Réponse non-M2 ou non parsable :\n", aiResult.text, "\n");
        fail++;
        continue;
      }
      const m2 = parsed.m2;
      m2.message = finishMsg(m2.message);
      const wc = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;
      const cc = (s: string) => (s || "").length;
      const msg = m2.message || "";

      console.log(`\n  ▸ T2 RELANCE — type ${m2.type} · ton ${m2.ton} · ${m2.canal} (${wc(msg)} mots, ${cc(msg)} car.)`);
      console.log(indent(msg || "(vide)"));
      console.log(`\n  reasoning : ${m2.reasoning || "—"}\n`);
      ok++;
    } catch (err) {
      console.log(`\n⚠️  Échec génération : ${err instanceof Error ? err.message : String(err)}\n`);
      fail++;
    }
  }

  console.log("═".repeat(72));
  console.log(`[preview-m2-relance] Terminé — ${ok} généré(s), ${fail} échec(s). Aucun envoi, aucune écriture, aucun enrôlement.`);
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    │ ${l}`).join("\n");
}

main().catch((err) => {
  console.error("[preview-m2-relance] Erreur fatale :", err);
  process.exit(1);
});
