/**
 * Sync accepted LinkedIn invitations via Unipile.
 *
 * Checks leads in stage "invited" (within active sequences) against Unipile's
 * getUserProfile to detect 1st-degree connections. Updates lead stage to
 * "connected" when an invitation has been accepted.
 *
 * Used by:
 *  - generate-actions cron (pre-generation sync)
 *  - check-invitations cron (safety net)
 */

import type { ServiceClient } from "@/lib/supabase/service";
import {
  getUnipileClient,
  extractLinkedInIdentifier,
} from "@/lib/unipile/client";

/** Max leads to check per user per execution (rate-limit guard) */
const MAX_CHECKS_PER_USER = 20;

export interface SyncResult {
  checked: number;
  transitioned: number;
  errors: string[];
}

/**
 * Checks if network_distance indicates a 1st degree connection.
 * Unipile returns various formats depending on the account; the canonical
 * value observed in production is "FIRST_DEGREE".
 */
function isFirstDegreeConnection(
  networkDistance: string | null | undefined
): boolean {
  if (!networkDistance) return false;
  const normalized = networkDistance.toUpperCase().trim();
  return ["FIRST", "FIRST_DEGREE", "DISTANCE_1", "1", "1ST"].includes(normalized);
}

/**
 * Sync accepted invitations for a single user.
 *
 * 1. Finds ALL leads in stage "invited" owned by the user (not just those in sequences)
 * 2. Checks each via Unipile getUserProfile
 * 3. Updates stage to "connected" if 1st-degree connection detected
 */
export async function syncAcceptedInvitations(
  supabase: ServiceClient,
  userId: string,
  unipileAccountId: string
): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, transitioned: 0, errors: [] };

  // Find ALL leads in "invited" stage for this user (not just those in sequences)
  const { data: candidates, error: candidatesError } = await supabase
    .from("leads")
    .select("id, linkedin_url, stage")
    .eq("user_id", userId)
    .eq("stage", "invited")
    .not("linkedin_url", "is", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_CHECKS_PER_USER);

  if (candidatesError) {
    result.errors.push(`candidates query: ${candidatesError.message}`);
    return result;
  }

  if (!candidates?.length) return result;

  const client = getUnipileClient();

  for (const lead of candidates) {
    try {
      if (!lead.linkedin_url) continue;

      const identifier = extractLinkedInIdentifier(lead.linkedin_url);
      const profile = await client.getUserProfile(
        identifier,
        unipileAccountId
      );

      result.checked++;

      const connected =
        isFirstDegreeConnection(
          profile.network_distance as string | null | undefined
        ) || profile.is_relationship === true;

      if (connected) {
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            stage: "connected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        if (updateError) {
          result.errors.push(`lead ${lead.id}: ${updateError.message}`);
        } else {
          result.transitioned++;
          console.log(
            `[Sync Relations] Lead ${lead.id} transitioned: invited → connected`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Sync Relations] Error checking lead ${lead.id}:`,
        msg
      );
      result.errors.push(`lead ${lead.id}: ${msg}`);
    }
  }

  return result;
}
