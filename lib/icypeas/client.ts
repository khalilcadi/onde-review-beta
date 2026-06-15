// ---------------------------------------------------------------------------
// Icypeas HTTP client — email search (single) + poll result
// ---------------------------------------------------------------------------

import type {
  IcypeasSearchResponse,
  IcypeasEmailResult,
  IcypeasEmailEnrichment,
  IcypeasPendingStatus,
  IcypeasBulkSearchResponse,
} from "./types";

const ICYPEAS_BASE_URL = "https://app.icypeas.com/api";

const PENDING_STATUSES: Set<string> = new Set<IcypeasPendingStatus>([
  "NONE",
  "SCHEDULED",
  "IN_PROGRESS",
]);

function getApiKey(): string {
  const key = process.env.ICYPEAS_API_KEY;
  if (!key) throw new Error("ICYPEAS_API_KEY is not set");
  return key;
}

function headers(): HeadersInit {
  return {
    Authorization: getApiKey(),
    "Content-Type": "application/json",
  };
}

// -- Search ------------------------------------------------------------------

export async function searchEmail(
  firstName: string,
  lastName: string,
  domainOrCompany: string,
  externalId?: string
): Promise<string | null> {
  try {
    const res = await fetch(`${ICYPEAS_BASE_URL}/email-search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        firstname: firstName,
        lastname: lastName,
        domainOrCompany,
        ...(externalId ? { custom: { externalId } } : {}),
      }),
    });

    if (!res.ok) {
      console.error(`[Icypeas] searchEmail HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const data = (await res.json()) as IcypeasSearchResponse;
    if (!data.success || !data.item?._id) {
      console.warn("[Icypeas] searchEmail: success=false or missing _id", data);
      return null;
    }

    return data.item._id;
  } catch (err) {
    console.error("[Icypeas] searchEmail failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// -- Read result -------------------------------------------------------------

export async function readResult(id: string): Promise<IcypeasEmailResult | null> {
  try {
    const res = await fetch(`${ICYPEAS_BASE_URL}/bulk-single-searchs/read`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      console.error(`[Icypeas] readResult HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    return (await res.json()) as IcypeasEmailResult;
  } catch (err) {
    console.error("[Icypeas] readResult failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// -- Poll until terminal status ----------------------------------------------

export async function pollResult(
  id: string,
  maxAttempts = 5,
  intervalMs = 3000
): Promise<IcypeasEmailResult | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await readResult(id);
    if (!result) return null;

    const item = result.items?.[0];
    if (!item) return null;

    if (!PENDING_STATUSES.has(item.status)) {
      return result;
    }

    // Wait before next attempt (skip wait on last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.warn(`[Icypeas] pollResult: timeout after ${maxAttempts} attempts for id=${id}`);
  return null;
}

// -- Bulk search --------------------------------------------------------------

const MAX_BULK_ITEMS = 5000;

export async function bulkSearch(
  name: string,
  data: [string, string, string][],
  externalIds: string[],
  webhookUrl: string
): Promise<IcypeasBulkSearchResponse | null> {
  if (data.length === 0) return null;
  if (data.length > MAX_BULK_ITEMS) {
    console.error(`[Icypeas] bulkSearch: ${data.length} items exceeds max ${MAX_BULK_ITEMS}`);
    return null;
  }

  try {
    const res = await fetch(`${ICYPEAS_BASE_URL}/bulk-search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name,
        task: "email-search",
        data,
        custom: {
          externalIds,
          webhookUrlItem: webhookUrl,
          webhookUrlBulkDone: webhookUrl,
          includeResultsInWebhook: true,
        },
      }),
    });

    if (!res.ok) {
      console.error(`[Icypeas] bulkSearch HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const result = (await res.json()) as IcypeasBulkSearchResponse;
    if (!result.success) {
      console.warn("[Icypeas] bulkSearch: success=false", result);
      return null;
    }

    console.log(`[Icypeas] bulkSearch started: file=${result.file}, items=${data.length}`);
    return result;
  } catch (err) {
    console.error("[Icypeas] bulkSearch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// -- Convenience: search + poll → enrichment object --------------------------

export async function searchAndPoll(
  firstName: string,
  lastName: string,
  domainOrCompany: string,
  externalId?: string
): Promise<IcypeasEmailEnrichment | null> {
  const searchId = await searchEmail(firstName, lastName, domainOrCompany, externalId);
  if (!searchId) return null;

  const result = await pollResult(searchId);
  if (!result?.items?.[0]) return null;

  const item = result.items[0];
  const bestEmail = item.results.emails?.[0] ?? null;

  return {
    email: bestEmail?.email ?? null,
    certainty: bestEmail?.certainty ?? null,
    mxProvider: bestEmail?.mxProvider ?? null,
    mxRecords: bestEmail?.mxRecords ?? [],
    phones: item.results.phones ?? [],
    saasServices: item.results.saasServices ?? [],
    gender: item.results.gender ?? null,
    linkedinUrl: item.results.li || null,
    searchId,
    status: item.status as IcypeasEmailEnrichment["status"],
    enrichedAt: new Date().toISOString(),
  };
}
