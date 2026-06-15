/**
 * STEP 1 — Filter & score the best ESN from `esn_idf_enriched.csv` (Pappers).
 *
 * ICP criteria:
 *   - Department in Île-de-France (75,77,78,91,92,93,94,95)
 *   - Effectif tranche overlapping [5,200] (3-5 .. 100-199)
 *   - At least one dirigeant "personne physique" with a first name
 *
 * Scoring priority (desc):
 *   a. number of physical dirigeants with a first name (more entry points)
 *   b. effectif known (always true post-filter, kept for completeness)
 *   c. chiffre d'affaires known
 *
 * Companies are expanded to ONE ROW PER DIRIGEANT (physical, with first name),
 * deduplicated on first+last name, until ~TARGET individual prospects.
 *
 * Output: scripts/esn-idf-candidates.json
 *
 * Usage: npx tsx scripts/esn-idf-filter.ts [--target 100]
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IDF_DEPTS = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);

// Effectif tranches overlapping [5, 200]. 1-2 too small, 200-249 too large.
const EFFECTIF_KEEP = new Set([
  "3-5",
  "6-9",
  "10-19",
  "20-49",
  "50-99",
  "100-199",
]);

const CSV_PATH = resolve(process.cwd(), "esn_idf_enriched.csv");
const OUT_PATH = resolve(process.cwd(), "scripts/esn-idf-candidates.json");

function parseTarget(): number {
  const i = process.argv.indexOf("--target");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100;
}

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV parser (handles quotes, embedded ; and newlines)
// ---------------------------------------------------------------------------

function parseCsv(text: string, delimiter = ";"): string[][] {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(v: string | undefined): string {
  return (v || "").trim();
}

function titleCase(v: string): string {
  return v
    .toLowerCase()
    .split(/([\s'-])/)
    .map((part) => (/[\s'-]/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function normName(first: string, last: string): string {
  // Dedup on FIRST prénom token + last name: Pappers lists the same person
  // under different full-prénom forms (e.g. "Philippe" vs "Philippe Gilbert
  // Jean-Pierre"). Collapsing to the first token catches those duplicates.
  const firstTok = first.trim().split(/[\s-]+/)[0] || first;
  return `${firstTok} ${last}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Dirigeant {
  first_name: string;
  last_name: string;
  title: string;
}

interface Prospect {
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  siren: string;
  effectif: string;
  chiffre_affaires: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const target = parseTarget();
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(raw);
  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);

  const I = {
    siren: idx("siren"),
    nom: idx("nom_complet"),
    effectif: idx("effectif_intitule"),
    ca: idx("chiffre_affaires"),
    dept: idx("departement"),
    d1n: idx("dirigeant_1_nom"),
    d1p: idx("dirigeant_1_prenom"),
    d1f: idx("dirigeant_1_fonction"),
    d1t: idx("dirigeant_1_type"),
    d2n: idx("dirigeant_2_nom"),
    d2p: idx("dirigeant_2_prenom"),
    d2f: idx("dirigeant_2_fonction"),
    d2t: idx("dirigeant_2_type"),
    d3n: idx("dirigeant_3_nom"),
    d3p: idx("dirigeant_3_prenom"),
    d3f: idx("dirigeant_3_fonction"),
    d3t: idx("dirigeant_3_type"),
  };

  interface Company {
    siren: string;
    company: string;
    effectif: string;
    ca: string;
    dirigeants: Dirigeant[];
    score: number;
  }

  const companies: Company[] = [];

  let totalRows = 0;
  let keptDept = 0;
  let keptEffectif = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < header.length - 2) continue; // malformed/short row
    totalRows++;

    const dept = clean(row[I.dept]);
    if (!IDF_DEPTS.has(dept)) continue;
    keptDept++;

    const effectif = clean(row[I.effectif]);
    if (!EFFECTIF_KEEP.has(effectif)) continue;
    keptEffectif++;

    // CA = 0 (or non-numeric) means undisclosed -> treat as unknown
    const caRaw = clean(row[I.ca]);
    const caNum = parseInt(caRaw, 10);
    const ca = Number.isFinite(caNum) && caNum > 0 ? String(caNum) : "";

    // Collect physical dirigeants with a first name
    const dirigeants: Dirigeant[] = [];
    const triples: Array<[number, number, number, number]> = [
      [I.d1n, I.d1p, I.d1f, I.d1t],
      [I.d2n, I.d2p, I.d2f, I.d2t],
      [I.d3n, I.d3p, I.d3f, I.d3t],
    ];
    for (const [ni, pi, fi, ti] of triples) {
      const type = clean(row[ti]).toLowerCase();
      const prenom = clean(row[pi]);
      const nom = clean(row[ni]);
      if (type !== "personne physique") continue;
      if (!prenom || !nom) continue;
      dirigeants.push({
        first_name: titleCase(prenom),
        last_name: titleCase(nom),
        title: clean(row[fi]) || "Dirigeant",
      });
    }

    if (dirigeants.length === 0) continue;

    // Scoring: a (count) >> b (effectif known, always 1 here) >> c (CA known)
    const score =
      dirigeants.length * 1000 + 1 * 10 + (ca ? 1 : 0);

    companies.push({
      siren: clean(row[I.siren]),
      company: clean(row[I.nom]),
      effectif,
      ca,
      dirigeants,
      score,
    });
  }

  // Sort companies by score desc (then more dirigeants, then CA known, then name)
  companies.sort(
    (a, b) =>
      b.score - a.score ||
      b.dirigeants.length - a.dirigeants.length ||
      (b.ca ? 1 : 0) - (a.ca ? 1 : 0) ||
      a.company.localeCompare(b.company)
  );

  // Expand to individual prospects, dedup on name, until target reached
  const seen = new Set<string>();
  const prospects: Prospect[] = [];

  for (const c of companies) {
    if (prospects.length >= target) break;
    for (const d of c.dirigeants) {
      const key = normName(d.first_name, d.last_name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      prospects.push({
        first_name: d.first_name,
        last_name: d.last_name,
        title: d.title,
        company: c.company,
        siren: c.siren,
        effectif: c.effectif,
        chiffre_affaires: c.ca,
      });
      if (prospects.length >= target) break;
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(prospects, null, 2), "utf8");

  // Stats
  const byDirCount = new Map<number, number>();
  for (const c of companies) {
    byDirCount.set(c.dirigeants.length, (byDirCount.get(c.dirigeants.length) || 0) + 1);
  }

  console.log("=== ESN IDF — Filter & Score ===");
  console.log(`Total data rows:           ${totalRows}`);
  console.log(`  in IDF depts:            ${keptDept}`);
  console.log(`  + effectif 5-200:        ${keptEffectif}`);
  console.log(`  + >=1 physical dirigeant: ${companies.length} companies`);
  console.log(`Companies by #dirigeants:`);
  for (const n of [...byDirCount.keys()].sort((a, b) => b - a)) {
    console.log(`   ${n} dirigeant(s): ${byDirCount.get(n)} companies`);
  }
  console.log(`\nProspects selected (1/dirigeant, dedup): ${prospects.length}`);
  console.log(`Companies used:            ${new Set(prospects.map((p) => p.siren)).size}`);
  console.log(`Prospects with CA known:   ${prospects.filter((p) => p.chiffre_affaires).length}`);
  console.log(`\nWritten: ${OUT_PATH}`);
}

main();
