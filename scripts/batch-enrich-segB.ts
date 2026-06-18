/**
 * batch-enrich-segB.ts — Batch d'enrichissement seg_B (enrich-only, AUCUN enrôlement).
 *
 * Enrichit les N premiers presort:B non encore enrichis, via enrichSingleLead
 * (Unipile lean + computeSegmentIcp), délai anti-détection 60–120 s entre chaque.
 *
 * ⚠️  Le persona seg_B n'a jamais tourné en live → on N'ENRÔLE PAS (comme seg_C).
 * ⚠️  Cap visites/j ~30. ~20 visites déjà faites aujourd'hui (enrichissement seg_A/C).
 *     COUNT par défaut = 15 (assumé : dépassement léger validé par l'utilisateur).
 *
 * USAGE :
 *   npx tsx scripts/batch-enrich-segB.ts --dry
 *   npx tsx scripts/batch-enrich-segB.ts            # COUNT=15
 *   COUNT=10 npx tsx scripts/batch-enrich-segB.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DRY = process.argv.includes("--dry");
const COUNT = parseInt(process.env.COUNT || "15", 10);
const DELAY_MIN_MS = 60_000;
const DELAY_MAX_MS = 120_000;

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}
function isEnriched(ed: any): boolean {
  return !!(ed && typeof ed === "object" && "enriched_at" in ed);
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelayMs() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UNIPILE_API_KEY", "UNIPILE_DSN"]) {
    if (!process.env[k]) {
      console.error(`❌ Variable d'environnement manquante : ${k}`);
      process.exit(1);
    }
  }

  const { createServiceClient } = await import("../lib/supabase/service");
  const supabase = createServiceClient();

  console.log(`\n=== batch-enrich-segB (${DRY ? "DRY-RUN" : "EXÉCUTION"}) — COUNT=${COUNT} ===\n`);

  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts").select("user_id, unipile_account_id, status").eq("status", "active");
  if (accErr) throw accErr;
  if (!accounts?.length) throw new Error("Aucun compte LinkedIn actif.");
  if (accounts.length > 1) throw new Error("Plusieurs comptes actifs — abort.");
  const userId = accounts[0].user_id;
  console.log(`Owner=${userId} | account=${accounts[0].unipile_account_id}`);

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, score, status, stage, tags, notes, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const leads = rows || [];

  const segBRemaining = leads.filter((l) => presortSeg(l.enrichment_data) === "B" && !isEnriched(l.enrichment_data) && !!l.linkedin_url);
  const batch = segBRemaining.slice(0, COUNT);

  const segBTotal = leads.filter((l) => presortSeg(l.enrichment_data) === "B").length;
  const segBEnriched = leads.filter((l) => presortSeg(l.enrichment_data) === "B" && isEnriched(l.enrichment_data)).length;
  console.log(`presort:B — total=${segBTotal} | enrichis=${segBEnriched} | restants=${segBRemaining.length}`);
  console.log(`À enrichir ce batch : ${batch.length}\n`);
  batch.forEach((l, i) => console.log(`  ${i + 1}. ${l.first_name} ${l.last_name} — ${l.title || "?"} @ ${l.company || "?"}`));

  if (DRY) {
    console.log("\nDRY-RUN — aucune écriture.\n");
    return;
  }

  const { enrichSingleLead } = await import("../app/api/ai/enrich/route");
  type Outcome = { name: string; ok: boolean; computed?: string | null; error?: string };
  const outcomes: Outcome[] = [];
  const start = Date.now();

  for (let i = 0; i < batch.length; i++) {
    const l = batch[i];
    const name = `${l.first_name} ${l.last_name}`;
    const tag = `[${i + 1}/${batch.length}] [B] ${name}`;
    if (i > 0) {
      const d = randomDelayMs();
      console.log(`⏳ pause anti-détection ${Math.round(d / 1000)}s avant ${tag}…`);
      await sleep(d);
    }
    try {
      const leadInput = {
        id: l.id, firstName: l.first_name || "", lastName: l.last_name || "",
        title: l.title, company: l.company, linkedinUrl: l.linkedin_url || "",
        score: l.score, status: l.status, stage: l.stage, tags: l.tags, notes: l.notes,
        enrichmentData: l.enrichment_data,
      };
      const result = (await enrichSingleLead(leadInput as never, userId, supabase as never)) as Record<string, any>;
      const computed = result?.scoring_detail?.segment_icp ?? null;
      outcomes.push({ name, ok: true, computed });
      console.log(`  ✓ ${tag} → computed=${computed}`);
    } catch (e) {
      outcomes.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
      console.error(`  ✗ ${tag} : ${e instanceof Error ? e.message : e}`);
    }
  }

  const okCount = outcomes.filter((o) => o.ok).length;
  const fails = outcomes.filter((o) => !o.ok);
  const dist: Record<string, number> = {};
  outcomes.filter((o) => o.ok).forEach((o) => { const c = o.computed || "?"; dist[c] = (dist[c] || 0) + 1; });

  console.log("\n" + "═".repeat(72));
  console.log("RÉCAPITULATIF — seg_B");
  console.log("═".repeat(72));
  console.log(`Durée                    : ${Math.round((Date.now() - start) / 1000)}s`);
  console.log(`Enrichis presort:B       : ${okCount}/${batch.length}` + (fails.length ? ` (${fails.length} échecs)` : ""));
  console.log(`Répartition computed_seg : ` + Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
  console.log(`Enrôlements              : 0 (seg_B — persona jamais en live)`);
  if (fails.length) {
    console.log("Échecs :");
    fails.forEach((o) => console.log(`   - ${o.name} : ${o.error}`));
  }
}

main().catch((e) => {
  console.error("\n[FATAL]", e instanceof Error ? e.stack : e);
  process.exit(1);
});
