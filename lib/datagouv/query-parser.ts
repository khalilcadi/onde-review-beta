/**
 * query-parser.ts — Traduit une requête de sourcing en langage naturel en filtres
 * pour l'API Recherche d'entreprises (data.gouv).
 *
 * Découpage volontaire :
 *  - DÉTERMINISTE (sans IA, pur, testable) : effectif, géographie, nombre de résultats.
 *  - IA (1 SEUL appel, modèle léger Haiku via lib/ai) : secteur → codes NAF, en
 *    SÉLECTIONNANT dans le catalogue officiel fourni au runtime. L'anti-hallucination
 *    est garanti par POST-VALIDATION ici (tout code hors catalogue est jeté), pas par
 *    le prompt → aucune dépendance au cache du modèle.
 *  - `interpretation` est construite DÉTERMINISTIQUEMENT depuis les filtres finaux :
 *    c'est l'étape de validation affichée à l'utilisateur AVANT exécution.
 *
 * Module library (PAS de "use server") : appelé depuis une server action.
 */

import { callAI } from "@/lib/ai/service";
import {
  NAF_DIVISIONS,
  NAF_SECTIONS,
  B2B_TECH_STARTER,
  EFFECTIF_KEYWORDS,
  EFFECTIF_BRACKETS,
  CITIES,
  REGIONS,
  DEPARTMENTS,
  effectifCodesForRange,
  effectifLabel,
  formatNafList,
  departmentLabel,
  sectionLabel,
  nafLabel,
  isValidNaf,
  isValidDivision,
  expandDivision,
  normalizeNafCode,
} from "./naf-map";

const NAF_PARSER_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedFilters {
  naf_codes: string[];
  section: string | null;
  effectif_codes: string[];
  departements: string[];
  categorie: string | null;
  limit: number;
  require_named_dirigeant: boolean;
}

export interface ParsedQuery {
  filters: ParsedFilters;
  interpretation: string;
}

// ---------------------------------------------------------------------------
// Helpers de normalisation (purs)
// ---------------------------------------------------------------------------

/** minuscule + sans accents + ponctuation→espaces + espaces compressés, bordé d'espaces. */
export function normalizePhrase(phrase: string): string {
  const stripped = phrase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return ` ${stripped} `;
}

// ---------------------------------------------------------------------------
// EFFECTIF (déterministe)
// ---------------------------------------------------------------------------

/** Extrait les codes INSEE de tranche d'effectif depuis la phrase. */
export function parseEffectif(phrase: string): string[] {
  const norm = normalizePhrase(phrase);
  // Variante déburrée qui PRÉSERVE le tiret (pour capter "10-49") — normalizePhrase
  // remplace le tiret par une espace, ce qui casserait l'intervalle.
  const deburr = phrase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const codes = new Set<string>();

  // 1) Mots-clés de catégorie (tpe/pme/eti/grand groupe)
  for (const [keyword, kwCodes] of Object.entries(EFFECTIF_KEYWORDS)) {
    const k = normalizePhrase(keyword).trim();
    if (norm.includes(` ${k} `)) kwCodes.forEach((c) => codes.add(c));
  }

  // 2) Intervalles explicites : "10-49", "10 a 49", "entre 10 et 49", "de 10 a 49"
  const rangeRe = /(\d{1,6})\s*(?:-|a|et)\s*(\d{1,6})/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(deburr)) !== null) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
      effectifCodesForRange(lo, hi).forEach((c) => codes.add(c));
    }
  }

  // 3) "moins de N" / "jusqu a N" → [0, N-1]
  let mm: RegExpExecArray | null;
  const lessRe = /(?:moins de|jusqu a|jusqu)\s*(\d{1,6})/g;
  while ((mm = lessRe.exec(deburr)) !== null) {
    const n = parseInt(mm[1], 10);
    if (Number.isFinite(n) && n > 0) effectifCodesForRange(0, n - 1).forEach((c) => codes.add(c));
  }

  // 4) "plus de N" / "au moins N" / "+ de N" / "N et plus" / "N salaries ou plus"
  const moreRe = /(?:plus de|au moins|\+ de)\s*(\d{1,6})/g;
  while ((mm = moreRe.exec(deburr)) !== null) {
    const n = parseInt(mm[1], 10);
    if (Number.isFinite(n)) effectifCodesForRange(n + 1, Infinity).forEach((c) => codes.add(c));
  }
  const andMoreRe = /(\d{1,6})\s*(?:salaries?\s*)?(?:et plus|ou plus|et \+)/g;
  while ((mm = andMoreRe.exec(deburr)) !== null) {
    const n = parseInt(mm[1], 10);
    if (Number.isFinite(n)) effectifCodesForRange(n, Infinity).forEach((c) => codes.add(c));
  }

  // Tri stable selon l'ordre des tranches INSEE
  return EFFECTIF_BRACKETS.map((b) => b.code).filter((c) => codes.has(c));
}

// ---------------------------------------------------------------------------
// GÉO (déterministe) — renvoie des codes département (post-filtre sur le siège)
// ---------------------------------------------------------------------------

// Tous les matchers géo unifiés (régions, départements, villes), clé normalisée + codes.
// Triés par longueur de clé décroissante → on matche les noms longs d'abord et on
// "consomme" l'occurrence pour éviter qu'un nom court (ex "Rhône") matche dans un
// nom long (ex "Bouches-du-Rhône").
const GEO_MATCHERS: { key: string; codes: string[] }[] = [
  ...Object.keys(REGIONS).map((k) => ({ key: normalizePhrase(k).trim(), codes: REGIONS[k] })),
  ...DEPARTMENTS.map((d) => ({ key: normalizePhrase(d.label).trim(), codes: [d.code] })),
  ...Object.keys(CITIES).map((k) => ({ key: normalizePhrase(k).trim(), codes: [CITIES[k]] })),
]
  .filter((e) => e.key.length > 0)
  .sort((a, b) => b.key.length - a.key.length);

/** Extrait les codes département depuis la phrase (villes, régions, départements). */
export function parseGeo(phrase: string): string[] {
  let remaining = normalizePhrase(phrase);
  const codes = new Set<string>();

  for (const { key, codes: matchCodes } of GEO_MATCHERS) {
    const needle = ` ${key} `;
    if (remaining.includes(needle)) {
      matchCodes.forEach((c) => codes.add(c));
      // Blanchit l'occurrence pour bloquer les sous-correspondances plus courtes.
      remaining = remaining.split(needle).join("  ");
    }
  }

  // Code département explicite : "departement 33", "dept 69", "dpt 75"
  let m: RegExpExecArray | null;
  const deptCodeRe = /(?:departement|dept|dpt)\s*(2a|2b|\d{2,3})/g;
  while ((m = deptCodeRe.exec(remaining)) !== null) {
    const c = m[1].toUpperCase();
    if (DEPARTMENTS.some((d) => d.code === c)) codes.add(c);
  }

  return Array.from(codes);
}

// ---------------------------------------------------------------------------
// LIMITE (déterministe) — nombre d'entreprises SCANNÉES (pas de leads finaux)
// ---------------------------------------------------------------------------

/** Extrait la taille de scan demandée. Défaut 50, plafond 250. */
export function parseLimit(phrase: string): number {
  const norm = normalizePhrase(phrase);

  // 1) Nombre explicitement lié à un volume de résultats/entreprises
  const tied = norm.match(
    /(\d{1,5})\s*(?:resultats?|entreprises?|societes?|boites?|leads?|contacts?|dirigeants?)/
  );
  if (tied) return clampLimit(parseInt(tied[1], 10));

  // 2) "top 100" / "les 50 premieres" / "premiers 30"
  const top = norm.match(/(?:top|premiers?|premieres?)\s*(\d{1,5})/);
  if (top) return clampLimit(parseInt(top[1], 10));
  const lesN = norm.match(/les\s*(\d{1,5})\s*(?:premiers?|premieres?)/);
  if (lesN) return clampLimit(parseInt(lesN[1], 10));

  return DEFAULT_LIMIT;
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// ---------------------------------------------------------------------------
// SECTEUR → NAF (1 seul appel IA + post-validation)
// ---------------------------------------------------------------------------

interface NafSelection {
  naf_codes: string[];
  section: string | null;
}

/** Catalogue compact injecté au runtime (le LLM ne choisit QUE là-dedans). */
function buildNafCatalogContext(): string {
  const sections = NAF_SECTIONS.map((s) => `${s.code} — ${s.label}`).join("\n");
  const divisions = NAF_DIVISIONS.map((d) => `${d.code} — ${d.label}`).join("\n");
  const starter = B2B_TECH_STARTER.map((c) => `${c} — ${nafLabel(c) ?? ""}`).join("\n");
  return [
    "CATALOGUE NAF (choisis UNIQUEMENT des codes ci-dessous) :",
    "",
    "SECTIONS (lettre — libellé) :",
    sections,
    "",
    "DIVISIONS (code 2 chiffres — libellé) :",
    divisions,
    "",
    'STARTER "tech / B2B numérique" (sous-classes à privilégier) :',
    starter,
  ].join("\n");
}

/** Parse défensif du premier objet JSON présent dans une réponse LLM. */
function extractJson(text: string): { naf_codes?: unknown; section?: unknown } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Sélectionne les codes NAF via 1 appel Haiku, puis POST-VALIDE contre le catalogue
 * officiel : sous-classe valide → gardée ; division valide → étendue en sous-classes ;
 * tout le reste → jeté. Défensif : toute erreur → sélection vide (on n'invente rien).
 */
export async function selectNafCodes(phrase: string, userId: string): Promise<NafSelection> {
  let raw: { naf_codes?: unknown; section?: unknown } | null = null;
  try {
    const res = await callAI({
      userId,
      agentId: "datagouv_parser",
      runtimeContext: buildNafCatalogContext(),
      modelOverride: NAF_PARSER_MODEL,
      temperature: 0,
      maxTokens: 300,
      messages: [{ role: "user", content: phrase }],
      metadata: { feature: "datagouv_sourcing" },
    });
    raw = extractJson(res.text);
  } catch (err) {
    console.error("[Datagouv] selectNafCodes failed:", err instanceof Error ? err.message : err);
    return { naf_codes: [], section: null };
  }

  if (!raw) return { naf_codes: [], section: null };

  // Post-validation des codes
  const validated = new Set<string>();
  const candidates = Array.isArray(raw.naf_codes) ? raw.naf_codes : [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const code = normalizeNafCode(candidate);
    if (isValidNaf(code)) {
      validated.add(code);
    } else if (isValidDivision(code)) {
      expandDivision(code).forEach((c) => validated.add(c));
    }
    // sinon : code hallucinné → jeté
  }

  // Post-validation de la section (lettre A–U existante)
  let section: string | null = null;
  if (typeof raw.section === "string") {
    const s = raw.section.trim().toUpperCase();
    if (/^[A-U]$/.test(s) && sectionLabel(s)) section = s;
  }

  return { naf_codes: Array.from(validated), section };
}

// ---------------------------------------------------------------------------
// Interprétation (déterministe) = phrase de validation affichée à l'utilisateur
// ---------------------------------------------------------------------------

function buildInterpretation(f: ParsedFilters): string {
  const parts: string[] = [];

  if (f.naf_codes.length > 0) {
    parts.push(`NAF : ${formatNafList(f.naf_codes)}`);
  } else if (f.section) {
    parts.push(`section ${f.section} (${sectionLabel(f.section) ?? ""})`);
  } else {
    parts.push("aucun secteur NAF identifié");
  }

  if (f.effectif_codes.length > 0) {
    parts.push(`effectif : ${f.effectif_codes.map((c) => effectifLabel(c) ?? c).join(", ")}`);
  }

  if (f.departements.length > 0) {
    parts.push(
      `zone (siège) : ${f.departements.map((c) => `${departmentLabel(c) ?? c} (${c})`).join(", ")}`
    );
  }

  parts.push(`${f.limit} entreprises à scanner`);

  return `Je lis — ${parts.join(" · ")}.`;
}

// ---------------------------------------------------------------------------
// Orchestrateur + cache mémoire
// ---------------------------------------------------------------------------

const cache = new Map<string, ParsedQuery>();

/** Clé de cache = phrase normalisée (mêmes requêtes ⇒ pas de réappel IA). */
function cacheKey(phrase: string): string {
  return normalizePhrase(phrase).trim();
}

/**
 * Parse une requête NL complète → { filters, interpretation }.
 * 1 seul appel IA (secteur→NAF), le reste déterministe. Résultat mis en cache.
 */
export async function parseQuery(phrase: string, userId: string): Promise<ParsedQuery> {
  const key = cacheKey(phrase);
  const cached = cache.get(key);
  if (cached) return cached;

  const effectif_codes = parseEffectif(phrase);
  const departements = parseGeo(phrase);
  const limit = parseLimit(phrase);
  const { naf_codes, section } = await selectNafCodes(phrase, userId);

  const filters: ParsedFilters = {
    naf_codes,
    section,
    effectif_codes,
    departements,
    categorie: null,
    limit,
    require_named_dirigeant: true,
  };

  const result: ParsedQuery = { filters, interpretation: buildInterpretation(filters) };
  cache.set(key, result);
  return result;
}

/** Vide le cache (tests / debug). */
export function clearQueryCache(): void {
  cache.clear();
}

/** Reconstruit l'interprétation après édition manuelle des filtres (sans IA). */
export function interpretationFor(filters: ParsedFilters): string {
  return buildInterpretation(filters);
}

export interface FilterLabels {
  naf: Record<string, string>;
  effectif: Record<string, string>;
  departements: Record<string, string>;
  section: string | null;
}

/**
 * Libellés des codes des filtres actifs (pour l'UI : chips éditables) — calculés
 * côté serveur afin de NE PAS embarquer le catalogue NAF complet dans le client.
 */
export function filterLabels(f: ParsedFilters): FilterLabels {
  const naf: Record<string, string> = {};
  f.naf_codes.forEach((c) => (naf[c] = nafLabel(c) ?? c));
  const effectif: Record<string, string> = {};
  f.effectif_codes.forEach((c) => (effectif[c] = effectifLabel(c) ?? c));
  const departements: Record<string, string> = {};
  f.departements.forEach((c) => (departements[c] = departmentLabel(c) ?? c));
  return {
    naf,
    effectif,
    departements,
    section: f.section ? sectionLabel(f.section) ?? f.section : null,
  };
}
