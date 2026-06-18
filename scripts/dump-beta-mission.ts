/**
 * dump-beta-mission.ts — READ-ONLY snapshot of the beta_mission schema.
 *
 * Aucune écriture DB, aucun envoi, aucun appel LLM/Unipile.
 * Tout est en lecture seule (createServiceClient → schema beta_mission).
 *
 * USAGE : npx tsx scripts/dump-beta-mission.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const TZ = "Europe/Paris";

/** Tableau aligné à partir d'un dict {clé: nombre}. */
function table(rows: Array<[string, string | number]>, h1 = "", h2 = "") {
  const left = Math.max(h1.length, ...rows.map((r) => String(r[0]).length), 1);
  const head = h1 ? `  ${h1.padEnd(left)}  ${h2}\n  ${"─".repeat(left)}  ${"─".repeat(Math.max(h2.length, 5))}` : "";
  if (head) console.log(head);
  for (const [k, v] of rows) console.log(`  ${String(k).padEnd(left)}  ${v}`);
}

/** Date "YYYY-MM-DD" du jour en Europe/Paris. */
function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** "YYYY-MM-DD" en Europe/Paris pour un timestamp ISO. */
function parisDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function inc(d: Record<string, number>, k: string) {
  d[k] = (d[k] || 0) + 1;
}

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { loadUserSchedulingSettings } = await import("@/lib/scheduling");
  type LeadForGeneration = import("@/lib/ai/lead-context").LeadForGeneration;

  const supabase = createServiceClient();
  const today = parisToday();

  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  DUMP beta_mission — lecture seule — ${today} (${TZ})        ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);

  // --- PROFILES (pour labelliser les owners) -------------------------------
  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  const nameOf = new Map((profiles || []).map((p) => [p.id, p.full_name || p.id]));

  // ================= 1. LEADS =================
  console.log(`\n━━━━━━━━━━ 1. LEADS ━━━━━━━━━━`);
  const { data: leadRows, error: leadErr } = await supabase
    .from("leads")
    .select("id, user_id, stage, enrichment_data");
  if (leadErr) {
    console.error("leads read error:", leadErr.message);
    process.exit(1);
  }
  const leads = leadRows || [];
  console.log(`\nTotal leads : ${leads.length}`);

  const byPresort: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  let enriched = 0;
  const byIcp: Record<string, number> = {};

  for (const r of leads) {
    const ed = (r.enrichment_data as Record<string, unknown> | null) ?? {};
    const presort = (ed?.presort as Record<string, unknown> | undefined)?.segment;
    inc(byPresort, presort ? String(presort) : "(none)");

    inc(byStage, r.stage || "(none)");

    const icp = (ed as LeadForGeneration["enrichmentData"])?.scoring_detail?.segment_icp;
    if (icp) {
      enriched++;
      inc(byIcp, String(icp));
    }
  }

  console.log(`\nPar presort (enrichment_data.presort.segment) :`);
  table(Object.entries(byPresort).sort());
  console.log(`\nEnrichis (scoring_detail.segment_icp présent) : ${enriched}`);
  table(Object.entries(byIcp).sort());
  console.log(`\nPar stage :`);
  table(Object.entries(byStage).sort());

  // ================= 2. SEQUENCE_LEADS =================
  console.log(`\n━━━━━━━━━━ 2. SEQUENCE_LEADS ━━━━━━━━━━`);
  const { data: seqLeads } = await supabase
    .from("sequence_leads")
    .select("id, sequence_id, status, current_step");
  const sl = seqLeads || [];
  console.log(`\nEnrôlés (total) : ${sl.length}`);
  const slByStatus: Record<string, number> = {};
  const slByStep: Record<string, number> = {};
  for (const r of sl) {
    inc(slByStatus, r.status || "(none)");
    inc(slByStep, String(r.current_step ?? "(none)"));
  }
  console.log(`\nPar status :`);
  table(Object.entries(slByStatus).sort());
  console.log(`\nPar current_step :`);
  table(Object.entries(slByStep).sort());

  // ================= 3. ACTIONS =================
  console.log(`\n━━━━━━━━━━ 3. ACTIONS ━━━━━━━━━━`);
  const { data: actRows } = await supabase
    .from("actions")
    .select("id, status, action_type, scheduled_at, created_at")
    .limit(5000);
  const acts = actRows || [];
  console.log(`\nTotal actions : ${acts.length}`);

  const order = ["pending", "validated", "processing", "sent", "failed", "cancelled"];
  const byStatus: Record<string, number> = {};
  for (const a of acts) inc(byStatus, a.status || "(none)");
  const statusRows: Array<[string, number]> = order.map((s) => [s, byStatus[s] || 0]);
  // toute valeur de status hors liste connue
  for (const [s, n] of Object.entries(byStatus)) {
    if (!order.includes(s)) statusRows.push([s, n]);
  }
  console.log(`\nPar status :`);
  table(statusRows);

  const schedToday = acts.filter((a) => parisDate(a.scheduled_at) === today);
  const createdToday = acts.filter((a) => parisDate(a.created_at) === today);
  console.log(`\nAujourd'hui (${today}) :`);
  const todayByStatus: Record<string, number> = {};
  for (const a of schedToday) inc(todayByStatus, a.status || "(none)");
  console.log(`  scheduled_at = aujourd'hui : ${schedToday.length}`);
  if (schedToday.length) table(Object.entries(todayByStatus).sort());
  console.log(`  created_at   = aujourd'hui : ${createdToday.length}`);

  // ================= 4. SEQUENCES + STEPS =================
  console.log(`\n━━━━━━━━━━ 4. SEQUENCES ACTIVES + STEPS ━━━━━━━━━━`);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("id, user_id, name, persona, status")
    .eq("status", "active");
  for (const s of seqs || []) {
    console.log(`\n▸ "${s.name}"  [${s.status}]  owner=${nameOf.get(s.user_id)}  persona=${s.persona || "—"}`);
    console.log(`  id=${s.id}`);
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("step_order, step_type, delay_days, condition, generation_mode")
      .eq("sequence_id", s.id)
      .order("step_order", { ascending: true });
    for (const st of steps || []) {
      console.log(
        `    #${st.step_order} ${st.step_type.padEnd(12)} delay=${st.delay_days}j  ` +
          `cond=${st.condition || "—"}  gen=${st.generation_mode}`
      );
    }
  }
  if (!(seqs || []).length) console.log("\n(aucune séquence active)");

  // ================= 5. LINKEDIN_ACCOUNTS =================
  console.log(`\n━━━━━━━━━━ 5. LINKEDIN_ACCOUNTS ━━━━━━━━━━`);
  const { data: accounts } = await supabase
    .from("linkedin_accounts")
    .select("id, user_id, unipile_account_id, status, account_type, warmup_start_date");
  for (const a of accounts || []) {
    console.log(`\n▸ owner=${nameOf.get(a.user_id)}  (user_id=${a.user_id})`);
    console.log(`    status              : ${a.status}`);
    console.log(`    account_type        : ${a.account_type ?? "—"}`);
    console.log(`    warmup_start_date   : ${a.warmup_start_date ?? "—"}`);
    console.log(`    unipile_account_id  : ${a.unipile_account_id}`);
  }
  if (!(accounts || []).length) console.log("\n(aucun compte LinkedIn)");

  // ================= 6. USER_SETTINGS — limites effectives =================
  console.log(`\n━━━━━━━━━━ 6. LIMITES QUOTIDIENNES EFFECTIVES (warmup appliqué) ━━━━━━━━━━`);
  // Un user par compte LinkedIn (les autres n'envoient pas).
  const userIds = [...new Set((accounts || []).map((a) => a.user_id))];
  for (const uid of userIds) {
    const eff = await loadUserSchedulingSettings(supabase, uid);
    console.log(`\n▸ ${nameOf.get(uid)} (user_id=${uid})`);
    table([
      ["daily_messages_limit", eff.dailyMessagesLimit],
      ["daily_invitations_limit", eff.dailyInvitationsLimit],
      ["daily_visits_limit", eff.dailyVisitsLimit],
      ["active_days", eff.activeDays.join(",")],
      ["working_hours", `${eff.startHour}h–${eff.endHour}h ${eff.timezone}`],
    ]);
  }

  console.log(`\n[dump] DONE — lecture seule, aucune écriture, aucun envoi.\n`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
