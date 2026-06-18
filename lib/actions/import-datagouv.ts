"use server";

/**
 * import-datagouv.ts — Crée des leads PERSONNES à partir des dirigeants sélectionnés
 * dans le sourcing data.gouv (calque lib/actions/import-gojiberry.ts).
 *
 * Flux par dirigeant :
 *   1. upsert `companies(siren)` via le client service_role (RLS : écriture réservée).
 *   2. dédup POOL-WIDE (comme gojiberry : pas de filtre user_id) sur la clé
 *      (siren, last_name, first_name) NORMALISÉS. Fallback linkedin_url non pertinent
 *      à la création (URL nulle tant que non résolue — checkpoint 5).
 *   3. crée un lead PERSONNE (client authentifié → user_id = auth.uid) :
 *      linkedin_url = null, signal SOURCING_DATAGOUV, tags ['datagouv','sourcing'],
 *      score via assignBucket().
 */

import { getAuthUser } from "./auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActionResult } from "./types";
import type { Json } from "@/types/database";
import type { Company, Dirigeant, SearchResult } from "@/lib/datagouv/types";
import { assignBucket } from "@/lib/scoring-buckets";
import {
  parseQuery,
  interpretationFor,
  filterLabels,
  type ParsedFilters,
  type FilterLabels,
} from "@/lib/datagouv/query-parser";
import { searchCompanies } from "@/lib/datagouv/client";

// ---------------------------------------------------------------------------
// Recherche (server actions appelées par l'UI import-leads)
// ---------------------------------------------------------------------------

export interface DatagouvSearchPayload {
  filters: ParsedFilters;
  labels: FilterLabels;
  interpretation: string;
  result: SearchResult;
}

/** Requête NL complète : parse (1 appel IA) → recherche entreprises. */
export async function searchDatagouv(
  phrase: string
): Promise<ActionResult<DatagouvSearchPayload>> {
  try {
    const { user } = await getAuthUser();
    const trimmed = phrase.trim();
    if (!trimmed) return { success: false, error: "Requête vide." };

    const { filters, interpretation } = await parseQuery(trimmed, user.id);
    const result = await searchCompanies(filters);
    return { success: true, data: { filters, labels: filterLabels(filters), interpretation, result } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Re-recherche après édition manuelle des filtres (chips) — AUCUN appel IA. */
export async function searchDatagouvWithFilters(
  filters: ParsedFilters
): Promise<ActionResult<DatagouvSearchPayload>> {
  try {
    await getAuthUser();
    const interpretation = interpretationFor(filters);
    const result = await searchCompanies(filters);
    return { success: true, data: { filters, labels: filterLabels(filters), interpretation, result } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface DatagouvImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ index: number; error: string }>;
}

interface ExistingLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  enrichment_data: Json | null;
  tags: string[] | null;
}

/** trim + minuscule + sans accents → pour comparaison de noms. */
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function importLeadsFromDatagouv(
  dirigeants: Dirigeant[]
): Promise<ActionResult<DatagouvImportResult>> {
  try {
    const { supabase, user } = await getAuthUser();
    const service = createServiceClient();

    const result: DatagouvImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
    const batchId = `datagouv_${new Date().toISOString()}`;

    // --- 1. Upsert des entreprises uniques (HUB, service_role) ---
    const companyMap = new Map<string, Company>();
    for (const d of dirigeants) {
      if (d.company?.siren) companyMap.set(d.company.siren, d.company);
    }
    if (companyMap.size > 0) {
      const rows = Array.from(companyMap.values()).map((c) => ({
        siren: c.siren,
        nom: c.nom || null,
        naf: c.naf,
        ville: c.ville,
        date_creation: c.dateCreation,
        effectif: c.effectif,
        domain: null as string | null,
        unite_legale: c.uniteLegale as unknown as Json,
      }));
      const { error } = await service.from("companies").upsert(rows, { onConflict: "siren" });
      // Non bloquant : on crée les leads même si l'upsert hub a partiellement échoué.
      if (error) console.error("[Datagouv] companies upsert failed:", error.message);
    }

    // --- 2. Pré-chargement des leads existants (dédup pool-wide par siren) ---
    const sirens = Array.from(companyMap.keys());
    const existingBySiren = new Map<string, ExistingLead[]>();
    if (sirens.length > 0) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, first_name, last_name, enrichment_data, tags, siren")
        .in("siren", sirens);
      for (const row of existing ?? []) {
        if (!row.siren) continue;
        const arr = existingBySiren.get(row.siren) ?? [];
        arr.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          enrichment_data: row.enrichment_data,
          tags: row.tags,
        });
        existingBySiren.set(row.siren, arr);
      }
    }

    // --- 3. Traitement dirigeant par dirigeant ---
    for (let i = 0; i < dirigeants.length; i++) {
      const d = dirigeants[i];
      try {
        if (!d.siren || !d.nom?.trim() || !d.prenom?.trim()) {
          result.skipped++;
          continue;
        }

        const companyFields = {
          naf: d.company?.naf ?? null,
          ville: d.company?.ville ?? null,
          effectif: d.company?.effectif ?? null,
          date_creation: d.company?.dateCreation ?? null,
        };
        const signalData = {
          type: "SOURCING_DATAGOUV" as const,
          source: "datagouv" as const,
          qualite: d.qualite ?? null,
          import_date: batchId,
        };
        const tags = ["datagouv", "sourcing"];

        const candidates = existingBySiren.get(d.siren) ?? [];
        const match = candidates.find(
          (c) =>
            normName(c.last_name ?? "") === normName(d.nom) &&
            normName(c.first_name ?? "") === normName(d.prenom)
        );

        if (match) {
          // --- Merge enrichment + tags (calque gojiberry) ---
          const ex = (match.enrichment_data as Record<string, unknown>) || {};
          const mergedEnrichment = {
            ...ex,
            signal: signalData,
            _import_batch: batchId,
            company: {
              ...((ex.company as Record<string, unknown>) || {}),
              ...companyFields,
            },
          };
          const mergedTags = Array.from(new Set([...(match.tags ?? []), ...tags]));

          const { error } = await supabase
            .from("leads")
            .update({
              enrichment_data: mergedEnrichment as unknown as Json,
              tags: mergedTags,
              title: d.qualite || undefined,
              company: d.companyNom || undefined,
              siren: d.siren,
            })
            .eq("id", match.id);

          if (error) result.errors.push({ index: i, error: error.message });
          else result.updated++;
        } else {
          // --- Insert nouveau lead PERSONNE ---
          const enrichmentData: Record<string, unknown> = {
            signal: signalData,
            _import_batch: batchId,
            company: companyFields,
          };
          const bucket = assignBucket({
            title: d.qualite,
            company: d.companyNom,
            enrichmentData: { signal: signalData },
          });

          const { data: newLead, error } = await supabase
            .from("leads")
            .insert({
              user_id: user.id,
              first_name: d.prenom,
              last_name: d.nom,
              title: d.qualite || null,
              company: d.companyNom || null,
              siren: d.siren,
              linkedin_url: null,
              score: bucket.score,
              status: bucket.status,
              tags,
              enrichment_data: enrichmentData as unknown as Json,
            })
            .select("id")
            .single();

          if (error) {
            result.errors.push({ index: i, error: error.message });
          } else if (newLead) {
            result.imported++;
            // Évite les doublons intra-lot : enrichit l'index de dédup.
            const arr = existingBySiren.get(d.siren) ?? [];
            arr.push({
              id: newLead.id,
              first_name: d.prenom,
              last_name: d.nom,
              enrichment_data: enrichmentData as unknown as Json,
              tags,
            });
            existingBySiren.set(d.siren, arr);
          }
        }
      } catch (rowErr) {
        result.errors.push({ index: i, error: (rowErr as Error).message });
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
