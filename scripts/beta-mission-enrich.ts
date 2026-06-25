/**
 * beta-mission-enrich.ts — Batch d'enrichissement SEUL (aucun enrôlement, aucun envoi).
 *
 * MISSION beta_mission :
 *   1. Enrichit les presort:A SANS enriched_at (jusqu'à 13) + presort:C SANS enriched_at
 *      (jusqu'à 7), via enrichSingleLead (Unipile lean + computeSegmentIcp).
 *      Délai anti-détection aléatoire 60–120 s ENTRE chaque profil.
 *      Plafond visites : 25/j (1 visite profil Unipile par lead enrichi).
 *   2. N'ENRÔLE PERSONNE. Enrichissement seul.
 *   3. Dédoublonne contre les leads DÉJÀ ENRÔLÉS (sequence_leads) : on ne les ré-enrichit pas.
 *
 * ÉCRITURE : enrichment_data (+ score/status dérivés, via le chemin de prod enrichSingleLead).
 *            AUCUN insert sequence_leads, AUCUN envoi LinkedIn.
 *
 * USAGE :
 *   npx tsx scripts/beta-mission-enrich.ts --dry   # preview sélection, 0 écriture
 *   npx tsx scripts/beta-mission-enrich.ts         # enrichit (pas d'enrôlement)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY = process.argv.includes("--dry");

const SEG_A_COUNT = 13;
const SEG_C_COUNT = 7;
const DAILY_VISIT_CAP = 25; // mission : cap 25/j
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

  console.log(`\n=== beta-mission-enrich (${DRY ? "DRY-RUN" : "EXÉCUTION"}) — enrichissement SEUL, aucun enrôlement ===\n`);

  // Owner / compte LinkedIn (un seul compte attendu)
  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("user_id, unipile_account_id, status")
    .eq("status", "active");
  if (accErr) throw accErr;
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn actif.");
  if (accounts.length > 1) throw new Error("Plusieurs comptes LinkedIn actifs — ambigu, abort.");
  const userId = accounts[0].user_id;
  console.log(`Owner=${userId} | account=${accounts[0].unipile_account_id}`);

  // Anti-doublon : tous les leads déjà enrôlés (toutes séquences confondues)
  const { data: existingEnroll } = await supabase.from("sequence_leads").select("lead_id");
  const alreadyEnrolled = new Set((existingEnroll || []).map((e) => e.lead_id));
  console.log(`Leads déjà enrôlés (à exclure du batch) : ${alreadyEnrolled.size}`);

  // Tous les leads yann-connections
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const leads = rows || [];

  // Sélection : presort:A non enrichis (≤13) + presort:C non enrichis (≤7),
  // url présente, NON déjà enrôlés.
  const eligible = (seg: string) =>
    leads.filter(
      (l) =>
        presortSeg(l.enrichment_data) === seg &&
        !isEnriched(l.enrichment_data) &&
        !!l.linkedin_url &&
        !alreadyEnrolled.has(l.id)
    );

  const segARemaining = eligible("A");
  const segCRemaining = eligible("C");
  const pickA = segARemaining.slice(0, SEG_A_COUNT);
  const pickC = segCRemaining.slice(0, SEG_C_COUNT);
  const batch = [
    ...pickA.map((l) => ({ lead: l, presort: "A" as const })),
    ...pickC.map((l) => ({ lead: l, presort: "C" as const })),
  ];

  console.log(`\nSélection : presort:A=${pickA.length}/${segARemaining.length} éligibles | presort:C=${pickC.length}/${segCRemaining.length} éligibles`);
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

  // === ENRICHISSEMENT (aucun enrôlement) ===
  const { enrichSingleLead } = await import("../app/api/ai/enrich/route");

  type Outcome = { id: string; name: string; presort: string; company: string; ok: boolean; computed?: string | null; profile?: boolean; error?: string };
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
      outcomes.push({ id: lead.id, name, presort, company: lead.company || "?", ok: true, computed, profile: gotProfile });
      console.log(`  ✓ ${tag} — presort=${presort} → computed=${computed}${gotProfile ? " | profil✓" : " | profil✗"}`);
    } catch (e) {
      outcomes.push({ id: lead.id, name, presort, company: lead.company || "?", ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  ✗ ${tag} : ${e instanceof Error ? e.message : e}`);
    }
  }

  // === RÉCAP ===
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const okA = outcomes.filter((o) => o.presort === "A" && o.ok).length;
  const okC = outcomes.filter((o) => o.presort === "C" && o.ok).length;
  const failA = outcomes.filter((o) => o.presort === "A" && !o.ok).length;
  const failC = outcomes.filter((o) => o.presort === "C" && !o.ok).length;

  const distA: Record<string, number> = {};
  const distC: Record<string, number> = {};
  outcomes.filter((o) => o.ok).forEach((o) => {
    const c = o.computed || "?";
    if (o.presort === "A") distA[c] = (distA[c] || 0) + 1;
    else distC[c] = (distC[c] || 0) + 1;
  });
  const fmt = (d: Record<string, number>) =>
    Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  ") || "—";

  console.log("\n" + "═".repeat(72));
  console.log("RÉCAPITULATIF — enrichissement seul");
  console.log("═".repeat(72));
  console.log(`Durée                         : ${totalDuration}s (${Math.round(totalDuration / 60)}min)`);
  console.log(`Enrichis presort:A            : ${okA} OK${failA ? `, ${failA} échecs` : ""}`);
  console.log(`Enrichis presort:C            : ${okC} OK${failC ? `, ${failC} échecs` : ""}`);
  console.log(`presort:A → computed_seg      : ${fmt(distA)}`);
  console.log(`presort:C → computed_seg      : ${fmt(distC)}`);
  console.log(`Enrôlements                   : 0 (volontaire — enrichissement seul)`);
  console.log(`Visites profil consommées     : ${okA + okC} (sur budget ${budget})`);

  // Surprises HORS_ICP / drift
  const segADrift = outcomes.filter((o) => o.presort === "A" && o.ok && o.computed !== "A");
  const segCDrift = outcomes.filter((o) => o.presort === "C" && o.ok && o.computed !== "C");
  if (segADrift.length) {
    console.log(`\n⚠️  presort:A NE confirme PAS A : ${segADrift.length}`);
    segADrift.forEach((o) => console.log(`     · ${o.name} (@ ${o.company}) → computed=${o.computed}`));
  }
  if (segCDrift.length) {
    console.log(`\n⚠️  presort:C NE confirme PAS C : ${segCDrift.length}`);
    segCDrift.forEach((o) => console.log(`     · ${o.name} (@ ${o.company}) → computed=${o.computed}`));
  }

  if (failA + failC > 0) {
    console.log("\nÉchecs :");
    outcomes.filter((o) => !o.ok).forEach((o) => console.log(`  - [${o.presort}] ${o.name} : ${o.error}`));
  }
}

main().catch((e) => {
  console.error("\n[FATAL]", e instanceof Error ? e.stack : e);
  process.exit(1);
});
