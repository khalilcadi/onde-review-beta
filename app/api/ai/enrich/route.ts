import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { type LeadForGeneration } from "@/lib/ai/lead-context";
import {
  getUnipileClient,
  extractLinkedInIdentifier,
} from "@/lib/unipile/client";
import { computeSegmentIcp } from "@/lib/scoring-buckets";
import type { Database } from "@/types/database";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Stages éligibles à l'auto-correction vers "connected" */
const AUTO_CORRECT_ELIGIBLE_STAGES = ["to_invite", "invited"];

/** Vérifie si network_distance indique une connexion 1er degré */
function isFirstDegreeConnection(networkDistance: string | null | undefined): boolean {
  if (!networkDistance) return false;
  const normalized = networkDistance.toUpperCase().trim();
  return (
    normalized === "FIRST" ||
    normalized === "FIRST_DEGREE" ||
    normalized === "DISTANCE_1" ||
    normalized === "1" ||
    normalized === "1ST"
  );
}

// ---------------------------------------------------------------------------
// Post summary type (from Step 1)
// ---------------------------------------------------------------------------

interface PostSummary {
  summary: string;
  sujet?: string;
  tension?: string | null;
  ton?: string;
  reactions: number;
  comments: number;
  date: string;
}

interface FilteredPost {
  text: string;
  reactions_count: number;
  comments_count: number;
  date: string;
  social_id?: string;
  share_url?: string | null;
  author_name?: string | null;
}

// ---------------------------------------------------------------------------
// Helper: parse Unipile relative dates ("2d", "1w", "3mo", "1yr")
// ---------------------------------------------------------------------------

function parseRelativeDate(relative: string): Date | null {
  const match = relative.match(/^(\d+)\s*(d|h|w|mo|yr)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();
  switch (unit) {
    case "h": now.setHours(now.getHours() - amount); break;
    case "d": now.setDate(now.getDate() - amount); break;
    case "w": now.setDate(now.getDate() - amount * 7); break;
    case "mo": now.setMonth(now.getMonth() - amount); break;
    case "yr": now.setFullYear(now.getFullYear() - amount); break;
    default: return null;
  }
  return now;
}

// ---------------------------------------------------------------------------
// Step 1: Unipile (source de vérité profil + posts)
// ---------------------------------------------------------------------------

async function stepUnipile(
  lead: LeadForGeneration,
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<{
  linkedinProfile: Record<string, unknown> | null;
  filteredPosts: FilteredPost[];
  postSummaries: PostSummary[];
  linkedinPosts: Record<string, unknown>[];
  headline: string | null;
  about: string | null;
  profileFirstName: string | null;
  profileLastName: string | null;
  currentCompanyId: string | null;
  currentCompanyName: string | null;
  accountId: string | null;
}> {
  const { data: linkedinAccount } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!linkedinAccount?.unipile_account_id || !lead.linkedinUrl) {
    return { linkedinProfile: null, filteredPosts: [], postSummaries: [], linkedinPosts: [], headline: null, about: null, profileFirstName: null, profileLastName: null, currentCompanyId: null, currentCompanyName: null, accountId: null };
  }

  const identifier = extractLinkedInIdentifier(lead.linkedinUrl);
  const client = getUnipileClient();

  // Fetch full profile
  const profile = await client
    .getUserProfile(identifier, linkedinAccount.unipile_account_id, {
      linkedinSections: "*",
    })
    .catch((err) => {
      console.warn(`[ENRICH DEBUG] getUserProfile FAILED for identifier="${identifier}":`, err instanceof Error ? err.message : err);
      return null;
    });

  // Fetch posts
  const providerId = profile?.provider_id;
  console.log(`[ENRICH DEBUG] provider_id=${providerId ?? "MISSING"}, identifier=${identifier}`);
  const postsResponse = providerId
    ? await client
        .getUserPostsByIdentifier(providerId, linkedinAccount.unipile_account_id, 10)
        .catch((err) => {
          console.warn(`[ENRICH DEBUG] getUserPostsByIdentifier FAILED for provider_id="${providerId}":`, err instanceof Error ? err.message : err);
          return null;
        })
    : null;
  console.log(`[ENRICH DEBUG] Posts bruts reçus: ${postsResponse?.items?.length ?? 0} (postsResponse is ${postsResponse ? "truthy" : "null"})`);

  const experience = profile?.work_experience || profile?.experience || [];
  const aboutText = profile?.summary || profile?.about || null;
  const headlineText = profile?.headline || null;

  // Extract profile data with new fields (education, shared_connections_count)
  let linkedinProfile: Record<string, unknown> | null = null;
  if (profile) {
    linkedinProfile = {
      headline: headlineText,
      about: aboutText,
      profile_picture_url: profile.profile_picture_url || null,
      profile_picture_url_large: profile.profile_picture_url_large || null,
      location: profile.location || null,
      connections_count: profile.connections_count ?? null,
      follower_count: profile.follower_count ?? profile.followers_count ?? null,
      is_premium: profile.is_premium ?? null,
      is_open_profile: profile.is_open_profile ?? null,
      is_creator: profile.is_creator ?? null,
      network_distance: profile.network_distance || null,
      skills: profile.skills || [],
      languages: profile.languages || [],
      websites: profile.websites || [],
      contact_info: profile.contact_info || null,
      creator_website: profile.creator_website || null,
      education: profile.education || [],
      shared_connections_count: profile.shared_connections_count ?? null,
    };
  }

  // Filter posts: only keep posts from last 30 days
  // Unipile returns: date ("2d","1w","3mo"), parsed_datetime (ISO?), reaction_counter, comment_counter, author (object)
  const now = Date.now();
  const rawPosts = (postsResponse?.items || []) as unknown as Record<string, unknown>[];
  const filteredPosts: FilteredPost[] = [];
  const linkedinPosts: Record<string, unknown>[] = [];

  for (const post of rawPosts) {
    // Resolve date: prefer parsed_datetime (ISO), fallback to relative "date" field
    let postDate: Date | null = null;
    if (post.parsed_datetime) {
      postDate = new Date(post.parsed_datetime as string);
    } else if (post.date && typeof post.date === "string") {
      postDate = parseRelativeDate(post.date as string);
    }

    if (!postDate || isNaN(postDate.getTime())) continue;
    if (now - postDate.getTime() > THIRTY_DAYS_MS) continue;

    const dateStr = postDate.toISOString().split("T")[0];
    const authorObj = post.author as Record<string, unknown> | null;
    const authorName = authorObj?.name as string || authorObj?.first_name as string || null;

    filteredPosts.push({
      text: (post.text as string) || "",
      reactions_count: (post.reaction_counter as number) ?? 0,
      comments_count: (post.comment_counter as number) ?? 0,
      date: dateStr,
      social_id: (post.social_id as string) || (post.id as string) || undefined,
      share_url: (post.share_url as string) || null,
      author_name: authorName,
    });

    linkedinPosts.push({
      social_id: post.social_id || post.id,
      text: post.text || "",
      share_url: post.share_url || null,
      timestamp: postDate.toISOString(),
      reactions_count: post.reaction_counter ?? 0,
      comments_count: post.comment_counter ?? 0,
      author_name: authorName,
    });
  }

  console.log(`[ENRICH DEBUG] Posts après filtre 30 jours: ${filteredPosts.length} / ${rawPosts.length} bruts`);

  // Résumés IA (post_summary) supprimés : on conserve uniquement les posts bruts
  // (linkedin_posts). person.recentPosts reste donc vide.
  const postSummaries: PostSummary[] = [];

  // Extract current company (most recent work_experience entry)
  const expArr = experience as Array<Record<string, unknown>>;
  const currentExp = expArr.find((e) => !e.end || e.end === null) || expArr[0] || null;
  const currentCompanyId = (currentExp?.company_id as string) || null;
  const currentCompanyName = (currentExp?.company as string) || (currentExp?.company_name as string) || null;

  return {
    linkedinProfile, filteredPosts, postSummaries, linkedinPosts,
    headline: headlineText, about: aboutText as string | null,
    profileFirstName: (profile?.first_name as string) || null,
    profileLastName: (profile?.last_name as string) || null,
    currentCompanyId,
    currentCompanyName,
    accountId: linkedinAccount.unipile_account_id,
  };
}

// ---------------------------------------------------------------------------
// Step 2A: Unipile linkedinCompany — données structurées (size, industry, etc.)
// ---------------------------------------------------------------------------

interface CompanyData {
  size?: string;
  industry?: string;
  website?: string | null;
  headquarters?: string | null;
  description?: string | null;
  followers_count?: number | null;
  employee_count?: number | null;
  linkedin_url?: string | null;
  source: "unipile";
}

function formatEmployeeRange(range?: { from: number; to: number }, exact?: number): string | undefined {
  if (range && typeof range.from === "number" && typeof range.to === "number") {
    return `${range.from}-${range.to}`;
  }
  if (typeof exact === "number") return String(exact);
  return undefined;
}

async function stepUnipileCompany(
  companyId: string | null,
  companyName: string | null,
  accountId: string | null,
  leadId: string,
): Promise<CompanyData | null> {
  if (!companyId || !accountId) return null;
  const client = getUnipileClient();
  try {
    const company = (await client.linkedinCompany(companyId, accountId)) as unknown as Record<string, unknown>;
    const industryArr = company.industry as string[] | undefined;
    const range = company.employee_count_range as { from: number; to: number } | undefined;
    const exact = company.employee_count as number | undefined;
    const locations = (company.locations as Array<Record<string, unknown>> | undefined) || [];
    const firstLoc = locations[0];
    const locStr = firstLoc
      ? [firstLoc.city, firstLoc.geographic_area, firstLoc.country].filter(Boolean).join(", ") || null
      : null;

    return {
      size: formatEmployeeRange(range, exact),
      industry: industryArr?.[0] || undefined,
      website: (company.website as string) || null,
      headquarters: locStr,
      description: (company.description as string) || (company.tagline as string) || null,
      followers_count: (company.followers_count as number) ?? null,
      employee_count: exact ?? null,
      linkedin_url: (company.profile_url as string) || null,
      source: "unipile",
    };
  } catch (err) {
    console.warn(
      `[ENRICH] linkedinCompany FAILED for company_id=${companyId} (${companyName}) lead=${leadId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}


// ---------------------------------------------------------------------------
// Signal type (preserved for Gojiberry passthrough)
// ---------------------------------------------------------------------------

interface SignalResult {
  type: string;
  detail: string;
  smartai_interaction: boolean;
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

export async function enrichSingleLead(
  lead: LeadForGeneration,
  userId: string,
  supabase: SupabaseClient<Database>
) {
  // === STEP 1: Unipile ===
  let unipileResult: Awaited<ReturnType<typeof stepUnipile>>;
  try {
    unipileResult = await stepUnipile(lead, userId, supabase);
  } catch (err) {
    console.warn("Step 1 (Unipile) failed, continuing without profile data:", err instanceof Error ? err.message : err);
    unipileResult = { linkedinProfile: null, filteredPosts: [], postSummaries: [], linkedinPosts: [], headline: null, about: null, profileFirstName: null, profileLastName: null, currentCompanyId: null, currentCompanyName: null, accountId: null };
  }

  // Signal Gojiberry pré-existant (préservé en passthrough plus bas).
  const existingSignal = (lead.enrichmentData?.signal as Record<string, unknown>) || {};

  // === STEP 2: Unipile company data ===
  const enrichmentResult: Record<string, any> = {};
  const warnings: string[] = [];

  const companyData = await stepUnipileCompany(
    unipileResult.currentCompanyId,
    unipileResult.currentCompanyName,
    unipileResult.accountId,
    lead.id
  ).catch((err) => {
    warnings.push("Unipile company indisponible");
    console.warn("[ENRICH] Step 2 (Unipile company) failed:", err);
    return null;
  });

  if (companyData || unipileResult.currentCompanyName) {
    enrichmentResult.company = {
      ...(unipileResult.currentCompanyName ? { name: unipileResult.currentCompanyName } : {}),
      ...(companyData ? {
        size: companyData.size,
        industry: companyData.industry,
        website: companyData.website,
        headquarters: companyData.headquarters,
        description: companyData.description,
        followers_count: companyData.followers_count,
        employee_count: companyData.employee_count,
        linkedin_url: companyData.linkedin_url,
      } : {}),
    };
  }
  // confidence dérivé : "high" si Unipile a donné size+industry, "low" sinon
  enrichmentResult.confidence = companyData?.size && companyData?.industry ? "high" : "low";

  // === Gojiberry signal passthrough (preserved from pre-enrichment) ===
  const hasGojiberryTag = (lead.tags || []).some((t) => t.startsWith("goji:"));
  const isGojiberrySignal =
    (existingSignal.source === "gojiberry" || hasGojiberryTag) && !!existingSignal.type;
  const gojiberrySignal: SignalResult | null = isGojiberrySignal
    ? {
        type: existingSignal.type as string,
        detail: (existingSignal.detail as string) || "",
        smartai_interaction: (existingSignal.smartai_interaction as boolean) || false,
      }
    : null;

  // === Assemble core enrichment fields ===
  // Preserve Gojiberry-specific signal fields when merging
  if (gojiberrySignal) {
    enrichmentResult.signal = {
      ...existingSignal,
      ...gojiberrySignal,
      source: "gojiberry",
    };
  }

  if (unipileResult.linkedinProfile) {
    enrichmentResult.linkedin_profile = unipileResult.linkedinProfile;
  }

  if (unipileResult.linkedinPosts.length > 0) {
    enrichmentResult.linkedin_posts = unipileResult.linkedinPosts;
  }

  // === STEP 2.5 — Segment ICP déterministe ===
  // Plus de scoring IA ni de dossier d'attaque : le segment est calculé en pur code
  // à partir du titre + des données entreprise Unipile (size/industry).
  // `scoring_detail.segment_icp` est PRÉSERVÉ (lu par generate-actions).
  const segmentIcp = computeSegmentIcp(lead.title, enrichmentResult, lead.company);
  const inIcp = segmentIcp !== "HORS_ICP";
  const scoreValue: number = inIcp ? 50 : 20;
  const scoreStatus: string = inIcp ? "warm" : "cold";

  enrichmentResult.scoring_detail = {
    ...((enrichmentResult.scoring_detail as Record<string, unknown>) || {}),
    segment_icp: segmentIcp,
  };

  // Marqueur d'enrichissement : sert de gate anti-réenrichissement dans generate-actions.
  enrichmentResult.enriched_at = new Date().toISOString();

  // === DB UPDATE with retry ===
  let dbWarning: string | undefined;
  if (lead.id) {
    const { data: currentLead } = await supabase
      .from("leads")
      .select("enrichment_data, stage, first_name, last_name, title, company, email, phone")
      .eq("id", lead.id)
      .single();

    const mergedData = {
      ...((currentLead?.enrichment_data as Record<string, unknown>) || {}),
      ...enrichmentResult,
    };

    // Purge champ legacy : hook_recommande (remplacé par le segment ICP). Le merge
    // ci-dessus préserverait sinon une valeur d'un enrichissement pré-refonte.
    delete mergedData.hook_recommande;

    console.log(`[ENRICH DEBUG] Merge final - linkedin_posts count:`, Array.isArray(mergedData.linkedin_posts) ? (mergedData.linkedin_posts as unknown[]).length : "ABSENT");

    // score/status dérivés du segment ICP déterministe (Step 2.5).
    // scoring_detail est déjà dans mergedData via enrichmentResult.
    const leadUpdate: Database["public"]["Tables"]["leads"]["Update"] = {
      enrichment_data: mergedData,
      score: scoreValue,
      status: scoreStatus,
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", lead.id);

    if (updateError) {
      console.warn("DB update failed, retrying once:", updateError.message);
      // Retry once
      const { error: retryError } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", lead.id);

      if (retryError) {
        console.error("DB update retry failed:", retryError.message);
        dbWarning = "Enrichissement calculé mais sauvegarde DB échouée. Veuillez réessayer.";
      }
    }

    // Backfill first_name/last_name/title/company from Unipile profile if missing
    const profileUpdates: Record<string, string> = {};
    if (!currentLead?.first_name && unipileResult.profileFirstName) {
      profileUpdates.first_name = unipileResult.profileFirstName;
    }
    if (!currentLead?.last_name && unipileResult.profileLastName) {
      profileUpdates.last_name = unipileResult.profileLastName;
    }
    if (!currentLead?.title && unipileResult.headline) {
      profileUpdates.title = unipileResult.headline;
    }
    if (!currentLead?.company) {
      // Try to extract company from enrichment or headline
      const enrichedCompany = enrichmentResult.company?.name as string | undefined;
      if (enrichedCompany) {
        profileUpdates.company = enrichedCompany;
      }
    }
    // Email/téléphone : contact_info du profil LinkedIn Unipile (Icypeas supprimé).
    const unipileContactInfo = unipileResult.linkedinProfile?.contact_info as
      | { emails?: string[]; phones?: string[] }
      | undefined;
    if (!currentLead?.email && unipileContactInfo?.emails?.[0]) {
      profileUpdates.email = unipileContactInfo.emails[0];
    }
    if (!currentLead?.phone && unipileContactInfo?.phones?.[0]) {
      profileUpdates.phone = unipileContactInfo.phones[0];
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: backfillError } = await supabase
        .from("leads")
        .update({ ...profileUpdates, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (backfillError) {
        console.warn("Backfill lead fields failed:", backfillError.message);
      } else {
        console.log(`Lead ${lead.id} backfilled from profile:`, Object.keys(profileUpdates).join(", "));
      }
    }

    // Auto-correct stage: 1er degré détecté → passer en "connected"
    let stageUpdated: string | undefined;
    const nd = unipileResult.linkedinProfile?.network_distance as string | null | undefined;
    if (isFirstDegreeConnection(nd) && currentLead?.stage && AUTO_CORRECT_ELIGIBLE_STAGES.includes(currentLead.stage)) {
      const { error: stageError } = await supabase
        .from("leads")
        .update({ stage: "connected", updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (stageError) {
        console.error("Failed to auto-correct stage:", stageError.message);
      } else {
        stageUpdated = "connected";
        console.log(`Lead ${lead.id} stage auto-corrected to 'connected' (was: ${currentLead.stage})`);
      }
    }

    const warning = [dbWarning, ...warnings].filter(Boolean).join(" / ") || undefined;
    return {
      ...enrichmentResult,
      stageUpdated,
      ...(warning ? { warning } : {}),
    };
  }

  return {
    ...enrichmentResult,
    ...(warnings.length > 0 ? { warning: warnings.join(" / ") } : {}),
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();

    const isBatch = Array.isArray(body.leads);
    const leads: LeadForGeneration[] = isBatch ? body.leads : [body.lead];

    if (!leads.length || !leads[0]?.id) {
      return NextResponse.json(
        { error: "Données lead manquantes (id requis)" },
        { status: 400 }
      );
    }

    if (!isBatch) {
      try {
        const result = await enrichSingleLead(leads[0], user.id, supabase);
        return NextResponse.json(result);
      } catch (err) {
        console.error("Enrichment error:", err);
        const msg = err instanceof Error ? err.message : "Erreur lors de l'enrichissement";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    const results = await Promise.all(
      leads.map(async (lead) => {
        try {
          const data = await enrichSingleLead(lead, user.id, supabase);
          return { leadId: lead.id, success: true, data };
        } catch (err) {
          console.error(`Enrichment failed for lead ${lead.id}:`, err);
          return {
            leadId: lead.id,
            success: false,
            error: err instanceof Error ? err.message : "Erreur enrichissement",
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Enrich API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de l&apos;enrichissement du lead",
      },
      { status: 500 }
    );
  }
}
