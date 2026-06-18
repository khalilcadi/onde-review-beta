/**
 * preview-m1.ts — Génération DRY du M1 réel sur 4 leads enrôlés variés (Onde Review beta).
 *
 * BUT : produire le premier DM (M1) tel qu'il PARTIRAIT réellement, pour relecture
 * humaine AVANT tout envoi. Le M1 est généré via EXACTEMENT le chemin de prod
 * (buildLeadContext + buildUserPrompt + callAI → buildSystemPromptParts + appel Claude),
 * le même que celui qu'utilise le cron generate-actions. Aucune réimplémentation.
 *
 * ⚠️  STRICTEMENT DRY :
 *     - AUCUN envoi (pas d'appel Unipile / LinkedIn)
 *     - AUCUNE écriture DB (lecture seule sur beta_mission.leads)
 *     - AUCUNE création d'action
 *     Seuls appels réseau : lecture Supabase + appels LLM (génération du message).
 *
 * ⚠️  Pas de délai anti-détection : ce sont des appels LLM, pas des actions LinkedIn.
 *
 * USAGE : npx tsx scripts/preview-m1.ts
 */

// 1re ligne effective : charger .env.local AVANT tout import qui lit process.env
// (les modules lib lisent l'env au chargement).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

/** Nombre de leads à prévisualiser (enrôlés, variés par entreprise/segment). */
const N_PREVIEW = 4;

/** Type d'action du M1 : DM direct (connexions 1er degré → pas d'invitation). */
const M1_ACTION_TYPE = "message";

/** Segment ICP calculé du lead (depuis l'enrichissement). */
function computedSeg(ed: unknown): string {
  const d = ed as { scoring_detail?: { segment_icp?: string } } | null | undefined;
  return d?.scoring_detail?.segment_icp ?? "?";
}

/**
 * Sélectionne jusqu'à `n` leads variés : on privilégie des entreprises distinctes
 * (la surface de personnalisation la plus visible), puis on complète si besoin.
 */
function pickVaried<T extends { company?: string | null; enrichment_data?: unknown }>(
  leads: T[],
  n: number
): T[] {
  const out: T[] = [];
  const seenCompany = new Set<string>();
  const seenSeg = new Set<string>();
  // 1er passage : entreprise ET segment encore jamais vus (variété maximale).
  for (const l of leads) {
    if (out.length >= n) break;
    const co = (l.company || "").trim().toLowerCase();
    const seg = computedSeg(l.enrichment_data);
    if (seenCompany.has(co) || seenSeg.has(seg)) continue;
    seenCompany.add(co);
    seenSeg.add(seg);
    out.push(l);
  }
  // 2e passage : entreprise distincte (segment peut se répéter).
  for (const l of leads) {
    if (out.length >= n) break;
    const co = (l.company || "").trim().toLowerCase();
    if (out.includes(l) || seenCompany.has(co)) continue;
    seenCompany.add(co);
    out.push(l);
  }
  // 3e passage : compléter avec ce qui reste.
  for (const l of leads) {
    if (out.length >= n) break;
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

/** Fichier de sortie Markdown (relecture humaine, gitignoré comme les autres résultats). */
const OUTPUT_MD = "scripts/preview-m1-results.md";

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  // Imports dynamiques APRÈS dotenv (les modules lib lisent l'env au chargement).
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeM1Message } = await import(
    "@/lib/ai/lead-context"
  );
  const { callAI } = await import("@/lib/ai/service");
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  // --- Lecture seule : enrôlements actifs (sequence_leads) -----------------
  const { data: enrolls, error: enrollErr } = await supabase
    .from("sequence_leads")
    .select("lead_id, status")
    .eq("status", "active");

  if (enrollErr) {
    console.error("[preview-m1] Erreur lecture sequence_leads :", enrollErr.message);
    process.exit(1);
  }
  const enrolledIds = new Set((enrolls || []).map((e) => e.lead_id));

  // --- Lecture seule : leads ------------------------------------------------
  const { data: rows, error } = await supabase
    .from("leads")
    .select(
      "id, user_id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data"
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[preview-m1] Erreur lecture leads :", error.message);
    process.exit(1);
  }

  // Enrôlés (présents dans sequence_leads actifs), puis 4 leads variés.
  const enrolled = (rows || []).filter((r) => enrolledIds.has(r.id));
  const leads = pickVaried(enrolled, N_PREVIEW);

  console.log(
    `\n[preview-m1] ${enrolled.length} lead(s) enrôlé(s) → ${leads.length} prévisualisé(s) (variés) — génération M1 DRY (aucun envoi, aucune écriture).\n`
  );

  if (leads.length === 0) {
    console.log("[preview-m1] Aucun lead enrôlé à prévisualiser. Fin.");
    return;
  }

  let ok = 0;
  let fail = 0;

  // Accumulateur pour l'export Markdown (relecture à froid).
  const mdBlocks: string[] = [
    `# Preview M1 — Invitation bêta Onde Review (leads enrôlés variés)`,
    ``,
    `> DRY run — aucun envoi, aucune écriture DB. ${leads.length} lead(s) sur ${enrolled.length} enrôlé(s).`,
    `> Généré via le chemin de prod (prospection_m1 V10, temp 0.7). Sortie passée au sanitize M1 déterministe.`,
    ``,
  ];

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i];

    // Mapping DB → LeadForGeneration (identique à loadLeadForGeneration du cron).
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

    // --- M1 = premier contact : sequenceStep.current = 1, aucun message précédent.
    const sequenceStepObj = { current: 1, total: 1, previousMessages: [] as string[] };

    // Chemin de prod exact (mêmes appels que generate-actions pour le M1).
    const runtimeContext = buildLeadContext(
      lead,
      M1_ACTION_TYPE,
      undefined,
      undefined,
      sequenceStepObj
    );
    const userPrompt = buildUserPrompt(
      lead,
      M1_ACTION_TYPE,
      undefined,
      undefined,
      sequenceStepObj,
      { withReasoning: true }
    );

    const icpSegment = lead.enrichmentData?.scoring_detail?.segment_icp;

    try {
      const aiResult = await callAI({
        userId: row.user_id,
        agentId: "prospection",
        runtimeContext,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1200,
        // Miroir exact du chemin de prod M1 (generate-actions) : température modérée (V10).
        temperature: 0.7,
        // signalType volontairement omis : Gojiberry retiré, le M1 route sur le segment.
        supabaseOverride: supabase,
        icpSegment,
        sequenceStep: 1,
        metadata: { leadId: lead.id, preview: "preview-m1" },
      });

      const parsed = parseGenerationResponse(aiResult.text, /* isFirstContact */ true);

      if (!parsed.m1) {
        console.log("⚠️  Réponse non-M1 ou non parsable :\n", aiResult.text, "\n");
        fail++;
        continue;
      }

      const m1 = parsed.m1;

      // Sanitize M1 déterministe : miroir exact de ce qui partirait (route generate).
      m1.variante_a.message = sanitizeM1Message(m1.variante_a.message);
      m1.variante_b.message = sanitizeM1Message(m1.variante_b.message);

      console.log(`\n  persona déduit : ${m1.persona || "—"}`);
      console.log(`  canal          : ${m1.canal} (recommandé : ${m1.canal_recommande})`);

      console.log(`\n  ▸ Variante A`);
      console.log(`    angle : ${m1.variante_a.angle || "—"}`);
      console.log(indent(m1.variante_a.message || "(vide)"));

      console.log(`\n  ▸ Variante B`);
      console.log(`    angle : ${m1.variante_b.angle || "—"}`);
      console.log(indent(m1.variante_b.message || "(vide)"));

      console.log(`\n  reasoning : ${m1.reasoning || "—"}\n`);

      // Bloc Markdown pour l'export.
      const wc = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;
      mdBlocks.push(
        `## #${i + 1} — ${lead.firstName} ${lead.lastName}`.trim(),
        ``,
        `- **Titre** : ${lead.title || "—"}`,
        `- **Entreprise** : ${lead.company || "—"}`,
        `- **Segment** : ${segment} · **persona** : ${m1.persona || "—"} · **canal** : ${m1.canal}`,
        ``,
        `**Variante A** — _${m1.variante_a.angle || "—"}_ (${wc(m1.variante_a.message)} mots)`,
        ``,
        `> ${(m1.variante_a.message || "(vide)").replace(/\n/g, "\n> ")}`,
        ``,
        `**Variante B** — _${m1.variante_b.angle || "—"}_ (${wc(m1.variante_b.message)} mots)`,
        ``,
        `> ${(m1.variante_b.message || "(vide)").replace(/\n/g, "\n> ")}`,
        ``,
        `**Reasoning** : ${m1.reasoning || "—"}`,
        ``,
        `---`,
        ``
      );
      ok++;
    } catch (err) {
      console.log(`⚠️  Échec génération : ${err instanceof Error ? err.message : String(err)}\n`);
      mdBlocks.push(
        `## #${i + 1} — ${lead.firstName} ${lead.lastName} — ⚠️ ÉCHEC`.trim(),
        ``,
        `Erreur : ${err instanceof Error ? err.message : String(err)}`,
        ``,
        `---`,
        ``
      );
      fail++;
    }
  }

  writeFileSync(OUTPUT_MD, mdBlocks.join("\n"), "utf8");

  console.log("═".repeat(72));
  console.log(`[preview-m1] Terminé — ${ok} généré(s), ${fail} échec(s). Aucun envoi, aucune écriture DB.`);
  console.log(`[preview-m1] Export Markdown → ${OUTPUT_MD}`);
}

/** Indente un bloc de texte multi-ligne pour l'affichage. */
function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    │ ${l}`)
    .join("\n");
}

main().catch((err) => {
  console.error("[preview-m1] Erreur fatale :", err);
  process.exit(1);
});
