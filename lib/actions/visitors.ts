"use server";

import { getAuthUser } from "./auth";
import { getUnipileAccountIdForUser } from "./linkedin";
import { getUnipileClient } from "@/lib/unipile/client";
import type { ActionResult } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface LeadMatch {
  leadId: string;
  status: string;
  stage: string;
  /** Sequence info if active */
  sequence?: {
    name: string;
    currentStep: number;
    totalSteps: number;
    daysSinceEntry: number;
  };
}

export interface ProfileVisitor {
  name: string;
  title: string;
  company: string;
  profileUrl: string;
  profilePictureUrl: string | null;
  viewedAt: string;
  distance: string;
  connectionsInCommon: number | null;
  leadMatch?: LeadMatch;
}

export interface VisitorInsight {
  type: "company" | "jobTitle" | "source" | "notableViewers";
  label: string;
  count?: number;
}

export interface ProfileVisitorsResult {
  visitors: ProfileVisitor[];
  insights: VisitorInsight[];
  viewsChangePercentage: number | null;
  totalViewers: number;
  rawResponse?: unknown;
}

// =============================================================================
// Helpers
// =============================================================================

/** Safe nested property accessor for unknown data */
function get(obj: unknown, ...keys: string[]): unknown {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function str(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

/**
 * Build profile picture URL from LinkedIn VectorImage structure.
 * Picks the 200x200 artifact for a good balance of quality and size.
 */
function extractPictureUrl(pictureData: unknown): string | null {
  const vectorImage = get(pictureData, "com.linkedin.common.VectorImage");
  if (!vectorImage) return null;

  const rootUrl = str(get(vectorImage, "rootUrl"));
  const artifacts = get(vectorImage, "artifacts");
  if (!rootUrl || !Array.isArray(artifacts) || artifacts.length === 0) return null;

  // Prefer 200x200, fallback to first
  const target = artifacts.find(
    (a: Record<string, unknown>) => a.width === 200 || a.width === 199
  ) ?? artifacts[0];

  const segment = str(get(target, "fileIdentifyingUrlPathSegment"));
  if (!segment) return null;

  return rootUrl + segment;
}

/**
 * Extract timestamp from profileViewer URN.
 * Format: urn:li:profileViewer:(memberId,timestamp)
 */
function extractTimestamp(urn: string): string {
  const match = urn.match(/,(\d+)\)/);
  if (match) {
    return new Date(parseInt(match[1])).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Extract a single visitor from a WvmpProfileViewCard.
 * Returns null if the card doesn't contain a parseable viewer.
 */
function parseViewerCard(
  card: unknown,
): ProfileVisitor | null {
  const cardUrn = str(get(card, "objectUrn"));
  const viewCard = get(
    card,
    "value",
    "com.linkedin.voyager.identity.me.WvmpProfileViewCard"
  );
  if (!viewCard) return null;

  const viewer = get(viewCard, "viewer") as Record<string, unknown> | null;
  if (!viewer) return null;

  const viewerType = Object.keys(viewer)[0];

  if (viewerType === "com.linkedin.voyager.identity.me.FullProfileViewer") {
    const full = viewer[viewerType] as Record<string, unknown>;
    const miniProfile = get(full, "profile", "miniProfile") as Record<string, unknown> | null;
    if (!miniProfile) return null;

    const firstName = str(get(miniProfile, "firstName"));
    const lastName = str(get(miniProfile, "lastName"));
    const occupation = str(get(miniProfile, "occupation"));
    const publicId = str(get(miniProfile, "publicIdentifier"));
    const distance = str(get(full, "profile", "distance", "value"));
    const pictureUrl = extractPictureUrl(get(miniProfile, "picture"));

    const connInsight = get(
      viewCard,
      "insight",
      "value",
      "com.linkedin.voyager.identity.me.ConnectionsInCommonInsight"
    );
    const connectionsInCommon = typeof get(connInsight, "numConnectionsInCommon") === "number"
      ? (get(connInsight, "numConnectionsInCommon") as number)
      : null;

    return {
      name: `${firstName} ${lastName}`.trim() || "Visiteur inconnu",
      title: occupation,
      company: "",
      profileUrl: publicId ? `https://www.linkedin.com/in/${publicId}` : "",
      profilePictureUrl: pictureUrl,
      viewedAt: extractTimestamp(cardUrn),
      distance,
      connectionsInCommon,
    };
  }

  if (viewerType === "com.linkedin.voyager.identity.me.ObfuscatedProfileViewer") {
    const obfuscated = viewer[viewerType] as Record<string, unknown>;
    const headline = str(get(obfuscated, "headline"));
    const companyName = str(get(obfuscated, "companyName"));

    return {
      name: "Visiteur LinkedIn",
      title: headline || companyName || "Profil masqué",
      company: companyName,
      profileUrl: "",
      profilePictureUrl: null,
      viewedAt: extractTimestamp(cardUrn),
      distance: "",
      connectionsInCommon: null,
    };
  }

  return null;
}

/**
 * Parse the Voyager wvmpCards response into structured data.
 * Extracts visitors from ALL insight cards (Summary, Notable, Company,
 * JobTitle, Source) and deduplicates by URN.
 */
function parseVisitorsResponse(data: unknown): {
  visitors: ProfileVisitor[];
  insights: VisitorInsight[];
  viewsChangePercentage: number | null;
  totalViewers: number;
} {
  const insights: VisitorInsight[] = [];
  let viewsChangePercentage: number | null = null;

  const elements = get(data, "data", "elements");
  if (!Array.isArray(elements) || elements.length === 0) {
    return { visitors: [], insights, viewsChangePercentage, totalViewers: 0 };
  }

  const viewersCard = get(
    elements[0],
    "value",
    "com.linkedin.voyager.identity.me.wvmpOverview.WvmpViewersCard"
  );
  if (!viewersCard) {
    return { visitors: [], insights, viewsChangePercentage, totalViewers: 0 };
  }

  const insightCards = get(viewersCard, "insightCards");
  if (!Array.isArray(insightCards)) {
    return { visitors: [], insights, viewsChangePercentage, totalViewers: 0 };
  }

  // Collect ALL unique visitors across every insight card type
  const seenUrns = new Set<string>();
  const visitors: ProfileVisitor[] = [];

  function collectVisitorsFromCards(cards: unknown[]) {
    for (const card of cards) {
      const urn = str(get(card, "objectUrn"));
      if (!urn || seenUrns.has(urn)) continue;
      seenUrns.add(urn);

      const visitor = parseViewerCard(card);
      if (visitor) visitors.push(visitor);
    }
  }

  for (const insightCard of insightCards) {
    const value = get(insightCard, "value") as Record<string, unknown> | null;
    if (!value) continue;

    const valueType = Object.keys(value)[0];
    const shortType = valueType?.split(".").pop();
    const cardData = value[valueType] as Record<string, unknown>;
    const cards = get(cardData, "cards");

    switch (shortType) {
      case "WvmpSummaryInsightCard": {
        viewsChangePercentage =
          typeof cardData.numViewsChangeInPercentage === "number"
            ? cardData.numViewsChangeInPercentage
            : null;
        if (Array.isArray(cards)) collectVisitorsFromCards(cards);
        break;
      }

      case "WvmpNotableViewersInsightCard": {
        if (Array.isArray(cards)) collectVisitorsFromCards(cards);
        insights.push({ type: "notableViewers", label: "Notable viewers" });
        break;
      }

      case "WvmpCompanyInsightCard": {
        if (Array.isArray(cards)) collectVisitorsFromCards(cards);
        const companyName = str(get(cardData, "companyName")) || str(get(cardData, "title"));
        if (companyName) {
          const count = typeof get(cardData, "numViews") === "number"
            ? (get(cardData, "numViews") as number)
            : (Array.isArray(cards) ? cards.length : undefined);
          insights.push({ type: "company", label: companyName, count });
        }
        break;
      }

      case "WvmpJobTitleInsightCard": {
        if (Array.isArray(cards)) collectVisitorsFromCards(cards);
        const title = str(get(cardData, "viewerTitle")) || str(get(cardData, "title")) || str(get(cardData, "jobTitle"));
        if (title) {
          insights.push({ type: "jobTitle", label: title });
        }
        break;
      }

      case "WvmpSourceInsightCard": {
        if (Array.isArray(cards)) collectVisitorsFromCards(cards);
        const referrerText = str(get(cardData, "referrer", "text"));
        const source = referrerText || str(get(cardData, "title")) || str(get(cardData, "source"));
        if (source) {
          insights.push({ type: "source", label: source });
        }
        break;
      }
    }
  }

  // Sort by visit date descending (most recent first)
  visitors.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  return { visitors, insights, viewsChangePercentage, totalViewers: visitors.length };
}

// =============================================================================
// Lead matching
// =============================================================================

import { createServerClient } from "@/lib/supabase/server";

/**
 * Match visitors against leads in DB by linkedin_url.
 * Enriches each matched visitor with lead status, stage, and active sequence info.
 */
async function matchVisitorsWithLeads(
  visitors: ProfileVisitor[],
): Promise<void> {
  // Collect publicIdentifiers from identified visitors
  const identifiedVisitors = visitors.filter((v) => v.profileUrl);
  if (identifiedVisitors.length === 0) return;

  const supabase = await createServerClient();

  // Query all leads that match any visitor's linkedin_url
  // We use ilike with the publicIdentifier slug
  const slugs = identifiedVisitors
    .map((v) => {
      const match = v.profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
      return match ? match[1] : null;
    })
    .filter(Boolean) as string[];

  if (slugs.length === 0) return;

  // Batch query: get all leads whose linkedin_url contains any of these slugs
  const { data: leads } = await supabase
    .from("leads")
    .select("id, linkedin_url, status, stage")
    .not("linkedin_url", "is", null);

  if (!leads || leads.length === 0) return;

  // Build slug -> lead map
  const slugToLead = new Map<string, { id: string; status: string; stage: string }>();
  for (const lead of leads) {
    if (!lead.linkedin_url) continue;
    const match = lead.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (match) {
      slugToLead.set(match[1].toLowerCase(), {
        id: lead.id,
        status: lead.status ?? "cold",
        stage: lead.stage ?? "to_invite",
      });
    }
  }

  // Get active sequence_leads for matched lead IDs
  const matchedLeadIds = Array.from(slugToLead.values()).map((l) => l.id);
  const { data: seqLeads } = await supabase
    .from("sequence_leads")
    .select("lead_id, current_step, status, entered_at, sequence_id, sequences!inner(name)")
    .in("lead_id", matchedLeadIds)
    .eq("status", "active");

  // Get step counts per sequence
  const seqIdSet = new Set((seqLeads || []).map((sl) => sl.sequence_id));
  const seqIds = Array.from(seqIdSet);
  const stepCounts = new Map<string, number>();
  if (seqIds.length > 0) {
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("sequence_id")
      .in("sequence_id", seqIds);
    if (steps) {
      for (const s of steps) {
        stepCounts.set(s.sequence_id, (stepCounts.get(s.sequence_id) || 0) + 1);
      }
    }
  }

  // Build leadId -> sequence info map
  const leadSeqMap = new Map<string, LeadMatch["sequence"]>();
  for (const sl of seqLeads || []) {
    const seqName = (sl.sequences as unknown as { name: string })?.name || "Séquence";
    const daysSince = Math.floor(
      (Date.now() - new Date(sl.entered_at).getTime()) / 86_400_000
    );
    leadSeqMap.set(sl.lead_id, {
      name: seqName,
      currentStep: sl.current_step ?? 0,
      totalSteps: stepCounts.get(sl.sequence_id) || 0,
      daysSinceEntry: daysSince,
    });
  }

  // Enrich visitors
  for (const visitor of identifiedVisitors) {
    const match = visitor.profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (!match) continue;
    const slug = match[1].toLowerCase();
    const lead = slugToLead.get(slug);
    if (!lead) continue;

    visitor.leadMatch = {
      leadId: lead.id,
      status: lead.status,
      stage: lead.stage,
      sequence: leadSeqMap.get(lead.id),
    };
  }
}

// =============================================================================
// Server Action
// =============================================================================

/**
 * Fetch LinkedIn profile visitors for the authenticated user via Unipile raw endpoint.
 */
export async function getProfileVisitors(): Promise<
  ActionResult<ProfileVisitorsResult>
> {
  try {
    const { user } = await getAuthUser();

    const accountId = await getUnipileAccountIdForUser(user.id);
    if (!accountId) {
      return {
        success: false,
        error: "Aucun compte LinkedIn connecté. Allez dans Réglages > Clés API pour connecter votre compte.",
      };
    }

    const client = getUnipileClient();

    // Call LinkedIn Voyager API via Unipile raw endpoint
    const rawResponse = await client.linkedinRaw({
      account_id: accountId,
      request_url: "https://www.linkedin.com/voyager/api/identity/wvmpCards",
    });

    const { visitors, insights, viewsChangePercentage, totalViewers } =
      parseVisitorsResponse(rawResponse);

    // Enrich identified visitors with lead/sequence data from DB
    await matchVisitorsWithLeads(visitors);

    return {
      success: true,
      data: {
        visitors,
        insights,
        viewsChangePercentage,
        totalViewers,
        rawResponse: visitors.length === 0 ? rawResponse : undefined,
      },
    };
  } catch (err) {
    console.error("[visitors] Error fetching profile visitors:", err);
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}
