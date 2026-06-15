/**
 * client.ts — Client de l'API Recherche d'entreprises (data.gouv).
 *
 * - PAS de clé API. Limite 7 req/s → throttle (≥150 ms entre requêtes).
 * - Backoff calqué sur lib/unipile/client.ts (exponentiel + jitter ; 429 + 5xx
 *   réessayés, 4xx non réessayés).
 * - Défensif : toute erreur → valeur vide (jamais de throw qui casse l'appelant).
 * - CONFORMITÉ appliquée ici : statut_diffusion === "O" + dirigeants personnes
 *   physiques nommés uniquement (cf. types.ts).
 * - Géo = SIÈGE : `departement` côté serveur pré-filtre (n'importe quel établissement),
 *   puis post-filtrage strict sur siege.departement. Pas de backfill.
 */

import type {
  Company,
  Dirigeant,
  RawCompany,
  RawDirigeant,
  RawSearchResponse,
  SearchFilters,
  SearchFunnel,
  SearchResult,
  SirenResolution,
} from "./types";

const BASE_URL = "https://recherche-entreprises.api.gouv.fr/search";
const PER_PAGE = 25; // maximum autorisé par l'API
const MAX_PAGES = 12; // garde-fou pagination (12 × 25 = 300 ≥ limit max 250)
const MIN_INTERVAL_MS = 150; // ≈ 6.6 req/s < 7 req/s
const MAX_NAF_CODES = 50; // garde-fou longueur d'URL
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Throttle 7 req/s (sérialisé au niveau module)
// ---------------------------------------------------------------------------

let throttleChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sérialise les requêtes en garantissant un espacement minimal. */
async function throttle(): Promise<void> {
  const prev = throttleChain;
  let release!: () => void;
  throttleChain = new Promise<void>((r) => (release = r));
  await prev;
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  release();
}

// ---------------------------------------------------------------------------
// Requête bas niveau (défensive + backoff)
// ---------------------------------------------------------------------------

async function fetchSearch(
  params: Record<string, string | number | undefined>
): Promise<RawSearchResponse | null> {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await throttle();
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });

      if (res.ok) {
        return (await res.json()) as RawSearchResponse;
      }

      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `[Datagouv] ${res.status} sur ${url.pathname}${url.search} — retry ${attempt + 1}/${MAX_RETRIES} dans ${Math.round(backoff)}ms`
        );
        await sleep(backoff);
        continue;
      }

      console.error(`[Datagouv] HTTP ${res.status} : ${await res.text().catch(() => "")}`);
      return null;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `[Datagouv] fetch error — retry ${attempt + 1}/${MAX_RETRIES} dans ${Math.round(backoff)}ms :`,
          err instanceof Error ? err.message : err
        );
        await sleep(backoff);
        continue;
      }
      console.error("[Datagouv] fetch failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers de normalisation
// ---------------------------------------------------------------------------

/** Met en forme un nom tout-majuscule INSEE en casse propre ("DUVAL" → "Duval"). */
function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/([\s'-])/) // garde séparateurs (espace, apostrophe, tiret)
    .map((part) => (/[a-zàâäéèêëîïôöùûüç]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

function normalizeCompany(raw: RawCompany): Company {
  const siege = raw.siege ?? {};
  return {
    siren: raw.siren,
    nom: (raw.nom_complet || raw.nom_raison_sociale || "").trim(),
    naf: raw.activite_principale ?? null,
    section: raw.section_activite_principale ?? null,
    ville: siege.libelle_commune ?? null,
    codePostal: siege.code_postal ?? null,
    departement: siege.departement ?? null,
    dateCreation: raw.date_creation ?? null,
    effectif: raw.tranche_effectif_salarie ?? null,
    categorie: raw.categorie_entreprise ?? null,
    uniteLegale: raw,
  };
}

/** Dirigeants personnes physiques nommés (conformité). */
function namedPhysicalDirigeants(raw: RawCompany): RawDirigeant[] {
  return (raw.dirigeants ?? []).filter(
    (d) =>
      d.type_dirigeant === "personne physique" &&
      typeof d.nom === "string" &&
      d.nom.trim().length > 0 &&
      typeof d.prenoms === "string" &&
      d.prenoms.trim().length > 0
  );
}

function firstGivenName(prenoms: string): string {
  const first = prenoms.trim().split(/\s+/)[0] ?? "";
  return titleCase(first);
}

// ---------------------------------------------------------------------------
// Construction des paramètres de filtre
// ---------------------------------------------------------------------------

function buildParams(filters: SearchFilters, page: number): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = { page, per_page: PER_PAGE };

  if (filters.naf_codes.length > 0) {
    params.activite_principale = filters.naf_codes.slice(0, MAX_NAF_CODES).join(",");
  } else if (filters.section) {
    params.section_activite_principale = filters.section;
  }
  if (filters.effectif_codes.length > 0) {
    params.tranche_effectif_salarie = filters.effectif_codes.join(",");
  }
  if (filters.departements.length > 0) {
    params.departement = filters.departements.join(",");
  }
  if (filters.categorie) {
    params.categorie_entreprise = filters.categorie;
  }
  return params;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Recherche paginée + normalisée. Pagine jusqu'à `filters.limit` entreprises
 * SCANNÉES, applique conformité + post-filtre siège, et renvoie l'entonnoir complet.
 */
export async function searchCompanies(filters: SearchFilters): Promise<SearchResult> {
  const funnel: SearchFunnel = {
    scanned: 0,
    conformes: 0,
    personnesPhysiques: 0,
    siegeDansZone: 0,
    leadsCandidats: 0,
  };

  const scanLimit = Math.max(1, filters.limit);
  const zone = new Set(filters.departements);
  const hasGeo = zone.size > 0;

  const rawCompanies: RawCompany[] = [];
  const maxPages = Math.min(MAX_PAGES, Math.ceil(scanLimit / PER_PAGE));

  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchSearch(buildParams(filters, page));
    if (!data || !Array.isArray(data.results) || data.results.length === 0) break;

    rawCompanies.push(...data.results);
    if (rawCompanies.length >= scanLimit) break;
    if (data.total_pages !== undefined && page >= data.total_pages) break;
  }

  const scanned = rawCompanies.slice(0, scanLimit);
  funnel.scanned = scanned.length;

  const companiesBySiren = new Map<string, Company>();
  const people: Dirigeant[] = [];

  for (const raw of scanned) {
    // 1) Conformité diffusion
    if (raw.statut_diffusion !== "O") continue;
    funnel.conformes++;

    // 2) Dirigeants personnes physiques nommés
    const dirigeants = namedPhysicalDirigeants(raw);
    if (dirigeants.length === 0) {
      if (!filters.require_named_dirigeant) {
        // entreprise conservée sans lead (cas non utilisé par défaut)
      }
      continue;
    }
    funnel.personnesPhysiques++;

    // 3) Post-filtrage SIÈGE (si filtre géo demandé)
    const company = normalizeCompany(raw);
    if (hasGeo && !(company.departement && zone.has(company.departement))) continue;
    funnel.siegeDansZone++;

    companiesBySiren.set(company.siren, company);
    for (const d of dirigeants) {
      people.push({
        siren: company.siren,
        companyNom: company.nom,
        nom: titleCase((d.nom ?? "").trim()),
        prenom: firstGivenName(d.prenoms ?? ""),
        qualite: d.qualite ?? null,
        company,
      });
    }
  }

  funnel.leadsCandidats = people.length;
  return { companies: Array.from(companiesBySiren.values()), people, funnel };
}

/** Similarité de noms (Jaccard sur tokens normalisés) → 0..1. */
function nameSimilarity(a: string, b: string): number {
  const tok = (s: string): string[] =>
    Array.from(
      new Set(
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
      )
    );
  const ta = tok(a);
  const tb = tok(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const tbSet = new Set(tb);
  let inter = 0;
  ta.forEach((t) => {
    if (tbSet.has(t)) inter++;
  });
  const union = ta.length + tb.length - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Résout un SIREN à partir d'un nom d'entreprise (meilleur match).
 * EXPOSÉ dès maintenant : réutilisable (ex. Maddyness plus tard).
 * Défensif : null si rien de pertinent.
 */
export async function resolveSiren(companyName: string): Promise<SirenResolution | null> {
  const q = companyName.trim();
  if (!q) return null;

  const data = await fetchSearch({ q, page: 1, per_page: 5 });
  if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;

  let best: SirenResolution | null = null;
  for (const raw of data.results) {
    const nom = (raw.nom_complet || raw.nom_raison_sociale || "").trim();
    const score = nameSimilarity(q, nom);
    if (!best || score > best.score_confiance) {
      best = { siren: raw.siren, nom, score_confiance: score };
    }
  }
  return best;
}
