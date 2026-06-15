import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fetchAll(table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  const leads = await fetchAll("leads", "first_name, last_name, company, title, score, stage, status, enrichment_data");
  const scored = leads.filter((l) => {
    const sd = l.enrichment_data?.scoring_detail;
    return l.stage !== "withdrawn" && sd != null && typeof sd === "object";
  });

  // Quels champs apparaissent dans scoring_detail ?
  const keyCount = new Map<string, number>();
  let catNull = 0;
  let catPresent = 0;
  for (const l of scored) {
    const sd = l.enrichment_data.scoring_detail;
    for (const k of Object.keys(sd)) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    if (sd.categorie == null) catNull++;
    else catPresent++;
  }
  console.log("Champs présents dans scoring_detail (sur " + scored.length + " leads) :");
  [...keyCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log(`  ${k.padEnd(22)} ${c}`));
  console.log(`\ncategorie null: ${catNull}   categorie présente: ${catPresent}`);

  // catégorie "devrait être" d'après le score et les seuils du prompt
  function expectedCat(s: number) {
    if (s >= 70) return "HOT";
    if (s >= 45) return "WARM";
    if (s >= 25) return "COLD";
    return "NO_GO";
  }
  const expDist = new Map<string, number>();
  for (const l of scored) {
    const c = expectedCat(l.score ?? 0);
    expDist.set(c, (expDist.get(c) ?? 0) + 1);
  }
  console.log("\nCatégorie ATTENDUE selon score + seuils du prompt :");
  ["HOT", "WARM", "COLD", "NO_GO"].forEach((c) => console.log(`  ${c.padEnd(6)} ${expDist.get(c) ?? 0}`));

  // status réel des leads (le champ que la fiche affiche)
  const statusDist = new Map<string, number>();
  for (const l of scored) statusDist.set(l.status, (statusDist.get(l.status) ?? 0) + 1);
  console.log("\nstatus réel (colonne leads.status) :");
  [...statusDist.entries()].forEach(([k, v]) => console.log(`  ${String(k).padEnd(8)} ${v}`));

  // 3 exemples : score le plus haut, médian, le plus bas — avec justification
  const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const samples = [
    ["score MAX", sorted[0]],
    ["score MÉDIAN", sorted[Math.floor(sorted.length / 2)]],
    ["score MIN", sorted[sorted.length - 1]],
  ] as const;
  console.log("\n— Échantillons par score —");
  for (const [label, l] of samples) {
    const sd = l.enrichment_data.scoring_detail;
    console.log(`\n[${label}] ${l.first_name} ${l.last_name} — ${l.title ?? "?"} @ ${l.company ?? "?"}`);
    console.log(`  score=${l.score} status=${l.status} stage=${l.stage}`);
    console.log(`  categorie=${sd.categorie ?? "(null)"} segment=${sd.segment_icp ?? "?"} confidence=${sd.confidence ?? "?"}`);
    console.log(`  fit=${sd.fit_score ?? "?"} intent=${sd.intent_score ?? "?"} timing=${sd.timing_score ?? "?"}`);
    console.log(`  justification: ${sd.justification ?? "(null)"}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
