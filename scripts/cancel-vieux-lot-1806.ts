/**
 * cancel-vieux-lot-1806.ts — annulation ciblée du vieux lot du 18/06.
 *
 * Critère : status = 'pending' AND created_at (Europe/Paris) = 2026-06-18.
 * GARDE : doit matcher EXACTEMENT 8 actions sur les leads attendus
 *   (Lucien Batteur, Tom Jullien ×2, Audrey Sertillange ×2, Ilan Aaron Habib,
 *    Léo Roux, Charlotte Hennebert). Sinon → STOP, rien n'est annulé.
 *
 * Action : status → 'cancelled' + error_message = "cleanup: doublons + prompt 18/06".
 * JAMAIS de hard delete. Aucun autre champ modifié. Aucun envoi, aucune régénération.
 *
 * DRY_RUN=1 (défaut) : liste seulement, ne change rien.
 * DRY_RUN=0 : exécute l'update après passage de la garde.
 *
 * USAGE :
 *   DRY_RUN=1 npx tsx scripts/cancel-vieux-lot-1806.ts   # aperçu
 *   DRY_RUN=0 npx tsx scripts/cancel-vieux-lot-1806.ts   # exécution
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const TZ = "Europe/Paris";
const TARGET_DATE = "2026-06-18";
const REASON = "cleanup: doublons + prompt 18/06";
const DRY_RUN = process.env.DRY_RUN !== "0"; // défaut = dry-run

const pD = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)) : "—";
const pDT = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(
        new Date(iso)
      )
    : "—";
const snip = (s: string | null | undefined, n = 80) =>
  s ? s.replace(/\|\|\|/g, " ⏎ ").replace(/\s+/g, " ").trim().slice(0, n) : "—";

// Multiset attendu de noms de leads (8 actions).
const EXPECTED: Record<string, number> = {
  "Lucien Batteur": 1,
  "Tom Jullien": 2,
  "Audrey Sertillange": 2,
  "Ilan Aaron Habib": 1,
  "Léo Roux": 1,
  "Charlotte Hennebert": 1,
};

async function main() {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const sb = createServiceClient();

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  CANCEL vieux lot 18/06 — ${DRY_RUN ? "DRY_RUN (aucune écriture)" : "EXÉCUTION RÉELLE"}        ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);

  // --- Snapshot AVANT : tous les pending ---
  const { data: pendBefore, error: e1 } = await sb
    .from("actions")
    .select("id, lead_id, status, generated_message, final_message, created_at")
    .eq("status", "pending");
  if (e1) {
    console.error("read error:", e1.message);
    process.exit(1);
  }
  const allPending = pendBefore || [];

  const { data: leads } = await sb.from("leads").select("id, first_name, last_name");
  const nameOf = new Map(
    (leads || []).map((l) => [l.id, `${l.first_name || ""} ${l.last_name || ""}`.trim() || "(sans nom)"])
  );

  // --- Sélection : pending + created_at(Paris) = TARGET_DATE ---
  const selected = allPending.filter((a) => pD(a.created_at) === TARGET_DATE);

  console.log(`\nPending total (avant) : ${allPending.length}`);
  console.log(`Sélection (pending + created_at Paris = ${TARGET_DATE}) : ${selected.length}\n`);

  // --- Liste de la sélection ---
  selected.sort((a, b) => a.created_at.localeCompare(b.created_at));
  console.log(`──── ACTIONS CIBLÉES ────`);
  for (const a of selected) {
    console.log(
      `  • ${(nameOf.get(a.lead_id!) || "?").padEnd(22)} id=${a.id}  created=${pDT(a.created_at)}`
    );
    console.log(`      "${snip(a.final_message ?? a.generated_message)}"`);
  }

  // ============ GARDE ============
  const errors: string[] = [];
  if (selected.length !== 8) errors.push(`compte = ${selected.length}, attendu 8`);

  // Comparaison de noms insensible à la casse/espaces (la DB peut stocker
  // "Charlotte HENNEBERT"; le critère métier porte sur l'identité du lead, pas la casse).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const expNorm: Record<string, number> = {};
  for (const [k, v] of Object.entries(EXPECTED)) expNorm[norm(k)] = v;

  const got: Record<string, number> = {};
  for (const a of selected) {
    const n = norm(nameOf.get(a.lead_id!) || "(inconnu)");
    got[n] = (got[n] || 0) + 1;
  }
  // comparer multiset
  const allNames = new Set([...Object.keys(expNorm), ...Object.keys(got)]);
  for (const n of allNames) {
    if ((expNorm[n] || 0) !== (got[n] || 0)) {
      errors.push(`lead "${n}": attendu ${expNorm[n] || 0}, trouvé ${got[n] || 0}`);
    }
  }

  console.log(`\n──── GARDE (8 actions + leads exacts) ────`);
  if (errors.length) {
    console.log(`  ❌ ÉCART DÉTECTÉ → STOP, rien n'est annulé :`);
    for (const e of errors) console.log(`     - ${e}`);
    console.log(`\n[STOP] Critère non conforme. Aucune écriture effectuée.\n`);
    process.exit(2);
  }
  console.log(`  ✅ Exactement 8 actions, leads conformes au set attendu.`);

  // ============ EXÉCUTION ou DRY_RUN ============
  if (DRY_RUN) {
    console.log(`\n[DRY_RUN] Garde franchie. Aucune écriture. Relancer avec DRY_RUN=0 pour exécuter.\n`);
    return;
  }

  console.log(`\n──── EXÉCUTION : status → 'cancelled' (raison="${REASON}") ────`);
  const ids = selected.map((a) => a.id);
  const { data: updated, error: e2 } = await sb
    .from("actions")
    .update({ status: "cancelled", error_message: REASON })
    .in("id", ids)
    .eq("status", "pending") // sécurité : ne touche que ce qui est encore pending
    .select("id");
  if (e2) {
    console.error("update error:", e2.message);
    process.exit(1);
  }
  console.log(`  Lignes mises à jour : ${updated?.length ?? 0}`);

  // --- Vérification APRÈS ---
  const { data: pendAfter } = await sb
    .from("actions")
    .select("id, lead_id, created_at")
    .eq("status", "pending");
  const after = pendAfter || [];
  const allFrom19 = after.every((a) => pD(a.created_at) === "2026-06-19");

  console.log(`\n──── VÉRIFICATION APRÈS ────`);
  console.log(`  Pending : ${allPending.length} → ${after.length}  ${after.length === 11 ? "✅" : "⚠️"}`);
  console.log(`  Les ${after.length} pending restants sont TOUS du 19/06 : ${allFrom19 ? "✅ oui" : "❌ NON"}`);
  if (!allFrom19) {
    const bad = after.filter((a) => pD(a.created_at) !== "2026-06-19");
    for (const a of bad) console.log(`     ⚠️ ${nameOf.get(a.lead_id!)} created=${pDT(a.created_at)}`);
  }

  console.log(`\n[DONE] ${updated?.length ?? 0} actions annulées (cancelled), 0 supprimée.\n`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
