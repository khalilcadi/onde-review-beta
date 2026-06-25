/**
 * inspect-step4.ts — LECTURE SEULE. Rassemble tout ce qu'il faut pour décider
 * de l'enrôlement des 7 D, l'annulation des 13 T2, et la mise à l'écart des 4 historiques.
 * Aucune écriture.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const D_TOKENS = ["socialclub", "kreads", "ace", "onyx", "indigital", "apikom", "starclick"];
const HISTORY_NAMES = ["lucien batteur", "clément barreau", "clement barreau", "léo roux", "leo roux", "lucie lanoiselee", "lucie lanoiselée"];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const { createServiceClient } = await import("../lib/supabase/service");
  const sb = createServiceClient();

  const { data: seqs } = await sb.from("sequences").select("id, name, status, user_id");
  console.log("=== SEQUENCES ===");
  for (const s of seqs || []) console.log(`  ${s.status === "active" ? "🟢" : "⚪"} ${s.name}  id=${s.id}  status=${s.status}`);

  const activeSeqs = (seqs || []).filter((s) => s.status === "active");
  for (const s of activeSeqs) {
    const { data: steps } = await sb
      .from("sequence_steps")
      .select("id, step_type, step_order, delay_days, generation_mode")
      .eq("sequence_id", s.id)
      .order("step_order", { ascending: true });
    console.log(`  steps de "${s.name}":`);
    for (const st of steps || []) console.log(`     #${st.step_order} ${st.step_type} delay=${st.delay_days}j mode=${st.generation_mode} id=${st.id}`);
  }

  const { data: leads } = await sb
    .from("leads")
    .select("id, first_name, last_name, company, stage, status, tags, enrichment_data, user_id");
  const nameOf = new Map((leads || []).map((l) => [l.id, `${l.first_name || ""} ${l.last_name || ""}`.trim()]));

  const { data: seqLeads } = await sb
    .from("sequence_leads")
    .select("id, sequence_id, lead_id, current_step, status, entered_at");
  const slByLead = new Map((seqLeads || []).map((sl) => [sl.lead_id, sl]));

  // 7 D
  console.log("\n=== 7 D (par token company) ===");
  for (const tok of D_TOKENS) {
    const matches = (leads || []).filter((l) => (l.company || "").toLowerCase().includes(tok));
    if (!matches.length) { console.log(`  [${tok}] ❌ aucun lead`); continue; }
    for (const m of matches) {
      const sl = slByLead.get(m.id);
      const seg = (m.enrichment_data as any)?.presort?.segment ?? (m.enrichment_data as any)?.scoring_detail?.segment_icp ?? "?";
      console.log(`  [${tok}] ${nameOf.get(m.id)} @ ${m.company} | stage=${m.stage} seg=${seg} | enrolled=${sl ? `OUI(${sl.status},step${sl.current_step})` : "non"}`);
    }
  }

  // 4 historiques
  console.log("\n=== 4 HISTORIQUES ===");
  for (const l of leads || []) {
    if (HISTORY_NAMES.includes(norm(nameOf.get(l.id) || ""))) {
      const sl = slByLead.get(l.id);
      console.log(`  ${nameOf.get(l.id)} | stage=${l.stage} | sl=${sl ? `id=${sl.id} status=${sl.status} step=${sl.current_step} seq=${sl.sequence_id}` : "PAS DE sequence_lead"}`);
    }
  }

  // 13 T2 pending
  console.log("\n=== T2 PENDING (relances) ===");
  const { data: pending } = await sb
    .from("actions")
    .select("id, lead_id, sequence_id, step_id, action_type, status, scheduled_at")
    .eq("status", "pending");
  // map step rank
  const { data: allSteps } = await sb.from("sequence_steps").select("id, sequence_id, step_type, step_order");
  const bySeq = new Map<string, any[]>();
  for (const st of allSteps || []) { if (!bySeq.has(st.sequence_id)) bySeq.set(st.sequence_id, []); bySeq.get(st.sequence_id)!.push(st); }
  const msgRank = new Map<string, number>();
  for (const [, list] of bySeq) {
    list.sort((a, b) => a.step_order - b.step_order);
    let r = 0;
    for (const st of list) { if (["message", "inmail"].includes(st.step_type)) { r++; msgRank.set(st.id, r); } }
  }
  const t2 = (pending || []).filter((a) => a.step_id && (msgRank.get(a.step_id) ?? 0) >= 2);
  console.log(`  Total pending=${(pending || []).length}, dont T2(rang≥2)=${t2.length}`);
  for (const a of t2) {
    const sl = slByLead.get(a.lead_id!);
    console.log(`   • ${nameOf.get(a.lead_id!)?.padEnd(26)} action=${a.id} step=${a.step_id?.slice(0,6)} | sl=${sl ? `${sl.status},step${sl.current_step}` : "—"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
