/**
 * wire-tomorrow-send.ts — Câble l'envoi de demain (état voulu de l'utilisateur).
 *
 *   1. Crée la séquence "Onde Review — Bêta (seg_A)" :
 *        T1 = message, delay 0,  condition if_no_response (gate du T2), mode ai
 *        T2 = message, delay 2j, condition if_no_response (gate du T3), mode ai
 *        T3 = message, delay 5j, condition (aucune),               mode ai
 *      NB moteur (generate-actions) : la condition stockée sur le step N gate le step N+1.
 *      Donc if_no_response sur T1 → gate T2 ; if_no_response sur T2 → gate T3.
 *      T1 lui-même n'est jamais gaté (current_step=0 → pas de step précédent).
 *   2. Enrôle UNIQUEMENT les 12 leads seg_A enrichis (segment_icp === "A" + enriched_at).
 *   3. Pose warmup_start_date = maintenant sur le compte LinkedIn de Yann (rampe → 8 msg J1-2).
 *
 * GARDE-FOUS : abort si seg_A ≠ 12, si un lead n'est pas enrichi, si une séquence
 *              ou des enrôlements existent déjà (anti-doublon).
 *
 * DRY-RUN par défaut. Écrit seulement avec --commit.
 * USAGE : npx tsx scripts/wire-tomorrow-send.ts [--commit]
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const COMMIT = process.argv.includes("--commit");

const SEQ_NAME = "Onde Review — Bêta (seg_A)";
const SEQ_PERSONA = "Studios & créa — connexions 1er degré (seg_A)";

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;
  const supabase = createServiceClient();

  console.log(`\n=== wire-tomorrow-send (${COMMIT ? "COMMIT" : "DRY-RUN"}) ===\n`);

  // --- Owner / compte LinkedIn ---------------------------------------------
  const { data: accounts } = await supabase
    .from("linkedin_accounts")
    .select("id, user_id, unipile_account_id, status, warmup_start_date");
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn.");
  if (accounts.length > 1) throw new Error("Plusieurs comptes LinkedIn — ambigu, abort.");
  const account = accounts[0];
  const userId = account.user_id;
  console.log(`Owner=${userId} | account=${account.unipile_account_id} | status=${account.status} | warmup=${account.warmup_start_date}`);

  // --- 12 leads seg_A enrichis ---------------------------------------------
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, user_id, first_name, last_name, stage, linkedin_url, enrichment_data")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const segA = (rows || []).filter((r) => {
    const ed = r.enrichment_data as LeadForGeneration["enrichmentData"];
    return ed?.scoring_detail?.segment_icp === "A";
  });

  // GARDE-FOUS
  if (segA.length !== 12) throw new Error(`ABORT: seg_A = ${segA.length}, attendu 12.`);
  for (const r of segA) {
    const ed = r.enrichment_data as LeadForGeneration["enrichmentData"];
    if (!(ed && typeof ed === "object" && "enriched_at" in ed)) throw new Error(`ABORT: lead ${r.id} sans enriched_at.`);
    if (r.user_id !== userId) throw new Error(`ABORT: lead ${r.id} owner ≠ compte.`);
    if (!r.linkedin_url) throw new Error(`ABORT: lead ${r.id} sans URL LinkedIn.`);
  }
  console.log(`seg_A OK : ${segA.length} leads enrichis (enriched_at), tous owner=${userId}, tous avec URL.`);

  // Anti-doublon
  const { data: existingSeqs } = await supabase.from("sequences").select("id, name").eq("user_id", userId);
  if (existingSeqs?.length) throw new Error(`ABORT: ${existingSeqs.length} séquence(s) existent déjà.`);
  const { data: existingEnroll } = await supabase.from("sequence_leads").select("id");
  if (existingEnroll?.length) throw new Error(`ABORT: ${existingEnroll.length} enrôlement(s) existent déjà.`);

  console.log("\nPLAN :");
  console.log(`  • Séquence "${SEQ_NAME}" (status=active)`);
  console.log(`      T1 message  delay=0  cond=if_no_response  mode=ai`);
  console.log(`      T2 message  delay=2  cond=if_no_response  mode=ai`);
  console.log(`      T3 message  delay=5  cond=(none)          mode=ai`);
  console.log(`  • Enrôler 12 leads (current_step=0, status=active)`);
  console.log(`  • warmup_start_date := now() sur ${account.unipile_account_id}`);

  if (!COMMIT) {
    console.log("\nDRY-RUN — aucune écriture. Relancer avec --commit pour appliquer.\n");
    return;
  }

  // --- 1. Séquence + steps --------------------------------------------------
  const { data: seq, error: seqErr } = await supabase
    .from("sequences")
    .insert({ user_id: userId, name: SEQ_NAME, persona: SEQ_PERSONA, status: "active" })
    .select("id")
    .single();
  if (seqErr || !seq) throw seqErr || new Error("création séquence échouée");
  console.log(`\n✅ Séquence créée : ${seq.id}`);

  const steps = [
    { sequence_id: seq.id, step_order: 1, step_type: "message", delay_days: 0, condition: JSON.stringify({ type: "if_no_response" }), generation_mode: "ai", template: null },
    { sequence_id: seq.id, step_order: 2, step_type: "message", delay_days: 2, condition: JSON.stringify({ type: "if_no_response" }), generation_mode: "ai", template: null },
    { sequence_id: seq.id, step_order: 3, step_type: "message", delay_days: 5, condition: null, generation_mode: "ai", template: null },
  ];
  const { error: stepsErr } = await supabase.from("sequence_steps").insert(steps);
  if (stepsErr) throw stepsErr;
  console.log(`✅ 3 steps créés (T1/T2/T3)`);

  // --- 2. Enrôlement des 12 -------------------------------------------------
  const enrollments = segA.map((r) => ({ sequence_id: seq.id, lead_id: r.id, current_step: 0, status: "active" }));
  const { data: enrolled, error: enrErr } = await supabase
    .from("sequence_leads")
    .insert(enrollments)
    .select("id");
  if (enrErr) throw enrErr;
  console.log(`✅ ${enrolled?.length} leads enrôlés`);

  // --- 3. Warmup ------------------------------------------------------------
  const nowIso = new Date().toISOString();
  const { error: wErr } = await supabase
    .from("linkedin_accounts")
    .update({ warmup_start_date: nowIso })
    .eq("id", account.id);
  if (wErr) throw wErr;
  console.log(`✅ warmup_start_date := ${nowIso}`);

  // --- Vérification finale --------------------------------------------------
  const { data: vSeqLeads } = await supabase.from("sequence_leads").select("id, status, current_step");
  const { data: vAcct } = await supabase.from("linkedin_accounts").select("warmup_start_date").eq("id", account.id).single();
  console.log(`\n=== VÉRIF FINALE ===`);
  console.log(`sequence_leads: ${vSeqLeads?.length} (tous current_step=0/active: ${vSeqLeads?.every((s) => s.current_step === 0 && s.status === "active")})`);
  console.log(`warmup_start_date: ${vAcct?.warmup_start_date}`);
  console.log("\nDONE.\n");
}

main().catch((e) => { console.error("fatal:", e instanceof Error ? e.message : e); process.exit(1); });
