/**
 * import-yann-connections.ts — Import des connexions KEEP de Yann (seg_A → seg_F)
 * dans beta_mission.leads, puis enrichissement d'un petit batch seg_A.
 *
 * ÉTAPE 1 — IMPORT (toujours)
 *   Lit ./Conenctions Yann/seg_{A..F}.csv, mappe :
 *     URL→linkedin_url, Position→title, Company→company, First/Last Name.
 *   Dédup sur linkedin_url (normalisé) contre la DB ET au sein des CSV.
 *   Ce sont des connexions 1er degré de Yann → stage='connected'.
 *   Le presort (segment + role_family + confidence + reason) est conservé dans
 *   enrichment_data.presort, + un tag `presort:X` pour filtrage rapide.
 *
 * ÉTAPE 2 — ENRICHISSEMENT (seg_A uniquement, ENRICH_COUNT leads)
 *   Appelle enrichSingleLead (Unipile lean + computeSegmentIcp), avec un délai
 *   anti-détection aléatoire de 60–120 s ENTRE chaque profil. Reste très en
 *   dessous du plafond journalier de visites (30/j).
 *
 * ⚠️  Cible le schéma beta_mission via createServiceClient() (PAS de createClient brut).
 * ⚠️  N'envoie AUCUN message, ne réactive AUCUN cron.
 *
 * USAGE :
 *   npx tsx scripts/import-yann-connections.ts            # import + enrich
 *   IMPORT_ONLY=1 npx tsx scripts/import-yann-connections.ts   # import seul
 */

// dotenv AVANT tout import qui lit process.env (lib/unipile lit UNIPILE_DSN au chargement).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

const DATA_DIR = "./Conenctions Yann";
const SEGMENTS = ["A", "B", "C", "D", "E", "F"] as const;

/** Nombre de leads seg_A à enrichir (fenêtre demandée : 10–15). */
const ENRICH_COUNT = 12;

/** Délai anti-détection entre deux getUserProfile. */
const DELAY_MIN_MS = 60_000;
const DELAY_MAX_MS = 120_000;

/** Plafond journalier de visites de profil (sécurité). */
const DAILY_VISIT_CAP = 30;

const IMPORT_ONLY = process.env.IMPORT_ONLY === "1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CsvLead {
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  linkedinUrl: string;
  presortSeg: string;
  roleFamily: string;
  confidence: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// CSV helpers (parser minimal : guillemets + BOM)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function readSegment(seg: string): CsvLead[] {
  const path = join(DATA_DIR, `seg_${seg}.csv`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    console.warn(`⚠️  ${path} introuvable — segment ignoré.`);
    return [];
  }
  raw = raw.replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (n: string) => header.indexOf(n);
  const iFirst = idx("first name");
  const iLast = idx("last name");
  const iUrl = idx("url");
  const iCompany = idx("company");
  const iPosition = idx("position");
  const iSegment = idx("segment");
  const iRole = idx("role_family");
  const iConf = idx("confidence");
  const iReason = idx("reason");

  const out: CsvLead[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const linkedinUrl = (c[iUrl] || "").trim();
    if (!linkedinUrl) continue;
    out.push({
      firstName: (c[iFirst] || "").trim(),
      lastName: (c[iLast] || "").trim(),
      title: (c[iPosition] || "").trim(),
      company: (c[iCompany] || "").trim(),
      linkedinUrl,
      presortSeg: (c[iSegment] || seg).trim() || seg,
      roleFamily: iRole >= 0 ? (c[iRole] || "").trim() : "",
      confidence: iConf >= 0 ? (c[iConf] || "").trim() : "",
      reason: iReason >= 0 ? (c[iReason] || "").trim() : "",
    });
  }
  return out;
}

/** Normalise une URL LinkedIn pour la dédup (https, sans trailing slash, lowercase host/path). */
function normalizeLinkedInUrl(url: string): string {
  let s = url.trim();
  s = s.replace(/\/+$/, "");
  if (s.startsWith("www.")) s = `https://${s}`;
  if (!s.startsWith("http")) {
    s = `https://www.linkedin.com${s.startsWith("/") ? "" : "/"}${s}`;
  }
  s = s.replace(/^http:\/\//, "https://");
  // Retire un éventuel ?query / #fragment
  s = s.split(/[?#]/)[0];
  return s.toLowerCase();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelayMs() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UNIPILE_API_KEY", "UNIPILE_DSN"]) {
    if (!process.env[k]) {
      console.error(`❌ Variable d'environnement manquante : ${k}`);
      process.exit(1);
    }
  }

  const { createServiceClient } = await import("../lib/supabase/service");
  const supabase = createServiceClient();

  // Compte LinkedIn actif → user_id propriétaire des leads importés.
  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id, user_id")
    .eq("status", "active");
  if (accErr) {
    console.error("❌ Lecture linkedin_accounts échouée :", accErr.message);
    process.exit(1);
  }
  const userId = accounts?.[0]?.user_id;
  if (!userId) {
    console.error("❌ Aucun linkedin_account actif dans beta_mission.");
    process.exit(1);
  }
  console.log(`✅ Opérateur (user_id) : ${userId}`);

  // === ÉTAPE 1 — IMPORT ===
  console.log("\n" + "=".repeat(70));
  console.log("ÉTAPE 1 — IMPORT seg_A → seg_F dans beta_mission.leads");
  console.log("=".repeat(70));

  const importBatch = `yann_connections_${new Date().toISOString()}`;
  const perSegImported: Record<string, number> = {};
  const perSegSkipped: Record<string, number> = {};
  let imported = 0;
  let updated = 0;
  let skippedDupCsv = 0;
  const errors: Array<{ url: string; error: string }> = [];

  // ids importés par segment (pour l'enrichissement seg_A ensuite)
  const importedBySeg: Record<string, Array<{ id: string; lead: CsvLead }>> = {};
  const seenUrls = new Set<string>(); // dédup intra-CSV

  for (const seg of SEGMENTS) {
    const leads = readSegment(seg);
    perSegImported[seg] = 0;
    perSegSkipped[seg] = 0;
    importedBySeg[seg] = [];
    console.log(`\n— seg_${seg} : ${leads.length} lignes`);

    for (const lead of leads) {
      const normUrl = normalizeLinkedInUrl(lead.linkedinUrl);

      if (seenUrls.has(normUrl)) {
        skippedDupCsv++;
        perSegSkipped[seg]++;
        continue;
      }
      seenUrls.add(normUrl);

      try {
        const { data: existing } = await supabase
          .from("leads")
          .select("id, tags, enrichment_data")
          .eq("linkedin_url", normUrl)
          .maybeSingle();

        const presort = {
          segment: lead.presortSeg,
          role_family: lead.roleFamily || null,
          confidence: lead.confidence || null,
          reason: lead.reason || null,
          source: "yann_connections",
          import_batch: importBatch,
        };
        const tags = ["yann-connections", `presort:${lead.presortSeg}`];

        if (existing) {
          // Dédup DB : on ne réimporte pas, on enrichit juste le presort + tags.
          const prevEnrich = (existing.enrichment_data as Record<string, unknown>) || {};
          const prevTags = (existing.tags as string[]) || [];
          const mergedTags = Array.from(new Set([...prevTags, ...tags]));
          const { error: upErr } = await supabase
            .from("leads")
            .update({
              enrichment_data: { ...prevEnrich, presort } as unknown as never,
              tags: mergedTags,
            })
            .eq("id", existing.id);
          if (upErr) errors.push({ url: normUrl, error: upErr.message });
          else {
            updated++;
            perSegSkipped[seg]++;
            // déjà en DB → éligible à l'enrichissement seg_A aussi
            importedBySeg[seg].push({ id: existing.id, lead });
          }
          continue;
        }

        const { data: newLead, error: insErr } = await supabase
          .from("leads")
          .insert({
            user_id: userId,
            first_name: lead.firstName,
            last_name: lead.lastName,
            title: lead.title || null,
            company: lead.company || null,
            linkedin_url: normUrl,
            stage: "connected", // connexions 1er degré de Yann
            status: "cold",
            score: 0,
            tags,
            enrichment_data: { presort } as unknown as never,
          })
          .select("id")
          .single();

        if (insErr) {
          errors.push({ url: normUrl, error: insErr.message });
        } else if (newLead) {
          imported++;
          perSegImported[seg]++;
          importedBySeg[seg].push({ id: newLead.id, lead });
        }
      } catch (e) {
        errors.push({ url: normUrl, error: e instanceof Error ? e.message : String(e) });
      }
    }
    console.log(`  → importés=${perSegImported[seg]} | déjà présents/maj=${perSegSkipped[seg]}`);
  }

  console.log("\n" + "-".repeat(70));
  console.log(`IMPORT TERMINÉ : ${imported} nouveaux | ${updated} mis à jour (déjà en DB) | ${skippedDupCsv} doublons intra-CSV ignorés`);
  if (errors.length) {
    console.log(`⚠️  ${errors.length} erreurs :`);
    errors.slice(0, 10).forEach((e) => console.log(`   - ${e.url} : ${e.error}`));
  }

  // === ÉTAPE 2 — ENRICHISSEMENT seg_A ===
  let enrichSuccess = 0;
  let enrichFail = 0;
  const enrichedSegments: Record<string, number> = {};

  if (!IMPORT_ONLY) {
    console.log("\n" + "=".repeat(70));
    console.log(`ÉTAPE 2 — ENRICHISSEMENT de ${ENRICH_COUNT} leads seg_A`);
    console.log("=".repeat(70));

    // Garde-fou plafond visites : compte les visites déjà envoyées aujourd'hui.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: visitsToday } = await supabase
      .from("actions")
      .select("id")
      .eq("action_type", "visit")
      .gte("sent_at", todayStart.toISOString());
    const visitsUsed = visitsToday?.length || 0;
    const budget = DAILY_VISIT_CAP - visitsUsed;
    const toEnrichCount = Math.min(ENRICH_COUNT, Math.max(0, budget));
    console.log(`Visites déjà utilisées aujourd'hui : ${visitsUsed}/${DAILY_VISIT_CAP} → budget=${budget}, on enrichit ${toEnrichCount}`);

    const segACandidates = importedBySeg["A"].slice(0, toEnrichCount);
    if (segACandidates.length === 0) {
      console.log("Aucun lead seg_A à enrichir.");
    }

    const { enrichSingleLead } = await import("../app/api/ai/enrich/route");

    for (let i = 0; i < segACandidates.length; i++) {
      const { id, lead } = segACandidates[i];
      const tag = `[${i + 1}/${segACandidates.length}] ${lead.firstName} ${lead.lastName}`;

      if (i > 0) {
        const d = randomDelayMs();
        console.log(`⏳ ${tag} — pause anti-détection ${Math.round(d / 1000)}s…`);
        await sleep(d);
      }

      try {
        const leadInput = {
          id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          title: lead.title,
          company: lead.company,
          linkedinUrl: lead.linkedinUrl,
          score: 0,
          status: "cold",
          stage: "connected",
          tags: ["yann-connections", `presort:${lead.presortSeg}`],
          notes: null,
          enrichmentData: null,
        };
        const result = (await enrichSingleLead(leadInput as never, userId, supabase as never)) as Record<string, any>;
        const seg = result?.scoring_detail?.segment_icp || "unknown";
        enrichedSegments[seg] = (enrichedSegments[seg] || 0) + 1;
        enrichSuccess++;
        const gotProfile = !!result?.linkedin_profile;
        console.log(`  ✓ ${tag} — presort=${lead.presortSeg} → computed=${seg}${gotProfile ? " | profil✓" : " | profil✗"}`);
      } catch (e) {
        enrichFail++;
        console.error(`  ✗ ${tag} : ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // === RÉCAP ===
  console.log("\n" + "=".repeat(70));
  console.log("RÉCAPITULATIF");
  console.log("=".repeat(70));
  console.log("\nImport par segment (nouveaux) :");
  for (const seg of SEGMENTS) {
    console.log(`  seg_${seg} : ${perSegImported[seg]} nouveaux, ${perSegSkipped[seg]} déjà présents/maj`);
  }
  console.log(`\nTOTAL importés (nouveaux)      : ${imported}`);
  console.log(`TOTAL mis à jour (déjà en DB)  : ${updated}`);
  console.log(`Doublons intra-CSV ignorés     : ${skippedDupCsv}`);
  console.log(`Erreurs import                 : ${errors.length}`);

  if (!IMPORT_ONLY) {
    console.log(`\nEnrichis (seg_A)               : ${enrichSuccess} OK, ${enrichFail} échecs`);
    console.log("Répartition par segment_icp calculé :");
    Object.entries(enrichedSegments)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k} : ${v}`));
  }

  // Vérif globale : répartition segment_icp sur tous les leads enrichis en DB.
  const { data: allLeads } = await supabase
    .from("leads")
    .select("enrichment_data")
    .contains("tags", ["yann-connections"]);
  const globalSeg: Record<string, number> = {};
  (allLeads || []).forEach((l: any) => {
    const seg = l.enrichment_data?.scoring_detail?.segment_icp;
    if (seg) globalSeg[seg] = (globalSeg[seg] || 0) + 1;
  });
  console.log(`\nTotal leads yann-connections en DB : ${allLeads?.length || 0}`);
  console.log("Dont enrichis (segment_icp présent) :");
  Object.entries(globalSeg)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k} : ${v}`));
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
