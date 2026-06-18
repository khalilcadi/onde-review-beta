/**
 * test-enrich-sample.ts — Test DRY de la classification ICP (Onde Review beta).
 *
 * BUT : enrichir un petit échantillon de connexions LinkedIn de Yann via Unipile
 * (mode lean : profil + entreprise uniquement), recalculer le segment ICP avec
 * computeSegmentIcp(), et afficher l'évidence à côté du segment pour relecture humaine.
 *
 * ⚠️  AUCUNE écriture dans beta_mission.leads — ce script est strictement read-only
 *     côté DB (il lit juste linkedin_accounts pour récupérer l'account Unipile).
 *
 * ⚠️  ANTI-DÉTECTION : un délai aléatoire de 60–120 s est respecté AVANT chaque
 *     appel getUserProfile (sauf le tout premier). C'est ce qui protège le compte
 *     LinkedIn de Yann d'un bannissement.
 *
 * USAGE : npx tsx scripts/test-enrich-sample.ts
 */

// 1re ligne effective : charger .env.local AVANT tout import qui lit process.env
// (lib/unipile/client lit UNIPILE_DSN / UNIPILE_BASE_URL au chargement du module).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// CONSTANTES (éditer ici)
// ---------------------------------------------------------------------------

/** Dossier des connexions triées (gitignored). */
const DATA_DIR = "./Conenctions Yann";

/**
 * Lead épinglé conservé d'un run précédent : référence connue (Benjamin Hermitte,
 * Ace Agency, seg_D) qu'on garde dans l'échantillon de validation anti-overfit.
 * Repéré par sous-chaîne d'URL pour rester robuste à l'ordre du CSV.
 */
const PINNED_LEAD = { seg: "D", urlContains: "benjamin-hermitte-digital-marketing" };

/**
 * Échantillon de validation anti-overfit : on prend des lignes FRAÎCHES (4–5)
 * de chaque segment, en sautant les 3 premières déjà testées au run précédent.
 */
const SAMPLE_SEGMENTS: Array<{ seg: string; skip: number; take: number }> = [
  { seg: "A", skip: 3, take: 2 },
  { seg: "C", skip: 3, take: 2 },
  { seg: "D", skip: 3, take: 2 },
];

/** Cas ambigus : nombre de leads pris dans maybe.csv. */
const MAYBE_FILE = "maybe.csv";
const MAYBE_TAKE = 8;

/** Fichier de sortie CSV (gitignored). */
const OUTPUT_CSV = "scripts/test_results.csv";

/** Délai anti-détection avant chaque getUserProfile (sauf le 1er). */
const DELAY_MIN_MS = 60_000;
const DELAY_MAX_MS = 120_000;

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface SampleLead {
  firstName: string;
  lastName: string;
  title: string; // Position
  company: string;
  linkedinUrl: string; // URL
  presortSeg: string; // colonne "segment" du CSV
}

interface CompanyEvidence {
  industry: string;
  size: string;
  website: string;
  description: string;
}

interface ResultRow extends SampleLead, CompanyEvidence {
  computedSeg: string;
  agree: boolean;
}

// ---------------------------------------------------------------------------
// Helpers env
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Variable d'environnement manquante : ${name} (vérifie .env.local)`);
    process.exit(1);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Helpers CSV (parser minimal gérant les guillemets + BOM)
// ---------------------------------------------------------------------------

/** Parse une ligne CSV en respectant les champs entre guillemets. */
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

/**
 * Lit un CSV de connexions et renvoie jusqu'à `take` leads mappés, après avoir
 * sauté les `skip` premières lignes de données (déjà testées). `fallbackSeg`
 * sert de presortSeg quand la colonne `segment` est absente/vide.
 */
function readCsvSample(
  path: string,
  skip: number,
  take: number,
  fallbackSeg: string
): SampleLead[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    console.warn(`⚠️  ${path} introuvable — ignoré.`);
    return [];
  }

  // Strip BOM
  raw = raw.replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iFirst = idx("first name");
  const iLast = idx("last name");
  const iUrl = idx("url");
  const iCompany = idx("company");
  const iPosition = idx("position");
  const iSegment = idx("segment");

  const out: SampleLead[] = [];
  let dataRow = 0; // index 1-based parmi les lignes de données (hors header)
  for (let i = 1; i < lines.length && out.length < take; i++) {
    dataRow++;
    if (dataRow <= skip) continue; // saute les lignes déjà testées
    const cols = parseCsvLine(lines[i]);
    const linkedinUrl = (cols[iUrl] || "").trim();
    if (!linkedinUrl) continue; // sans URL, pas d'enrichissement possible
    out.push({
      firstName: (cols[iFirst] || "").trim(),
      lastName: (cols[iLast] || "").trim(),
      title: (cols[iPosition] || "").trim(),
      company: (cols[iCompany] || "").trim(),
      linkedinUrl,
      presortSeg: (cols[iSegment] || fallbackSeg).trim() || fallbackSeg,
    });
  }
  return out;
}

/** Renvoie tous les leads d'un seg_X.csv (utilisé pour retrouver un lead épinglé). */
function readWholeSegment(seg: string): SampleLead[] {
  return readCsvSample(join(DATA_DIR, `seg_${seg}.csv`), 0, Infinity, seg);
}

// ---------------------------------------------------------------------------
// Helpers divers
// ---------------------------------------------------------------------------

function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(s: string, n: number): string {
  const clean = (s || "").replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

/** Échappe un champ pour le CSV de sortie. */
function csvField(s: string): string {
  const v = s ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validation env (force le chargement de .env.local en amont).
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("UNIPILE_API_KEY");
  requireEnv("UNIPILE_DSN");

  // Imports dynamiques APRÈS dotenv (les modules lib lisent l'env au chargement).
  const { createServiceClient } = await import("../lib/supabase/service");
  const { getUnipileClient, extractLinkedInIdentifier } = await import(
    "../lib/unipile/client"
  );
  const { computeSegmentIcp } = await import("../lib/scoring-buckets");

  // 1) Récupère le compte Unipile de l'opérateur (Yann).
  const supabase = createServiceClient();
  const { data: accounts, error: accErr } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id, status, user_id")
    .eq("status", "active");

  if (accErr) {
    console.error("❌ Lecture beta_mission.linkedin_accounts échouée :", accErr.message);
    process.exit(1);
  }
  const accountId = accounts?.[0]?.unipile_account_id;
  if (!accountId) {
    console.error("❌ Aucun linkedin_account actif trouvé dans beta_mission.linkedin_accounts.");
    process.exit(1);
  }
  console.log(`✅ Compte Unipile opérateur : ${accountId}`);

  // 2) Construit l'échantillon de validation anti-overfit.
  const sample: SampleLead[] = [];

  // a) Lead épinglé (référence connue conservée du run précédent).
  const pinned = readWholeSegment(PINNED_LEAD.seg).find((l) =>
    l.linkedinUrl.includes(PINNED_LEAD.urlContains)
  );
  if (pinned) sample.push(pinned);
  else console.warn(`⚠️  Lead épinglé introuvable (${PINNED_LEAD.urlContains}).`);

  // b) Lignes fraîches (4–5) de chaque segment.
  for (const { seg, skip, take } of SAMPLE_SEGMENTS) {
    sample.push(...readCsvSample(join(DATA_DIR, `seg_${seg}.csv`), skip, take, seg));
  }

  // c) Cas ambigus (maybe.csv).
  sample.push(...readCsvSample(join(DATA_DIR, MAYBE_FILE), 0, MAYBE_TAKE, "MAYBE"));

  if (sample.length === 0) {
    console.error("❌ Échantillon vide — vérifie le contenu de", DATA_DIR);
    process.exit(1);
  }
  console.log(`✅ Échantillon : ${sample.length} leads à enrichir (DRY, aucune écriture leads).\n`);

  const client = getUnipileClient();
  const results: ResultRow[] = [];
  let enrichFail = 0;

  // 3) Enrichissement lead par lead (lean : profil + entreprise).
  for (let i = 0; i < sample.length; i++) {
    const lead = sample[i];
    const tag = `[${i + 1}/${sample.length}] ${lead.firstName} ${lead.lastName} (${lead.presortSeg})`;

    // ⚠️ Anti-détection : délai aléatoire AVANT chaque appel, sauf le 1er.
    if (i > 0) {
      const delay = randomDelayMs();
      console.log(`⏳ ${tag} — pause anti-détection ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
    }

    try {
      const identifier = extractLinkedInIdentifier(lead.linkedinUrl);

      // a) Profil → extrait l'entreprise courante.
      const profile = (await client.getUserProfile(identifier, accountId, {
        linkedinSections: "*",
      })) as unknown as Record<string, any>;

      const experience = (profile?.work_experience ||
        profile?.experience ||
        []) as Array<Record<string, any>>;
      const currentExp =
        experience.find((e) => !e.end || e.end === null) || experience[0] || null;
      const companyId = (currentExp?.company_id as string) || null;
      const companyName =
        (currentExp?.company as string) ||
        (currentExp?.company_name as string) ||
        lead.company;

      // b) Entreprise → industry / size / website / description.
      const evidence: CompanyEvidence = {
        industry: "",
        size: "",
        website: "",
        description: "",
      };
      if (companyId) {
        const company = (await client.linkedinCompany(companyId, accountId)) as unknown as Record<
          string,
          any
        >;
        const industryArr = company.industry as string[] | undefined;
        const range = company.employee_count_range as { from: number; to: number } | undefined;
        const exact = company.employee_count as number | undefined;
        evidence.industry = industryArr?.[0] || "";
        evidence.size = range
          ? `${range.from}-${range.to}`
          : typeof exact === "number"
          ? String(exact)
          : "";
        evidence.website = (company.website as string) || "";
        evidence.description =
          (company.description as string) || (company.tagline as string) || "";
      }

      // c) Segment ICP calculé (même logique que la prod).
      const enrichmentData = {
        company: {
          size: evidence.size || null,
          industry: evidence.industry || null,
          description: evidence.description || null,
        },
      };
      // 3e param : nom brut de l'entreprise (colonne `company` du CSV) — sert de
      // signal de repli quand l'enrichissement entreprise est vide.
      const computedSeg = computeSegmentIcp(lead.title, enrichmentData, lead.company);

      results.push({
        ...lead,
        ...evidence,
        company: companyName,
        computedSeg,
        agree: computedSeg === lead.presortSeg,
      });
      console.log(
        `   → presort=${lead.presortSeg} computed=${computedSeg} ${
          computedSeg === lead.presortSeg ? "✓" : "✗"
        } | ${evidence.industry || "?"} | ${evidence.size || "?"}`
      );
    } catch (err) {
      enrichFail++;
      console.warn(`   ⚠️ ENRICH_FAIL : ${err instanceof Error ? err.message : err}`);
      results.push({
        ...lead,
        industry: "ENRICH_FAIL",
        size: "",
        website: "",
        description: "",
        computedSeg: "ENRICH_FAIL",
        agree: false,
      });
    }
  }

  // 4) Tri : DÉSACCORDS (presort ≠ computed) en haut.
  results.sort((a, b) => Number(a.agree) - Number(b.agree));

  // 5) Affichage console (table) + écriture CSV.
  const cols = [
    "name",
    "title",
    "company",
    "presort_seg",
    "computed_seg",
    "agree?",
    "industry",
    "size",
    "website",
    "description(120c)",
  ];

  console.log("\n" + "=".repeat(80));
  console.log("RÉSULTATS (désaccords presort≠computed en haut)");
  console.log("=".repeat(80) + "\n");

  const csvLines: string[] = [cols.join(",")];
  for (const r of results) {
    const name = `${r.firstName} ${r.lastName}`.trim();
    const desc = truncate(r.description, 120);
    console.log(
      [
        `${r.agree ? "  " : "✗ "}${name}`,
        `title=${truncate(r.title, 40)}`,
        `co=${truncate(r.company, 30)}`,
        `presort=${r.presortSeg}`,
        `computed=${r.computedSeg}`,
        `agree=${r.agree ? "yes" : "NO"}`,
        `industry=${r.industry || "-"}`,
        `size=${r.size || "-"}`,
        `web=${r.website || "-"}`,
        `desc=${desc || "-"}`,
      ].join(" | ")
    );
    csvLines.push(
      [
        csvField(name),
        csvField(r.title),
        csvField(r.company),
        csvField(r.presortSeg),
        csvField(r.computedSeg),
        csvField(r.agree ? "yes" : "no"),
        csvField(r.industry),
        csvField(r.size),
        csvField(r.website),
        csvField(desc),
      ].join(",")
    );
  }
  writeFileSync(OUTPUT_CSV, csvLines.join("\n") + "\n", "utf-8");

  // 6) Récapitulatif.
  const total = results.length;
  const agreeCount = results.filter((r) => r.agree).length;
  const byComputed: Record<string, number> = {};
  for (const r of results) byComputed[r.computedSeg] = (byComputed[r.computedSeg] || 0) + 1;
  const horsIcp = results.filter((r) => r.computedSeg === "HORS_ICP").length;
  const emptyEvidence = results.filter(
    (r) => r.computedSeg !== "ENRICH_FAIL" && (!r.website || !r.description)
  ).length;

  console.log("\n" + "=".repeat(80));
  console.log("RÉCAPITULATIF");
  console.log("=".repeat(80));
  console.log(
    `Taux d'accord presort vs computed : ${agreeCount}/${total} (${
      total ? Math.round((agreeCount / total) * 100) : 0
    }%)`
  );
  console.log(
    "Comptes par computed_seg          :",
    Object.entries(byComputed)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join("  ")
  );
  console.log(`Nb HORS_ICP                       : ${horsIcp}`);
  console.log(`Nb ENRICH_FAIL                    : ${enrichFail}`);
  console.log(`Nb leads website OU description VIDE: ${emptyEvidence}`);
  console.log(`\n📄 CSV écrit : ${OUTPUT_CSV}`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
