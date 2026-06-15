/**
 * Tests déterministes du parser data.gouv (Checkpoint 1).
 *
 * Couvre : parseEffectif, parseGeo, parseLimit, normalisation, et la
 * post-validation NAF (codes hallucinés jetés, divisions étendues).
 * AUCUN appel IA (selectNafCodes / parseQuery non testés ici : ils dépendent du LLM).
 *
 * USAGE : npx tsx scripts/test-datagouv.ts
 */

import {
  parseEffectif,
  parseGeo,
  parseLimit,
  normalizePhrase,
} from "../lib/datagouv/query-parser";
import {
  isValidNaf,
  isValidDivision,
  expandDivision,
  effectifCodesForRange,
  NAF_CATALOG,
  NAF_DIVISIONS,
  NAF_SECTIONS,
} from "../lib/datagouv/naf-map";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function setEq(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function testCatalog() {
  console.log("\n=== NAF catalog (source officielle INSEE) ===");
  assert(NAF_SECTIONS.length === 21, `21 sections (${NAF_SECTIONS.length})`);
  assert(NAF_DIVISIONS.length === 88, `88 divisions (${NAF_DIVISIONS.length})`);
  assert(NAF_CATALOG.length === 732, `732 sous-classes (${NAF_CATALOG.length})`);
  assert(isValidNaf("62.01Z"), "62.01Z est une sous-classe valide");
  assert(isValidNaf("62.02a"), "normalisation casse : 62.02a → valide");
  assert(!isValidNaf("99.99Z"), "99.99Z (inexistant) rejeté");
  assert(isValidDivision("62"), "division 62 valide");
  assert(isValidDivision("2"), "division '2' paddée → 02 valide");
  assert(!isValidDivision("99") === false, "division 99 existe"); // 99 existe
}

function testExpandDivision() {
  console.log("\n=== expandDivision (post-validation) ===");
  const codes = expandDivision("62");
  assert(codes.length > 0, `division 62 → ${codes.length} sous-classes`);
  assert(
    codes.every((c) => c.startsWith("62.")),
    "toutes les sous-classes commencent par 62."
  );
  assert(codes.includes("62.01Z"), "62 contient 62.01Z");
  assert(expandDivision("99").length >= 1, "division 99 → au moins 1 sous-classe");
}

function testEffectif() {
  console.log("\n=== parseEffectif ===");
  assert(setEq(parseEffectif("10-49 salariés"), ["11", "12"]), "10-49 → [11,12]");
  assert(setEq(parseEffectif("entre 20 et 49"), ["12"]), "entre 20 et 49 → [12]");
  assert(setEq(parseEffectif("de 50 à 99 salariés"), ["21"]), "50 à 99 → [21]");
  assert(parseEffectif("PME").length > 0 && setEq(parseEffectif("PME"), ["11", "12", "21", "22", "31"]), "PME → 10-249");
  assert(setEq(parseEffectif("TPE"), ["00", "01", "02", "03"]), "TPE → <10");
  assert(setEq(parseEffectif("moins de 10"), ["00", "01", "02", "03"]), "moins de 10 → <10");
  // "plus de 5000" = >5000 : la tranche 52 (5000-9999) chevauche les valeurs >5000, donc 52 ET 53.
  assert(setEq(parseEffectif("plus de 5000"), ["52", "53"]), "plus de 5000 → [52,53]");
  assert(setEq(parseEffectif("100 salariés et plus"), ["22", "31", "32", "41", "42", "51", "52", "53"]), "100 et plus");
  assert(parseEffectif("des entreprises tech").length === 0, "pas d'effectif → []");
  assert(setEq(effectifCodesForRange(10, 49), ["11", "12"]), "effectifCodesForRange(10,49) → [11,12]");
}

function testGeo() {
  console.log("\n=== parseGeo (siège, codes département) ===");
  assert(setEq(parseGeo("entreprises à Paris"), ["75"]), "Paris → 75");
  assert(setEq(parseGeo("à Lyon"), ["69"]), "Lyon → 69");
  assert(setEq(parseGeo("en Gironde"), ["33"]), "Gironde → 33");
  assert(setEq(parseGeo("Bouches-du-Rhône"), ["13"]), "Bouches-du-Rhône → 13");
  assert(
    setEq(parseGeo("en Île-de-France"), ["75", "77", "78", "91", "92", "93", "94", "95"]),
    "Île-de-France → 8 départements"
  );
  assert(setEq(parseGeo("région PACA"), ["04", "05", "06", "13", "83", "84"]), "PACA → 6 départements");
  assert(parseGeo("département 33").includes("33"), "département 33 → 33");
  assert(parseGeo("agences digitales").length === 0, "pas de géo → []");
}

function testLimit() {
  console.log("\n=== parseLimit (scan size, défaut 50, cap 250) ===");
  assert(parseLimit("100 entreprises") === 100, "100 entreprises → 100");
  assert(parseLimit("top 30") === 30, "top 30 → 30");
  assert(parseLimit("les 25 premières") === 25, "les 25 premières → 25");
  assert(parseLimit("agences tech à Paris") === 50, "aucun nombre → défaut 50");
  assert(parseLimit("5000 entreprises") === 250, "5000 → plafonné à 250");
  // Un effectif "10-49 salariés" ne doit PAS être lu comme limite
  assert(parseLimit("tech 10-49 salariés à Paris") === 50, "effectif n'est pas la limite");
}

function testNormalize() {
  console.log("\n=== normalizePhrase ===");
  assert(normalizePhrase("Île-de-France") === " ile de france ", "accents + tirets normalisés");
  assert(normalizePhrase("  PME   Tech  ") === " pme tech ", "espaces compressés + minuscule");
}

function main() {
  console.log("==============================================");
  console.log("  DATAGOUV PARSER — tests déterministes");
  console.log("==============================================");

  testCatalog();
  testExpandDivision();
  testEffectif();
  testGeo();
  testLimit();
  testNormalize();

  console.log("\n==============================================");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("==============================================");

  if (failed > 0) process.exit(1);
}

main();
