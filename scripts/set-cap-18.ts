/**
 * set-cap-18.ts — Monte daily_messages_limit 15 → 18 sur le compte opérateur (Yann).
 * Merge JSONB (ne touche à rien d'autre). NE touche PAS au warmup, n'envoie rien,
 * ne réactive aucun cron. Confirme la valeur écrite + la limite EFFECTIVE.
 *
 * USAGE :
 *   npx tsx scripts/set-cap-18.ts            # applique
 *   DRY_RUN=1 npx tsx scripts/set-cap-18.ts  # inspection seule
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY_RUN = process.env.DRY_RUN === "1";
const TARGET_MESSAGES_LIMIT = 18;

async function main() {
  const { createServiceClient } = await import("../lib/supabase/service");
  const { loadUserSchedulingSettings } = await import("../lib/scheduling");
  const supabase = createServiceClient();

  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("id, user_id, status")
    .eq("status", "active");
  if (accErr) {
    console.error("❌ Lecture linkedin_accounts :", accErr.message);
    process.exit(1);
  }
  if (!accounts?.length) {
    console.error("❌ Aucun linkedin_account actif.");
    process.exit(1);
  }
  if (accounts.length > 1) console.warn(`⚠️  ${accounts.length} comptes actifs — application à tous.`);
  const userId = accounts[0].user_id;
  console.log(`✅ user_id : ${userId}`);

  const { data: beforeRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const beforeSettings = (beforeRow?.settings ?? {}) as Record<string, unknown>;
  console.log(`AVANT : daily_messages_limit = ${beforeSettings.daily_messages_limit ?? "(absent → défaut)"}`);

  if (DRY_RUN) {
    console.log("[DRY_RUN] aucune écriture.");
    return;
  }

  const mergedSettings = { ...beforeSettings, daily_messages_limit: TARGET_MESSAGES_LIMIT };
  const { error: sErr } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, settings: mergedSettings } as never, { onConflict: "user_id" });
  if (sErr) {
    console.error("❌ Upsert user_settings :", sErr.message);
    process.exit(1);
  }

  // Relecture de la valeur réellement écrite en DB (preuve).
  const { data: afterRow } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const written = (afterRow?.settings ?? {}) as Record<string, unknown>;
  const eff = await loadUserSchedulingSettings(supabase as never, userId);

  console.log(`APRÈS : user_settings.daily_messages_limit (DB) = ${written.daily_messages_limit}`);
  console.log(`APRÈS : limite EFFECTIVE messages/jour          = ${eff.dailyMessagesLimit}`);
  console.log(written.daily_messages_limit === TARGET_MESSAGES_LIMIT ? "✅ Écrit = 18." : "❌ Valeur écrite inattendue.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
