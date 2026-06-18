/**
 * resume-batch-segA-segC.ts — Reprise du batch interrompu (laptop fermé).
 *
 * État au moment de la reprise :
 *   - presort:A : 13 restants déjà enrichis (0 restant). Rien à enrichir côté A.
 *   - presort:C : 4/7 d'origine enrichis ; il reste 3 des 7 D'ORIGINE à finir :
 *       Léo Blanc, Aurore Laurin, Emeline Loas.
 *     ⚠️ On NE touche PAS les autres presort:C (hors lot de 7 demandé).
 *   - Enrôlement seg_A : jamais exécuté (toujours 12).
 *
 * 1. Enrichit UNIQUEMENT les 3 seg_C restants du lot d'origine (anti-détection 60–120s).
 * 2. Enrôle dans "Onde Review — Bêta (seg_A)" tous les presort:A computed=A pas
 *    encore enrôlés (cohérence persona). Drift (computed ≠ A) signalé, pas enrôlé.
 * 3. seg_C : aucun enrôlement.
 *
 * USAGE :
 *   npx tsx scripts/resume-batch-segA-segC.ts --dry
 *   npx tsx scripts/resume-batch-segA-segC.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY = process.argv.includes("--dry");

const SEQ_NAME = "Onde Review — Bêta (seg_A)";
const DAILY_VISIT_CAP = 30;
const DELAY_MIN_MS = 60_000;
const DELAY_MAX_MS = 120_000;

/** Les 3 seg_C restants DU LOT D'ORIGINE (par nom complet, presort:C non enrichis). */
const SEG_C_REMAINING_ORIGINAL = ["Léo Blanc", "Aurore Laurin", "Emeline Loas"];

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}
function isEnriched(ed: any): boolean {
  return !!(ed && typeof ed === "object" && "enriched_at" in ed);
}
function computedSeg(ed: any): string | null {
  return ed?.scoring_detail?.segment_icp ?? null;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelayMs() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UNIPILE_API_KEY", "UNIPILE_DSN"]) {
    if (!process.env[k]) {
      console.error(`❌ Variable d'environnement manquante : ${k}`);
      process.exit(1);
    }
  }

  const { createServiceClient } = await import("../lib/supabase/service");
  const supabase = createServiceClient();

  console.log(`\n=== resume-batch-segA-segC (${DRY ? "DRY-RUN" : "EXÉCUTION"}) ===\n`);

  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("user_id, unipile_account_id, status")
    .eq("status", "active");
  if (accErr) throw accErr;
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn actif.");
  if (accounts.length > 1) throw new Error("Plusieurs comptes actifs — abort.");
  const userId = accounts[0].user_id;
  console.log(`Owner=${userId} | account=${accounts[0].unipile_account_id}`);

  const { data: seqs } = await supabase.from("sequences").select("id, name").eq("name", SEQ_NAME);
  const seq = seqs?.[0];
  if (!seq) throw new Error(`ABORT: séquence "${SEQ_NAME}" introuvable.`);

  const { data: existingEnroll } = await supabase
    .from("sequence_leads")
    .select("lead_id")
    .eq("sequence_id", seq.id);
  const alreadyEnrolled = new Set((existingEnroll || []).map((e) => e.lead_id));
  console.log(`Séquence seg_A : ${seq.id} | déjà enrôlés : ${alreadyEnrolled.size}`);

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const leads = rows || [];

  // --- Sélection des 3 seg_C restants du lot d'origine -----------------------
  const wantedNames = new Set(SEG_C_REMAINING_ORIGINAL.map((n) => n.toLowerCase()));
  const toEnrich = leads.filter((l) => {
    const full = `${l.first_name} ${l.last_name}`.trim().toLowerCase();
    return presortSeg(l.enrichment_data) === "C" && !isEnriched(l.enrichment_data) && wantedNames.has(full);
  });

  console.log(`\nseg_C restants du lot d'origine à enrichir : ${toEnrich.length}/${SEG_C_REMAINING_ORIGINAL.length}`);
  toEnrich.forEach((l) => console.log(`   · ${l.first_name} ${l.last_name} @ ${l.company || "?"}`));
  if (toEnrich.length !== SEG_C_REMAINING_ORIGINAL.length) {
    console.warn(`⚠️  Attendu ${SEG_C_REMAINING_ORIGINAL.length}, trouvé ${toEnrich.length} (certains déjà enrichis ?).`);
  }

  // Budget visites
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: visitsToday } = await supabase
    .from("actions").select("id").eq("action_type", "visit").gte("sent_at", todayStart.toISOString());
  const budget = DAILY_VISIT_CAP - (visitsToday?.length || 0);
  console.log(`Budget visites : ${budget}/${DAILY_VISIT_CAP}`);
  if (toEnrich.length > budget) throw new Error(`ABORT: ${toEnrich.length} > budget ${budget}.`);

  // --- Aperçu enrôlement seg_A ----------------------------------------------
  const segAComputedA = leads.filter(
    (l) => presortSeg(l.enrichment_data) === "A" && computedSeg(l.enrichment_data) === "A"
  );
  const segADrift = leads.filter(
    (l) => presortSeg(l.enrichment_data) === "A" && isEnriched(l.enrichment_data) && computedSeg(l.enrichment_data) !== "A"
  );
  const enrollCandidates = segAComputedA.filter((l) => !alreadyEnrolled.has(l.id));
  console.log(`\nEnrôlement seg_A : computed=A total=${segAComputedA.length} | déjà enrôlés=${alreadyEnrolled.size} | à enrôler=${enrollCandidates.length}`);
  enrollCandidates.forEach((l) => console.log(`   + ${l.first_name} ${l.last_name}`));
  if (segADrift.length) {
    console.log(`⚠️  presort:A drift (NON enrôlés) : ${segADrift.length}`);
    segADrift.forEach((l) => console.log(`     · ${l.first_name} ${l.last_name} → computed=${computedSeg(l.enrichment_data)}`));
  }

  if (DRY) {
    console.log("\nDRY-RUN — aucune écriture.\n");
    return;
  }

  // --- ENRICHISSEMENT --------------------------------------------------------
  const { enrichSingleLead } = await import("../app/api/ai/enrich/route");
  type Outcome = { name: string; ok: boolean; computed?: string | null; error?: string };
  const outcomes: Outcome[] = [];

  for (let i = 0; i < toEnrich.length; i++) {
    const l = toEnrich[i];
    const name = `${l.first_name} ${l.last_name}`;
    const tag = `[${i + 1}/${toEnrich.length}] [C] ${name}`;
    if (i > 0) {
      const d = randomDelayMs();
      console.log(`⏳ pause anti-détection ${Math.round(d / 1000)}s avant ${tag}…`);
      await sleep(d);
    }
    try {
      const leadInput = {
        id: l.id, firstName: l.first_name || "", lastName: l.last_name || "",
        title: l.title, company: l.company, linkedinUrl: l.linkedin_url || "",
        score: l.score, status: l.status, stage: l.stage, tags: l.tags, notes: l.notes,
        enrichmentData: l.enrichment_data,
      };
      const result = (await enrichSingleLead(leadInput as never, userId, supabase as never)) as Record<string, any>;
      const computed = result?.scoring_detail?.segment_icp ?? null;
      outcomes.push({ name, ok: true, computed });
      console.log(`  ✓ ${tag} → computed=${computed}`);
    } catch (e) {
      outcomes.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  ✗ ${tag} : ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- ENRÔLEMENT seg_A (computed=A, pas déjà enrôlés) -----------------------
  let enrolledCount = 0;
  if (enrollCandidates.length) {
    const enrollments = enrollCandidates.map((l) => ({ sequence_id: seq.id, lead_id: l.id, current_step: 0, status: "active" }));
    const { data: ins, error: enrErr } = await supabase.from("sequence_leads").insert(enrollments).select("id");
    if (enrErr) throw enrErr;
    enrolledCount = ins?.length || 0;
  }

  // --- RÉCAP -----------------------------------------------------------------
  const okC = outcomes.filter((o) => o.ok).length;
  const failC = outcomes.filter((o) => !o.ok);
  console.log("\n" + "═".repeat(72));
  console.log("RÉCAPITULATIF (reprise)");
  console.log("═".repeat(72));
  console.log(`seg_C enrichis (reprise)      : ${okC}/${toEnrich.length}` + (failC.length ? ` (${failC.length} échecs)` : ""));
  outcomes.filter((o) => o.ok).forEach((o) => console.log(`   · ${o.name} → ${o.computed}`));
  console.log(`Enrôlés dans seg_A (computed=A): ${enrolledCount}`);
  if (failC.length) {
    console.log("Échecs :");
    failC.forEach((o) => console.log(`   - ${o.name} : ${o.error}`));
  }

  const { data: finalEnroll } = await supabase.from("sequence_leads").select("id").eq("sequence_id", seq.id);
  console.log(`\nTotal enrôlés "${SEQ_NAME}" : ${finalEnroll?.length || 0}`);
}

main().catch((e) => {
  console.error("\n[FATAL]", e instanceof Error ? e.stack : e);
  process.exit(1);
});
