/**
 * Simple 3-bucket scoring for Onde Review beta leads.
 * Replaces the complex AI scoring (100-point fit/intent/timing).
 * Zero API calls — pure code logic.
 */

import type { SignalType } from "@/types/leads";

export type Bucket = "PRIORITAIRE" | "STANDARD" | "A_VERIFIER";

/**
 * Segments ICP studios créa (Onde Review beta).
 * A = studio créa · CEO/Founder
 * B = studio créa · chef de projet / head of production
 * C = agence social/ads avec studio · rôle créa (strategist, CD, DA)
 * D = agence social/ads avec studio · CEO/Founder
 * E = freelance créa (DA, motion, monteur, graphiste)
 * F = PME avec prod créative interne
 * HORS_ICP = >50 personnes ou clairement hors créa
 */
export type IcpSegment = "A" | "B" | "C" | "D" | "E" | "F" | "HORS_ICP";

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
    description?: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Keyword lists — edit here to tune classification
// ---------------------------------------------------------------------------

// Titres qui indiquent un decideur autonome (founder family)
const FOUNDER_TITLES = [
  "founder", "fondateur", "fondatrice",
  "co-founder", "co-fondateur", "co-fondatrice",
  "cofondateur", "cofondatrice",
  "ceo", "chief executive",
  "gérant", "gérante", "gerant", "gerante",
  "owner", "dirigeant", "dirigeante",
  "président", "présidente", "president",
  "dg", "pdg", "directeur général", "directrice générale",
];

// Titres rôle chef de projet / head of production → segment B si studio créa
const PROD_TITLES = [
  "chef de projet", "head of production", "production manager",
  "project manager", "responsable production",
];

// Titres rôle créa stratégique / direction créa → segment C (in agence) ou A (in studio si founder)
const CREATIVE_TITLES = [
  "creative director", "directeur créatif", "directrice créative",
  "head of studio", "creative strategist", "stratège créatif", "stratege creatif",
  "stratège créative", "strategiste créatif",
  "directeur artistique", "directrice artistique", "da", "art director",
  "graphiste", "designer graphique",
  "social media manager", "content manager", "paid social",
  "content strategist", "community manager",
];

// Titres rôle "craft" (exécution créative) → segment E (freelance) ou F (interne) — JAMAIS B
const CRAFT_TITLES = [
  "vidéaste", "videaste", "monteur", "monteuse", "monteur vidéo", "montage",
  "motion designer", "motion design", "motion",
  "créateur de contenu", "créatrice de contenu", "createur de contenu", "creatrice de contenu",
  "créateur·rice de contenu", "content creator", "ugc",
  "cadreur", "cadreuse", "coloriste", "réalisateur", "realisateur", "réalisatrice",
  "animateur", "animatrice", "animateur 2d", "animateur 3d",
];

// Titres explicitement freelance/indépendant créa → segment E
const FREELANCE_CREATIVE_TITLES = [
  "freelance", "indépendant", "independant",
];

// Industries LinkedIn créa (toujours ICP si taille ≤ 50)
const CREATIVE_INDUSTRIES = [
  "design", "graphic design", "marketing and advertising", "marketing & advertising",
  "media production", "motion pictures and film", "animation", "photography",
  "movies, videos, and sound",
  "online media", "broadcast media", "entertainment",
  "advertising", "creative",
];

// Industries studio/production (entité type "studio") — plus spécifique que CREATIVE
const STUDIO_INDUSTRIES = [
  "design", "graphic design", "media production",
  "motion pictures and film", "movies, videos, and sound",
  "animation", "photography",
];

// Industries agence social/ads
const AGENCY_INDUSTRIES = [
  "marketing and advertising", "marketing & advertising", "advertising",
  "advertising services", "online media",
];

// Signaux media-buying / performance pure-player (média acheté, pas de prod créative)
// → si présents SANS aucun signal de prod créative, le lead est HORS_ICP.
const PERF_SIGNALS = [
  "google ads", "google ad", "sea", "sem", "référencement", "referencement",
  "paid search", "ppc", "media buying", "média buying", "performance marketing",
  "search engine", "adwords",
];

// Signaux de prod créative (studio / créa / contenu) — recherchés dans
// title + description + nom d'entreprise. Servent à (1) ne PAS exclure un
// pure-player qui fait aussi de la créa, (2) classer sur texte quand
// l'enrichissement entreprise est vide.
const CREATIVE_PROD_SIGNALS = [
  "studio", "créa", "crea", "créative", "creative", "motion", "design",
  "vidéo", "video", "audiovisuel", "film", "animation", "photo", "photograph",
  "branding", "content production", "production de contenu", "contenu",
  "production", "producteur", "productrice", "producer",
  "réalisation", "realisation", "montage", "post-production", "postproduction",
  "graphi", "brand content", "social media",
];

// Signaux de prod créative FORTS (vrai studio / craft de production). Sous-ensemble
// strict de CREATIVE_PROD_SIGNALS : on retire les termes génériques de marketing
// digital ("social media", "contenu", "design" nu) et le piège de sous-chaîne
// "créa" (matche "création de site web"). Utilisé UNIQUEMENT par la garde
// pure-player (exclusion a2) : une agence média-buying dont la description ne fait
// que mentionner "Social Media Ads" ou "Création de site" ne doit PAS échapper à
// l'exclusion. Un VRAI studio (motion/film/montage/branding/photo…) la conserve.
const CREATIVE_PROD_STRONG = [
  "studio", "motion", "audiovisuel", "film", "animation",
  "vidéo", "video", "montage", "post-production", "postproduction",
  "réalisation", "realisation", "branding", "brand content",
  "photo", "photograph", "graphi",
  "production", "producteur", "productrice", "producer",
  "graphic design", "design graphique", "direction artistique",
  "créative", "creative",
];

// Mot "agence/agency" dans le NOM ou la DESCRIPTION → entité AGENCE.
// Sert à trancher founder A (studio) vs D (agence) : une agence qui mentionne
// "studio" comme vertical ou se dit "créative" reste une agence → D.
const AGENCE_SIGNALS = ["agence", "agency"];

// Signaux d'un VRAI studio / maison de production (entité studio, pas agence).
// Servent à réserver le segment A (founder de studio) aux vrais studios.
const STUDIO_SIGNALS = [
  "studio", "production", "producteur", "productrice", "producer",
  "motion", "film", "audiovisuel", "réalisation", "realisation",
  "post-production", "postproduction",
];

// Industries clairement non-créa → HORS_ICP si title non-créa
const NON_CREATIVE_INDUSTRIES = [
  "software", "information technology", "computer software", "saas",
  "finance", "banking", "financial services", "insurance",
  "legal", "law practice", "law firm",
  "consulting", "management consulting", "staffing", "staffing and recruiting",
  "retail", "consumer goods", "e-commerce",
  "real estate", "construction", "manufacturing",
  "healthcare", "hospital", "pharmaceuticals",
  "education", "higher education", "research",
  "government", "public administration",
  "logistics", "transportation", "automotive",
];

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

// Helpers
function matchesAny(str: string, keywords: string[]): boolean {
  return keywords.some((k) => str.includes(k));
}

/**
 * Détermine le segment ICP studios créa (Onde Review beta).
 * Logique ordonnée, déterministe, zéro API call.
 *
 * Ordre d'évaluation :
 *   (a) exclusions  — size>50, pure-player media-buying, industry non-créa → HORS_ICP
 *   (b) classification créa positive — sur industry + description + title
 *   (c) fallback texte — si enrichissement entreprise vide, on classe sur
 *       title + rawCompanyName
 *   (d) défaut prudent — B
 *
 * @param rawCompanyName  nom brut de l'entreprise (depuis le lead/CSV). Sert
 *   de signal de repli quand `enrichmentData.company` est absent ou vide.
 */
export function computeSegmentIcp(
  title: string | null | undefined,
  enrichmentData: EnrichmentForBucket | null | undefined,
  rawCompanyName?: string | null,
): IcpSegment {
  const titleLower = (title || "").toLowerCase();
  const companySize = enrichmentData?.company?.size || "";
  const industry = (enrichmentData?.company?.industry || "").toLowerCase();
  const description = (enrichmentData?.company?.description || "").toLowerCase();
  const rawNameLower = (rawCompanyName || "").toLowerCase();
  const sizeNum = parseSizeEstimate(companySize);

  // Enrichissement entreprise considéré "vide" si ni industry ni description.
  const enrichmentEmpty = !industry && !description;

  // --- Signaux titre ---
  const isFreelanceTitle = matchesAny(titleLower, FREELANCE_CREATIVE_TITLES);
  const isFounderTitle = matchesAny(titleLower, FOUNDER_TITLES);
  const isProdTitle = matchesAny(titleLower, PROD_TITLES);
  const isCraftTitle = matchesAny(titleLower, CRAFT_TITLES);
  const isCreativeTitle = matchesAny(titleLower, CREATIVE_TITLES);
  const hasCreativeTitle =
    isFounderTitle || isProdTitle || isCreativeTitle || isFreelanceTitle || isCraftTitle;

  // --- Signaux industry ---
  const isCreativeIndustry = matchesAny(industry, CREATIVE_INDUSTRIES);
  const isStudioIndustry = matchesAny(industry, STUDIO_INDUSTRIES);
  const isAgencyIndustry = matchesAny(industry, AGENCY_INDUSTRIES);
  const isNonCreativeIndustry = matchesAny(industry, NON_CREATIVE_INDUSTRIES);

  // --- Signaux texte (title + description + nom brut) ---
  const fullText = `${titleLower} ${description} ${rawNameLower}`;
  // Pure-player perf : on scanne title + description + industry. Les signaux
  // perf d'un pure-player sont souvent UNIQUEMENT dans le titre (ex. Ace :
  // "Agence Google Ads & SEA … Référencement Payant" dans le title seul).
  const hasPerfSignal = matchesAny(`${titleLower} ${description} ${industry}`, PERF_SIGNALS);
  const hasCreativeProdSignal = matchesAny(fullText, CREATIVE_PROD_SIGNALS);
  // Garde pure-player (a2) : on n'accepte comme preuve de créa QUE des signaux
  // forts — soit un VRAI rôle créa (créatif/craft/prod), soit un signal de
  // production studio (motion/film/branding…). Les mots génériques d'une desc
  // d'agence marketing ("Social Media Ads", "Création de site") ne suffisent pas.
  const hasCreaRole = isCreativeTitle || isCraftTitle || isProdTitle;
  const hasGenuineProdSignal = matchesAny(fullText, CREATIVE_PROD_STRONG);
  // La description renforce la détection studio/agence (signal le plus riche).
  const descIsStudio = matchesAny(description, CREATIVE_PROD_SIGNALS);
  const studioFit = isStudioIndustry || descIsStudio;
  const agencyFit = isAgencyIndustry;

  // =========================================================================
  // (a) EXCLUSIONS
  // =========================================================================

  // a1. Taille > 50 ET pas freelance solo → HORS_ICP
  if (sizeNum !== null && sizeNum > 50 && !isFreelanceTitle) return "HORS_ICP";

  // a2. Pure-player media-buying / perf : signal perf présent ET ni rôle créa
  //     réel ni signal de production studio fort → HORS_ICP.
  //     Ex. Ace : "CEO … Google Ads & SEA", desc agence marketing dont les seuls
  //     mots "créa" sont incidents ("Social Media Ads", "Création de site") →
  //     HORS_ICP. AYA : "Stratège créatif" (rôle créa) malgré "media buying" →
  //     conservé. Socialclub/Motion909 (signal studio) → conservés.
  if (hasPerfSignal && !hasCreaRole && !hasGenuineProdSignal) return "HORS_ICP";

  // a3. Industry clairement non-créa ET titre non-créa ET pas de signal prod → HORS_ICP
  if (
    isNonCreativeIndustry &&
    !hasCreativeTitle &&
    !isCreativeIndustry &&
    !hasCreativeProdSignal
  ) {
    return "HORS_ICP";
  }

  // =========================================================================
  // (b) CLASSIFICATION CRÉA POSITIVE (industry + description + title)
  // =========================================================================

  // Contexte freelance : titre freelance, nom d'entreprise "freelance", ou size 1.
  const isFreelanceContext =
    isFreelanceTitle ||
    matchesAny(rawNameLower, [
      "freelance", "indépendant", "independant",
      "auto-entrepreneur", "autoentrepreneur", "self-employed", "self employed",
    ]) ||
    sizeNum === 1;

  // b1. Founder family → studio (A) vs agence (D)
  //     Détection AGENCE prioritaire : si "agence"/"agency" apparaît dans le NOM
  //     ou la DESCRIPTION, le founder est D (jamais A), même si la desc mentionne
  //     "studio" comme vertical ou se dit "créative" (Socialclub, Kreads → D).
  //     A est réservé aux VRAIS studios : signal studio/production/motion SANS
  //     "agence"/"agency" (Studio SEER, Motion909, La Kabine → A).
  if (isFounderTitle) {
    const isAgence = matchesAny(`${description} ${rawNameLower}`, AGENCE_SIGNALS);
    if (isAgence) return "D";
    const hasStudioSignal =
      isStudioIndustry ||
      matchesAny(`${titleLower} ${description} ${rawNameLower}`, STUDIO_SIGNALS) ||
      // (c) Fallback texte si enrichissement vide : signal prod dans titre+nom.
      (enrichmentEmpty && matchesAny(fullText, CREATIVE_PROD_SIGNALS));
    if (hasStudioSignal) return "A";
    // Founder sans signal studio et sans mot "agence" connu → D par défaut.
    return "D";
  }

  // b2. Rôle "craft" (exécution) → E (freelance) / F (interne) — JAMAIS B
  if (isCraftTitle) {
    if (isFreelanceContext) return "E";
    // Contexte entreprise réel (industry créa/studio/agence, PME 2-50, ou nom
    // évoquant un studio/prod) → rôle interne → F.
    if (studioFit || isCreativeIndustry || agencyFit) return "F";
    if (sizeNum !== null && sizeNum >= 2) return "F";
    if (matchesAny(rawNameLower, CREATIVE_PROD_SIGNALS)) return "F";
    // Pas de contexte entreprise → craft solo → E.
    return "E";
  }

  // b3. Chef de projet / head of production en contexte créa → B
  if (isProdTitle) {
    return "B";
  }

  // b4. Freelance créa explicite → E
  if (isFreelanceTitle) return "E";

  // b5. Rôle créa stratégique / direction créa → C (agence/studio) ou F (PME interne)
  if (isCreativeTitle) {
    if (agencyFit || studioFit || isCreativeIndustry) return "C";
    // Rôle créa dans une PME (prod créative interne), taille 2-50 → F
    if (sizeNum !== null && sizeNum >= 2 && sizeNum <= 50) return "F";
    return "C"; // fallback rôle créa
  }

  // b6. Créa-fit par industry/description seule (titre inplaçable) → B (conservateur)
  if (isCreativeIndustry || descIsStudio) return "B";

  // =========================================================================
  // (c) FALLBACK TEXTE — enrichissement vide, on s'appuie sur titre + nom brut
  // =========================================================================
  if (enrichmentEmpty && matchesAny(fullText, CREATIVE_PROD_SIGNALS)) {
    return "B";
  }

  // =========================================================================
  // (d) DÉFAUT PRUDENT — on ne met pas HORS_ICP pour ne pas exclure par erreur
  // =========================================================================
  return "B";
}

// Exemples de classification (pour validation manuelle)
// { title: "Founder", industry: "Design", size: "5-10" }          → A
// { title: "Head of Production", industry: "Animation", size: "15-25" } → B
// { title: "Creative Director", industry: "Marketing and Advertising", size: "20-30" } → C
// { title: "CEO", industry: "Marketing and Advertising", size: "10-20" } → D
// { title: "Freelance Motion Designer", industry: "", size: "1" }  → E
// { title: "DA", industry: "Food & Beverages", size: "30-50" }     → F

export function assignBucket(lead: {
  title?: string | null;
  company?: string | null;
  enrichmentData?: EnrichmentForBucket | null;
}): BucketResult {
  const signalType = lead.enrichmentData?.signal?.type as SignalType | null | undefined;
  const isGoji = lead.enrichmentData?.signal?.source === "gojiberry";
  const decideur = isDecideur(lead.title);

  const segmentIcp = computeSegmentIcp(lead.title, lead.enrichmentData, lead.company);

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
