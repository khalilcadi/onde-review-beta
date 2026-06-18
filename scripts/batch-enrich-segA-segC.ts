/**
 * batch-enrich-segA-segC.ts — Batch d'enrichissement demandé (20 leads).
 *
 * 1. Enrichit les 13 presort:A restants + 7 presort:C (les premiers non enrichis),
 *    via enrichSingleLead (Unipile lean + computeSegmentIcp). Délai anti-détection
 *    aléatoire 60–120 s ENTRE chaque profil. 20 visites < plafond 30/j.
 * 2. Enrôle dans la séquence existante "Onde Review — Bêta (seg_A)" les presort:A
 *    fraîchement enrichis QUI CALCULENT segment_icp === "A" (cohérence persona).
 *    Les presort:A qui dérivent (computed ≠ A) sont signalés, PAS enrôlés.
 * 3. seg_C : enrichis SEULEMENT. AUCUN enrôlement (persona agency_creative jamais
 *    tournée en live).
 *
 * GARDE-FOUS : skip leads déjà enrichis ; skip leads déjà enrôlés ; abort si le
 *              budget visites < nb à enrichir ; séquence seg_A doit exister.
 *
 * USAGE :
 *   npx tsx scripts/batch-enrich-segA-segC.ts --dry     # preview sélection, 0 écriture
 *   npx tsx scripts/batch-enrich-segA-segC.ts           # enrichit + enrôle
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY = process.argv.includes("--dry");

const SEQ_NAME = "Onde Review — Bêta (seg_A)";
const SEG_A_COUNT = 13;
const SEG_C_COUNT = 7;
const DAILY_VISIT_CAP = 30;
const DELAY_MIN_MS = 60_000;
const DELAY_MAX_MS = 120_000;

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}
function isEnriched(ed: any): boolean {
  return !!(ed && typeof ed === "object" && "enriched_at" in ed);
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

  console.log(`\n=== batch-enrich-segA-segC (${DRY ? "DRY-RUN" : "EXÉCUTION"}) ===\n`);

  // Owner / compte LinkedIn
  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("user_id, unipile_account_id, status")
    .eq("status", "active");
  if (accErr) throw accErr;
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn actif.");
  if (accounts.length > 1) throw new Error("Plusieurs comptes LinkedIn actifs — ambigu, abort.");
  const userId = accounts[0].user_id;
  console.log(`Owner=${userId} | account=${accounts[0].unipile_account_id}`);

  // Séquence seg_A (doit exister)
  const { data: seqs } = await supabase.from("sequences").select("id, name").eq("name", SEQ_NAME);
  const seq = seqs?.[0];
  if (!seq) throw new Error(`ABORT: séquence "${SEQ_NAME}" introuvable.`);
  console.log(`Séquence seg_A : ${seq.id}`);

  // Enrôlements déjà existants (anti-doublon)
  const { data: existingEnroll } = await supabase
    .from("sequence_leads")
    .select("lead_id")
    .eq("sequence_id", seq.id);
  const alreadyEnrolled = new Set((existingEnroll || []).map((e) => e.lead_id));
  console.log(`Déjà enrôlés dans seg_A : ${alreadyEnrolled.size}`);

  // Tous les leads yann-connections
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const leads = rows || [];

  // Sélection : presort:A restants (13) + presort:C restants (7 premiers)
  const segARemaining = leads.filter((l) => presortSeg(l.enrichment_data) === "A" && !isEnriched(l.enrichment_data));
  const segCRemaining = leads.filter((l) => presortSeg(l.enrichment_data) === "C" && !isEnriched(l.enrichment_data));

  const pickA = segARemaining.slice(0, SEG_A_COUNT);
  const pickC = segCRemaining.slice(0, SEG_C_COUNT);
  const batch = [
    ...pickA.map((l) => ({ lead: l, presort: "A" as const })),
    ...pickC.map((l) => ({ lead: l, presort: "C" as const })),
  ].filter((b) => !!b.lead.linkedin_url);

  console.log(`\nSélection : presort:A=${pickA.length}/${segARemaining.length} restants | presort:C=${pickC.length}/${segCRemaining.length} restants`);
  console.log(`Total à enrichir : ${batch.length}`);

  // Garde-fou budget visites
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: visitsToday } = await supabase
    .from("actions")
    .select("id")
    .eq("action_type", "visit")
    .gte("sent_at", todayStart.toISOString());
  const visitsUsed = visitsToday?.length || 0;
  const budget = DAILY_VISIT_CAP - visitsUsed;
  console.log(`Visites consommées aujourd'hui : ${visitsUsed}/${DAILY_VISIT_CAP} → budget=${budget}`);
  if (batch.length > budget) {
    throw new Error(`ABORT: batch (${batch.length}) > budget visites (${budget}).`);
  }

  if (DRY) {
    console.log("\n— Leads qui seraient enrichis :");
    batch.forEach((b, i) =>
      console.log(`  ${i + 1}. [${b.presort}] ${b.lead.first_name} ${b.lead.last_name} — ${b.lead.title || "?"} @ ${b.lead.company || "?"}`)
    );
    console.log("\nDRY-RUN — aucune écriture. Relancer sans --dry pour exécuter.\n");
    return;
  }

  // === ENRICHISSEMENT ===
  const { enrichSingleLead } = await import("../app/api/ai/enrich/route");

  type Outcome = { id: string; name: string; presort: string; ok: boolean; computed?: string | null; error?: string };
  const outcomes: Outcome[] = [];
  const startTime = Date.now();

  for (let i = 0; i < batch.length; i++) {
    const { lead, presort } = batch[i];
    const name = `${lead.first_name} ${lead.last_name}`;
    const tag = `[${i + 1}/${batch.length}] [${presort}] ${name}`;

    if (i > 0) {
      const d = randomDelayMs();
      console.log(`⏳ pause anti-détection ${Math.round(d / 1000)}s avant ${tag}…`);
      await sleep(d);
    }

    try {
      const leadInput = {
        id: lead.id,
        firstName: lead.first_name || "",
        lastName: lead.last_name || "",
        title: lead.title,
        company: lead.company,
        linkedinUrl: lead.linkedin_url || "",
        score: lead.score,
        status: lead.status,
        stage: lead.stage,
        tags: lead.tags,
        notes: lead.notes,
        enrichmentData: lead.enrichment_data,
      };
      const result = (await enrichSingleLead(leadInput as never, userId, supabase as never)) as Record<string, any>;
      const computed = result?.scoring_detail?.segment_icp ?? null;
      const gotProfile = !!result?.linkedin_profile;
      outcomes.push({ id: lead.id, name, presort, ok: true, computed });
      console.log(`  ✓ ${tag} — presort=${presort} → computed=${computed}${gotProfile ? " | profil✓" : " | profil✗"}`);
    } catch (e) {
      outcomes.push({ id: lead.id, name, presort, ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  ✗ ${tag} : ${e instanceof Error ? e.message : e}`);
    }
  }

  // === ENRÔLEMENT seg_A (computed === "A" uniquement) ===
  const segAEnriched = outcomes.filter((o) => o.presort === "A" && o.ok);
  const toEnroll = segAEnriched.filter((o) => o.computed === "A" && !alreadyEnrolled.has(o.id));
  const segADrift = segAEnriched.filter((o) => o.computed !== "A");

  let enrolledCount = 0;
  if (toEnroll.length) {
    const enrollments = toEnroll.map((o) => ({ sequence_id: seq.id, lead_id: o.id, current_step: 0, status: "active" }));
    const { data: ins, error: enrErr } = await supabase.from("sequence_leads").insert(enrollments).select("id");
    if (enrErr) throw enrErr;
    enrolledCount = ins?.length || 0;
  }

  // === RÉCAP ===
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const okA = outcomes.filter((o) => o.presort === "A" && o.ok).length;
  const okC = outcomes.filter((o) => o.presort === "C" && o.ok).length;
  const failA = outcomes.filter((o) => o.presort === "A" && !o.ok).length;
  const failC = outcomes.filter((o) => o.presort === "C" && !o.ok).length;

  const computedDist: Record<string, number> = {};
  outcomes.filter((o) => o.ok).forEach((o) => {
    const c = o.computed || "?";
    computedDist[c] = (computedDist[c] || 0) + 1;
  });

  console.log("\n" + "═".repeat(72));
  console.log("RÉCAPITULATIF");
  console.log("═".repeat(72));
  console.log(`Durée                         : ${totalDuration}s (${Math.round(totalDuration / 60)}min)`);
  console.log(`Enrichis presort:A            : ${okA} OK${failA ? `, ${failA} échecs` : ""}`);
  console.log(`Enrichis presort:C            : ${okC} OK${failC ? `, ${failC} échecs` : ""}`);
  console.log(`Répartition computed_seg      : ` + Object.entries(computedDist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
  console.log(`Enrôlés dans seg_A (computed=A): ${enrolledCount}`);
  if (segADrift.length) {
    console.log(`⚠️  presort:A NON enrôlés (computed ≠ A, à revoir) : ${segADrift.length}`);
    segADrift.forEach((o) => console.log(`     · ${o.name} → computed=${o.computed}`));
  }
  console.log(`Enrôlements seg_C             : 0 (volontaire — persona jamais en live)`);
  console.log(`Visites profil consommées     : ${okA + okC} (sur budget ${budget})`);

  if (failA + failC > 0) {
    console.log("\nÉchecs :");
    outcomes.filter((o) => !o.ok).forEach((o) => console.log(`  - [${o.presort}] ${o.name} : ${o.error}`));
  }

  // Vérif finale enrôlements
  const { data: finalEnroll } = await supabase.from("sequence_leads").select("id").eq("sequence_id", seq.id);
  console.log(`\nTotal enrôlés dans "${SEQ_NAME}" après run : ${finalEnroll?.length || 0}`);
}

main().catch((e) => {
  console.error("\n[FATAL]", e instanceof Error ? e.stack : e);
  process.exit(1);
});
