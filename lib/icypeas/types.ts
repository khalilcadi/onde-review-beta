// ---------------------------------------------------------------------------
// Icypeas API types — Email enrichment (single search + poll)
// ---------------------------------------------------------------------------

export type IcypeasCertainty = "ultra_sure" | "very_sure" | "probable" | "not_found";

/** Statuts en cours — nécessitent un re-poll */
export type IcypeasPendingStatus = "NONE" | "SCHEDULED" | "IN_PROGRESS";

/** Statuts terminaux — résultat final */
export type IcypeasTerminalStatus =
  | "DEBITED"
  | "FOUND"
  | "NOT_FOUND"
  | "DEBITED_NOT_FOUND"
  | "BAD_INPUT"
  | "INSUFFICIENT_FUNDS";

export type IcypeasStatus = IcypeasPendingStatus | IcypeasTerminalStatus;

// -- Request / Response types ------------------------------------------------

export interface IcypeasSearchRequest {
  firstname: string;
  lastname: string;
  domainOrCompany: string;
  custom?: {
    webhookUrl?: string;
    externalId?: string;
  };
}

export interface IcypeasSearchResponse {
  success: boolean;
  item: {
    status: IcypeasStatus;
    _id: string;
  };
}

export interface IcypeasReadRequest {
  id: string;
}

export interface IcypeasEmailEntry {
  email: string;
  certainty: IcypeasCertainty;
  mxRecords?: string[];
  mxProvider?: string;
}

export interface IcypeasEmailResult {
  items: Array<{
    results: {
      firstname: string;
      lastname: string;
      fullname: string;
      gender: string;
      li: string;
      emails: IcypeasEmailEntry[];
      phones: string[];
      saasServices: string[];
    };
    status: IcypeasStatus;
    userData: {
      externalId: string;
      provider: string;
    };
    system: {
      createdAt: string;
      modifiedAt: string;
    };
    _id: string;
  }>;
}

// -- Bulk Search types --------------------------------------------------------

export interface IcypeasBulkSearchRequest {
  name: string;
  task: "email-search";
  data: [string, string, string][]; // [firstname, lastname, domainOrCompany]
  custom?: {
    externalIds?: string[];
    webhookUrlItem?: string;
    webhookUrlBulkDone?: string;
    includeResultsInWebhook?: boolean;
  };
}

export interface IcypeasBulkSearchResponse {
  success: boolean;
  file: string; // bulk_id
  status: string;
}

/** Webhook payload wrapper sent by Icypeas */
export interface IcypeasWebhookPayload {
  signature: string;
  timestamp: string;
  data: IcypeasWebhookItemData | IcypeasWebhookBulkDoneData;
}

/** Item-level webhook: contains email search results */
export interface IcypeasWebhookItemData {
  results: {
    firstname: string;
    lastname: string;
    fullname: string;
    gender: string;
    li: string;
    emails: IcypeasEmailEntry[];
    phones: string[];
    saasServices: string[];
  };
  status: IcypeasStatus;
  userData: {
    externalId: string;
    provider: string;
  };
  system: {
    createdAt: string;
    modifiedAt: string;
  };
  _id: string;
}

/** Bulk-done webhook: summary stats */
export interface IcypeasWebhookBulkDoneData {
  file: string;
  stats?: Record<string, unknown>;
  [key: string]: unknown;
}

// -- What we store in enrichment_data.email_enrichment -----------------------

export interface IcypeasEmailEnrichment {
  email: string | null;
  certainty: IcypeasCertainty | null;
  mxProvider: string | null;
  mxRecords: string[];
  phones: string[];
  saasServices: string[];
  gender: string | null;
  linkedinUrl: string | null;
  searchId: string;
  status: IcypeasTerminalStatus;
  enrichedAt: string;
}
