import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac } from "crypto";
import {
  createServiceClient,
  type ServiceClient,
} from "@/lib/supabase/service";
import type {
  IcypeasWebhookItemData,
  IcypeasEmailEnrichment,
  IcypeasTerminalStatus,
} from "@/lib/icypeas/types";
import type { Json } from "@/types/database";

/**
 * POST /api/webhooks/icypeas
 * Receives webhook events from Icypeas (item results + bulk done).
 * Uses service_role client to bypass RLS (no user session).
 * Always returns 200 to prevent retries.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signature, timestamp, data } = body;

    // Debug: log incoming webhook
    const externalId = data?.userData?.externalId ?? "n/a";
    const status = data?.status ?? "n/a";
    console.log(`[Webhook Icypeas] Received — externalId=${externalId}, status=${status}, hasSignature=${!!signature}, timestamp=${timestamp ?? "n/a"}`);

    // Verify HMAC-SHA1 signature
    if (!verifySignature(signature, timestamp, req.nextUrl.pathname)) {
      console.warn(`[Webhook Icypeas] REJECTED — invalid signature. signature=${signature}, timestamp=${timestamp}, pathname=${req.nextUrl.pathname}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (!data) {
      console.warn("[Webhook Icypeas] No data in payload");
      return NextResponse.json({ received: true });
    }

    // Discriminate: item result vs bulk_done
    if (isItemResult(data)) {
      const supabase = createServiceClient();
      await handleItemResult(supabase, data);
    } else {
      // Bulk done — just log stats
      console.log("[Webhook Icypeas] Bulk done:", JSON.stringify(data).slice(0, 500));
    }
  } catch (err) {
    console.error("[Webhook Icypeas] Processing error:", err);
  }

  return NextResponse.json({ received: true });
}

// =============================================================================
// Signature verification
// =============================================================================

function verifySignature(
  signature: string | undefined,
  timestamp: string | undefined,
  pathname: string
): boolean {
  const secret = process.env.ICYPEAS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[Webhook Icypeas] ICYPEAS_WEBHOOK_SECRET not set — skipping verification");
    return true; // Allow in dev without secret
  }

  if (!signature || !timestamp) return false;

  const payload = (pathname + timestamp).toLowerCase();
  const expected = createHmac("sha1", secret).update(payload).digest("hex");

  return expected === signature;
}

// =============================================================================
// Type guard
// =============================================================================

function isItemResult(data: unknown): data is IcypeasWebhookItemData {
  return (
    typeof data === "object" &&
    data !== null &&
    "results" in data &&
    "userData" in data &&
    typeof (data as IcypeasWebhookItemData).results === "object"
  );
}

// =============================================================================
// Item result handler
// =============================================================================

const BACKFILL_CERTAINTIES = new Set(["ultra_sure", "very_sure", "probable"]);

async function handleItemResult(
  supabase: ServiceClient,
  item: IcypeasWebhookItemData
) {
  const leadId = item.userData?.externalId;
  if (!leadId) {
    console.warn("[Webhook Icypeas] Item result without externalId, skipping");
    return;
  }

  console.log(`[Webhook Icypeas] handleItemResult START — lead=${leadId}, itemStatus=${item.status}, emails=${JSON.stringify(item.results?.emails ?? [])}`);

  // Build enrichment object (same logic as single pipeline)
  const bestEmail = item.results.emails?.[0] ?? null;
  const emailEnrichment: IcypeasEmailEnrichment = {
    email: bestEmail?.email ?? null,
    certainty: bestEmail?.certainty ?? null,
    mxProvider: bestEmail?.mxProvider ?? null,
    mxRecords: bestEmail?.mxRecords ?? [],
    phones: item.results.phones ?? [],
    saasServices: item.results.saasServices ?? [],
    gender: item.results.gender ?? null,
    linkedinUrl: item.results.li || null,
    searchId: item._id,
    status: item.status as IcypeasTerminalStatus,
    enrichedAt: new Date().toISOString(),
  };

  // Fetch current lead
  let lead;
  try {
    const { data, error: fetchError } = await supabase
      .from("leads")
      .select("id, email, phone, enrichment_data")
      .eq("id", leadId)
      .maybeSingle();

    if (fetchError) {
      console.error(`[Webhook Icypeas] DB fetch error for lead ${leadId}:`, fetchError.message, fetchError.code);
      return;
    }
    if (!data) {
      console.warn(`[Webhook Icypeas] Lead ${leadId} not found in DB`);
      return;
    }
    lead = data;
  } catch (err) {
    console.error(`[Webhook Icypeas] DB fetch threw for lead ${leadId}:`, err);
    return;
  }

  // Merge email_enrichment into existing enrichment_data
  const existingData = (lead.enrichment_data as Record<string, unknown>) || {};
  const mergedData = {
    ...existingData,
    email_enrichment: emailEnrichment,
  };

  try {
    const { error: updateError } = await supabase
      .from("leads")
      .update({ enrichment_data: mergedData as unknown as Json })
      .eq("id", leadId);

    if (updateError) {
      console.error(`[Webhook Icypeas] enrichment_data UPDATE failed for lead ${leadId}:`, updateError.message, updateError.code, updateError.details);
      return;
    }
    console.log(`[Webhook Icypeas] enrichment_data written OK for lead ${leadId}`);
  } catch (err) {
    console.error(`[Webhook Icypeas] enrichment_data UPDATE threw for lead ${leadId}:`, err);
    return;
  }

  // Backfill email + phone on the lead row if sufficient certainty
  const fieldUpdates: Record<string, string> = {};

  if (
    emailEnrichment.email &&
    emailEnrichment.certainty &&
    BACKFILL_CERTAINTIES.has(emailEnrichment.certainty) &&
    !lead.email
  ) {
    fieldUpdates.email = emailEnrichment.email;
  } else {
    console.log(`[Webhook Icypeas] Lead ${leadId} email backfill skipped — email=${emailEnrichment.email}, certainty=${emailEnrichment.certainty}, existingEmail=${lead.email ?? "null"}`);
  }

  if (emailEnrichment.phones?.[0] && !lead.phone) {
    fieldUpdates.phone = emailEnrichment.phones[0];
  }

  if (Object.keys(fieldUpdates).length > 0) {
    try {
      const { error: backfillError } = await supabase
        .from("leads")
        .update({ ...fieldUpdates, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (backfillError) {
        console.error(`[Webhook Icypeas] Backfill UPDATE failed for lead ${leadId}:`, backfillError.message, backfillError.code);
      } else {
        console.log(`[Webhook Icypeas] Backfill OK for lead ${leadId}: ${JSON.stringify(fieldUpdates)}`);
      }
    } catch (err) {
      console.error(`[Webhook Icypeas] Backfill threw for lead ${leadId}:`, err);
    }
  }

  console.log(
    `[Webhook Icypeas] handleItemResult DONE — lead=${leadId}: ${emailEnrichment.email ?? "no email"} (${emailEnrichment.certainty ?? "n/a"}, status=${emailEnrichment.status})`
  );
}
