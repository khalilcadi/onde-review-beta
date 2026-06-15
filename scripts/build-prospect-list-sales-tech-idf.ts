/**
 * Build a prospect list of Sales leaders in Tech / SaaS based in Île-de-France
 * using Unipile LinkedIn CLASSIC search (no Sales Navigator).
 *
 * Inserts deduplicated leads into `leads` and creates a dedicated `lists` row
 * (+ list_leads junction). Anti-doublon on leads.linkedin_url (pool partagé).
 *
 * Usage:
 *   npx tsx scripts/build-prospect-list-sales-tech-idf.ts --owner <uuid> \
 *     [--limit-per-keyword 100] [--dry-run]
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createServiceClient } from "@/lib/supabase/service";
import { getUnipileClient, UnipileApiError } from "@/lib/unipile/client";

// -----------------------------------------------------------------------------
// CLI args
// -----------------------------------------------------------------------------

interface CliArgs {
  ownerId: string;
  limitPerKeyword: number;
  dryRun: boolean;
  listId?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let ownerId: string | undefined;
  let limitPerKeyword = 100;
  let dryRun = false;
  let listId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--owner") {
      ownerId = argv[++i];
    } else if (arg === "--limit-per-keyword") {
      limitPerKeyword = parseInt(argv[++i], 10);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--list-id") {
      listId = argv[++i];
    }
  }

  if (!ownerId) {
    console.error("Missing --owner <userId>. Aborting.");
    process.exit(1);
  }
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) {
    console.error(`--owner must be a UUID, got: ${ownerId}`);
    process.exit(1);
  }
  if (!Number.isFinite(limitPerKeyword) || limitPerKeyword <= 0) {
    console.error("--limit-per-keyword must be a positive integer.");
    process.exit(1);
  }

  return { ownerId, limitPerKeyword, dryRun, listId };
}

// -----------------------------------------------------------------------------
// Target persona config
// -----------------------------------------------------------------------------

const TITLE_TERMS: string[] = [
  "Directrice Commerciale",
  "Directeur Commercial",
  "Head of Sales",
  "VP Sales",
  "Chief Sales Officer",
];

// LinkedIn classic search rejects queries > ~100 chars with content_too_large.
// We split into <title> × <industry-segment> passes — each query stays short.
const INDUSTRY_SEGMENTS: Array<{ label: string; boolean: string }> = [
  { label: "SaaS", boolean: "(SaaS OR software OR logiciel)" },
  { label: "ESN", boolean: '(ESN OR "services numériques")' },
  { label: "Conseil", boolean: '("cabinet de conseil" OR consulting)' },
];

const KEYWORDS_PASSES: Array<{ label: string; query: string }> =
  TITLE_TERMS.flatMap((title) =>
    INDUSTRY_SEGMENTS.map((seg) => ({
      label: `${title} × ${seg.label}`,
      query: `"${title}" AND ${seg.boolean}`,
    }))
  );

const TITLE_MATCH_REGEX =
  /(directrice|directeur)\s+commercial|head\s+of\s+sales|vp\s+sales|vice[-\s]?president\s+sales|chief\s+sales\s+officer|\bcso\b/i;

const TECH_INDUSTRY_KEYWORDS = [
  "computer software",
  "software",
  "saas",
  "information technology",
  "it services",
  "internet",
  "tech",
  "logiciel",
  "éditeur",
  "editeur",
  "plateforme",
];

const IDF_LOCATION_KEYWORDS = [
  "île-de-france",
  "ile-de-france",
  "paris",
  "boulogne",
  "neuilly",
  "levallois",
  "issy-les-moulineaux",
  "saint-denis",
  "nanterre",
  "courbevoie",
  "la défense",
  "la defense",
  "puteaux",
  "montreuil",
  "cergy",
  "versailles",
  "saint-quentin",
  "evry",
  "créteil",
  "creteil",
  "bobigny",
  "rueil-malmaison",
];

const IDF_POSTAL_PREFIXES = ["75", "77", "78", "91", "92", "93", "94", "95"];

// -----------------------------------------------------------------------------
// Unipile search types (extended — the client's typed input is too narrow)
// -----------------------------------------------------------------------------

interface ClassicPeopleSearchBody {
  api: "classic";
  category: "people";
  keywords: string;
  cursor?: string;
  location?: string[];
  industry?: string[];
  profile_language?: string[];
}

interface ClassicPeopleSearchItem {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  profile_url?: string;
  public_identifier?: string;
  location?: string;
  current_positions?: Array<{
    company?: string;
    role?: string;
    industry?: string;
  }>;
  network_distance?: string;
  [k: string]: unknown;
}

interface ClassicSearchResponse {
  items?: ClassicPeopleSearchItem[];
  cursor?: string;
  paging?: { total_count?: number; start?: number; page_count?: number };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function normalizeLinkedInUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return null;
  const slug = match[1].replace(/\/$/, "");
  return `https://www.linkedin.com/in/${slug}`;
}

function splitName(item: ClassicPeopleSearchItem): {
  first_name: string | null;
  last_name: string | null;
} {
  if (item.first_name || item.last_name) {
    return {
      first_name: item.first_name?.trim() || null,
      last_name: item.last_name?.trim() || null,
    };
  }
  const full = (item.name || "").trim();
  if (!full) return { first_name: null, last_name: null };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

function extractCompany(item: ClassicPeopleSearchItem): string | null {
  const pos = item.current_positions?.[0];
  if (pos?.company) return pos.company;
  const headline = item.headline || "";
  const atMatch = headline.match(/\b(?:at|chez|@)\s+(.+?)(?:\s*[|\-•]|$)/i);
  return atMatch ? atMatch[1].trim() : null;
}

function extractTitle(item: ClassicPeopleSearchItem): string | null {
  const pos = item.current_positions?.[0];
  if (pos?.role) return pos.role;
  const headline = item.headline || "";
  const beforeAt = headline.split(/\b(?:at|chez|@)\b/i)[0];
  return beforeAt ? beforeAt.trim() : headline || null;
}

function looksLikeOpenToWork(item: ClassicPeopleSearchItem): boolean {
  const h = (item.headline || "").toLowerCase();
  return (
    h.includes("open to work") ||
    h.includes("à la recherche") ||
    h.includes("a la recherche") ||
    h.includes("en recherche d'emploi") ||
    h.includes("seeking new opportunit")
  );
}

function matchesIdf(item: ClassicPeopleSearchItem): boolean {
  const loc = (item.location || "").toLowerCase();
  if (!loc) return false;
  if (IDF_LOCATION_KEYWORDS.some((k) => loc.includes(k))) return true;
  for (const prefix of IDF_POSTAL_PREFIXES) {
    if (loc.includes(`(${prefix})`) || loc.includes(` ${prefix} `)) return true;
  }
  return false;
}

function matchesTech(item: ClassicPeopleSearchItem): boolean {
  const haystack = [
    item.headline || "",
    item.current_positions?.[0]?.industry || "",
    item.current_positions?.[0]?.company || "",
  ]
    .join(" ")
    .toLowerCase();
  return TECH_INDUSTRY_KEYWORDS.some((k) => haystack.includes(k));
}

function matchesTitle(title: string | null): boolean {
  if (!title) return false;
  return TITLE_MATCH_REGEX.test(title);
}

// -----------------------------------------------------------------------------
// Try to resolve LinkedIn IDs for location (IDF) and industries (tech)
// via /linkedin/search/parameters. Best-effort: classic search may not
// accept these IDs everywhere, so failures are non-fatal.
// -----------------------------------------------------------------------------

interface SearchParametersOption {
  id: string;
  title?: string;
  name?: string;
}

async function tryResolveLocationAndIndustryIds(
  accountId: string
): Promise<{ locationIds: string[]; industryIds: string[] }> {
  const client = getUnipileClient();
  const result: { locationIds: string[]; industryIds: string[] } = {
    locationIds: [],
    industryIds: [],
  };

  try {
    const params = (await client.linkedinSearchParameters(accountId)) as
      | {
          location?: SearchParametersOption[];
          industry?: SearchParametersOption[];
          locations?: SearchParametersOption[];
          industries?: SearchParametersOption[];
        }
      | undefined;

    const locations =
      params?.location || params?.locations || ([] as SearchParametersOption[]);
    const industries =
      params?.industry ||
      params?.industries ||
      ([] as SearchParametersOption[]);

    for (const opt of locations) {
      const label = (opt.title || opt.name || "").toLowerCase();
      if (
        label.includes("île-de-france") ||
        label.includes("ile-de-france") ||
        label === "paris" ||
        label.includes("paris area") ||
        label.includes("région parisienne") ||
        label.includes("region parisienne")
      ) {
        if (opt.id) result.locationIds.push(opt.id);
      }
    }

    for (const opt of industries) {
      const label = (opt.title || opt.name || "").toLowerCase();
      if (
        label.includes("computer software") ||
        label.includes("software") ||
        label.includes("information technology") ||
        label.includes("it services") ||
        label.includes("internet") ||
        label.includes("saas")
      ) {
        if (opt.id) result.industryIds.push(opt.id);
      }
    }
  } catch (err) {
    console.warn(
      `[searchParameters] could not resolve IDs (${(err as Error).message}). Will rely on keywords + post-filtering.`
    );
  }

  return result;
}

// -----------------------------------------------------------------------------
// Raw classic people search — cursor pagination
// -----------------------------------------------------------------------------

async function classicPeopleSearchRaw(
  accountId: string,
  body: ClassicPeopleSearchBody
): Promise<ClassicSearchResponse> {
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
  const url = new URL(`https://${dsn}/api/v1/linkedin/search`);
  url.searchParams.set("account_id", accountId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.UNIPILE_API_KEY!,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new UnipileApiError(
      res.status,
      `LinkedIn search failed (${res.status})`,
      text.slice(0, 500)
    );
  }
  return (json as ClassicSearchResponse) ?? {};
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

interface PassStats {
  keyword: string;
  fetched: number;
  kept: number;
  newLeads: number;
  duplicates: number;
}

async function main() {
  const args = parseArgs();

  if (!process.env.UNIPILE_API_KEY) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }
  if (
    !args.dryRun &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    console.error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Use --dry-run to skip DB writes."
    );
    process.exit(1);
  }

  console.log("=== Build prospect list — Sales / Tech / IDF ===\n");
  console.log(`Owner:          ${args.ownerId}`);
  console.log(`Limit/keyword:  ${args.limitPerKeyword}`);
  console.log(`Dry run:        ${args.dryRun}\n`);

  // ---- 1. Detect LinkedIn account ----
  // Unipile /accounts returns { type: "LINKEDIN", sources: [{ status: "OK" }] }
  // — NOT `provider` / top-level `status`. Prefer an explicit --account-id override.
  const accountOverride = process.argv.includes("--account-id")
    ? process.argv[process.argv.indexOf("--account-id") + 1]
    : undefined;

  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";
  const rawAccountsRes = await fetch(`https://${dsn}/api/v1/accounts`, {
    headers: {
      "X-API-KEY": process.env.UNIPILE_API_KEY!,
      Accept: "application/json",
    },
  });
  if (!rawAccountsRes.ok) {
    console.error(
      `Failed to list Unipile accounts: ${rawAccountsRes.status} ${await rawAccountsRes.text()}`
    );
    process.exit(1);
  }
  const accountsRes = (await rawAccountsRes.json()) as {
    items: Array<{
      id: string;
      name?: string;
      type?: string;
      provider?: string;
      sources?: Array<{ id: string; status: string }>;
    }>;
  };
  const accounts = accountsRes.items || [];

  const isLinkedIn = (a: { type?: string; provider?: string }) =>
    a.type === "LINKEDIN" || a.provider === "LINKEDIN";
  const sourceStatus = (a: { sources?: Array<{ status: string }> }) =>
    a.sources?.[0]?.status || "?";

  const linkedinAcc = accountOverride
    ? accounts.find((a) => a.id === accountOverride)
    : accounts.find((a) => isLinkedIn(a) && sourceStatus(a) === "OK") ||
      accounts.find(isLinkedIn) ||
      accounts[0];

  if (!linkedinAcc) {
    console.error("No LinkedIn account found on this Unipile workspace.");
    process.exit(1);
  }
  console.log(
    `LinkedIn account: ${linkedinAcc.id} (${linkedinAcc.name || "?"}) — source status: ${sourceStatus(linkedinAcc)}\n`
  );

  // ---- 2. Resolve location/industry IDs (best-effort) ----
  const { locationIds, industryIds } = await tryResolveLocationAndIndustryIds(
    linkedinAcc.id
  );
  console.log(
    `Resolved IDs — locations: [${locationIds.join(", ") || "none"}], industries: [${industryIds.join(", ") || "none"}]\n`
  );

  // ---- 3. Supabase setup ----
  const supabase = args.dryRun ? null : createServiceClient();

  // Pre-load existing linkedin_urls (pool partagé)
  const existingUrls = new Set<string>();
  if (supabase) {
    const { data, error } = await supabase
      .from("leads")
      .select("linkedin_url");
    if (error) {
      console.error("Failed to load existing leads:", error.message);
      process.exit(1);
    }
    for (const row of data || []) {
      if (row.linkedin_url) existingUrls.add(row.linkedin_url);
    }
    console.log(`Existing leads in DB: ${existingUrls.size}\n`);
  }

  // ---- 4. Create the destination list ----
  const today = new Date().toISOString().slice(0, 10);
  const listName = `Sales Directors – Tech IDF – ${today}`;
  let listId: string | null = null;

  if (supabase) {
    if (args.listId) {
      const { data: existing, error } = await supabase
        .from("lists")
        .select("id, name")
        .eq("id", args.listId)
        .single();
      if (error || !existing) {
        console.error(`List ${args.listId} not found: ${error?.message}`);
        process.exit(1);
      }
      listId = existing.id;
      console.log(`Appending to existing list: "${existing.name}" (id=${listId})\n`);
    } else {
      const { data: list, error: listErr } = await supabase
        .from("lists")
        .insert({ user_id: args.ownerId, name: listName })
        .select("id")
        .single();
      if (listErr) {
        console.error("Failed to create list:", listErr.message);
        process.exit(1);
      }
      listId = list.id;
      console.log(`Created list: "${listName}" (id=${listId})\n`);
    }
  } else {
    console.log(`[dry-run] Would create list: "${listName}"\n`);
  }

  // ---- 5. Run searches ----
  const allStats: PassStats[] = [];
  const collected = new Map<string, ClassicPeopleSearchItem>();
  const dryRunCounted = new Set<string>();

  for (let passIdx = 0; passIdx < KEYWORDS_PASSES.length; passIdx++) {
    const pass = KEYWORDS_PASSES[passIdx];
    if (passIdx > 0) {
      const interPassDelay = randomBetween(5000, 10000);
      await sleep(interPassDelay);
    }
    console.log(`\n--- Pass: ${pass.label} ---`);
    console.log(`   query: ${pass.query}`);
    const stats: PassStats = {
      keyword: pass.label,
      fetched: 0,
      kept: 0,
      newLeads: 0,
      duplicates: 0,
    };

    const body: ClassicPeopleSearchBody = {
      api: "classic",
      category: "people",
      keywords: pass.query,
    };
    if (locationIds.length > 0) body.location = locationIds;
    if (industryIds.length > 0) body.industry = industryIds;
    body.profile_language = ["fr"];

    let cursor: string | undefined;
    let page = 0;

    while (stats.fetched < args.limitPerKeyword) {
      page++;
      if (cursor) body.cursor = cursor;
      else delete body.cursor;

      let response: ClassicSearchResponse;
      try {
        response = await classicPeopleSearchRaw(linkedinAcc.id, body);
      } catch (err) {
        const e = err as UnipileApiError;
        console.warn(
          `   page ${page} failed: ${e.status} ${e.message} ${e.detail || ""}`
        );
        break;
      }

      const items = response.items || [];
      if (items.length === 0) break;

      stats.fetched += items.length;

      for (const item of items) {
        const url = normalizeLinkedInUrl(item.profile_url);
        if (!url) continue;

        const title = extractTitle(item);
        if (!matchesTitle(title)) continue;
        if (!matchesIdf(item)) continue;
        // NOTE: Classic LinkedIn search response does NOT include industry data
        // (only name + headline + vague location). Tech filtering cannot be
        // applied reliably at this stage — leads are tagged `industry-unverified`
        // and should be enriched via unipile.linkedinCompany() before campaign.
        if (looksLikeOpenToWork(item)) continue;

        const { first_name, last_name } = splitName(item);
        if (!first_name && !last_name) continue;

        if (!collected.has(url)) {
          collected.set(url, item);
          stats.kept++;
        }
      }

      cursor = response.cursor;
      if (!cursor) break;
      if (stats.fetched >= args.limitPerKeyword) break;

      await sleep(randomBetween(2000, 4000));
    }

    // Insert leads for this pass
    if (supabase) {
      for (const [url, item] of collected.entries()) {
        if (existingUrls.has(url)) {
          stats.duplicates++;
          continue;
        }
        // Skip leads we already inserted in earlier passes of this run
        if ((item as { __inserted?: boolean }).__inserted) continue;

        const { first_name, last_name } = splitName(item);
        const insertRow = {
          user_id: args.ownerId,
          first_name,
          last_name,
          title: extractTitle(item),
          company: extractCompany(item),
          linkedin_url: url,
          tags: [
            "sales-idf-tech",
            "sourced-unipile-classic",
            "industry-unverified",
          ],
          status: "cold",
          stage: "to_invite",
        };

        const { data: inserted, error: insErr } = await supabase
          .from("leads")
          .insert(insertRow)
          .select("id")
          .single();

        if (insErr) {
          if (insErr.code === "23505") {
            stats.duplicates++;
            existingUrls.add(url);
            continue;
          }
          console.warn(`   insert failed for ${url}: ${insErr.message}`);
          continue;
        }

        existingUrls.add(url);
        (item as { __inserted?: boolean; __leadId?: string }).__inserted = true;
        (item as { __inserted?: boolean; __leadId?: string }).__leadId =
          inserted.id;
        stats.newLeads++;

        if (listId) {
          await supabase
            .from("list_leads")
            .upsert({ list_id: listId, lead_id: inserted.id }, {
              ignoreDuplicates: true,
            });
        }
      }
    } else {
      // dry-run: count only items first seen in this pass
      for (const [url] of collected.entries()) {
        if (dryRunCounted.has(url)) continue;
        dryRunCounted.add(url);
        if (existingUrls.has(url)) stats.duplicates++;
        else stats.newLeads++;
      }
    }

    console.log(
      `   fetched=${stats.fetched}  filtered=${stats.kept}  new=${stats.newLeads}  duplicates=${stats.duplicates}`
    );
    allStats.push(stats);
  }

  // ---- 6. Summary ----
  console.log("\n=== SUMMARY ===");
  let totalFetched = 0,
    totalKept = 0,
    totalNew = 0,
    totalDup = 0;
  for (const s of allStats) {
    console.log(
      `  ${s.keyword.padEnd(40)} fetched=${s.fetched}  kept=${s.kept}  new=${s.newLeads}  dup=${s.duplicates}`
    );
    totalFetched += s.fetched;
    totalKept += s.kept;
    totalNew += s.newLeads;
    totalDup += s.duplicates;
  }
  console.log(
    `\n  TOTAL                        fetched=${totalFetched}  unique-kept=${collected.size}  new=${totalNew}  dup=${totalDup}`
  );
  console.log(`\nList: "${listName}"  id=${listId ?? "(dry-run)"}`);
  console.log("=== DONE ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
