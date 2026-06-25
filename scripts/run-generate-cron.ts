/**
 * run-generate-cron.ts — Force un run du cron generate-actions MAINTENANT,
 * en local contre le même schéma beta_mission (createServiceClient).
 * Invoque le handler GET de prod tel quel (même code que Vercel).
 * Génère des actions en status='pending' (AUCUN envoi — send-actions seul envoie,
 * et uniquement les 'validated').
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { GET } = await import("../app/api/crons/generate-actions/route");
  const secret = process.env.CRON_SECRET || "";
  const req = new Request("https://local/api/crons/generate-actions", {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
  const res = await GET(req as never);
  const body = await (res as Response).json();
  console.log("HTTP", (res as Response).status);
  console.log(JSON.stringify(body, null, 2));
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
