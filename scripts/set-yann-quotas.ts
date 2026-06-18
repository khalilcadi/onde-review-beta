/**
 * set-yann-quotas.ts — Gestion manuelle des quotas du compte de Yann.
 *
 *   1. warmup_start_date = NULL sur le linkedin_account actif (désactive le ramp-up).
 *   2. daily_messages_limit = 15 dans user_settings (merge JSONB, compte récent).
 *   3. Confirme les limites EFFECTIVES via loadUserSchedulingSettings
 *      (warmup retiré → effectif = valeur user_settings, sinon défaut).
 *
 * ⚠️  Cible beta_mission via createServiceClient(). N'envoie AUCUN message,
 *     ne touche ni au chemin d'envoi ni à M2, ne réactive aucun cron.
 *
 * USAGE :
 *   npx tsx scripts/set-yann-quotas.ts            # applique
 *   DRY_RUN=1 npx tsx scripts/set-yann-quotas.ts  # inspection seule
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY_RUN = process.env.DRY_RUN === "1";
const TARGET_MESSAGES_LIMIT = 15;

async function main() {
  const { createServiceClient } = await import("../lib/supabase/service");
  const { loadUserSchedulingSettings } = await import("../lib/scheduling");
  const supabase = createServiceClient();

  // --- Compte LinkedIn actif (opérateur = Yann) ---
  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("id, user_id, warmup_start_date, status")
    .eq("status", "active");
  if (accErr) {
    console.error("❌ Lecture linkedin_accounts :", accErr.message);
    process.exit(1);
  }
  if (!accounts?.length) {
    console.error("❌ Aucun linkedin_account actif.");
    process.exit(1);
  }
  if (accounts.length > 1) {
    console.warn(`⚠️  ${accounts.length} comptes actifs — application à tous.`);
  }
  const userId = accounts[0].user_id;
  console.log(`✅ user_id : ${userId}`);
  console.log("\n--- AVANT ---");
  for (const a of accounts) {
    console.log(`  account ${a.id} → warmup_start_date = ${a.warmup_start_date ?? "NULL"}`);
  }

  // --- État user_settings avant ---
  const { data: beforeRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const beforeSettings = (beforeRow?.settings ?? {}) as Record<string, unknown>;
  console.log(`  user_settings.daily_messages_limit = ${beforeSettings.daily_messages_limit ?? "(absent → défaut)"}`);
  console.log(`  user_settings.daily_visits_limit   = ${beforeSettings.daily_visits_limit ?? "(absent → défaut)"}`);

  if (DRY_RUN) {
    console.log("\n[DRY_RUN] aucune écriture.");
    return;
  }

  // --- 1. warmup_start_date = NULL ---
  const { error: wErr } = await supabase
    .from("linkedin_accounts")
    .update({ warmup_start_date: null } as never)
    .eq("status", "active");
  if (wErr) {
    console.error("❌ Update warmup_start_date :", wErr.message);
    process.exit(1);
  }

  // --- 2. daily_messages_limit = 15 (merge JSONB, ne pas écraser le reste) ---
  const mergedSettings = { ...beforeSettings, daily_messages_limit: TARGET_MESSAGES_LIMIT };
  const { error: sErr } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, settings: mergedSettings } as never, { onConflict: "user_id" });
  if (sErr) {
    console.error("❌ Upsert user_settings :", sErr.message);
    process.exit(1);
  }

  // --- 3. Confirmation des limites EFFECTIVES ---
  const eff = await loadUserSchedulingSettings(supabase as never, userId);
  console.log("\n--- APRÈS (limites EFFECTIVES via loadUserSchedulingSettings) ---");
  console.log(`  invitations/jour : ${eff.dailyInvitationsLimit}`);
  console.log(`  messages/jour    : ${eff.dailyMessagesLimit}`);
  console.log(`  visites/jour     : ${eff.dailyVisitsLimit}`);
  console.log("\n✅ Terminé (warmup retiré, plafond messages manuel appliqué).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
