/**
 * etat-des-lieux-beta.ts — LECTURE SEULE. Aucune écriture/validation/envoi/LLM.
 * État des lieux complet du schéma beta_mission après plusieurs jours de cron.
 * USAGE : npx tsx scripts/etat-des-lieux-beta.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const TZ = "Europe/Paris";
const pDT = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
    : "—";
const pD = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)) : "—";

// Marqueurs "ancien M2 smart.ai jamais transplanté"
const OLD_MARKERS = ["JARVIS", "PROSPECTOR", "NEXUS", "—", "Frame.io"];
function flagsOldM2(text: string | null | undefined): string[] {
  if (!text) return [];
  return OLD_MARKERS.filter((m) => text.includes(m));
}
const snip = (s: string | null | undefined, n = 70) =>
  s ? s.replace(/\|\|\|/g, " ⏎ ").replace(/\s+/g, " ").trim().slice(0, n) : "—";

type ActionRow = {
  id: string;
  user_id: string;
  lead_id: string | null;
  sequence_id: string | null;
  step_id: string | null;
  action_type: string;
  status: string;
  generated_message: string | null;
  final_message: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  validated_at: string | null;
  error_message: string | null;
  created_at: string;
};

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const sb = createServiceClient();

  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ÉTAT DES LIEUX beta_mission — LECTURE SEULE — ${pD(new Date().toISOString())}        ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);

  // ---------- chargement ----------
  const { data: leadRows } = await sb
    .from("leads")
    .select("id, first_name, last_name, stage, status, user_id");
  const leads = leadRows || [];
  const leadOf = new Map(
    leads.map((l) => [
      l.id,
      { name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || "(sans nom)", stage: l.stage, status: l.status },
    ])
  );

  const { data: seqLeadRows } = await sb
    .from("sequence_leads")
    .select("sequence_id, lead_id, current_step, status, entered_at");
  const seqLeads = seqLeadRows || [];

  const { data: stepRows } = await sb
    .from("sequence_steps")
    .select("id, sequence_id, step_order, step_type, delay_days");
  const steps = stepRows || [];

  const { data: actRows, error: actErr } = await sb
    .from("actions")
    .select(
      "id, user_id, lead_id, sequence_id, step_id, action_type, status, generated_message, final_message, scheduled_at, sent_at, validated_at, error_message, created_at"
    )
    .limit(50000);
  if (actErr) {
    console.error("actions read error:", actErr.message);
    process.exit(1);
  }
  const actions = (actRows || []) as ActionRow[];

  const { data: convRows } = await sb
    .from("conversations")
    .select("id, lead_id, channel, status, updated_at, attendee_name");
  const convs = convRows || [];
  const { data: msgRows } = await sb
    .from("messages")
    .select("id, conversation_id, direction, content, timestamp");
  const msgs = msgRows || [];

  // ---------- step labels (T1/T2 par séquence) ----------
  const MSG_TYPES = new Set(["message", "inmail", "whatsapp", "email"]);
  const bySeq = new Map<string, typeof steps>();
  for (const st of steps) {
    if (!bySeq.has(st.sequence_id)) bySeq.set(st.sequence_id, []);
    bySeq.get(st.sequence_id)!.push(st);
  }
  const stepLabel = new Map<string, string>();
  const stepOrder = new Map<string, number>();
  const stepIsMsg = new Map<string, boolean>();
  const stepDelay = new Map<string, number>();
  const stepMsgRank = new Map<string, number>(); // 1 pour T1, 2 pour T2…
  for (const [, list] of bySeq) {
    list.sort((a, b) => a.step_order - b.step_order);
    let tCount = 0;
    for (const st of list) {
      stepOrder.set(st.id, st.step_order);
      stepDelay.set(st.id, st.delay_days ?? 0);
      const isMsg = MSG_TYPES.has(st.step_type);
      stepIsMsg.set(st.id, isMsg);
      if (isMsg) {
        tCount++;
        stepLabel.set(st.id, `T${tCount}`);
        stepMsgRank.set(st.id, tCount);
      } else {
        stepLabel.set(st.id, (st.step_type || "?").toUpperCase());
      }
    }
  }
  const labelFor = (id: string | null) => (id ? stepLabel.get(id) ?? `step:${id.slice(0, 6)}` : "—(no step)");

  // ============================================================
  // 1. LEADS
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 1. LEADS ━━━━━━━━━━━━━━`);
  const stageCount: Record<string, number> = {};
  for (const l of leads) stageCount[l.stage || "(null)"] = (stageCount[l.stage || "(null)"] || 0) + 1;
  console.log(`Total leads : ${leads.length}`);
  console.log(`Par stage :`);
  for (const [s, n] of Object.entries(stageCount).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${s.padEnd(16)} : ${n}`);
  }
  const enrolledLeadIds = new Set(seqLeads.map((s) => s.lead_id));
  console.log(`Leads enrôlés (présents dans sequence_leads) : ${enrolledLeadIds.size}`);
  const slStatusCount: Record<string, number> = {};
  for (const s of seqLeads) slStatusCount[s.status || "(null)"] = (slStatusCount[s.status || "(null)"] || 0) + 1;
  console.log(`   sequence_leads par status : ${JSON.stringify(slStatusCount)}`);

  // ============================================================
  // 2. MESSAGES ENVOYÉS (sent)
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 2. MESSAGES ENVOYÉS (status='sent') ━━━━━━━━━━━━━━`);
  const sent = actions.filter((a) => a.status === "sent");
  console.log(`Actions sent (tous types) : ${sent.length}`);
  // ventilation par label de step
  const sentByLabel: Record<string, number> = {};
  for (const a of sent) sentByLabel[labelFor(a.step_id)] = (sentByLabel[labelFor(a.step_id)] || 0) + 1;
  console.log(`Ventilation par step :`);
  for (const [l, n] of Object.entries(sentByLabel).sort((a, b) => b[1] - a[1])) console.log(`   ${l.padEnd(16)} : ${n}`);

  // leads DISTINCTS contactés (≥1 message sent : step type message/inmail)
  const sentMsg = sent.filter((a) => a.step_id && stepIsMsg.get(a.step_id));
  const distinctMsgLeads = new Set(sentMsg.map((a) => a.lead_id));
  console.log(`\nLeads DISTINCTS avec ≥1 MESSAGE sent : ${distinctMsgLeads.size}`);
  // distinct par rang de message
  const leadsByRank = new Map<number, Set<string>>();
  for (const a of sentMsg) {
    const r = stepMsgRank.get(a.step_id!) ?? 0;
    if (!leadsByRank.has(r)) leadsByRank.set(r, new Set());
    leadsByRank.get(r)!.add(a.lead_id!);
  }
  for (const r of [...leadsByRank.keys()].sort()) {
    console.log(`   leads ayant reçu T${r} : ${leadsByRank.get(r)!.size}`);
  }

  // ============================================================
  // 3. RÉPONSES
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 3. RÉPONSES ━━━━━━━━━━━━━━`);
  const responded = leads.filter((l) => l.stage === "responded");
  console.log(`Leads stage='responded' : ${responded.length}`);
  // messages entrants
  const inbound = msgs.filter((m) => m.direction === "received" || m.direction === "inbound" || m.direction === "in");
  console.log(`Messages entrants loggés (direction in/received) : ${inbound.length}`);
  const convLead = new Map(convs.map((c) => [c.id, c.lead_id]));
  if (inbound.length) {
    console.log(`Liste (lead | date | extrait) :`);
    const sortedIn = [...inbound].sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    for (const m of sortedIn) {
      const lid = convLead.get(m.conversation_id);
      const nm = lid ? leadOf.get(lid)?.name ?? lid : "(conv?)";
      const POS = /\b(oui|interess|interess|ok|d'accord|volontiers|avec plaisir|carr[ée]ment|go|partant|dispo|appel|call|rdv|rendez)/i;
      const tag = POS.test(m.content || "") ? "🟢pos?" : "  ";
      console.log(`   ${tag} ${(nm || "?").padEnd(24)} ${pDT(m.timestamp)}  "${snip(m.content, 60)}"`);
    }
  }
  console.log(`Détail leads responded :`);
  for (const l of responded) console.log(`   • ${leadOf.get(l.id)?.name}  (status=${l.status})`);

  // ============================================================
  // 4. EN ATTENTE D'ENVOI (pending + validated non envoyées)
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 4. EN ATTENTE D'ENVOI ━━━━━━━━━━━━━━`);
  const waiting = actions.filter((a) => a.status === "pending" || a.status === "validated");
  console.log(`Total en attente (pending + validated) : ${waiting.length}`);

  // T1 = premier message OU action non-message d'ouverture (invitation/visite).
  // "relance T2" = step message de rang >=2.
  const isRelance = (a: ActionRow) => a.step_id && stepIsMsg.get(a.step_id) && (stepMsgRank.get(a.step_id) ?? 1) >= 2;
  const isT1opener = (a: ActionRow) => !isRelance(a);

  const t1pending = waiting.filter((a) => a.status === "pending" && isT1opener(a));
  const t2pending = waiting.filter((a) => a.status === "pending" && isRelance(a));
  const t1validated = waiting.filter((a) => a.status === "validated" && isT1opener(a));
  const t2validated = waiting.filter((a) => a.status === "validated" && isRelance(a));

  console.log(`\n  PENDING — T1/openers : ${t1pending.length}`);
  console.log(`  PENDING — relance T2 : ${t2pending.length}`);
  console.log(`  VALIDATED — T1/openers : ${t1validated.length}`);
  console.log(`  VALIDATED — relance T2 : ${t2validated.length}`);

  // ventilation T1 openers par action_type
  const t1byType: Record<string, number> = {};
  for (const a of [...t1pending, ...t1validated]) t1byType[`${a.action_type}/${labelFor(a.step_id)}`] = (t1byType[`${a.action_type}/${labelFor(a.step_id)}`] || 0) + 1;
  console.log(`  (détail openers par type/step : ${JSON.stringify(t1byType)})`);

  console.log(`\n  ── Contrôle ANCIEN_M2 sur les relances en attente (pending+validated) ──`);
  const relancesWaiting = [...t2pending, ...t2validated];
  if (!relancesWaiting.length) {
    console.log(`     (aucune relance T2 en attente)`);
  } else {
    for (const a of relancesWaiting) {
      const content = a.final_message ?? a.generated_message;
      const fl = flagsOldM2(content);
      const tag = fl.length ? `🔴 ANCIEN_M2 [${fl.join(",")}]` : "🟢 ok";
      console.log(
        `     ${tag}  ${(leadOf.get(a.lead_id || "")?.name || "?").padEnd(22)} status=${a.status}  sched=${pDT(a.scheduled_at)}`
      );
      console.log(`        "${snip(content, 90)}"`);
    }
  }

  // ============================================================
  // 5. M2 DÛ
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 5. M2 DÛ (in_sequence, T1 sent, pas de réponse, délai T2 écoulé) ━━━━━━━━━━━━━━`);
  // T2 delay : on prend le delay_days du step rang 2 (par séquence). Fallback 3j.
  const t2DelayBySeq = new Map<string, number>();
  for (const [seq, list] of bySeq) {
    const t2 = list.filter((s) => MSG_TYPES.has(s.step_type)).sort((a, b) => a.step_order - b.step_order)[1];
    if (t2) t2DelayBySeq.set(seq, t2.delay_days ?? 0);
  }
  // map lead -> dernier T1 sent (action message rang 1)
  const now = Date.now();
  const respondedSet = new Set(responded.map((l) => l.id));
  // index relances déjà existantes par lead
  const relanceByLead = new Map<string, ActionRow[]>();
  for (const a of actions) {
    if (isRelance(a) && a.lead_id) {
      if (!relanceByLead.has(a.lead_id)) relanceByLead.set(a.lead_id, []);
      relanceByLead.get(a.lead_id)!.push(a);
    }
  }

  const m2due: { lead: string; leadId: string; t1: string; delay: number; existsRelance: boolean; relanceStatuses: string; oldM2: boolean }[] = [];
  // group T1-sent per lead
  const t1SentByLead = new Map<string, ActionRow[]>();
  for (const a of sentMsg) {
    if ((stepMsgRank.get(a.step_id!) ?? 1) === 1 && a.lead_id) {
      if (!t1SentByLead.has(a.lead_id)) t1SentByLead.set(a.lead_id, []);
      t1SentByLead.get(a.lead_id)!.push(a);
    }
  }
  for (const [lid, list] of t1SentByLead) {
    if (respondedSet.has(lid)) continue; // a répondu -> pas dû
    const lead = leadOf.get(lid);
    if (lead?.stage !== "in_sequence") continue; // critère in_sequence
    // dernier T1 sent
    list.sort((a, b) => (b.sent_at || b.created_at).localeCompare(a.sent_at || a.created_at));
    const t1 = list[0];
    const seqDelay = t1.sequence_id ? t2DelayBySeq.get(t1.sequence_id) ?? 3 : 3;
    const t1Time = new Date(t1.sent_at || t1.created_at).getTime();
    const dueTime = t1Time + seqDelay * 24 * 3600 * 1000;
    if (now < dueTime) continue; // délai pas écoulé
    const relances = relanceByLead.get(lid) || [];
    const pendingRelances = relances.filter((r) => r.status === "pending" || r.status === "validated");
    const anyOld = pendingRelances.some((r) => flagsOldM2(r.final_message ?? r.generated_message).length > 0);
    m2due.push({
      lead: lead?.name || lid,
      leadId: lid,
      t1: pDT(t1.sent_at || t1.created_at),
      delay: seqDelay,
      existsRelance: pendingRelances.length > 0,
      relanceStatuses: pendingRelances.map((r) => r.status).join(",") || "—",
      oldM2: anyOld,
    });
  }
  console.log(`Leads avec M2 DÛ : ${m2due.length}  (délai T2 par séquence, fallback 3j)`);
  for (const d of m2due.sort((a, b) => a.t1.localeCompare(b.t1))) {
    console.log(
      `   • ${d.lead.padEnd(24)} T1 sent=${d.t1}  délaiT2=${d.delay}j  ` +
        `relance_pending=${d.existsRelance ? `OUI(${d.relanceStatuses})` : "non"}  ` +
        `${d.oldM2 ? "🔴ANCIEN_M2" : ""}`
    );
  }

  // ============================================================
  // 6. DIVERS
  // ============================================================
  console.log(`\n━━━━━━━━━━━━━━ 6. DIVERS ━━━━━━━━━━━━━━`);
  const byStatus: Record<string, number> = {};
  for (const a of actions) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  console.log(`Actions par status : ${JSON.stringify(byStatus)}`);
  const failed = actions.filter((a) => a.status === "failed");
  if (failed.length) {
    console.log(`\nFAILED (${failed.length}) :`);
    for (const a of failed) console.log(`   • ${leadOf.get(a.lead_id || "")?.name ?? "?"}  step=${labelFor(a.step_id)}  err="${snip(a.error_message, 60)}"  ${pDT(a.created_at)}`);
  }
  const cancelled = actions.filter((a) => a.status === "cancelled");
  console.log(`\nCANCELLED : ${cancelled.length}`);

  // ============================================================
  // TOTAUX FINAUX NETS
  // ============================================================
  console.log(`\n╔══════════════ TOTAUX FINAUX NETS ══════════════╗`);
  console.log(`  Leads ayant reçu ≥1 message      : ${distinctMsgLeads.size}`);
  console.log(`  Leads ayant répondu (responded)  : ${responded.length}`);
  console.log(`  En attente T1/openers (pending+val): ${t1pending.length + t1validated.length}`);
  console.log(`  En attente relance T2 (pending+val): ${t2pending.length + t2validated.length}`);
  console.log(`  M2 DÛ (relance légitime à produire): ${m2due.length}`);
  console.log(`╚════════════════════════════════════════════════╝`);

  console.log(`\n[état-des-lieux] DONE — lecture seule, aucune écriture, aucun envoi.\n`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
