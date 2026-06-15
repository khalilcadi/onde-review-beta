/**
 * Import RAG DÉMO — pousse des blocs RAG personnalisés (générés depuis le site
 * d'un prospect) dans le RAG du SEUL user démo, via la table user_rag_data.
 *
 * Pourquoi ce script : l'UI Settings > Knowledge édite un bloc à la fois et n'a
 * pas d'import de fichiers en masse. Ici on dépose les JSON dans un dossier et on
 * les upsert d'un coup. Override par user → tes vrais users ne sont pas touchés.
 * Les overrides sont relus en DB à chaque génération → effet immédiat, sans restart.
 *
 * USAGE :
 *   1. Dépose tes blocs (1 fichier .json par bloc) dans scripts/demo-rag/
 *      Chaque fichier doit avoir la forme { bloc_id, title, sections, metadata }
 *      avec bloc_id ∈ icp_segments | pain_points | messaging_angles | offre_produit | qualification
 *   2. npx tsx scripts/seed-demo-rag.ts
 *
 * Re-run = upsert (remplace proprement). Pour revenir aux defaults : supprime les
 * lignes user_rag_data du user démo (ou bouton "Reset to default" dans l'UI).
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { promises as fs } from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo-fiveforty@prospector.app";
const RAG_DIR = path.resolve(process.cwd(), "scripts/demo-rag");
const VALID_BLOC_IDS = ["icp_segments", "pain_points", "messaging_angles", "offre_produit", "qualification"];

/**
 * Répare le mojibake UTF-8-lu-comme-Latin1 (é affiché "Ã©", à "Ã ", etc.).
 * Ne s'applique que si la signature mojibake est détectée, pour ne pas casser un
 * fichier déjà propre.
 */
function fixMojibake(s: string): string {
  if (/Ã[\x80-\xBF]|Â[\x80-\xBF]/.test(s)) {
    return Buffer.from(s, "latin1").toString("utf8");
  }
  return s;
}

async function findDemoUserId(): Promise<string> {
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((u) => u.email === DEMO_EMAIL);
  if (!user) throw new Error(`User démo ${DEMO_EMAIL} introuvable — lance d'abord scripts/seed-demo.ts`);
  return user.id;
}

async function main() {
  console.log("\n=== IMPORT RAG DÉMO ===\n");

  let files: string[];
  try {
    files = (await fs.readdir(RAG_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(`Dossier introuvable : ${RAG_DIR}\nCrée-le et dépose tes blocs .json dedans.`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`Aucun .json dans ${RAG_DIR}`);
    process.exit(1);
  }

  const userId = await findDemoUserId();
  console.log(`User démo : ${DEMO_EMAIL} (${userId})\n`);

  let ok = 0;
  for (const file of files) {
    const raw = fixMojibake(await fs.readFile(path.join(RAG_DIR, file), "utf-8"));
    let bloc: { bloc_id?: string; title?: string; sections?: unknown[] };
    try {
      bloc = JSON.parse(raw);
    } catch (e) {
      console.warn(`  [SKIP] ${file} — JSON invalide : ${(e as Error).message}`);
      continue;
    }

    const blocId = bloc.bloc_id;
    if (!blocId || !VALID_BLOC_IDS.includes(blocId)) {
      console.warn(`  [SKIP] ${file} — bloc_id "${blocId}" non reconnu (attendu : ${VALID_BLOC_IDS.join(", ")})`);
      continue;
    }
    if (!Array.isArray(bloc.sections) || bloc.sections.length === 0) {
      console.warn(`  [SKIP] ${file} — pas de sections`);
      continue;
    }

    const { error } = await supabase
      .from("user_rag_data")
      .upsert({ user_id: userId, data_type: blocId, content: bloc }, { onConflict: "user_id,data_type" });

    if (error) {
      console.warn(`  [ERREUR] ${blocId} — ${error.message}`);
    } else {
      console.log(`  [OK] ${blocId.padEnd(16)} ← ${file} (${bloc.sections.length} sections)`);
      ok++;
    }
  }

  console.log(`\n✅ ${ok}/${files.length} blocs importés dans le RAG de ${DEMO_EMAIL}.`);
  console.log("   Effet immédiat (overrides relus en DB à chaque génération).\n");
}

main().catch((e) => {
  console.error("\n❌ Import RAG démo échoué :", e);
  process.exit(1);
});
