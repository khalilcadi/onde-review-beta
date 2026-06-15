/**
 * generate-naf-map.ts — Génère lib/datagouv/naf-data.ts depuis la nomenclature
 * OFFICIELLE INSEE NAF rév. 2 (2008). JAMAIS saisi de mémoire.
 *
 * Sources officielles (INSEE, fichier 2120875) :
 *   - Niveau 1 (sections, 21)      : naf2008_liste_n1.xls
 *   - Niveau 2 (divisions, 88)     : naf2008_liste_n2.xls
 *   - Niveau 5 (sous-classes, 732) : naf2008_liste_n5.xls
 *
 * Chaque fichier a la structure : ligne titre, puis header ["Code","Libellé"],
 * puis les lignes code/libellé.
 *
 * Exécuter :  npx tsx scripts/generate-naf-map.ts
 * Le fichier généré (lib/datagouv/naf-data.ts) est commité → aucune dépendance
 * runtime à `xlsx` (devDependency uniquement, utilisée par ce script).
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { join } from "path";

const BASE = "https://www.insee.fr/fr/statistiques/fichier/2120875";
const SOURCES = {
  sections: `${BASE}/naf2008_liste_n1.xls`,
  divisions: `${BASE}/naf2008_liste_n2.xls`,
  sousClasses: `${BASE}/naf2008_liste_n5.xls`,
} as const;

interface NafEntry {
  code: string;
  label: string;
}

async function fetchSheetRows(url: string): Promise<unknown[][]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
}

function extractEntries(
  rows: unknown[][],
  normalizeCode: (raw: unknown) => string | null
): NafEntry[] {
  const headerIdx = rows.findIndex(
    (r) => String(r[0] ?? "").trim().toLowerCase() === "code"
  );
  if (headerIdx === -1) throw new Error('Header "Code" introuvable');

  const out: NafEntry[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (r[0] == null || r[1] == null) continue;
    const code = normalizeCode(r[0]);
    const label = String(r[1]).trim();
    if (!code || !label) continue;
    out.push({ code, label });
  }
  return out;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION ÉCHOUÉE : ${msg}`);
}

function tsArray(entries: NafEntry[]): string {
  return entries
    .map((e) => `  { code: ${JSON.stringify(e.code)}, label: ${JSON.stringify(e.label)} },`)
    .join("\n");
}

async function main(): Promise<void> {
  console.log("[naf-gen] Téléchargement des 3 fichiers officiels INSEE…");
  const [sectionRows, divisionRows, sousClasseRows] = await Promise.all([
    fetchSheetRows(SOURCES.sections),
    fetchSheetRows(SOURCES.divisions),
    fetchSheetRows(SOURCES.sousClasses),
  ]);

  const sections = extractEntries(sectionRows, (raw) => {
    const c = String(raw).trim().toUpperCase();
    return /^[A-U]$/.test(c) ? c : null;
  });
  const divisions = extractEntries(divisionRows, (raw) => {
    const c = String(raw).trim().padStart(2, "0");
    return /^\d{2}$/.test(c) ? c : null;
  });
  const sousClasses = extractEntries(sousClasseRows, (raw) => {
    const c = String(raw).trim().toUpperCase();
    return /^\d{2}\.\d{2}[A-Z]$/.test(c) ? c : null;
  });

  // --- Vérifications dures (anti-régression) ---
  assert(sections.length === 21, `21 sections attendues, obtenu ${sections.length}`);
  assert(divisions.length === 88, `88 divisions attendues, obtenu ${divisions.length}`);
  assert(
    sousClasses.length === 732,
    `732 sous-classes attendues, obtenu ${sousClasses.length}`
  );

  const byCode = new Map(sousClasses.map((e) => [e.code, e.label]));
  assert(
    byCode.get("62.01Z") === "Programmation informatique",
    `spot-check 62.01Z = "${byCode.get("62.01Z")}"`
  );
  assert(byCode.has("70.22Z"), "spot-check 70.22Z (conseil de gestion) présent");
  assert(byCode.has("01.11Z"), "spot-check 01.11Z présent");
  assert(
    sections.some((s) => s.code === "M"),
    "spot-check section M présente"
  );
  assert(
    divisions.some((d) => d.code === "62"),
    "spot-check division 62 présente"
  );

  const header = `/**
 * naf-data.ts — AUTO-GÉNÉRÉ. NE PAS ÉDITER À LA MAIN.
 *
 * Source : nomenclature OFFICIELLE INSEE NAF rév. 2 (2008), fichier 2120875.
 *   sections   ← naf2008_liste_n1.xls (${sections.length})
 *   divisions  ← naf2008_liste_n2.xls (${divisions.length})
 *   sousClasses← naf2008_liste_n5.xls (${sousClasses.length})
 *
 * Régénérer : npx tsx scripts/generate-naf-map.ts
 */

export interface NafEntry {
  code: string;
  label: string;
}
`;

  const body = `
/** 21 sections NAF (niveau 1, code lettre A–U). */
export const NAF_SECTIONS: NafEntry[] = [
${tsArray(sections)}
];

/** 88 divisions NAF (niveau 2, code 2 chiffres). */
export const NAF_DIVISIONS: NafEntry[] = [
${tsArray(divisions)}
];

/** 732 sous-classes NAF (niveau 5, code ex "62.01Z") — catalogue complet de validation. */
export const NAF_CATALOG: NafEntry[] = [
${tsArray(sousClasses)}
];
`;

  const outPath = join(__dirname, "..", "lib", "datagouv", "naf-data.ts");
  writeFileSync(outPath, header + body, "utf8");
  console.log(
    `[naf-gen] OK → ${outPath}\n` +
      `         sections=${sections.length} divisions=${divisions.length} sous-classes=${sousClasses.length}`
  );
}

main().catch((err) => {
  console.error("[naf-gen] ÉCHEC :", err instanceof Error ? err.message : err);
  process.exit(1);
});
