"use server";

/**
 * resolve-linkedin.ts — Résolution LinkedIn CROISÉE d'un lead dirigeant (data.gouv).
 *
 * Deux sources croisées :
 *   - WEB (outil web_search de Claude) : trouve une URL linkedin.com/in probable.
 *     Lancée À L'IMPORT (cf. import-datagouv) et stockée dans
 *     enrichment_data.linkedin_suggestion. Ne consomme PAS le quota LinkedIn.
 *   - UNIPILE (search LinkedIn) : profil précis, lancé À LA DEMANDE (bouton).
 *
 * Écriture HYBRIDE PAR CONFIANCE :
 *   - si une source Unipile CONCORDE avec l'URL web (même profil) → confiance haute
 *     → auto-écriture de linkedin_url.
 *   - sinon → on renvoie les candidats, l'utilisateur CONFIRME (aucune écriture auto).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthUser } from "./auth";
import { getUnipileAccountIdForUser } from "./linkedin";
import { getUnipileClient } from "@/lib/unipile/client";
import { callClaudeWebSearch } from "@/lib/ai/service";
import type { ActionResult } from "./types";
import type { Database, Json } from "@/types/database";

type DbClient = SupabaseClient<Database>;

interface ResolvableLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  enrichment_data: Json | null;
}

const AUTO_ATTACH_SCORE = 0.85; // seuil d'auto-écriture sans concordance explicite
const MAX_WEB_AT_IMPORT = 15; // plafond de pré-résolutions web par import (coût/temps)
const WEB_CONCURRENCY = 4;

export interface LinkedInCandidate {
  id: string;
  name: string;
  headline: string | null;
  profileUrl: string | null;
  location: string | null;
  /** score de match local 0..1 (similarité nom + bonus entreprise + concordance web) */
  score: number;
  source: "unipile" | "web";
  /** true si l'URL concorde avec la suggestion web */
  agreement: boolean;
}

export interface CrossedResolution {
  attached: boolean; // true si linkedin_url a été écrit automatiquement
  profileUrl: string | null; // URL retenue (attachée ou meilleur candidat)
  webUrl: string | null; // suggestion web
  candidates: LinkedInCandidate[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normTokens(s: string): string[] {
  return Array.from(new Set(normName(s).split(" ").filter(Boolean)));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  a.forEach((t) => {
    if (setB.has(t)) inter++;
  });
  return inter / (a.length + b.length - inter);
}

function matchScore(
  firstName: string,
  lastName: string,
  company: string,
  cand: { name?: string; headline?: string }
): number {
  const nameScore = jaccard(normTokens(`${firstName} ${lastName}`), normTokens(cand.name ?? ""));
  const headlineTokens = new Set(normTokens(cand.headline ?? ""));
  const companyTokens = normTokens(company);
  const companyHit = companyTokens.length > 0 && companyTokens.some((t) => headlineTokens.has(t));
  return Math.min(1, nameScore + (companyHit ? 0.15 : 0));
}

/** Canonicalise une URL LinkedIn → "linkedin.com/in/<slug>" (comparaison). */
function canonicalLinkedInUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.toLowerCase().match(/linkedin\.com\/in\/([a-z0-9\-_%]+)/i);
  return m ? `linkedin.com/in/${m[1].replace(/\/+$/, "")}` : null;
}

/** Première URL linkedin.com/in trouvée dans un texte ou une liste de sources. */
function extractLinkedInUrl(text: string, sources: string[]): string | null {
  const all = [text, ...sources].join(" ");
  const m = all.match(/https?:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i);
  if (m) return m[0].replace(/\/+$/, "");
  // fallback : reconstruire depuis "linkedin.com/in/slug" sans protocole
  const m2 = all.match(/linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i);
  return m2 ? `https://www.${m2[0].replace(/\/+$/, "")}` : null;
}

// ---------------------------------------------------------------------------
// Recherche WEB (Claude web_search) — utilisée à l'import et en fallback
// ---------------------------------------------------------------------------

/**
 * Cherche l'URL LinkedIn d'une personne via l'outil web_search de Claude.
 * Défensif : null si rien / erreur.
 */
export async function webFindLinkedIn(input: {
  firstName: string;
  lastName: string;
  company: string;
  userId: string;
  supabaseOverride?: Parameters<typeof callClaudeWebSearch>[0]["supabaseOverride"];
}): Promise<{ url: string | null; sources: string[] }> {
  const { firstName, lastName, company, userId, supabaseOverride } = input;
  try {
    const prompt =
      `Trouve l'URL du profil LinkedIn de "${firstName} ${lastName}", dirigeant(e) de l'entreprise "${company}" (France). ` +
      `Réponds UNIQUEMENT avec l'URL au format https://www.linkedin.com/in/... ou le mot AUCUNE si tu n'es pas sûr.`;
    const res = await callClaudeWebSearch({
      userId,
      agentId: "datagouv_parser",
      prompt,
      maxUses: 3,
      metadata: { feature: "datagouv_linkedin_web" },
      supabaseOverride,
    });
    return { url: extractLinkedInUrl(res.text, res.sources), sources: res.sources };
  } catch (err) {
    console.error("[ResolveLinkedIn] web search failed:", err instanceof Error ? err.message : err);
    return { url: null, sources: [] };
  }
}

/**
 * Pré-résolution WEB à l'import : pour les leads importés, cherche une URL LinkedIn
 * via Claude web_search et la stocke dans enrichment_data.linkedin_suggestion.
 * N'ÉCRIT PAS linkedin_url (la confiance web seule est insuffisante — confirmation
 * ou concordance Unipile requise). Plafonné + concurrence limitée (coût/temps/quota OpenAI nul).
 */
export async function webResolveImported(
  items: Array<{ siren: string; firstName: string; lastName: string; company: string }>
): Promise<ActionResult<{ resolved: number; scanned: number; capped: boolean }>> {
  try {
    const { supabase, user } = await getAuthUser();
    const batch = items.slice(0, MAX_WEB_AT_IMPORT);
    let resolved = 0;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < batch.length) {
        const it = batch[cursor++];
        try {
          const { data: leads } = await supabase
            .from("leads")
            .select("id, first_name, last_name, enrichment_data, linkedin_url")
            .eq("siren", it.siren)
            .eq("user_id", user.id);
          const lead = (leads ?? []).find(
            (l) =>
              normName(l.last_name ?? "") === normName(it.lastName) &&
              normName(l.first_name ?? "") === normName(it.firstName)
          );
          if (!lead || lead.linkedin_url) continue; // absent ou déjà résolu
          const ex = (lead.enrichment_data as Record<string, unknown>) || {};
          if ((ex.linkedin_suggestion as { url?: string } | undefined)?.url) continue; // déjà suggéré

          const { url } = await webFindLinkedIn({
            firstName: it.firstName,
            lastName: it.lastName,
            company: it.company,
            userId: user.id,
          });
          if (!url) continue;

          const merged = { ...ex, linkedin_suggestion: { url, source: "web" } };
          const { error } = await supabase
            .from("leads")
            .update({ enrichment_data: merged as unknown as Json })
            .eq("id", lead.id);
          if (!error) resolved++;
        } catch (e) {
          console.error("[webResolveImported] item failed:", e instanceof Error ? e.message : e);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(WEB_CONCURRENCY, batch.length) }, () => worker())
    );
    return { success: true, data: { resolved, scanned: batch.length, capped: items.length > batch.length } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Résolution croisée À LA DEMANDE (Unipile + web stocké) + auto-write hybride
// ---------------------------------------------------------------------------

/** Cœur de la résolution croisée sur un lead déjà chargé (web stocké + Unipile). */
async function crossResolveLead(
  supabase: DbClient,
  userId: string,
  lead: ResolvableLead
): Promise<CrossedResolution> {
  const firstName = lead.first_name ?? "";
  const lastName = lead.last_name ?? "";
  const company = lead.company ?? "";

  const enrichment = (lead.enrichment_data as Record<string, unknown>) || {};
  const suggestion = enrichment.linkedin_suggestion as { url?: string } | undefined;
  let webUrl = suggestion?.url ?? null;

  // Sources en parallèle : Unipile (search) + web (si pas déjà stockée à l'import)
  const accountId = await getUnipileAccountIdForUser(userId);
  const unipilePromise = accountId
    ? getUnipileClient()
        .linkedinSearch({
          account_id: accountId,
          keywords: `${firstName} ${lastName} ${company}`.trim(),
          first_name: firstName,
          last_name: lastName,
          company,
          limit: 5,
        })
        .then((r) => r.items ?? [])
        .catch((e) => {
          console.error("[ResolveLinkedIn] Unipile search failed:", e instanceof Error ? e.message : e);
          return [];
        })
    : Promise.resolve([]);

  const webPromise = webUrl ? Promise.resolve(null) : webFindLinkedIn({ firstName, lastName, company, userId });

  const [unipileResults, webResult] = await Promise.all([unipilePromise, webPromise]);
  if (!webUrl && webResult) webUrl = webResult.url;
  const webCanon = canonicalLinkedInUrl(webUrl);

  const candidates: LinkedInCandidate[] = unipileResults.map((r) => {
    const profileUrl = r.profile_url ?? null;
    const agreement = !!webCanon && canonicalLinkedInUrl(profileUrl) === webCanon;
    const base = matchScore(firstName, lastName, company, r);
    return {
      id: r.id,
      name: r.name ?? "",
      headline: r.headline ?? null,
      profileUrl,
      location: r.location ?? null,
      score: agreement ? Math.max(base, 0.95) : base,
      source: "unipile" as const,
      agreement,
    };
  });

  // URL web non présente côté Unipile → l'ajouter comme candidat web
  if (webUrl && !candidates.some((c) => canonicalLinkedInUrl(c.profileUrl) === webCanon)) {
    candidates.push({
      id: "web",
      name: `${firstName} ${lastName}`,
      headline: "Résultat recherche web",
      profileUrl: webUrl,
      location: null,
      score: 0.5,
      source: "web",
      agreement: false,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Auto-écriture hybride : concordance web↔Unipile OU score Unipile très élevé
  const top = candidates[0];
  if (top?.profileUrl && (top.agreement || (top.source === "unipile" && top.score >= AUTO_ATTACH_SCORE))) {
    const { error } = await supabase.from("leads").update({ linkedin_url: top.profileUrl }).eq("id", lead.id);
    if (!error) return { attached: true, profileUrl: top.profileUrl, webUrl, candidates };
  }

  return { attached: false, profileUrl: top?.profileUrl ?? null, webUrl, candidates };
}

/** Résolution depuis la table Import Leads (par siren + nom/prénom). */
export async function resolveLinkedInOnDemand(input: {
  siren: string;
  firstName: string;
  lastName: string;
  company: string;
}): Promise<ActionResult<CrossedResolution>> {
  try {
    const { supabase, user } = await getAuthUser();
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, first_name, last_name, company, enrichment_data")
      .eq("siren", input.siren)
      .eq("user_id", user.id);
    if (error) return { success: false, error: error.message };

    const lead = (leads ?? []).find(
      (l) =>
        normName(l.last_name ?? "") === normName(input.lastName) &&
        normName(l.first_name ?? "") === normName(input.firstName)
    );
    if (!lead) return { success: false, error: "Lead introuvable — importe-le d'abord." };

    return { success: true, data: await crossResolveLead(supabase, user.id, lead) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Résolution depuis la fiche prospect (par leadId). */
export async function resolveLinkedInForLead(
  leadId: string
): Promise<ActionResult<CrossedResolution>> {
  try {
    const { supabase, user } = await getAuthUser();
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, first_name, last_name, company, enrichment_data")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!lead) return { success: false, error: "Lead introuvable (ou non détenu)." };

    return { success: true, data: await crossResolveLead(supabase, user.id, lead) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Écriture confirmée (clic utilisateur sur un candidat)
// ---------------------------------------------------------------------------

export async function attachLinkedInToLead(input: {
  siren: string;
  firstName: string;
  lastName: string;
  profileUrl: string;
}): Promise<ActionResult<{ updated: boolean }>> {
  try {
    const { supabase, user } = await getAuthUser();
    const { siren, firstName, lastName, profileUrl } = input;
    if (!profileUrl.trim()) return { success: false, error: "URL LinkedIn vide." };

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, first_name, last_name")
      .eq("siren", siren)
      .eq("user_id", user.id);
    if (error) return { success: false, error: error.message };

    const match = (leads ?? []).find(
      (l) =>
        normName(l.last_name ?? "") === normName(lastName) &&
        normName(l.first_name ?? "") === normName(firstName)
    );
    if (!match) return { success: false, error: "Lead introuvable — importe-le d'abord." };

    const { error: updateError } = await supabase
      .from("leads")
      .update({ linkedin_url: profileUrl })
      .eq("id", match.id);
    if (updateError) return { success: false, error: updateError.message };
    return { success: true, data: { updated: true } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Écriture confirmée par leadId (depuis la fiche prospect). */
export async function attachLinkedInToLeadById(
  leadId: string,
  profileUrl: string
): Promise<ActionResult<{ updated: boolean }>> {
  try {
    const { supabase, user } = await getAuthUser();
    if (!profileUrl.trim()) return { success: false, error: "URL LinkedIn vide." };
    const { error } = await supabase
      .from("leads")
      .update({ linkedin_url: profileUrl })
      .eq("id", leadId)
      .eq("user_id", user.id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { updated: true } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
