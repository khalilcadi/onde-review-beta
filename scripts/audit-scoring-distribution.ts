/**
 * AUDIT ONLY — distribution des scores sur les leads actifs.
 * Lecture seule. Ne modifie RIEN.
 *
 * Le client JS Supabase ne fait pas de SQL brut, et `categorie` / `segment_icp`
 * ne sont PAS des colonnes : ils vivent dans enrichment_data->'scoring_detail'.
 * Ce script réplique en JS la requête d'agrégation + sélectionne 3 leads
 * représentatifs (HOT / WARM / COLD ou NO_GO).
 *
 * Lancer : npx tsx scripts/audit-scoring-distribution.ts
 */

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
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function hd(t: string) {
  console.log("\n" + "═".repeat(78) + `\n${t}\n` + "═".repeat(78));
}

async function main() {
  const leads = await fetchAll(
    "leads",
    "id, first_name, last_name, company, title, score, stage, status, enrichment_data"
  );

  // Filtre : stage NOT IN ('withdrawn') AND scoring_detail IS NOT NULL
  const scored = leads.filter((l) => {
    if (l.stage === "withdrawn") return false;
    const sd = l.enrichment_data?.scoring_detail;
    return sd != null && typeof sd === "object";
  });

  hd("4. DISTRIBUTION DES SCORES (catégorie × segment_icp)");
  console.log(
    `Leads totaux: ${leads.length}  |  notés & actifs (scoring_detail non null, stage != withdrawn): ${scored.length}\n`
  );

  type Agg = { total: number; sum: number; min: number; max: number };
  const groups = new Map<string, Agg>();
  for (const l of scored) {
    const sd = l.enrichment_data.scoring_detail;
    const cat = sd.categorie ?? "(null)";
    const seg = sd.segment_icp ?? "(null)";
    const k = `${cat}||${seg}`;
    const score = typeof l.score === "number" ? l.score : 0;
    const e = groups.get(k) ?? { total: 0, sum: 0, min: Infinity, max: -Infinity };
    e.total++;
    e.sum += score;
    e.min = Math.min(e.min, score);
    e.max = Math.max(e.max, score);
    groups.set(k, e);
  }

  console.log(
    "categorie".padEnd(12) +
      "segment".padEnd(12) +
      "total".padStart(7) +
      "avg".padStart(9) +
      "min".padStart(6) +
      "max".padStart(6)
  );
  console.log("-".repeat(52));
  [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([k, v]) => {
      const [cat, seg] = k.split("||");
      console.log(
        cat.padEnd(12) +
          seg.padEnd(12) +
          String(v.total).padStart(7) +
          (v.sum / v.total).toFixed(1).padStart(9) +
          String(v.min).padStart(6) +
          String(v.max).padStart(6)
      );
    });

  // ── 5. Trois leads représentatifs ────────────────────────────────────────
  hd("5. ÉCHANTILLON — 1 HOT, 1 WARM, 1 COLD/NO_GO");

  function pick(predicate: (cat: string) => boolean) {
    return scored
      .filter((l) => predicate(String(l.enrichment_data.scoring_detail.categorie ?? "")))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const hot = pick((c) => c === "HOT")[0];
  const warm = pick((c) => c === "WARM")[0];
  // COLD trié par score décroissant ; NO_GO trié croissant (le plus bas)
  const cold = pick((c) => c === "COLD")[0];
  const nogo = pick((c) => c === "NO_GO").sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const coldOrNogo = cold ?? nogo;

  function show(label: string, l: any) {
    if (!l) {
      console.log(`\n[${label}] — aucun lead dans cette catégorie.`);
      return;
    }
    const sd = l.enrichment_data.scoring_detail;
    console.log(`\n[${label}]`);
    console.log(`  Nom        : ${l.first_name ?? ""} ${l.last_name ?? ""}`.trimEnd());
    console.log(`  Entreprise : ${l.company ?? "—"}`);
    console.log(`  Titre      : ${l.title ?? "—"}`);
    console.log(`  Score      : ${l.score}   catégorie=${sd.categorie ?? "—"}   segment=${sd.segment_icp ?? "—"}   confidence=${sd.confidence ?? "—"}`);
    console.log(`  Detail     : fit=${sd.fit_score ?? "?"} intent=${sd.intent_score ?? "?"} timing=${sd.timing_score ?? "?"}`);
    console.log(`  Justif.    : ${sd.justification ?? "—"}`);
  }

  show("HOT", hot);
  show("WARM", warm);
  show(cold ? "COLD" : "NO_GO", coldOrNogo);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
