/**
 * step4-enroll-cancel.ts — beta_mission step 4.
 *
 *   A. ENRÔLE les 7 D (lean) dans la séquence active "Onde Review — Bêta (seg_A)".
 *      Lean = stamp enrichment_data.enriched_at (+ lean_enrollment:true) pour que le
 *      cron NE ré-enrichisse PAS (pas de visite Unipile / Perplexity) → M1 généré
 *      depuis le contexte CSV seul (= preview-m1-v11-7d validée).
 *      Insert sequence_leads(current_step=0, status='active', entered_at=now).
 *   B. ANNULE les 13 T2 périmés (status pending, step c2d30e) → cancelled, pour
 *      régénération en copie neuve (V6.0 / T2 léger) au prochain run du cron.
 *   C. NE touche PAS les 4 historiques (Lucien/Clément/Léo/Lucie) — déjà
 *      sequence_leads.status='completed', donc hors du champ du cron. → manuel.
 *
 * Garde dure : exactement 7 D (companies attendues) + exactement 13 T2 sur le step T2.
 * Sinon STOP, aucune écriture. JAMAIS de hard delete. Aucun envoi.
 *
 * USAGE :
 *   npx tsx scripts/step4-enroll-cancel.ts            # DRY (défaut)
 *   DRY_RUN=0 npx tsx scripts/step4-enroll-cancel.ts  # exécute
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY_RUN = process.env.DRY_RUN !== "0";
const ACTIVE_SEQ_ID = "4459b07b-b23a-4ce6-b289-2cdf4330a20f"; // Onde Review — Bêta (seg_A)
const T2_STEP_ID = "c2d30ec5-43e7-4ab9-9b29-04305ad89122";     // step #2 (T2, delay 2j)
const CANCEL_REASON = "regen copie neuve — V6.0 / T2 léger (25/06)";

// token → sous-chaîne company ATTENDUE (garde anti-faux-match, ex. "wallace"⊃"ace")
const D_TARGETS: Array<[string, string]> = [
  ["socialclub", "socialclub"],
  ["kreads", "kreads"],
  ["ace", "ace agency"],
  ["onyx", "onyx"],
  ["indigital", "indigital"],
  ["apikom", "apikom"],
  ["starclick", "starclick"],
];

async function main() {
  const { createServiceClient } = await import("../lib/supabase/service");
  const sb = createServiceClient();

  console.log(`\n=== STEP 4 — ${DRY_RUN ? "DRY (aucune écriture)" : "EXÉCUTION RÉELLE"} ===\n`);

  // Owner
  const { data: accounts } = await sb.from("linkedin_accounts").select("user_id").eq("status", "active");
  const userId = accounts?.[0]?.user_id;
  if (!userId) { console.error("❌ pas de compte actif"); process.exit(1); }

  // --- A. Sélection des 7 D (tag yann-connections, 1er par token en created_at asc) ---
  const { data: rows } = await sb
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  const leads = rows || [];

  const picks: Array<{ tok: string; row: (typeof leads)[number] }> = [];
  for (const [tok, expectCo] of D_TARGETS) {
    const row = leads.find((l) => (l.company || "").toLowerCase().includes(tok));
    if (!row) { console.error(`❌ token "${tok}" introuvable`); process.exit(2); }
    if (!(row.company || "").toLowerCase().includes(expectCo)) {
      console.error(`❌ token "${tok}" → "${row.company}" ne matche pas l'attendu "${expectCo}". STOP.`);
      process.exit(2);
    }
    picks.push({ tok, row });
  }

  // Garde : 7 distincts, tous avec URL
  const ids = new Set(picks.map((p) => p.row.id));
  if (ids.size !== 7) { console.error(`❌ ${ids.size} D distincts (attendu 7). STOP.`); process.exit(2); }

  // Anti-doublon enrôlement
  const { data: already } = await sb.from("sequence_leads").select("lead_id").in("lead_id", [...ids]);
  if ((already || []).length) {
    console.error(`❌ ${already!.length} déjà enrôlé(s). STOP.`); process.exit(2);
  }

  console.log("A. 7 D à enrôler (lean) :");
  for (const p of picks) {
    const ed: any = p.row.enrichment_data || {};
    console.log(`   • ${p.row.first_name} ${p.row.last_name} @ ${p.row.company} | url=${p.row.linkedin_url ? "✓" : "✗"} | enriched_at=${ed.enriched_at ? "déjà" : "non→lean"}`);
    if (!p.row.linkedin_url) { console.error("   ❌ URL manquante. STOP."); process.exit(2); }
  }

  // --- B. Sélection des 13 T2 pending sur le step T2 ---
  const { data: t2pending } = await sb
    .from("actions")
    .select("id, lead_id, status, step_id, created_at")
    .eq("status", "pending")
    .eq("step_id", T2_STEP_ID);
  const t2 = t2pending || [];
  const nameOf = new Map(leads.map((l) => [l.id, `${l.first_name || ""} ${l.last_name || ""}`.trim()]));
  console.log(`\nB. T2 pending à annuler (step ${T2_STEP_ID.slice(0, 6)}) : ${t2.length}`);
  if (t2.length !== 13) {
    console.error(`❌ ${t2.length} T2 pending (attendu 13). STOP, rien annulé.`); process.exit(2);
  }

  if (DRY_RUN) {
    console.log("\n[DRY] Gardes franchies (7 D + 13 T2). Aucune écriture. Relancer avec DRY_RUN=0.\n");
    return;
  }

  // ===== EXÉCUTION =====
  const nowIso = new Date().toISOString();

  // A1. Stamp lean marker + A2. insert sequence_leads
  for (const p of picks) {
    const ed = (p.row.enrichment_data || {}) as Record<string, unknown>;
    const merged = { ...ed, enriched_at: ed.enriched_at ?? nowIso, lean_enrollment: true };
    const { error: edErr } = await sb.from("leads").update({ enrichment_data: merged as never }).eq("id", p.row.id);
    if (edErr) { console.error(`❌ stamp lean ${p.row.id}:`, edErr.message); process.exit(1); }
  }
  const slRows = picks.map((p) => ({
    sequence_id: ACTIVE_SEQ_ID,
    lead_id: p.row.id,
    current_step: 0,
    status: "active",
    entered_at: nowIso,
  }));
  const { data: insSL, error: slErr } = await sb.from("sequence_leads").insert(slRows as never).select("id");
  if (slErr) { console.error("❌ insert sequence_leads:", slErr.message); process.exit(1); }
  console.log(`\n✅ A. ${insSL?.length ?? 0} sequence_leads insérés (lean, current_step=0, active).`);

  // B. cancel 13 T2
  const t2ids = t2.map((a) => a.id);
  const { data: cancelled, error: cErr } = await sb
    .from("actions")
    .update({ status: "cancelled", error_message: CANCEL_REASON })
    .in("id", t2ids)
    .eq("status", "pending")
    .select("id, lead_id");
  if (cErr) { console.error("❌ cancel T2:", cErr.message); process.exit(1); }
  console.log(`✅ B. ${cancelled?.length ?? 0} T2 annulés (→ cancelled, régénération copie neuve).`);
  for (const a of cancelled || []) console.log(`     • ${nameOf.get(a.lead_id!) || a.lead_id}`);

  console.log(`\n✅ C. 4 historiques non touchés (sequence_leads.status='completed' = hors cron). Manuel.`);
  console.log(`\n[DONE] enrôlés=${insSL?.length}, T2 annulés=${cancelled?.length}, 0 supprimé.\n`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
