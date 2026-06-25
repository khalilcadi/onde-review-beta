/**
 * preview-m1-segD-lean.ts — LECTURE + LLM DRY uniquement. AUCUN envoi, AUCUNE
 * écriture DB, AUCUN enrôlement.
 *
 * 1. Confirme les plafonds EFFECTIFS (loadUserSchedulingSettings) du compte Yann.
 * 2. Sélectionne 8 leads presort:D NON enrôlés (absents de sequence_leads).
 * 3. DRY-preview M1 en MODE LEAN sur 3 d'entre eux : contexte = CSV seul
 *    (firstName / company / jobTitle), enrichmentData forcé à null → PAS de visite,
 *    PAS d'enrichissement. Chemin de génération = prod (buildLeadContext +
 *    buildUserPrompt + callAI → Claude), exactement comme generate-actions en M1.
 *
 * USAGE : npx tsx scripts/preview-m1-segD-lean.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const N_PREVIEW = 3;
const N_SELECT = 8;
const M1_ACTION_TYPE = "message";

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}

function pickVariedByCompany<T extends { company?: string | null }>(leads: T[], n: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const l of leads) {
    if (out.length >= n) break;
    const co = (l.company || "").trim().toLowerCase();
    if (co && seen.has(co)) continue;
    if (co) seen.add(co);
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
  const { loadUserSchedulingSettings } = await import("@/lib/scheduling");
  const { buildLeadContext, buildUserPrompt, parseGenerationResponse, sanitizeMessage } = await import(
    "@/lib/ai/lead-context"
  );
  const { humanizeMessage, applyAntiBloc } = await import("@/lib/humanize");
  const { callAI } = await import("@/lib/ai/service");

  const finishMsg = (raw: string) => applyAntiBloc(humanizeMessage(sanitizeMessage(raw), M1_ACTION_TYPE));
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();

  // --- compte actif (Yann) ---
  const { data: accounts } = await supabase
    .from("linkedin_accounts")
    .select("user_id, unipile_account_id, status")
    .eq("status", "active");
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn actif.");
  const userId = accounts[0].user_id;

  const eff = await loadUserSchedulingSettings(supabase as never, userId);
  console.log("\n=== PLAFONDS EFFECTIFS (loadUserSchedulingSettings) ===");
  console.log(`  invitations/jour : ${eff.dailyInvitationsLimit}`);
  console.log(`  messages/jour    : ${eff.dailyMessagesLimit}`);
  console.log(`  visites/jour     : ${eff.dailyVisitsLimit}`);

  // --- anti-doublon : leads déjà enrôlés ---
  const { data: enroll } = await supabase.from("sequence_leads").select("lead_id");
  const enrolled = new Set((enroll || []).map((e) => e.lead_id));

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, user_id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  const segD = (rows || []).filter((r) => presortSeg(r.enrichment_data) === "D" && !enrolled.has(r.id));
  const pick8 = segD.slice(0, N_SELECT);

  console.log(`\n=== SÉLECTION presort:D NON enrôlés ===`);
  console.log(`  presort:D non enrôlés disponibles : ${segD.length}`);
  console.log(`  sélectionnés (max ${N_SELECT}) : ${pick8.length}`);
  pick8.forEach((l, i) =>
    console.log(`   ${i + 1}. ${l.first_name} ${l.last_name} — ${l.title || "?"} @ ${l.company || "?"}`)
  );

  const previewLeads = pickVariedByCompany(pick8, N_PREVIEW);
  console.log(`\n=== DRY-PREVIEW M1 LEAN (3 messages, contexte CSV seul, PAS de visite) ===`);

  for (let i = 0; i < previewLeads.length; i++) {
    const row = previewLeads[i];
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
    console.log(`#${i + 1}  ${lead.firstName} ${lead.lastName}`.trim() + `  ·  ${lead.title || "—"}  ·  ${lead.company || "—"}`);
    console.log("─".repeat(72));

    const sequenceStepObj = { current: 1, total: 1, previousMessages: [] as string[] };
    const runtimeContext = buildLeadContext(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj);
    const userPrompt = buildUserPrompt(lead, M1_ACTION_TYPE, undefined, undefined, sequenceStepObj, { withReasoning: true });

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
        metadata: { leadId: lead.id, preview: "preview-m1-segD-lean" },
      });

      const parsed = parseGenerationResponse(aiResult.text, true);
      if (!parsed.m1) {
        console.log("⚠️  Réponse non-M1 ou non parsable :\n", aiResult.text, "\n");
        continue;
      }
      const m1 = parsed.m1;
      m1.variante_a.message = finishMsg(m1.variante_a.message);
      m1.variante_b.message = finishMsg(m1.variante_b.message);
      const wc = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;
      console.log(`\n  persona déduit : ${m1.persona || "—"}  ·  canal : ${m1.canal}`);
      console.log(`\n  ▸ Variante A — ${m1.variante_a.angle || "—"} (${wc(m1.variante_a.message)} mots)`);
      console.log(indent(m1.variante_a.message || "(vide)"));
      console.log(`\n  ▸ Variante B — ${m1.variante_b.angle || "—"} (${wc(m1.variante_b.message)} mots)`);
      console.log(indent(m1.variante_b.message || "(vide)"));
      console.log(`\n  reasoning : ${m1.reasoning || "—"}`);
    } catch (err) {
      console.log(`⚠️  Échec génération : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n" + "═".repeat(72));
  console.log("[preview-m1-segD-lean] Terminé — aucun envoi, aucune écriture, aucun enrôlement.");
}

function indent(text: string): string {
  return text.split("\n").map((l) => `    │ ${l}`).join("\n");
}

main().catch((err) => {
  console.error("[preview-m1-segD-lean] Erreur fatale :", err);
  process.exit(1);
});
