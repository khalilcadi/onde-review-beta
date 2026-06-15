import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { callAI, callClaudeWebSearch } from "@/lib/ai/service";
import {
  type LeadForGeneration,
  buildDossierInput,
  buildScoringContext,
  buildScoringUserPrompt,
} from "@/lib/ai/lead-context";
import {
  getUnipileClient,
  extractLinkedInIdentifier,
} from "@/lib/unipile/client";
import { type ScoringResult } from "@/lib/ai/scoring";
import { assignBucket } from "@/lib/scoring-buckets";
import { searchAndPoll } from "@/lib/icypeas/client";
import type { IcypeasEmailEnrichment } from "@/lib/icypeas/types";
import type { AgentId } from "@/lib/ai/prompts/defaults";
import type { Database } from "@/types/database";

const SONNET_MODEL = "claude-sonnet-4-6";
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
// Helper: extrait le dernier objet JSON {...} équilibré d'un texte (prose + JSON).
// String-aware (ignore les accolades dans les chaînes). Renvoie null si aucun.
// ---------------------------------------------------------------------------

function extractLastJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  let last: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          last = text.slice(start, i + 1);
          start = -1;
        }
      }
    }
  }
  return last;
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

  // Summarize each filtered post via Claude — structured extraction (sujet, tension, ton)
  // Parallélisation par batches de 5 (réduit ~10s → ~2-3s pour 10 posts)
  const SUMMARY_CONCURRENCY = 5;
  const postSummaries: PostSummary[] = [];
  const summarizablePosts = filteredPosts.filter((p) => p.text.trim());

  for (let i = 0; i < summarizablePosts.length; i += SUMMARY_CONCURRENCY) {
    const batch = summarizablePosts.slice(i, i + SUMMARY_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (post): Promise<PostSummary> => {
        try {
          const summaryResponse = await callAI({
            userId,
            agentId: "post_summary" as AgentId,
            messages: [{ role: "user", content: `Analyse ce post LinkedIn et extrais les informations suivantes en JSON strict :\n{\n  "sujet": "le thème principal en 5 mots max",\n  "tension": "la douleur ou l'enjeu business révélé (null si c'est juste du contenu informatif)",\n  "ton": "corporate | decontracte | expert | vulnerable"\n}\nRéponds UNIQUEMENT avec le JSON, rien d'autre.\n\nPost:\n${post.text}` }],
            maxTokens: 150,
            temperature: 0,
            modelOverride: SONNET_MODEL,
            runtimeContext: "Tu es un analyste de contenu LinkedIn. Tu extrais sujet, tension business et ton de chaque post. Tu réponds uniquement en JSON strict, sans commentaire.",
            metadata: { leadId: lead.id, action: "enrich_summarize_post" },
            supabaseOverride: supabase,
          });

          const cleanJson = summaryResponse.text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          const parsed = JSON.parse(cleanJson) as { sujet?: string; tension?: string | null; ton?: string };

          return {
            summary: parsed.sujet || summaryResponse.text.slice(0, 60),
            sujet: parsed.sujet || undefined,
            tension: parsed.tension || null,
            ton: parsed.ton || undefined,
            reactions: post.reactions_count,
            comments: post.comments_count,
            date: post.date,
          };
        } catch (err) {
          console.warn("Post summarization failed, using truncated text:", err instanceof Error ? err.message : err);
          return {
            summary: post.text.slice(0, 150) + (post.text.length > 150 ? "..." : ""),
            reactions: post.reactions_count,
            comments: post.comments_count,
            date: post.date,
          };
        }
      })
    );
    postSummaries.push(...results);
  }

  console.log(`[ENRICH DEBUG] Résumés générés: ${postSummaries.length}`, postSummaries.map(s => s.summary.slice(0, 60)));

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
    console.warn("Step 1 (Unipile) failed, continuing with Perplexity only:", err instanceof Error ? err.message : err);
    unipileResult = { linkedinProfile: null, filteredPosts: [], postSummaries: [], linkedinPosts: [], headline: null, about: null, profileFirstName: null, profileLastName: null, currentCompanyId: null, currentCompanyName: null, accountId: null };
  }

  // === STEP 1b: Fetch Gojiberry intent post content (if applicable) ===
  const existingSignal = (lead.enrichmentData?.signal as Record<string, unknown>) || {};
  if (
    existingSignal.source === "gojiberry" &&
    existingSignal.intent_post_url &&
    !existingSignal.intent_post_content
  ) {
    try {
      const postUrl = existingSignal.intent_post_url as string;
      // Extract LinkedIn activity ID from URL (format: activity-XXXXXXXXX)
      const activityMatch = postUrl.match(/activity-(\d+)/);
      if (activityMatch) {
        const { data: linkedinAccount } = await supabase
          .from("linkedin_accounts")
          .select("unipile_account_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .single();

        if (linkedinAccount?.unipile_account_id) {
          const client = getUnipileClient();
          const post = await client.getPost(activityMatch[1]).catch(() => null);
          const postObj = post as unknown as Record<string, unknown> | null;
          if (postObj && postObj.text) {
            const postText = (postObj.text as string).slice(0, 500);
            // Update the lead's enrichment_data with the post content
            const currentEnrichment = (lead.enrichmentData || {}) as Record<string, unknown>;
            const currentSignal = (currentEnrichment.signal || {}) as Record<string, unknown>;
            await supabase
              .from("leads")
              .update({
                enrichment_data: {
                  ...currentEnrichment,
                  signal: { ...currentSignal, intent_post_content: postText },
                },
              })
              .eq("id", lead.id);
            console.log(`[ENRICH] Gojiberry post content fetched for lead ${lead.id} (${postText.length} chars)`);
          }
        }
      }
    } catch (err) {
      console.warn("[ENRICH] Gojiberry post fetch failed (non-blocking):", err instanceof Error ? err.message : err);
    }
  }

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

  // === STEP 3 — Web research (OpenAI web_search × 3 en parallèle) ===
  // 3 recherches : société (Pappers/Verif), presse/actualités, signaux personne.
  // Promise.allSettled : un échec d'une recherche n'empêche pas les autres.
  if (lead.company) {
    const queryA = `${lead.company} Pappers Verif effectifs CA structure juridique`;
    const queryB = `"${lead.company}" actualités presse 2025 recrutement partenariat`;
    const queryC = `"${lead.firstName} ${lead.lastName}" ${lead.company} LinkedIn signaux`;

    const webMeta = { leadId: lead.id, action: "enrich_web_research" };
    const [resA, resB, resC] = await Promise.allSettled([
      callClaudeWebSearch({
        userId,
        agentId: "enrichissement" as AgentId,
        prompt: queryA,
        instructions:
          'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"effectif": "...|null", "ca": "...|null", "structure_capitalistique": "...|null", "code_naf": "...|null", "date_creation": "...|null"}. Mets null pour chaque champ non trouvé.',
        metadata: webMeta,
        supabaseOverride: supabase,
      }),
      callClaudeWebSearch({
        userId,
        agentId: "enrichissement" as AgentId,
        prompt: queryB,
        instructions:
          'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"presse": [{"titre": "...", "resume": "...", "date": "AAAA-MM-JJ|null"}]}. Tableau vide si rien de pertinent.',
        metadata: webMeta,
        supabaseOverride: supabase,
      }),
      callClaudeWebSearch({
        userId,
        agentId: "enrichissement" as AgentId,
        prompt: queryC,
        instructions:
          'Réponds UNIQUEMENT en JSON strict, sans commentaire : {"signaux": [{"type": "...", "description": "...", "date": "AAAA-MM-JJ|null"}]}. Tableau vide si rien de pertinent.',
        metadata: webMeta,
        supabaseOverride: supabase,
      }),
    ]);

    // Robuste : Claude (web_search) renvoie souvent de la prose + JSON. On tente,
    // dans l'ordre : (1) parse direct, (2) bloc ```json ... ```, (3) dernier {...} complet.
    const parseWebJson = (raw: string): Record<string, unknown> | null => {
      const tryParse = (s: string): Record<string, unknown> | null => {
        try {
          return JSON.parse(s.trim()) as Record<string, unknown>;
        } catch {
          return null;
        }
      };

      // (1) parse direct (après strip d'éventuels fences entourant tout le texte)
      const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const direct = tryParse(stripped);
      if (direct) return direct;

      // (2) extraire depuis un bloc markdown ```json ... ``` (le dernier s'il y en a plusieurs)
      const fenceMatches = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
      if (fenceMatches.length > 0) {
        const fromFence = tryParse(fenceMatches[fenceMatches.length - 1][1]);
        if (fromFence) return fromFence;
      }

      // (3) dernier objet {...} complet dans le texte (équilibrage des accolades)
      const lastObj = extractLastJsonObject(raw);
      if (lastObj) {
        const fromObj = tryParse(lastObj);
        if (fromObj) return fromObj;
      }

      return null;
    };

    // Query A → societe (null si échec ou rien trouvé)
    let societe: Record<string, unknown> | undefined;
    if (resA.status === "fulfilled") {
      try {
        const parsed = parseWebJson(resA.value.text);
        if (parsed) {
          societe = {
            effectif: (parsed.effectif as string) || undefined,
            ca: (parsed.ca as string) || undefined,
            structure_capitalistique: (parsed.structure_capitalistique as string) || undefined,
            code_naf: (parsed.code_naf as string) || undefined,
            date_creation: (parsed.date_creation as string) || undefined,
            source: resA.value.sources[0] || "claude_web_search",
          };
        }
      } catch (err) {
        console.warn("[ENRICH] web_research societe parse failed:", err instanceof Error ? err.message : err);
        societe = undefined;
      }
    } else {
      console.warn("[ENRICH] web_research query A (societe) rejected:", resA.reason);
    }

    // Query B → presse[] (tableau vide si échec)
    let presse: Array<Record<string, unknown>> = [];
    if (resB.status === "fulfilled") {
      try {
        const parsed = parseWebJson(resB.value.text);
        const items = (parsed?.presse as Array<Record<string, unknown>>) || [];
        presse = items.map((it) => ({
          titre: (it.titre as string) || "",
          resume: (it.resume as string) || "",
          date: (it.date as string) || undefined,
          source: (it.source as string) || resB.value.sources[0] || "claude_web_search",
        }));
      } catch (err) {
        console.warn("[ENRICH] web_research presse parse failed:", err instanceof Error ? err.message : err);
        presse = [];
      }
    } else {
      console.warn("[ENRICH] web_research query B (presse) rejected:", resB.reason);
    }

    // Query C → signaux[] (tableau vide si échec)
    let signaux: Array<Record<string, unknown>> = [];
    if (resC.status === "fulfilled") {
      try {
        const parsed = parseWebJson(resC.value.text);
        const items = (parsed?.signaux as Array<Record<string, unknown>>) || [];
        signaux = items.map((it) => ({
          type: (it.type as string) || "",
          description: (it.description as string) || "",
          date: (it.date as string) || undefined,
          source: (it.source as string) || resC.value.sources[0] || "claude_web_search",
        }));
      } catch (err) {
        console.warn("[ENRICH] web_research signaux parse failed:", err instanceof Error ? err.message : err);
        signaux = [];
      }
    } else {
      console.warn("[ENRICH] web_research query C (signaux) rejected:", resC.reason);
    }

    enrichmentResult.web_research = {
      ...(societe ? { societe } : {}),
      presse,
      signaux,
      searched_at: new Date().toISOString(),
    };
  } else {
    console.log(`[ENRICH] Step 3 (web research) skipped for lead ${lead.id}: no company`);
  }

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

  // === Assemble core enrichment fields (needed by the dossier d'attaque below) ===
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

  if (unipileResult.postSummaries.length > 0) {
    if (!enrichmentResult.person) enrichmentResult.person = {};
    enrichmentResult.person.recentPosts = unipileResult.postSummaries;
  }

  if (unipileResult.linkedinPosts.length > 0) {
    enrichmentResult.linkedin_posts = unipileResult.linkedinPosts;
  }

  // === STEP 3.5 — Scoring IA (avant le dossier) ===
  // L'agent de scoring qualifie le lead à partir de toutes les données collectées
  // (profil, posts, entreprise, web_research, signal). Son résultat conditionne le
  // dossier d'attaque (Step 4) : un lead NO_GO ne mérite pas de dossier.
  // Fallback : si l'appel IA échoue, on retombe sur assignBucket (déterministe,
  // zéro API). Le fallback NE renseigne PAS `categorie` → on sait que le score vient
  // du bucketer et non de l'agent.
  let scoreValue: number | null = null;
  let scoreStatus: string | null = null;
  try {
    // Donner au scorer le contexte enrichi (données fraîches non encore persistées)
    const leadForScoring: LeadForGeneration = {
      ...lead,
      enrichmentData: { ...(lead.enrichmentData || {}), ...enrichmentResult },
    };
    const scoringResponse = await callAI({
      userId,
      agentId: "scoring" as AgentId,
      runtimeContext: buildScoringContext(leadForScoring),
      messages: [{ role: "user", content: buildScoringUserPrompt(leadForScoring) }],
      maxTokens: 1024,
      temperature: 0.3,
      modelOverride: SONNET_MODEL,
      metadata: { leadId: lead.id, action: "enrich_score" },
      supabaseOverride: supabase,
    });

    const cleanText = scoringResponse.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleanText) as ScoringResult;

    const categoryToStatus: Record<string, string> = {
      HOT: "hot",
      WARM: "warm",
      COLD: "cold",
      NO_GO: "cold",
    };
    scoreValue = typeof parsed.score === "number" ? parsed.score : null;
    scoreStatus = categoryToStatus[parsed.categorie?.toUpperCase()] ?? null;

    enrichmentResult.scoring_detail = {
      ...parsed.detail,
      categorie: parsed.categorie,
      segment_icp: parsed.segment_icp || null,
      confidence: parsed.confidence,
      cas_limite: parsed.cas_limite,
      ajustement_ia: parsed.ajustement_ia,
      justification: parsed.justification,
    };
  } catch (err) {
    console.warn(
      `[ENRICH] AI scoring failed for lead ${lead.id}, falling back to bucketer:`,
      err instanceof Error ? err.message : err
    );
    const bucket = assignBucket({
      title: lead.title,
      enrichmentData: enrichmentResult as {
        signal?: { type?: string | null; source?: string | null } | null;
        company?: { size?: string | null; industry?: string | null; revenue?: string | null } | null;
      },
    });
    scoreValue = bucket.score;
    scoreStatus = bucket.status;
    // Fallback bucketer : pas de `categorie` (réservée à l'agent IA).
    enrichmentResult.scoring_detail = {
      ...((enrichmentResult.scoring_detail as Record<string, unknown>) || {}),
      segment_icp: bucket.segmentIcp,
    };
  }

  // === STEP 4 — Dossier d'attaque ===
  // Synthèse stratégique du lead via Claude Sonnet, à partir de toutes les données
  // collectées en amont (profil, posts, entreprise, web_research, signal).
  // Placé après le scoring et avant Icypeas (l'email n'alimente pas le dossier).
  // Skip si lead NO_GO, ou si ni profil LinkedIn ni données entreprise.
  const hasLinkedinProfile = !!enrichmentResult.linkedin_profile;
  const hasCompanyData = !!enrichmentResult.company;
  if (enrichmentResult.scoring_detail?.categorie === "NO_GO") {
    console.log(`[ENRICH] Lead ${lead.id} scored NO_GO — skipping dossier`);
    enrichmentResult.dossier = null;
    // still run Icypeas (Step 5) — email is useful even for future re-evaluation
  } else if (!hasLinkedinProfile && !hasCompanyData) {
    console.warn(
      `[ENRICH] Step 4 (Dossier d'attaque) skipped for lead ${lead.id}: no linkedin_profile and no company data`
    );
    enrichmentResult.dossier = null;
  } else {
    try {
      const userMessage = buildDossierInput(lead, enrichmentResult);
      const dossierResponse = await callAI({
        userId,
        agentId: "dossier_attaque" as AgentId,
        messages: [{ role: "user", content: userMessage }],
        // 3000 : un dossier in-ICP riche (corps_message + listes a_eviter/a_integrer
        // + reserves) dépasse 1500 tokens et tronque le JSON → parse échoue.
        maxTokens: 3000,
        temperature: 0.3,
        modelOverride: SONNET_MODEL,
        metadata: { leadId: lead.id, action: "enrich_dossier_attaque" },
        supabaseOverride: supabase,
      });

      const responseText = dossierResponse.text;
      try {
        const cleaned = responseText.replace(/```json|```/g, "").trim();
        const dossier = JSON.parse(cleaned) as Record<string, unknown>;
        enrichmentResult.dossier = { ...dossier, generated_at: new Date().toISOString() };
      } catch (e) {
        console.error("Dossier parse failed:", e);
        enrichmentResult.dossier = null;
      }
    } catch (err) {
      console.warn(
        "[ENRICH] Step 4 (Dossier d'attaque) call failed (non-blocking):",
        err instanceof Error ? err.message : err
      );
      enrichmentResult.dossier = null;
    }
  }

  // === STEP 5: Icypeas Email Enrichment ===
  let emailEnrichment: IcypeasEmailEnrichment | null = null;
  if (lead.firstName && lead.lastName) {
    // Domain source: enrichment company website (priority) or lead.company (fallback)
    let domain: string | null = null;
    const companyWebsiteUrl =
      (enrichmentResult.company?.website as string | undefined) ||
      (lead.enrichmentData?.company?.website as string | undefined);
    if (companyWebsiteUrl) {
      try {
        domain = new URL(companyWebsiteUrl).hostname.replace(/^www\./, "");
      } catch {
        // invalid URL, try as-is
        domain = companyWebsiteUrl.replace(/^www\./, "");
      }
    }
    if (!domain && lead.company) {
      domain = lead.company;
    }

    if (domain) {
      try {
        emailEnrichment = await searchAndPoll(lead.firstName, lead.lastName, domain, lead.id);
        if (emailEnrichment) {
          console.log(`[ENRICH] Icypeas result for lead ${lead.id}: ${emailEnrichment.email ?? "no email"} (${emailEnrichment.certainty ?? "n/a"}, status=${emailEnrichment.status})`);
        } else {
          console.log(`[ENRICH] Icypeas: no result for lead ${lead.id}`);
        }
      } catch (err) {
        console.warn("[ENRICH] Icypeas failed (non-blocking):", err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`[ENRICH] Icypeas: skipped, no domain for lead ${lead.id}`);
    }
  }

  // Icypeas email enrichment
  if (emailEnrichment) {
    enrichmentResult.email_enrichment = emailEnrichment;
  }

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

    // Purge champ legacy : hook_recommande (remplacé par dossier). Le merge ci-dessus
    // préserverait sinon une valeur d'un enrichissement pré-refonte indéfiniment.
    delete mergedData.hook_recommande;

    console.log(`[ENRICH DEBUG] Merge final - person.recentPosts:`, JSON.stringify(mergedData.person?.recentPosts ?? "ABSENT").slice(0, 300));
    console.log(`[ENRICH DEBUG] Merge final - linkedin_posts count:`, Array.isArray(mergedData.linkedin_posts) ? (mergedData.linkedin_posts as unknown[]).length : "ABSENT");

    // Inclut les champs de scoring (score, status) calculés au Step 3.5.
    // scoring_detail est déjà dans mergedData via enrichmentResult.
    const leadUpdate: Database["public"]["Tables"]["leads"]["Update"] = {
      enrichment_data: mergedData,
      ...(scoreValue !== null ? { score: scoreValue } : {}),
      ...(scoreStatus !== null ? { status: scoreStatus } : {}),
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
    // Icypeas: backfill email + phone if high certainty
    if (emailEnrichment?.email && (emailEnrichment.certainty === "ultra_sure" || emailEnrichment.certainty === "very_sure" || emailEnrichment.certainty === "probable")) {
      if (!currentLead?.email) {
        profileUpdates.email = emailEnrichment.email;
      }
    }
    if (emailEnrichment?.phones?.[0] && !currentLead?.phone) {
      profileUpdates.phone = emailEnrichment.phones[0];
    }

    // Fallback Unipile : si Icypeas n'a rien trouvé, utiliser contact_info du profil LinkedIn
    const unipileContactInfo = unipileResult.linkedinProfile?.contact_info as
      | { emails?: string[]; phones?: string[] }
      | undefined;
    if (!profileUpdates.email && !currentLead?.email && unipileContactInfo?.emails?.[0]) {
      profileUpdates.email = unipileContactInfo.emails[0];
    }
    if (!profileUpdates.phone && !currentLead?.phone && unipileContactInfo?.phones?.[0]) {
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
