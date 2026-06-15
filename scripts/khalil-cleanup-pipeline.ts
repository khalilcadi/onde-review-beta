/**
 * Khalil Cleanup Pipeline
 * =======================
 * Re-calcule le stage de chaque lead de Khalil à partir de la VRAIE source de vérité :
 *   - actions.status='sent' (par type)
 *   - getUserProfile Unipile live (1er degré)
 *   - messages.direction='inbound' (réponses)
 *
 * Règles de stage :
 *   1. inbound message reçu             → 'responded'
 *   2. message envoyé (sent)            → 'in_sequence'
 *   3. 1er degré LinkedIn (live Unipile)→ 'connected'
 *   4. invitation envoyée (sent)        → 'invited'
 *   5. rien                              → 'to_invite'
 *
 * En plus : pour les leads qui passent en 'to_invite' (rien d'envoyé), annule
 * toutes les actions pending/validated en attente (Khalil veut tout revoir).
 *
 * Mode dry-run : si DRY_RUN=1 dans l'env, n'écrit rien, affiche juste le diff.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/khalil-cleanup-pipeline.ts   # preview
 *   npx tsx scripts/khalil-cleanup-pipeline.ts             # apply
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const DRY_RUN = process.env.DRY_RUN === "1";

type Stage = "to_invite" | "invited" | "connected" | "in_sequence" | "responded";

function extractLinkedInIdentifier(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].replace(/\/$/, "") : null;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

async function main() {
  console.log(
    `\n${DRY_RUN ? "🟡 DRY RUN" : "🔴 APPLY MODE"} — cleanup pipeline Khalil\n`
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { getUnipileClient } = await import("../lib/unipile/client");
  const unipile = getUnipileClient();

  // ── 1. Khalil's LinkedIn account ─────────────────────────────────────────
  const { data: linkedinAccounts } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", KHALIL_USER_ID);
  if (!linkedinAccounts?.length) {
    console.error("❌ Pas de linkedin_account pour Khalil");
    process.exit(1);
  }
  const accountId = linkedinAccounts[0].unipile_account_id;
  console.log(`✅ Compte Unipile : ${accountId}`);

  // ── 2. Tous les leads de Khalil ──────────────────────────────────────────
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, linkedin_url, stage")
    .eq("user_id", KHALIL_USER_ID)
    .order("created_at", { ascending: false });
  if (leadsErr || !leads) {
    console.error("❌ Erreur leads :", leadsErr?.message);
    process.exit(1);
  }
  console.log(`✅ ${leads.length} leads à traiter`);
  const leadIds = leads.map((l) => l.id);

  // ── 3. Actions sent groupées par lead ────────────────────────────────────
  const { data: sentActions } = await supabase
    .from("actions")
    .select("lead_id, action_type")
    .eq("user_id", KHALIL_USER_ID)
    .eq("status", "sent");
  const sentByLead = new Map<string, { invitation: number; message: number }>();
  for (const a of (sentActions as Array<{ lead_id: string | null; action_type: string }>) || []) {
    if (!a.lead_id) continue;
    const cur = sentByLead.get(a.lead_id) || { invitation: 0, message: 0 };
    if (a.action_type === "invitation") cur.invitation++;
    else if (a.action_type === "message" || a.action_type === "inmail") cur.message++;
    sentByLead.set(a.lead_id, cur);
  }
  console.log(
    `✅ Actions sent : ${sentByLead.size} leads ont au moins 1 action envoyée`
  );

  // ── 4. Réponses inbound (conversations rattachées) ───────────────────────
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, lead_id")
    .in("lead_id", leadIds);
  const convIds = (convs || []).map((c) => c.id);
  const convToLead = new Map<string, string>();
  for (const c of (convs as Array<{ id: string; lead_id: string }>) || []) {
    convToLead.set(c.id, c.lead_id);
  }
  const repliedSet = new Set<string>();
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, direction")
      .in("conversation_id", convIds)
      .eq("direction", "inbound");
    for (const m of (msgs as Array<{ conversation_id: string }>) || []) {
      const leadId = convToLead.get(m.conversation_id);
      if (leadId) repliedSet.add(leadId);
    }
  }
  console.log(`✅ Réponses : ${repliedSet.size} leads ont répondu`);

  // ── 5. Connexions live via Unipile getUserProfile ────────────────────────
  console.log(
    `\n📡 Vérification connexions live (${leads.length} appels Unipile, ~${Math.ceil(leads.length * 0.6)}s)…`
  );
  const connectedSet = new Set<string>();
  let okCount = 0;
  let errCount = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const id = extractLinkedInIdentifier(lead.linkedin_url);
    if (!id) {
      errCount++;
      continue;
    }
    try {
      const profile = (await unipile.getUserProfile(id, accountId)) as unknown as {
        network_distance?: string;
        is_relationship?: boolean;
      };
      const nd = (profile.network_distance || "").toUpperCase().trim();
      const isFirst =
        profile.is_relationship === true ||
        ["FIRST", "FIRST_DEGREE", "DISTANCE_1", "1", "1ST"].includes(nd);
      if (isFirst) {
        connectedSet.add(lead.id);
        okCount++;
      }
    } catch {
      errCount++;
    }
    process.stdout.write(
      `\r   ${i + 1}/${leads.length} — ${okCount} connectés, ${errCount} non vérifiables`
    );
    await new Promise((r) => setTimeout(r, 500));
  }
  process.stdout.write("\n");
  console.log(`✅ ${okCount} leads connectés en 1er degré (live)`);

  // ── 6. Calcul du nouveau stage par lead ──────────────────────────────────
  function computeStage(leadId: string): Stage {
    if (repliedSet.has(leadId)) return "responded";
    const sent = sentByLead.get(leadId);
    if (sent && sent.message > 0) return "in_sequence";
    if (connectedSet.has(leadId)) return "connected";
    if (sent && sent.invitation > 0) return "invited";
    return "to_invite";
  }

  type Diff = {
    leadId: string;
    name: string;
    company: string;
    oldStage: string;
    newStage: Stage;
    changed: boolean;
  };
  const diffs: Diff[] = leads.map((l) => {
    const newStage = computeStage(l.id);
    return {
      leadId: l.id,
      name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || "—",
      company: l.company || "—",
      oldStage: l.stage || "—",
      newStage,
      changed: l.stage !== newStage,
    };
  });

  // ── 7. Affichage du diff ─────────────────────────────────────────────────
  const changed = diffs.filter((d) => d.changed);
  console.log("\n" + "═".repeat(110));
  console.log(`📊 DIFF — ${changed.length}/${diffs.length} leads vont changer de stage`);
  console.log("═".repeat(110));

  // Group by transition
  const transitions: Record<string, Diff[]> = {};
  for (const d of changed) {
    const key = `${d.oldStage} → ${d.newStage}`;
    if (!transitions[key]) transitions[key] = [];
    transitions[key].push(d);
  }
  for (const [key, ds] of Object.entries(transitions).sort()) {
    console.log(`\n  ${key}  (${ds.length} leads)`);
    for (const d of ds) {
      console.log(`    • ${pad(d.name, 28)} ${d.company}`);
    }
  }

  // Distribution finale
  const finalDist: Record<Stage, number> = {
    to_invite: 0,
    invited: 0,
    connected: 0,
    in_sequence: 0,
    responded: 0,
  };
  for (const d of diffs) finalDist[d.newStage]++;
  console.log("\n" + "─".repeat(110));
  console.log("Distribution finale :");
  console.log(`  to_invite   : ${finalDist.to_invite}`);
  console.log(`  invited     : ${finalDist.invited}`);
  console.log(`  connected   : ${finalDist.connected}`);
  console.log(`  in_sequence : ${finalDist.in_sequence}`);
  console.log(`  responded   : ${finalDist.responded}`);

  // ── 8. Actions à annuler ─────────────────────────────────────────────────
  // Règle Khalil :
  //   - Annuler TOUTES les actions PENDING de type message/inmail (les "à valider")
  //   - LAISSER intactes les actions VALIDATED de type invitation (envoi imminent)
  //   - LAISSER intactes les autres types
  const { data: pendActionsRaw } = await supabase
    .from("actions")
    .select("id, lead_id, action_type, status")
    .eq("user_id", KHALIL_USER_ID)
    .eq("status", "pending")
    .in("action_type", ["message", "inmail"]);
  const actionsToCancel =
    (pendActionsRaw as Array<{
      id: string;
      lead_id: string;
      action_type: string;
      status: string;
    }>) || [];

  // Inventaire complet des actions pour transparence
  const { data: allOpen } = await supabase
    .from("actions")
    .select("status, action_type")
    .eq("user_id", KHALIL_USER_ID)
    .in("status", ["pending", "validated"]);
  const inventory: Record<string, number> = {};
  for (const a of (allOpen as Array<{ status: string; action_type: string }>) || []) {
    const k = `${a.status}/${a.action_type}`;
    inventory[k] = (inventory[k] || 0) + 1;
  }
  console.log("\n📋 Inventaire actions ouvertes (pending + validated) :");
  for (const [k, v] of Object.entries(inventory).sort()) {
    console.log(`    ${k.padEnd(25)} : ${v}`);
  }
  console.log(
    `\n→ ${actionsToCancel.length} actions pending message/inmail seront ANNULÉES`
  );
  console.log(
    `→ Les actions validated invitation et tout le reste sont LAISSÉES intactes`
  );

  // ── 9. Apply ou DRY RUN ──────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n🟡 DRY RUN — aucune écriture en DB");
    console.log("    Pour appliquer : `npx tsx scripts/khalil-cleanup-pipeline.ts` (sans DRY_RUN=1)");
    return;
  }

  console.log("\n🔴 APPLY MODE — écriture en cours…");

  // 9a. Update stages
  let stageUpdates = 0;
  let stageErrors = 0;
  for (const d of changed) {
    const { error } = await supabase
      .from("leads")
      .update({ stage: d.newStage, updated_at: new Date().toISOString() })
      .eq("id", d.leadId);
    if (error) {
      console.error(`  ❌ ${d.name}: ${error.message}`);
      stageErrors++;
    } else {
      stageUpdates++;
    }
  }
  console.log(`  ✅ ${stageUpdates}/${changed.length} stages mis à jour (${stageErrors} erreurs)`);

  // 9b. Cancel pending message/inmail actions (Khalil's daily reset)
  if (actionsToCancel.length > 0) {
    const ids = actionsToCancel.map((a) => a.id);
    const { error: cancelErr } = await supabase
      .from("actions")
      .update({
        status: "cancelled",
        error_message: "Cancelled by cleanup script (daily message reset 2026-04-07)",
      })
      .in("id", ids);
    if (cancelErr) {
      console.error(`  ❌ Erreur cancel actions : ${cancelErr.message}`);
    } else {
      console.log(`  ✅ ${actionsToCancel.length} actions message/inmail annulées`);
    }
  }

  console.log("\n✅ Cleanup terminé.");
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
