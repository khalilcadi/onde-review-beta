/**
 * Khalil Leads Report
 * ===================
 * Pour chaque lead attribué à Khalil, indique :
 *   - Séquence active (nom + étape courante / total + step_type)
 *   - Connecté LinkedIn 1er degré (vérification live via Unipile getRelations)
 *   - Nb messages envoyés / Nb réponses reçues
 *   - Nb actions pending (programmées par cron, en attente validation)
 *   - Nb actions validated (validées par Khalil, en attente d'envoi cron)
 *
 * Sortie :
 *   - Tableau markdown affiché dans le terminal
 *   - CSV complet écrit dans outputs/khalil-leads-report-YYYY-MM-DD.csv
 *
 * Usage:
 *   npx tsx scripts/khalil-leads-report.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "fs";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract LinkedIn identifier from URL.
 * IMPORTANT: do NOT lowercase — internal IDs (ACwAA…, ACoAA…) are case-sensitive
 * and Unipile rejects them with "Recipient cannot be reached" if mangled.
 * Public slugs are conventionally lowercase already, so no harm done.
 */
function extractLinkedInIdentifier(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].replace(/\/$/, "") : null;
}

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "UNIPILE_API_KEY",
    "UNIPILE_DSN",
  ];
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`❌ Missing env var: ${k}`);
      process.exit(1);
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── 1. Find Khalil ────────────────────────────────────────────────────────
  console.log("1) Recherche du compte Khalil…");
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", "%khalil%");

  if (profileErr) {
    console.error("❌ Erreur lecture profiles :", profileErr.message);
    process.exit(1);
  }
  if (!profiles || profiles.length === 0) {
    console.error("❌ Aucun profil avec full_name contenant 'khalil' trouvé.");
    process.exit(1);
  }
  if (profiles.length > 1) {
    console.warn(`⚠️  ${profiles.length} profils Khalil trouvés :`);
    profiles.forEach((p) => console.warn(`    - ${p.id} : ${p.full_name}`));
  }
  const khalil = profiles[0];
  console.log(`   ✅ ${khalil.full_name} (id=${khalil.id})`);

  // ── 2. Find Khalil's LinkedIn account ─────────────────────────────────────
  console.log("\n2) Recherche du compte LinkedIn Unipile…");
  const { data: linkedinAccounts, error: laErr } = await supabase
    .from("linkedin_accounts")
    .select("id, unipile_account_id, status")
    .eq("user_id", khalil.id);

  if (laErr) {
    console.error("❌ Erreur lecture linkedin_accounts :", laErr.message);
    process.exit(1);
  }
  if (!linkedinAccounts || linkedinAccounts.length === 0) {
    console.error("❌ Aucun linkedin_account pour Khalil.");
    process.exit(1);
  }
  const linkedinAccount = linkedinAccounts[0];
  console.log(
    `   ✅ unipile_account_id=${linkedinAccount.unipile_account_id} (status=${linkedinAccount.status})`
  );

  // ── 3. Init Unipile client (relations check moved to step 4 — per lead) ──
  const { getUnipileClient } = await import("../lib/unipile/client");
  const unipile = getUnipileClient();

  // ── 4. Fetch all leads owned by Khalil ────────────────────────────────────
  console.log("\n3) Récupération des leads de Khalil…");
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, stage, status, created_at")
    .eq("user_id", khalil.id)
    .order("created_at", { ascending: false });

  if (leadsErr) {
    console.error("❌ Erreur lecture leads :", leadsErr.message);
    process.exit(1);
  }
  if (!leads || leads.length === 0) {
    console.log("   (aucun lead)");
    return;
  }
  console.log(`   ✅ ${leads.length} leads trouvés`);

  const leadIds = leads.map((l) => l.id);

  // ── 5. Fetch sequence_leads (active only, joined to active sequences) ────
  console.log("\n5) Récupération des séquences actives…");
  const { data: sequenceLeads, error: slErr } = await supabase
    .from("sequence_leads")
    .select(
      "id, lead_id, sequence_id, current_step, status, sequences:sequence_id (id, name, status)"
    )
    .in("lead_id", leadIds)
    .eq("status", "active");

  if (slErr) {
    console.error("❌ Erreur lecture sequence_leads :", slErr.message);
    process.exit(1);
  }

  // Filter to only those whose parent sequence is active
  type SLRow = {
    id: string;
    lead_id: string;
    sequence_id: string;
    current_step: number;
    status: string;
    sequences: { id: string; name: string; status: string } | null;
  };
  const activeSL = ((sequenceLeads as unknown as SLRow[]) || []).filter(
    (sl) => sl.sequences && sl.sequences.status === "active"
  );

  // Fetch sequence_steps for these sequences (to compute "current_step / total" + label)
  const sequenceIds = Array.from(new Set(activeSL.map((sl) => sl.sequence_id)));
  let stepsBySequence: Record<string, Array<{ step_order: number; step_type: string }>> = {};
  if (sequenceIds.length > 0) {
    const { data: steps, error: stepsErr } = await supabase
      .from("sequence_steps")
      .select("sequence_id, step_order, step_type")
      .in("sequence_id", sequenceIds)
      .order("step_order", { ascending: true });
    if (stepsErr) {
      console.error("❌ Erreur lecture sequence_steps :", stepsErr.message);
    } else {
      for (const s of steps || []) {
        const sid = (s as { sequence_id: string }).sequence_id;
        if (!stepsBySequence[sid]) stepsBySequence[sid] = [];
        stepsBySequence[sid].push({
          step_order: (s as { step_order: number }).step_order,
          step_type: (s as { step_type: string }).step_type,
        });
      }
    }
  }
  console.log(`   ✅ ${activeSL.length} leads dans une séquence active`);

  // Map: lead_id → sequence info
  const seqByLead = new Map<
    string,
    { name: string; currentStep: number; totalSteps: number; currentType: string }
  >();
  for (const sl of activeSL) {
    const steps = stepsBySequence[sl.sequence_id] || [];
    const currentType =
      steps.find((s) => s.step_order === sl.current_step)?.step_type || "—";
    seqByLead.set(sl.lead_id, {
      name: sl.sequences!.name,
      currentStep: sl.current_step,
      totalSteps: steps.length,
      currentType,
    });
  }

  // ── 6. Fetch ALL Khalil's actions (sent + pending + validated) ───────────
  console.log("\n5) Récupération des actions (pending/validated/sent)…");
  const { data: actions, error: actErr } = await supabase
    .from("actions")
    .select("lead_id, status, action_type")
    .eq("user_id", khalil.id)
    .in("status", ["pending", "validated", "sent"]);

  if (actErr) {
    console.error("❌ Erreur lecture actions :", actErr.message);
    process.exit(1);
  }
  type ActRow = { lead_id: string | null; status: string; action_type: string };
  const actByLead = new Map<
    string,
    { pending: number; validated: number; sentInvitation: number; sentMessage: number }
  >();
  for (const a of (actions as ActRow[]) || []) {
    if (!a.lead_id) continue;
    const cur = actByLead.get(a.lead_id) || {
      pending: 0,
      validated: 0,
      sentInvitation: 0,
      sentMessage: 0,
    };
    if (a.status === "pending") cur.pending++;
    else if (a.status === "validated") cur.validated++;
    else if (a.status === "sent") {
      if (a.action_type === "invitation") cur.sentInvitation++;
      else if (a.action_type === "message" || a.action_type === "inmail")
        cur.sentMessage++;
    }
    actByLead.set(a.lead_id, cur);
  }
  const leadsWithSentMsg = Array.from(actByLead.values()).filter(
    (v) => v.sentMessage > 0
  ).length;
  console.log(
    `   ✅ ${actByLead.size} leads avec actions ; ${leadsWithSentMsg} leads avec ≥1 message envoyé (actions.sent)`
  );

  // ── 7. Fetch conversations + match unlinked ones by attendee_name ────────
  console.log("\n6) Récupération des conversations + messages (réponses)…");
  const { data: allConvs, error: convErr } = await supabase
    .from("conversations")
    .select("id, lead_id, attendee_name, attendee_profile_url")
    .eq("user_id", khalil.id);
  if (convErr) {
    console.error("❌ Erreur lecture conversations :", convErr.message);
    process.exit(1);
  }
  type ConvLite = {
    id: string;
    lead_id: string | null;
    attendee_name: string | null;
    attendee_profile_url: string | null;
  };
  const conversations = (allConvs || []) as ConvLite[];

  // Build name → leadId map for fuzzy matching unlinked conversations
  const leadByLowerName = new Map<string, string>();
  for (const lead of leads) {
    const k = `${(lead.first_name || "").toLowerCase().trim()} ${(lead.last_name || "").toLowerCase().trim()}`.trim();
    if (k) leadByLowerName.set(k, lead.id);
  }
  const convToLead = new Map<string, string>(); // conv.id → lead.id
  let matchedByLink = 0;
  let matchedByName = 0;
  for (const c of conversations) {
    if (c.lead_id && leadIds.includes(c.lead_id)) {
      convToLead.set(c.id, c.lead_id);
      matchedByLink++;
    } else if (c.attendee_name) {
      const key = c.attendee_name.toLowerCase().trim();
      const leadId = leadByLowerName.get(key);
      if (leadId) {
        convToLead.set(c.id, leadId);
        matchedByName++;
      }
    }
  }
  console.log(
    `   ${conversations.length} conversations Khalil ; ${matchedByLink} liées à un lead, ${matchedByName} matchées par nom (orphelines récupérées)`
  );

  // Fetch messages for the matched conversations
  const msgByLead = new Map<string, { received: number }>();
  const matchedConvIds = Array.from(convToLead.keys());
  if (matchedConvIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, direction")
      .in("conversation_id", matchedConvIds);
    for (const m of (msgs as Array<{ conversation_id: string; direction: string }>) || []) {
      if (m.direction !== "inbound") continue;
      const leadId = convToLead.get(m.conversation_id);
      if (!leadId) continue;
      const cur = msgByLead.get(leadId) || { received: 0 };
      cur.received++;
      msgByLead.set(leadId, cur);
    }
  }
  const repliedLeads = Array.from(msgByLead.values()).filter((v) => v.received > 0).length;
  console.log(`   ✅ ${repliedLeads} leads ont répondu (messages inbound)`);

  // ── 8. Per-lead Unipile getUserProfile (authoritative connection check) ─
  // getUserProfile accepts ALL identifier formats (slug, ACwAA…, ACoAA…),
  // so we use the regex-extracted identifier directly. The trick is the
  // network_distance value: real responses say "FIRST_DEGREE" not "FIRST".
  console.log(
    "\n7) Vérification connexion LinkedIn live (getUserProfile par lead)…"
  );
  const connByLead = new Map<string, "OUI" | "NON" | "?">();
  const errorsByLead: Array<{ name: string; error: string }> = [];
  let okCount = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const id = extractLinkedInIdentifier(lead.linkedin_url);
    if (!id) {
      connByLead.set(lead.id, "?");
      continue;
    }
    let attempts = 0;
    let success = false;
    while (attempts < 2 && !success) {
      attempts++;
      try {
        const profile = (await unipile.getUserProfile(
          id,
          linkedinAccount.unipile_account_id
        )) as unknown as {
          network_distance?: string;
          is_relationship?: boolean;
        };
        const nd = (profile.network_distance || "").toUpperCase().trim();
        const isFirst =
          profile.is_relationship === true ||
          nd === "FIRST_DEGREE" ||
          nd === "DISTANCE_1" ||
          nd === "FIRST" ||
          nd === "1" ||
          nd === "1ST";
        connByLead.set(lead.id, isFirst ? "OUI" : "NON");
        if (isFirst) okCount++;
        success = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempts < 2) {
          // Retry once after a longer pause (likely rate limit)
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        connByLead.set(lead.id, "?");
        errorsByLead.push({
          name: `${lead.first_name} ${lead.last_name}`,
          error: msg,
        });
      }
    }
    process.stdout.write(
      `\r   ${i + 1}/${leads.length} vérifiés — ${okCount} connectés, ${errorsByLead.length} erreurs`
    );
    // Rate limit (Unipile = ~2 req/sec safe)
    await new Promise((r) => setTimeout(r, 500));
  }
  process.stdout.write("\n");
  console.log(`   ✅ Terminé : ${okCount} leads connectés en 1er degré`);
  if (errorsByLead.length > 0) {
    console.log(`   ⚠️  ${errorsByLead.length} erreurs (échantillon) :`);
    errorsByLead.slice(0, 5).forEach((e) =>
      console.log(`      - ${e.name}: ${e.error}`)
    );
  }

  // ── 9. Build report rows ─────────────────────────────────────────────────
  type Row = {
    name: string;
    company: string;
    stageDb: string;
    seqName: string;
    seqStep: string;
    connected: "OUI" | "NON" | "?";
    sentInv: number;
    sentMsg: number;
    received: number;
    pending: number;
    validated: number;
    linkedinUrl: string;
  };

  const rows: Row[] = leads.map((lead) => {
    const seq = seqByLead.get(lead.id);
    const msg = msgByLead.get(lead.id) || { received: 0 };
    const act = actByLead.get(lead.id) || {
      pending: 0,
      validated: 0,
      sentInvitation: 0,
      sentMessage: 0,
    };
    const connected = connByLead.get(lead.id) || "?";

    return {
      name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "—",
      company: lead.company || "—",
      stageDb: lead.stage || "—",
      seqName: seq ? seq.name : "—",
      seqStep: seq ? `${seq.currentStep}/${seq.totalSteps} (${seq.currentType})` : "—",
      connected,
      sentInv: act.sentInvitation,
      sentMsg: act.sentMessage,
      received: msg.received,
      pending: act.pending,
      validated: act.validated,
      linkedinUrl: lead.linkedin_url || "",
    };
  });

  // ── 9. Print summary table ───────────────────────────────────────────────
  console.log("\n" + "═".repeat(140));
  console.log("📊 RAPPORT LEADS KHALIL");
  console.log("═".repeat(140));

  const totals = {
    leads: rows.length,
    inSequence: rows.filter((r) => r.seqName !== "—").length,
    connected: rows.filter((r) => r.connected === "OUI").length,
    notConnected: rows.filter((r) => r.connected === "NON").length,
    unknownConnection: rows.filter((r) => r.connected === "?").length,
    leadsWithSentInv: rows.filter((r) => r.sentInv > 0).length,
    leadsWithSentMsg: rows.filter((r) => r.sentMsg > 0).length,
    leadsReplied: rows.filter((r) => r.received > 0).length,
    pendingActions: rows.reduce((s, r) => s + r.pending, 0),
    validatedActions: rows.reduce((s, r) => s + r.validated, 0),
  };

  console.log(`Total leads                : ${totals.leads}`);
  console.log(`Dans une séquence active   : ${totals.inSequence}`);
  console.log(`Connectés (Unipile live)   : ${totals.connected}`);
  console.log(`Non connectés              : ${totals.notConnected}`);
  console.log(`Connection inconnue        : ${totals.unknownConnection}`);
  console.log(`Leads avec invitation env. : ${totals.leadsWithSentInv}`);
  console.log(`Leads avec message env.    : ${totals.leadsWithSentMsg}`);
  console.log(`Leads ayant répondu        : ${totals.leadsReplied}`);
  console.log(`Actions pending (cumul)    : ${totals.pendingActions}`);
  console.log(`Actions validated (cumul)  : ${totals.validatedActions}`);

  // Print table (top 50)
  console.log("\n" + "─".repeat(150));
  const header =
    pad("Nom", 24) +
    pad("Entreprise", 22) +
    pad("Stage", 12) +
    pad("Séquence", 22) +
    pad("Étape", 18) +
    pad("Connecté", 10) +
    pad("Inv", 5) +
    pad("Msg", 5) +
    pad("Rép", 5) +
    pad("Pend", 6) +
    pad("Val", 5);
  console.log(header);
  console.log("─".repeat(150));
  const TOP = 70;
  for (const r of rows.slice(0, TOP)) {
    console.log(
      pad(r.name, 24) +
        pad(r.company, 22) +
        pad(r.stageDb, 12) +
        pad(r.seqName, 22) +
        pad(r.seqStep, 18) +
        pad(r.connected, 10) +
        pad(String(r.sentInv), 5) +
        pad(String(r.sentMsg), 5) +
        pad(String(r.received), 5) +
        pad(String(r.pending), 6) +
        pad(String(r.validated), 5)
    );
  }
  if (rows.length > TOP) {
    console.log("─".repeat(150));
    console.log(`… ${rows.length - TOP} leads supplémentaires (voir CSV complet)`);
  }
  console.log("─".repeat(150));

  // ── 10. Write CSV ────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const outputsDir = resolve(process.cwd(), "outputs");
  if (!existsSync(outputsDir)) mkdirSync(outputsDir, { recursive: true });
  const csvPath = resolve(outputsDir, `khalil-leads-report-${today}.csv`);

  const csvHeaders = [
    "Nom",
    "Entreprise",
    "Stage DB",
    "Sequence active",
    "Etape",
    "Connecte (Unipile live)",
    "Invitations envoyees",
    "Messages envoyes",
    "Reponses recues",
    "Actions pending",
    "Actions validated",
    "LinkedIn URL",
  ];
  const csvLines = [csvHeaders.join(",")];
  for (const r of rows) {
    csvLines.push(
      [
        r.name,
        r.company,
        r.stageDb,
        r.seqName,
        r.seqStep,
        r.connected,
        r.sentInv,
        r.sentMsg,
        r.received,
        r.pending,
        r.validated,
        r.linkedinUrl,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  writeFileSync(csvPath, csvLines.join("\n"), "utf8");
  console.log(`\n✅ CSV complet écrit : ${csvPath}`);

  // Also write a JSON for the assistant to easily reload
  const jsonPath = resolve(outputsDir, `khalil-leads-report-${today}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ totals, rows }, null, 2),
    "utf8"
  );
  console.log(`✅ JSON écrit         : ${jsonPath}`);
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
