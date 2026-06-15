/**
 * Gojiberry CSV parsing utilities.
 * Used by both the server action (import) and the client (preview).
 * NOT a server action file — no "use server" directive.
 */

import type { SignalType } from "@/types/leads";

// ---------------------------------------------------------------------------
// Gojiberry CSV row (parsed from headers)
// ---------------------------------------------------------------------------

export interface GojiberryCSVRow {
  firstName: string;
  lastName: string;
  email?: string;
  email2?: string;
  email3?: string;
  phone?: string;
  phone2?: string;
  phone3?: string;
  location?: string;
  jobTitle?: string;
  industry?: string;
  company?: string;
  companyUrl?: string;
  website?: string;
  importDate?: string;
  intent?: string;
  profileUrl?: string;
  totalScore?: string;
  intentKeyword?: string;
}

// ---------------------------------------------------------------------------
// Header auto-mapping (Gojiberry CSV column names -> internal fields)
// ---------------------------------------------------------------------------

const GOJIBERRY_HEADER_MAP: Record<string, keyof GojiberryCSVRow | null> = {
  "first name": "firstName",
  "last name": "lastName",
  "email": "email",
  "email 2": "email2",
  "email 3": "email3",
  "phone": "phone",
  "phone 2": "phone2",
  "phone 3": "phone3",
  "location": "location",
  "job title": "jobTitle",
  "industry": "industry",
  "company": "company",
  "company url": "companyUrl",
  "website": "website",
  "import date": "importDate",
  "intent": "intent",
  "profile url": "profileUrl",
  "total score": "totalScore",
  "intent keyword": "intentKeyword",
  "personnalized email message": null,
  "personnalized linkedin message": null,
};

// ---------------------------------------------------------------------------
// Intent HTML parser
// ---------------------------------------------------------------------------

export interface ParsedIntent {
  signalType: SignalType;
  detail: string;
  postUrl: string | null;
  expertUrl: string | null;
  keyword: string | null;
}

export function parseGojiberryIntent(
  intentHtml: string,
  intentKeyword: string
): ParsedIntent {
  const intent = intentHtml.trim();
  const keyword = intentKeyword.trim();

  // 1. Job change signal
  if (intent.includes("Strategic Window: Just hired")) {
    return {
      signalType: "NEW_ROLE",
      detail: "Prise de poste recente (<90 jours)",
      postUrl: null,
      expertUrl: null,
      keyword: null,
    };
  }

  // 2. Top 5% active signal
  if (intent.includes("Top 5% most active")) {
    return {
      signalType: "ICP_TOP_ACTIVE",
      detail: "Top 5% des profils les plus actifs dans l'ICP",
      postUrl: null,
      expertUrl: null,
      keyword: null,
    };
  }

  // 3. Engagement signals (with post/expert URL in HTML)
  if (intent.includes("Just engaged with")) {
    const hrefMatch = intent.match(/href='([^']+)'/);
    const postUrl = hrefMatch?.[1] || null;

    if (keyword.includes("linkedin.com/in/")) {
      return {
        signalType: "ENGAGEMENT_EXPERT",
        detail: "Engagement avec un expert du secteur",
        postUrl,
        expertUrl: keyword,
        keyword: null,
      };
    }

    if (keyword.includes("linkedin.com/company/")) {
      return {
        signalType: "COMPETITOR_ENGAGEMENT",
        detail: "Engagement avec du contenu concurrent",
        postUrl,
        expertUrl: null,
        keyword: null,
      };
    }

    const cleanedKeyword = keyword.replace(/^"+|"+$/g, "").trim();
    return {
      signalType: "ENGAGEMENT_KEYWORD",
      detail: cleanedKeyword
        ? `Engagement sur contenu "${cleanedKeyword}"`
        : "Engagement avec du contenu LinkedIn",
      postUrl,
      expertUrl: null,
      keyword: cleanedKeyword || null,
    };
  }

  // 4. Fallback
  return {
    signalType: "SIGNAL_FAIBLE",
    detail: intent || "Signal non classifie",
    postUrl: null,
    expertUrl: null,
    keyword: null,
  };
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

export function parseGojiberryCSVHeaders(
  headers: string[]
): Map<number, keyof GojiberryCSVRow> {
  const mapping = new Map<number, keyof GojiberryCSVRow>();

  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i].trim().toLowerCase();
    const field = GOJIBERRY_HEADER_MAP[normalized];
    if (field) {
      mapping.set(i, field);
    }
  }

  return mapping;
}

export function mapCSVRowToGojiberry(
  values: string[],
  headerMapping: Map<number, keyof GojiberryCSVRow>
): GojiberryCSVRow {
  const row: Partial<GojiberryCSVRow> = {};

  headerMapping.forEach((field, index) => {
    if (index < values.length && values[index]) {
      (row as Record<string, string>)[field] = values[index].trim();
    }
  });

  return {
    firstName: row.firstName || "",
    lastName: row.lastName || "",
    ...row,
  };
}
