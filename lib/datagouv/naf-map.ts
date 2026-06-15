/**
 * naf-map.ts — Tables de référence + helpers pour le parsing déterministe des
 * requêtes data.gouv (secteur NAF, effectif, géo).
 *
 * - NAF : ré-exporté depuis `naf-data.ts` (AUTO-GÉNÉRÉ depuis la nomenclature
 *   OFFICIELLE INSEE rév. 2 — cf. scripts/generate-naf-map.ts). Le catalogue
 *   complet (732 sous-classes) sert de **garde-fou anti-hallucination** : tout
 *   code renvoyé par le LLM absent du catalogue est jeté (`isValidNaf`).
 * - EFFECTIF : codes "tranche d'effectif salarié" INSEE (utilisés tels quels
 *   par l'API recherche-entreprises via `tranche_effectif_salarie`).
 * - GÉO : départements / régions / grandes villes → code département (post-filtre
 *   sur le SIÈGE côté client).
 *
 * Module PUR (aucun "use server", aucun I/O) → testable.
 */

import { NAF_CATALOG, NAF_DIVISIONS, NAF_SECTIONS, type NafEntry } from "./naf-data";

export { NAF_CATALOG, NAF_DIVISIONS, NAF_SECTIONS };
export type { NafEntry };

// ---------------------------------------------------------------------------
// NAF — lookups & validation
// ---------------------------------------------------------------------------

const NAF_CODE_SET = new Set(NAF_CATALOG.map((e) => e.code));
const NAF_LABEL_BY_CODE = new Map(NAF_CATALOG.map((e) => [e.code, e.label]));
const DIVISION_LABEL_BY_CODE = new Map(NAF_DIVISIONS.map((e) => [e.code, e.label]));
const SECTION_LABEL_BY_CODE = new Map(NAF_SECTIONS.map((e) => [e.code, e.label]));

/** Normalise un code candidat (trim, majuscules). */
export function normalizeNafCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** true si le code est une sous-classe NAF rév.2 existante (ex "62.01Z"). */
export function isValidNaf(code: string): boolean {
  return NAF_CODE_SET.has(normalizeNafCode(code));
}

/** Libellé d'une sous-classe, ou null si inconnue. */
export function nafLabel(code: string): string | null {
  return NAF_LABEL_BY_CODE.get(normalizeNafCode(code)) ?? null;
}

/** Libellé d'une division (2 chiffres), ou null. */
export function divisionLabel(code: string): string | null {
  return DIVISION_LABEL_BY_CODE.get(code.trim().padStart(2, "0")) ?? null;
}

/** Libellé d'une section (lettre A–U), ou null. */
export function sectionLabel(code: string): string | null {
  return SECTION_LABEL_BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** true si `code` est une division NAF (2 chiffres) existante. */
export function isValidDivision(code: string): boolean {
  return DIVISION_LABEL_BY_CODE.has(code.trim().padStart(2, "0"));
}

/**
 * Étend une division (ex "62") en ses sous-classes ("62.01Z", "62.02A", …).
 * Utilisé quand le LLM répond au niveau division : on convertit en sous-classes
 * valides pour le filtre `code_naf` de l'API.
 */
export function expandDivision(division: string): string[] {
  const d = division.trim().padStart(2, "0");
  return NAF_CATALOG.filter((e) => e.code.startsWith(`${d}.`)).map((e) => e.code);
}

/** Phrase lisible : "62.01Z (Programmation informatique), 70.22Z (Conseil…)". */
export function formatNafList(codes: string[]): string {
  return codes
    .map((c) => {
      const label = nafLabel(c);
      return label ? `${c} (${label})` : c;
    })
    .join(", ");
}

/**
 * Set NAF de départ pour "tech B2B" (approximation par secteur, PAS un vrai
 * filtre B2B — l'API ne distingue pas B2B/B2C). Sert d'ancrage dans le prompt LLM.
 */
export const B2B_TECH_STARTER: string[] = [
  "62.01Z", // Programmation informatique
  "62.02A", // Conseil en systèmes et logiciels informatiques
  "62.02B", // Tierce maintenance de systèmes et d'applications informatiques
  "62.09Z", // Autres activités informatiques
  "63.11Z", // Traitement de données, hébergement et activités connexes
  "63.12Z", // Portails Internet
  "58.29A", // Édition de logiciels système et de réseau
  "58.29B", // Édition de logiciels outils de développement et de langages
  "58.29C", // Édition de logiciels applicatifs
];

// ---------------------------------------------------------------------------
// EFFECTIF — codes INSEE "tranche d'effectif salarié"
// (valeur exacte attendue par l'API via `tranche_effectif_salarie`)
// ---------------------------------------------------------------------------

export interface EffectifBracket {
  code: string;
  min: number;
  max: number;
  label: string;
}

/** Tranches INSEE (hors "NN" non employeuse). Ordonnées croissant. */
export const EFFECTIF_BRACKETS: EffectifBracket[] = [
  { code: "00", min: 0, max: 0, label: "0 salarié" },
  { code: "01", min: 1, max: 2, label: "1-2 salariés" },
  { code: "02", min: 3, max: 5, label: "3-5 salariés" },
  { code: "03", min: 6, max: 9, label: "6-9 salariés" },
  { code: "11", min: 10, max: 19, label: "10-19 salariés" },
  { code: "12", min: 20, max: 49, label: "20-49 salariés" },
  { code: "21", min: 50, max: 99, label: "50-99 salariés" },
  { code: "22", min: 100, max: 199, label: "100-199 salariés" },
  { code: "31", min: 200, max: 249, label: "200-249 salariés" },
  { code: "32", min: 250, max: 499, label: "250-499 salariés" },
  { code: "41", min: 500, max: 999, label: "500-999 salariés" },
  { code: "42", min: 1000, max: 1999, label: "1000-1999 salariés" },
  { code: "51", min: 2000, max: 4999, label: "2000-4999 salariés" },
  { code: "52", min: 5000, max: 9999, label: "5000-9999 salariés" },
  { code: "53", min: 10000, max: Infinity, label: "10000+ salariés" },
];

const EFFECTIF_LABEL_BY_CODE = new Map(EFFECTIF_BRACKETS.map((b) => [b.code, b.label]));

export function effectifLabel(code: string): string | null {
  return EFFECTIF_LABEL_BY_CODE.get(code) ?? null;
}

/** Catégories de taille usuelles → codes INSEE. */
export const EFFECTIF_KEYWORDS: Record<string, string[]> = {
  tpe: ["00", "01", "02", "03"], // < 10
  "très petite entreprise": ["00", "01", "02", "03"],
  micro: ["00", "01", "02", "03"],
  pme: ["11", "12", "21", "22", "31"], // 10-249
  "petite et moyenne entreprise": ["11", "12", "21", "22", "31"],
  eti: ["32", "41", "42", "51"], // 250-4999
  "entreprise de taille intermédiaire": ["32", "41", "42", "51"],
  "grand groupe": ["52", "53"], // 5000+
  "grande entreprise": ["52", "53"],
  grandgroupe: ["52", "53"],
};

/** Codes effectif compris dans l'intervalle [min,max] (chevauchement). */
export function effectifCodesForRange(min: number, max: number): string[] {
  return EFFECTIF_BRACKETS.filter((b) => b.min <= max && b.max >= min).map((b) => b.code);
}

// ---------------------------------------------------------------------------
// GÉO — départements, régions, grandes villes → code département
// Codes officiels INSEE (métropole 01–95 + 2A/2B Corse, DROM 971–976).
// Le post-filtrage se fait sur le SIÈGE côté client.
// ---------------------------------------------------------------------------

export const DEPARTMENTS: NafEntry[] = [
  { code: "01", label: "Ain" },
  { code: "02", label: "Aisne" },
  { code: "03", label: "Allier" },
  { code: "04", label: "Alpes-de-Haute-Provence" },
  { code: "05", label: "Hautes-Alpes" },
  { code: "06", label: "Alpes-Maritimes" },
  { code: "07", label: "Ardèche" },
  { code: "08", label: "Ardennes" },
  { code: "09", label: "Ariège" },
  { code: "10", label: "Aube" },
  { code: "11", label: "Aude" },
  { code: "12", label: "Aveyron" },
  { code: "13", label: "Bouches-du-Rhône" },
  { code: "14", label: "Calvados" },
  { code: "15", label: "Cantal" },
  { code: "16", label: "Charente" },
  { code: "17", label: "Charente-Maritime" },
  { code: "18", label: "Cher" },
  { code: "19", label: "Corrèze" },
  { code: "2A", label: "Corse-du-Sud" },
  { code: "2B", label: "Haute-Corse" },
  { code: "21", label: "Côte-d'Or" },
  { code: "22", label: "Côtes-d'Armor" },
  { code: "23", label: "Creuse" },
  { code: "24", label: "Dordogne" },
  { code: "25", label: "Doubs" },
  { code: "26", label: "Drôme" },
  { code: "27", label: "Eure" },
  { code: "28", label: "Eure-et-Loir" },
  { code: "29", label: "Finistère" },
  { code: "30", label: "Gard" },
  { code: "31", label: "Haute-Garonne" },
  { code: "32", label: "Gers" },
  { code: "33", label: "Gironde" },
  { code: "34", label: "Hérault" },
  { code: "35", label: "Ille-et-Vilaine" },
  { code: "36", label: "Indre" },
  { code: "37", label: "Indre-et-Loire" },
  { code: "38", label: "Isère" },
  { code: "39", label: "Jura" },
  { code: "40", label: "Landes" },
  { code: "41", label: "Loir-et-Cher" },
  { code: "42", label: "Loire" },
  { code: "43", label: "Haute-Loire" },
  { code: "44", label: "Loire-Atlantique" },
  { code: "45", label: "Loiret" },
  { code: "46", label: "Lot" },
  { code: "47", label: "Lot-et-Garonne" },
  { code: "48", label: "Lozère" },
  { code: "49", label: "Maine-et-Loire" },
  { code: "50", label: "Manche" },
  { code: "51", label: "Marne" },
  { code: "52", label: "Haute-Marne" },
  { code: "53", label: "Mayenne" },
  { code: "54", label: "Meurthe-et-Moselle" },
  { code: "55", label: "Meuse" },
  { code: "56", label: "Morbihan" },
  { code: "57", label: "Moselle" },
  { code: "58", label: "Nièvre" },
  { code: "59", label: "Nord" },
  { code: "60", label: "Oise" },
  { code: "61", label: "Orne" },
  { code: "62", label: "Pas-de-Calais" },
  { code: "63", label: "Puy-de-Dôme" },
  { code: "64", label: "Pyrénées-Atlantiques" },
  { code: "65", label: "Hautes-Pyrénées" },
  { code: "66", label: "Pyrénées-Orientales" },
  { code: "67", label: "Bas-Rhin" },
  { code: "68", label: "Haut-Rhin" },
  { code: "69", label: "Rhône" },
  { code: "70", label: "Haute-Saône" },
  { code: "71", label: "Saône-et-Loire" },
  { code: "72", label: "Sarthe" },
  { code: "73", label: "Savoie" },
  { code: "74", label: "Haute-Savoie" },
  { code: "75", label: "Paris" },
  { code: "76", label: "Seine-Maritime" },
  { code: "77", label: "Seine-et-Marne" },
  { code: "78", label: "Yvelines" },
  { code: "79", label: "Deux-Sèvres" },
  { code: "80", label: "Somme" },
  { code: "81", label: "Tarn" },
  { code: "82", label: "Tarn-et-Garonne" },
  { code: "83", label: "Var" },
  { code: "84", label: "Vaucluse" },
  { code: "85", label: "Vendée" },
  { code: "86", label: "Vienne" },
  { code: "87", label: "Haute-Vienne" },
  { code: "88", label: "Vosges" },
  { code: "89", label: "Yonne" },
  { code: "90", label: "Territoire de Belfort" },
  { code: "91", label: "Essonne" },
  { code: "92", label: "Hauts-de-Seine" },
  { code: "93", label: "Seine-Saint-Denis" },
  { code: "94", label: "Val-de-Marne" },
  { code: "95", label: "Val-d'Oise" },
  { code: "971", label: "Guadeloupe" },
  { code: "972", label: "Martinique" },
  { code: "973", label: "Guyane" },
  { code: "974", label: "La Réunion" },
  { code: "976", label: "Mayotte" },
];

const DEPARTMENT_LABEL_BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d.label]));

export function departmentLabel(code: string): string | null {
  return DEPARTMENT_LABEL_BY_CODE.get(code) ?? null;
}

/** Régions (découpage 2016) → codes départements. */
export const REGIONS: Record<string, string[]> = {
  "ile-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "auvergne-rhone-alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "bourgogne-franche-comte": ["21", "25", "39", "58", "70", "71", "89", "90"],
  bretagne: ["22", "29", "35", "56"],
  "centre-val-de-loire": ["18", "28", "36", "37", "41", "45"],
  corse: ["2A", "2B"],
  "grand-est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "hauts-de-france": ["02", "59", "60", "62", "80"],
  normandie: ["14", "27", "50", "61", "76"],
  "nouvelle-aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "pays-de-la-loire": ["44", "49", "53", "72", "85"],
  "provence-alpes-cote-d-azur": ["04", "05", "06", "13", "83", "84"],
  paca: ["04", "05", "06", "13", "83", "84"],
};

/** Grandes villes FR → code département (clés normalisées sans accent). */
export const CITIES: Record<string, string> = {
  paris: "75",
  marseille: "13",
  lyon: "69",
  toulouse: "31",
  nice: "06",
  nantes: "44",
  montpellier: "34",
  strasbourg: "67",
  bordeaux: "33",
  lille: "59",
  rennes: "35",
  reims: "51",
  "saint-etienne": "42",
  "le-havre": "76",
  toulon: "83",
  grenoble: "38",
  dijon: "21",
  angers: "49",
  nimes: "30",
  "clermont-ferrand": "63",
  "aix-en-provence": "13",
  brest: "29",
  tours: "37",
  amiens: "80",
  limoges: "87",
  annecy: "74",
  perpignan: "66",
  besancon: "25",
  metz: "57",
  orleans: "45",
  rouen: "76",
  mulhouse: "68",
  caen: "14",
  nancy: "54",
  "boulogne-billancourt": "92",
  nanterre: "92",
  montreuil: "93",
  versailles: "78",
  pau: "64",
  "la-rochelle": "17",
  avignon: "84",
  bayonne: "64",
};
