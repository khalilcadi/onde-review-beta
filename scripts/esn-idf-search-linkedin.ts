/**
 * STEP 2 & 3 — Resolve LinkedIn profiles for the filtered ESN prospects and
 * emit the final CSV.
 *
 * Reads:  scripts/esn-idf-candidates.json   (output of esn-idf-filter.ts)
 * Writes: scripts/esn-idf-top100-prospects.csv   (found leads only)
 *         scripts/esn-idf-not-found.txt          (unresolved leads)
 *
 * Search uses Unipile LinkedIn CLASSIC people search (POST /linkedin/search).
 * NOTE: the originally-specified GET /users/search?q=... endpoint is broken —
 * it ignores `q` and always returns the same profile (public_identifier
 * "search"). The classic people search returns proper matches whose `id`
 * field IS the provider_id (ACoAAA…), used to build the LinkedIn URL.
 *
 * Resumable: already-resolved (CSV) and already-missed (txt) names are skipped.
 * 10s delay between searches (anti-detection).
 *
 * Usage: npx tsx scripts/esn-idf-search-linkedin.ts [--account WHCR7VvRSo6B6z-Lewi4sg]
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

const ACCOUNT_ID =
  (process.argv.includes("--account")
    ? process.argv[process.argv.indexOf("--account") + 1]
    : undefined) || "WHCR7VvRSo6B6z-Lewi4sg";

const DSN = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
const API_KEY = process.env.UNIPILE_API_KEY;

const CANDIDATES_PATH = resolve(process.cwd(), "scripts/esn-idf-candidates.json");
const CSV_PATH = resolve(process.cwd(), "scripts/esn-idf-top100-prospects.csv");
const NOTFOUND_PATH = resolve(process.cwd(), "scripts/esn-idf-not-found.txt");

const CSV_HEADER =
  "first_name,last_name,title,company,linkedin_url,siren,effectif,chiffre_affaires";

const SEARCH_DELAY_MS = 10_000;

const LIMIT = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10)
  : Infinity;

interface Candidate {
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  siren: string;
  effectif: string;
  chiffre_affaires: string;
}

interface SearchItem {
  id?: string; // provider_id (ACoAAA…)
  name?: string;
  first_name?: string;
  last_name?: string;
  public_identifier?: string;
  headline?: string;
  location?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstToken(s: string): string {
  return s.trim().split(/[\s-]+/)[0] || s;
}

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function nameKey(c: { first_name: string; last_name: string }): string {
  // First prénom token + last name — consistent with the filter's dedup so
  // resume keys align whether the prénom is stored full or abbreviated.
  return `${norm(firstToken(c.first_name))}|${norm(c.last_name)}`;
}

// ---------------------------------------------------------------------------
// Unipile classic people search
// ---------------------------------------------------------------------------

async function classicSearch(keywords: string): Promise<SearchItem[]> {
  const url = new URL(`https://${DSN}/api/v1/linkedin/search`);
  url.searchParams.set("account_id", ACCOUNT_ID);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY!,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ api: "classic", category: "people", keywords }),
    });

    if (res.status === 429 || res.status >= 500) {
      const wait = 15_000 * (attempt + 1);
      console.warn(`   ⚠ ${res.status} — backing off ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      console.warn(`   ✗ search failed ${res.status}: ${text.slice(0, 200)}`);
      return [];
    }
    try {
      const j = JSON.parse(text) as { items?: SearchItem[] };
      return j.items || [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Pick the first result whose name plausibly matches the candidate.
 * Requires the last name to appear; first name match boosts confidence.
 */
function pickRelevant(
  items: SearchItem[],
  cand: Candidate,
  requireBoth: boolean
): SearchItem | null {
  const candLast = norm(cand.last_name);
  const candFirst = norm(firstToken(cand.first_name));

  for (const item of items) {
    const fullName = norm(
      item.name ||
        `${item.first_name || ""} ${item.last_name || ""}`.trim()
    );
    if (!fullName) continue;

    const lastOk = candLast.length >= 3 && fullName.includes(candLast);
    const firstOk = candFirst.length >= 2 && fullName.includes(candFirst);

    if (requireBoth) {
      // Name-only query: demand both first AND last name to avoid false positives.
      if (lastOk && firstOk) return item;
    } else {
      // Company-scoped query: last name present is enough (company narrows it).
      if (lastOk) return item;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const candidates: Candidate[] = JSON.parse(
    readFileSync(CANDIDATES_PATH, "utf8")
  );

  // ---- Resume: collect already-processed name keys ----
  const done = new Set<string>();

  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, CSV_HEADER + "\n", "utf8");
  } else {
    const lines = readFileSync(CSV_PATH, "utf8").split("\n").slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;
      // crude parse: first two columns are first_name,last_name (may be quoted)
      const m = line.match(/^("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),/);
      if (m) {
        const fn = m[1].replace(/^"|"$/g, "").replace(/""/g, '"');
        const ln = m[2].replace(/^"|"$/g, "").replace(/""/g, '"');
        done.add(nameKey({ first_name: fn, last_name: ln }));
      }
    }
  }
  if (existsSync(NOTFOUND_PATH)) {
    const lines = readFileSync(NOTFOUND_PATH, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/KEY=([^\s|]*\|[^\s|]*)/);
      if (m) done.add(m[1]);
    }
  }

  console.log("=== ESN IDF — LinkedIn resolution ===");
  console.log(`Account:     ${ACCOUNT_ID}`);
  console.log(`Candidates:  ${candidates.length}`);
  console.log(`Already done: ${done.size}`);
  console.log("");

  let found = 0;
  let notFound = 0;
  let processed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const key = nameKey(c);
    if (done.has(key)) continue;
    if (processed >= LIMIT) break;

    processed++;
    if (processed > 1) await sleep(SEARCH_DELAY_MS);

    process.stdout.write(
      `[${i + 1}/${candidates.length}] ${c.first_name} ${c.last_name} @ ${c.company} … `
    );

    // Pass 1: name + company (last-name match accepted, company narrows it).
    let match: SearchItem | null = null;
    try {
      const items = await classicSearch(
        `${firstToken(c.first_name)} ${c.last_name} ${c.company}`
      );
      match = pickRelevant(items, c, false);
    } catch (err) {
      console.log(`error: ${(err as Error).message}`);
    }

    // Pass 2 (fallback): name only, requiring both first AND last name.
    if (!match) {
      await sleep(SEARCH_DELAY_MS);
      try {
        const items2 = await classicSearch(
          `${firstToken(c.first_name)} ${c.last_name}`
        );
        match = pickRelevant(items2, c, true);
      } catch (err) {
        console.log(`error: ${(err as Error).message}`);
      }
    }

    if (match && match.id) {
      const providerId = match.id;
      const linkedinUrl = `https://www.linkedin.com/in/${providerId}`;
      const rowCols = [
        c.first_name,
        c.last_name,
        c.title,
        c.company,
        linkedinUrl,
        c.siren,
        c.effectif,
        c.chiffre_affaires,
      ].map(csvField);
      appendFileSync(CSV_PATH, rowCols.join(",") + "\n", "utf8");
      found++;
      console.log(`✓ ${match.name || match.public_identifier} (${providerId})`);
    } else {
      const reason = "no relevant match";
      appendFileSync(
        NOTFOUND_PATH,
        `${c.first_name} ${c.last_name} | ${c.title} | ${c.company} | siren=${c.siren} | ${reason} | KEY=${key}\n`,
        "utf8"
      );
      notFound++;
      console.log(`✗ ${reason}`);
    }
  }

  console.log("");
  console.log("=== DONE ===");
  console.log(`Processed this run: ${processed}`);
  console.log(`Found:    ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`CSV:       ${CSV_PATH}`);
  console.log(`Not-found: ${NOTFOUND_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
