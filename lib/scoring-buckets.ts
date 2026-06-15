/**
 * Simple 3-bucket scoring for Gojiberry leads.
 * Replaces the complex AI scoring (100-point fit/intent/timing).
 * Zero API calls — pure code logic.
 */

import type { SignalType } from "@/types/leads";

export type Bucket = "PRIORITAIRE" | "STANDARD" | "A_VERIFIER";
export type IcpSegment = "A" | "B" | "C" | "D1" | "D2" | "HORS_ICP";

interface BucketResult {
  score: number;
  status: "hot" | "warm" | "cold";
  bucket: Bucket;
  segmentIcp: IcpSegment;
}

interface EnrichmentForBucket {
  signal?: { type?: string | null; source?: string | null } | null;
  company?: {
    size?: string | null;
    industry?: string | null;
    revenue?: string | null;
  } | null;
}

// Titres qui indiquent un decideur autonome
const DECIDEUR_TITLES = [
  "founder", "fondateur", "fondatrice",
  "co-founder", "co-fondateur", "co-fondatrice",
  "ceo", "coo", "cto", "cmo", "cro", "cso",
  "chief", "president", "président", "présidente",
  "directeur", "directrice", "director", "managing director",
  "gérant", "gérante", "gerant", "gerante",
  "owner", "associé", "associée", "partner",
  "head of", "vp ", "vice president",
];

// Signaux forts (intent eleve)
const STRONG_SIGNALS: SignalType[] = [
  "ENGAGEMENT_KEYWORD",
  "COMPETITOR_ENGAGEMENT",
  "INBOUND",
];

// Signaux moyens (intent modere)
const MEDIUM_SIGNALS: SignalType[] = [
  "NEW_ROLE",
  "ENGAGEMENT_EXPERT",
  "ICP_TOP_ACTIVE",
  "POST_DOULEUR",
  "ACTUALITE",
];

function isDecideur(title?: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DECIDEUR_TITLES.some((t) => lower.includes(t));
}

function parseSizeEstimate(size: string | null | undefined): number | null {
  if (!size) return null;
  // "10-20 employés" → 15, "35-50" → 42, "1 (indépendant)" → 1
  const range = size.match(/(\d+)\s*[-–à]\s*(\d+)/);
  if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
  const single = size.match(/(\d+)/);
  if (single) return parseInt(single[1], 10);
  return null;
}

/**
 * Détermine le segment ICP d'un lead de façon déterministe (zéro API call).
 * Logique :
 * - ESN/SSII/cabinet conseil → D1 (5-49) ou D2 (50-249)
 * - B2C / trop grande entreprise (>250) → HORS_ICP
 * - Freelance/coach sans structure et sans signal décideur → HORS_ICP
 * - PME B2B par taille : A (≤4), B (≤12), C (≤50)
 * - Fallback décideur sans taille → B (Growth)
 */
export function computeSegmentIcp(
  title: string | null | undefined,
  enrichmentData: EnrichmentForBucket | null | undefined,
): IcpSegment {
  const titleLower = (title || "").toLowerCase();
  const companySize = enrichmentData?.company?.size || "";
  const industry = (enrichmentData?.company?.industry || "").toLowerCase();
  const sizeNum = parseSizeEstimate(companySize);

  // Détection ESN / Cabinet conseil (industry ou titre)
  const isESN =
    /\b(esn|ssii|cabinet.*conseil|consulting|intégrateur|société.*service|prestation.*informatique)\b/i.test(industry)
    || /\b(esn|ssii|cabinet.*conseil|consulting)\b/i.test(titleLower);

  if (isESN) {
    if (sizeNum !== null) {
      if (sizeNum >= 50 && sizeNum < 250) return "D2";
      if (sizeNum >= 5 && sizeNum < 50) return "D1";
      if (sizeNum >= 250) return "HORS_ICP";
    }
    return "D1"; // ESN sans taille → défaut petite ESN
  }

  // HORS_ICP : B2C ou trop grande
  const isB2C = /\b(b2c|retail|e-commerce|mode|luxe|restauration|immobilier.*particulier)\b/i.test(industry);
  const isTooLarge = sizeNum !== null && sizeNum > 250;
  if (isB2C || isTooLarge) return "HORS_ICP";

  // HORS_ICP : freelance / coach / formateur solo SANS structure (taille 1-2) SANS signal décideur
  const hasFondateurSignal = /\b(founder|fondateur|ceo|dirigeant|gérant|co-fondateur)\b/i.test(titleLower);
  const titleLooksFreelance = /\b(freelance|indépendant|coach|formateur|consultant.*indépendant)\b/i.test(titleLower);
  const industryLooksFreelance = /\b(coaching|formation(?!\s*b2b)|freelance|indépendant)\b/i.test(industry);
  const isSoloStructure = sizeNum !== null && sizeNum <= 2;

  // Freelance explicite dans le titre (sans casquette décideur d'une vraie boîte)
  if (titleLooksFreelance && !hasFondateurSignal) return "HORS_ICP";

  // Fondateur d'une activité solo de coaching/formation → HORS_ICP
  // (un "Founder" d'un cabinet de coaching à 1 personne n'est pas ICP Smart.AI)
  if (industryLooksFreelance && isSoloStructure) return "HORS_ICP";

  // Segments PME B2B par taille
  if (sizeNum !== null) {
    if (sizeNum <= 4) return "A";
    if (sizeNum <= 20) return "B";
    if (sizeNum <= 50) return "C";
    return "HORS_ICP"; // > 50 personnes hors ESN
  }

  // Fallback sur le titre si pas de taille
  const isDecideurAutonome = hasFondateurSignal
    || /\b(cto|coo|managing.*director|directeur.*général|president|dg|pdg)\b/i.test(titleLower);
  if (isDecideurAutonome) return "B"; // défaut décideur sans taille = Growth

  return "B"; // fallback ultime
}

export function assignBucket(lead: {
  title?: string | null;
  enrichmentData?: EnrichmentForBucket | null;
}): BucketResult {
  const signalType = lead.enrichmentData?.signal?.type as SignalType | null | undefined;
  const isGoji = lead.enrichmentData?.signal?.source === "gojiberry";
  const decideur = isDecideur(lead.title);

  const segmentIcp = computeSegmentIcp(lead.title, lead.enrichmentData);

  // PRIORITAIRE: signal fort OU (signal moyen + decideur confirme)
  if (STRONG_SIGNALS.includes(signalType as SignalType)) {
    return { score: 80, status: "hot", bucket: "PRIORITAIRE", segmentIcp };
  }

  if (decideur && MEDIUM_SIGNALS.includes(signalType as SignalType)) {
    return { score: 80, status: "hot", bucket: "PRIORITAIRE", segmentIcp };
  }

  // STANDARD: signal moyen OU lead Gojiberry avec titre decideur
  if (MEDIUM_SIGNALS.includes(signalType as SignalType)) {
    return { score: 50, status: "warm", bucket: "STANDARD", segmentIcp };
  }

  if (isGoji && decideur) {
    return { score: 50, status: "warm", bucket: "STANDARD", segmentIcp };
  }

  // A_VERIFIER: tout le reste
  return { score: 20, status: "cold", bucket: "A_VERIFIER", segmentIcp };
}
