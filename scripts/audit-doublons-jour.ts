/**
 * audit-doublons-jour.ts — READ-ONLY.
 *
 * Pour CHAQUE action du jour (created_at OU scheduled_at = aujourd'hui, Europe/Paris)
 * dont le lead a DÉJÀ une action `sent` antérieure (un message déjà envoyé),
 * produit une ligne :
 *   - lead (nom + id), lead.stage
 *   - sequence_leads.current_step
 *   - le step de l'action (label T1 / relance T2 / INVITATION / VISITE …)
 *   - status de l'action, created_at, scheduled_at
 *   - date du message sent antérieur (le plus récent)
 *   - snippet du contenu de la nouvelle action (final_message ?? generated_message)
 *   - CLASSIFICATION : DOUBLON_T1 | RELANCE_T2 | REPONDU | (autre)
 *
 * AUCUNE écriture, AUCUN envoi, AUCUN appel LLM/Unipile.
 * USAGE : npx tsx scripts/audit-doublons-jour.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const TZ = "Europe/Paris";

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function parisDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}
function parisDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
function snippet(s: string | null | undefined, n = 90): string {
  if (!s) return "—";
  const flat = s.replace(/\|\|\|/g, " ⏎ ").replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

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
  created_at: string;
};

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient();
  const today = parisToday();

  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  AUDIT DOUBLONS DU JOUR — lecture seule — ${today} (${TZ})  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);

  // --- profiles (labels owners) -------------------------------------------
  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  const nameOf = new Map((profiles || []).map((p) => [p.id, p.full_name || p.id]));

  // --- toutes les actions (pour reconstituer l'historique sent par lead) ---
  const { data: actRows, error: actErr } = await supabase
    .from("actions")
    .select(
      "id, user_id, lead_id, sequence_id, step_id, action_type, status, generated_message, final_message, scheduled_at, sent_at, created_at"
    )
    .limit(20000);
  if (actErr) {
    console.error("actions read error:", actErr.message);
    process.exit(1);
  }
  const actions = (actRows || []) as ActionRow[];

  // --- steps : map step_id -> {sequence_id, step_order, step_type, label} --
  const { data: stepRows } = await supabase
    .from("sequence_steps")
    .select("id, sequence_id, step_order, step_type");
  const steps = stepRows || [];

  // Label T1/T2/... pour les steps de type message/inmail, par séquence.
  const MSG_TYPES = new Set(["message", "inmail", "whatsapp", "email"]);
  const bySeq = new Map<string, typeof steps>();
  for (const st of steps) {
    if (!bySeq.has(st.sequence_id)) bySeq.set(st.sequence_id, []);
    bySeq.get(st.sequence_id)!.push(st);
  }
  const stepLabel = new Map<string, string>(); // step_id -> "T1" | "INVITATION" | ...
  const stepOrder = new Map<string, number>(); // step_id -> step_order
  const stepIsMsg = new Map<string, boolean>();
  for (const [, list] of bySeq) {
    list.sort((a, b) => a.step_order - b.step_order);
    let tCount = 0;
    for (const st of list) {
      stepOrder.set(st.id, st.step_order);
      const isMsg = MSG_TYPES.has(st.step_type);
      stepIsMsg.set(st.id, isMsg);
      if (isMsg) {
        tCount++;
        stepLabel.set(st.id, `T${tCount}`);
      } else {
        stepLabel.set(st.id, st.step_type.toUpperCase());
      }
    }
  }
  const labelFor = (stepId: string | null) =>
    stepId ? stepLabel.get(stepId) ?? `step:${stepId.slice(0, 6)}` : "—(no step)";

  // --- sequence_leads : map (sequence_id, lead_id) -> current_step ---------
  const { data: seqLeadRows } = await supabase
    .from("sequence_leads")
    .select("sequence_id, lead_id, current_step, status");
  const seqLeadOf = new Map<string, { current_step: number | null; status: string }>();
  for (const r of seqLeadRows || []) {
    seqLeadOf.set(`${r.sequence_id}|${r.lead_id}`, {
      current_step: r.current_step,
      status: r.status,
    });
  }

  // --- leads : map id -> {name, stage, user_id} ---------------------------
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, first_name, last_name, stage, user_id");
  const leadOf = new Map(
    (leadRows || []).map((l) => [
      l.id,
      {
        name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || "(sans nom)",
        stage: l.stage,
        user_id: l.user_id,
      },
    ])
  );

  // --- historique des actions SENT par lead -------------------------------
  const sentByLead = new Map<string, ActionRow[]>();
  for (const a of actions) {
    if (a.status === "sent" && a.lead_id) {
      if (!sentByLead.has(a.lead_id)) sentByLead.set(a.lead_id, []);
      sentByLead.get(a.lead_id)!.push(a);
    }
  }

  // --- actions du jour (created OU scheduled = aujourd'hui) ----------------
  const todayActions = actions.filter(
    (a) => parisDate(a.created_at) === today || parisDate(a.scheduled_at) === today
  );

  // Ne garder que celles dont le lead a une action SENT ANTÉRIEURE.
  type Reported = {
    a: ActionRow;
    priorSent: ActionRow[];
    mostRecentSent: ActionRow;
    classification: string;
  };
  const reported: Reported[] = [];

  for (const a of todayActions) {
    if (!a.lead_id) continue;
    const sents = sentByLead.get(a.lead_id) || [];
    // antérieures : sent_at avant le created_at de la nouvelle action
    const refTime = new Date(a.created_at).getTime();
    const prior = sents.filter((s) => {
      if (s.id === a.id) return false;
      const t = s.sent_at ? new Date(s.sent_at).getTime() : new Date(s.created_at).getTime();
      return t <= refTime;
    });
    if (prior.length === 0) continue;

    prior.sort((x, y) => {
      const tx = new Date(x.sent_at || x.created_at).getTime();
      const ty = new Date(y.sent_at || y.created_at).getTime();
      return ty - tx;
    });
    const mostRecent = prior[0];

    // --- classification ---
    const lead = leadOf.get(a.lead_id);
    let cls: string;

    const newLabel = labelFor(a.step_id);
    const newIsMsg = a.step_id ? stepIsMsg.get(a.step_id) ?? false : false;
    const newOrder = a.step_id ? stepOrder.get(a.step_id) ?? -1 : -1;

    // labels des steps message déjà SENT pour ce lead
    const priorMsgLabels = new Set(
      prior.filter((p) => p.step_id && stepIsMsg.get(p.step_id)).map((p) => labelFor(p.step_id))
    );
    const priorMsgMaxOrder = Math.max(
      -1,
      ...prior
        .filter((p) => p.step_id && stepIsMsg.get(p.step_id))
        .map((p) => stepOrder.get(p.step_id!) ?? -1)
    );

    if (lead?.stage === "responded") {
      cls = "REPONDU";
    } else if (newIsMsg && priorMsgLabels.has(newLabel)) {
      // même step message déjà envoyé -> doublon
      cls = "DOUBLON_T1";
    } else if (newIsMsg && newOrder > priorMsgMaxOrder && priorMsgMaxOrder >= 0) {
      // étape message suivante -> relance légitime
      cls = "RELANCE_T2";
    } else if (newIsMsg && priorMsgMaxOrder < 0) {
      // nouveau message alors qu'aucun message sent (que invitation/visite avant)
      cls = "T1_APRES_NON-MSG";
    } else {
      cls = "AUTRE";
    }

    reported.push({ a, priorSent: prior, mostRecentSent: mostRecent, classification: cls });
  }

  // ============== AFFICHAGE ==============
  console.log(`\nActions du jour (created OU scheduled = ${today}) : ${todayActions.length}`);
  console.log(`Dont le lead a une action SENT antérieure : ${reported.length}\n`);

  if (reported.length === 0) {
    console.log("(aucune action du jour sur un lead déjà contacté)");
    console.log(`\n[audit] DONE — lecture seule, aucune écriture.\n`);
    return;
  }

  // tri : classification puis owner
  const clsOrder = ["DOUBLON_T1", "T1_APRES_NON-MSG", "REPONDU", "RELANCE_T2", "AUTRE"];
  reported.sort(
    (x, y) =>
      clsOrder.indexOf(x.classification) - clsOrder.indexOf(y.classification) ||
      x.a.created_at.localeCompare(y.a.created_at)
  );

  for (const r of reported) {
    const { a } = r;
    const lead = leadOf.get(a.lead_id!);
    const sl = a.sequence_id ? seqLeadOf.get(`${a.sequence_id}|${a.lead_id}`) : undefined;
    const tag =
      r.classification === "DOUBLON_T1" || r.classification === "T1_APRES_NON-MSG"
        ? "🔴"
        : r.classification === "REPONDU"
          ? "🟠"
          : r.classification === "RELANCE_T2"
            ? "🟢"
            : "⚪";

    console.log(`${tag} [${r.classification}]  ${lead?.name}  (lead=${a.lead_id})`);
    console.log(
      `     owner=${nameOf.get(a.user_id)}  stage=${lead?.stage}  ` +
        `seq_leads.current_step=${sl ? sl.current_step : "—"} (sl.status=${sl?.status ?? "—"})`
    );
    console.log(
      `     action: type=${a.action_type}  step=${labelFor(a.step_id)}  ` +
        `status=${a.status}  type_action=${a.action_type}`
    );
    console.log(
      `     created_at=${parisDateTime(a.created_at)}  scheduled_at=${parisDateTime(a.scheduled_at)}`
    );
    console.log(
      `     ⤷ SENT antérieur le plus récent : step=${labelFor(r.mostRecentSent.step_id)}  ` +
        `type=${r.mostRecentSent.action_type}  sent_at=${parisDateTime(r.mostRecentSent.sent_at)}` +
        (r.priorSent.length > 1 ? `   (+${r.priorSent.length - 1} autre(s) sent)` : "")
    );
    console.log(`     ⤷ nouveau contenu : "${snippet(a.final_message ?? a.generated_message)}"`);
    console.log("");
  }

  // ============== TOTAUX PAR CLASSE ==============
  console.log(`━━━━━━━━━━ TOTAUX PAR CLASSE ━━━━━━━━━━`);
  const totals: Record<string, number> = {};
  for (const r of reported) totals[r.classification] = (totals[r.classification] || 0) + 1;
  for (const c of clsOrder) {
    if (totals[c]) console.log(`  ${c.padEnd(20)} : ${totals[c]}`);
  }
  console.log(`  ${"TOTAL".padEnd(20)} : ${reported.length}`);

  console.log(`\n[audit] DONE — lecture seule, aucune écriture, aucun envoi.\n`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
