"use server";

import { getAuthUser } from "./auth";
import type { ActionResult } from "./types";
import type { Json } from "@/types/database";
import {
  parseGojiberryIntent,
  type GojiberryCSVRow,
  type ParsedIntent,
} from "@/lib/gojiberry-parser";
import { assignBucket } from "@/lib/scoring-buckets";

// Re-export types for client consumption
export type { GojiberryCSVRow } from "@/lib/gojiberry-parser";

// ---------------------------------------------------------------------------
// Signal-specific tag generator
// ---------------------------------------------------------------------------

function buildSignalTag(parsed: ParsedIntent): string {
  switch (parsed.signalType) {
    case "ENGAGEMENT_KEYWORD":
      return parsed.keyword
        ? `goji:keyword:${parsed.keyword.toLowerCase().replace(/\s+/g, "-")}`
        : "goji:keyword";
    case "ENGAGEMENT_EXPERT":
      return "goji:expert";
    case "NEW_ROLE":
      return "goji:new-role";
    case "ICP_TOP_ACTIVE":
      return "goji:top-active";
    case "COMPETITOR_ENGAGEMENT":
      return "goji:competitor";
    default:
      return "goji:other";
  }
}

// ---------------------------------------------------------------------------
// LinkedIn URL normalization
// ---------------------------------------------------------------------------

function normalizeLinkedInUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/+$/, "");
  if (cleaned.startsWith("www.")) {
    cleaned = `https://${cleaned}`;
  }
  if (!cleaned.startsWith("http")) {
    cleaned = `https://www.linkedin.com${cleaned.startsWith("/") ? "" : "/"}${cleaned}`;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Main import action
// ---------------------------------------------------------------------------

export interface GojiberryImportResult {
  imported: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
}

export async function importLeadsFromGojiberry(
  rows: GojiberryCSVRow[]
): Promise<ActionResult<GojiberryImportResult>> {
  try {
    const { supabase, user } = await getAuthUser();

    const result: GojiberryImportResult = {
      imported: 0,
      updated: 0,
      errors: [],
    };
    const batchId = `gojiberry_${new Date().toISOString()}`;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const profileUrl = row.profileUrl?.trim();
        if (!profileUrl) {
          result.errors.push({ row: i + 1, error: "Profile URL manquant" });
          continue;
        }

        const linkedinUrl = normalizeLinkedInUrl(profileUrl);

        const parsed = parseGojiberryIntent(
          row.intent || "",
          row.intentKeyword || ""
        );

        const signalData = {
          type: parsed.signalType,
          detail: parsed.detail,
          source: "gojiberry" as const,
          gojiberry_score: row.totalScore ? parseFloat(row.totalScore) : null,
          intent_keyword: parsed.keyword,
          intent_post_url: parsed.postUrl,
          intent_expert_url: parsed.expertUrl,
          intent_post_content: null,
          import_date: row.importDate || null,
          smartai_interaction: false,
        };

        const enrichmentData: Record<string, unknown> = {
          signal: signalData,
          _import_batch: batchId,
        };

        const companyData: Record<string, string> = {};
        if (row.industry) companyData.industry = row.industry;
        if (row.location) companyData.location = row.location;
        if (row.website) companyData.website = row.website;
        else if (row.companyUrl) companyData.website = row.companyUrl;
        if (Object.keys(companyData).length > 0) {
          enrichmentData.company = companyData;
        }

        const signalTag = buildSignalTag(parsed);
        const tags = ["gojiberry", signalTag];

        const { data: existing } = await supabase
          .from("leads")
          .select("id, enrichment_data, tags")
          .eq("linkedin_url", linkedinUrl)
          .maybeSingle();

        if (existing) {
          const existingEnrichment =
            (existing.enrichment_data as Record<string, unknown>) || {};
          const mergedEnrichment = {
            ...existingEnrichment,
            signal: signalData,
            _import_batch: batchId,
            company: {
              ...((existingEnrichment.company as Record<string, unknown>) || {}),
              ...companyData,
            },
          };

          const existingTags = (existing.tags as string[]) || [];
          const mergedTags = Array.from(new Set([...existingTags, ...tags]));

          const { error: updateError } = await supabase
            .from("leads")
            .update({
              enrichment_data: mergedEnrichment as unknown as Json,
              tags: mergedTags,
              title: row.jobTitle || undefined,
              company: row.company || undefined,
              email: row.email || undefined,
              phone: row.phone || undefined,
            })
            .eq("id", existing.id);

          if (updateError) {
            result.errors.push({ row: i + 1, error: updateError.message });
          } else {
            result.updated++;
          }
        } else {
          // Assign bucket score at import (no AI call)
          const bucket = assignBucket({
            title: row.jobTitle,
            enrichmentData: { signal: signalData },
          });

          const { data: newLead, error: insertError } = await supabase
            .from("leads")
            .insert({
              user_id: user.id,
              first_name: row.firstName || "",
              last_name: row.lastName || "",
              linkedin_url: linkedinUrl,
              title: row.jobTitle || null,
              company: row.company || null,
              email: row.email || null,
              phone: row.phone || null,
              score: bucket.score,
              status: bucket.status,
              tags,
              enrichment_data: enrichmentData as unknown as Json,
            })
            .select("id")
            .single();

          if (insertError) {
            result.errors.push({ row: i + 1, error: insertError.message });
          } else if (newLead) {
            result.imported++;
          }
        }
      } catch (rowErr) {
        result.errors.push({
          row: i + 1,
          error: (rowErr as Error).message,
        });
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
