/**
 * Tests for resolveRagSections() and mapGojiberrySignal()
 *
 * USAGE:
 *   npx tsx scripts/test-rag-resolver.ts
 */

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

function assertIncludes(arr: string[], value: string, label: string) {
  assert(arr.includes(value), `${label} includes "${value}"`);
}

function assertNotIncludes(arr: string[], value: string, label: string) {
  assert(!arr.includes(value), `${label} does NOT include "${value}"`);
}

function assertEmpty(arr: string[] | undefined, label: string) {
  assert(!arr || arr.length === 0, `${label} is empty/absent (got ${arr?.length ?? 0})`);
}

// ---------------------------------------------------------------------------
// Test: M1 + Segment B + Signal A
// ---------------------------------------------------------------------------

async function testM1_SegB_SignalA() {
  console.log("\n=== M1 + Segment B + Signal A ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M1", "B", "A");

  // icp_segments: segment_b + signaux_intention (signal A)
  assertIncludes(r.icp_segments, "segment_b", "icp_segments");
  assertIncludes(r.icp_segments, "signaux_intention", "icp_segments");

  // pain_points: pp_generiques_b2b (non-ESN)
  assertIncludes(r.pain_points, "pp_generiques_b2b", "pain_points");

  // offre_produit: vue_ensemble (non-ESN)
  assertIncludes(r.offre_produit, "vue_ensemble", "offre_produit");

  // messaging_angles: position_1_systeme + position_3_outil (B/A) + vocabulaire
  assertIncludes(r.messaging_angles, "position_1_systeme", "messaging_angles");
  assertIncludes(r.messaging_angles, "position_3_outil", "messaging_angles");
  assertIncludes(r.messaging_angles, "vocabulaire", "messaging_angles");

  // qualification: empty for M1
  assertEmpty(r.qualification, "qualification");
}

// ---------------------------------------------------------------------------
// Test: M1 + Segment D1 + Signal B
// ---------------------------------------------------------------------------

async function testM1_SegD1_SignalB() {
  console.log("\n=== M1 + Segment D1 + Signal B ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M1", "D1", "B");

  // icp_segments: segment_d1 + triple_pipeline + signaux_intention (signal B)
  assertIncludes(r.icp_segments, "segment_d1", "icp_segments");
  assertIncludes(r.icp_segments, "triple_pipeline", "icp_segments");
  assertIncludes(r.icp_segments, "signaux_intention", "icp_segments");

  // pain_points: pp_esn_intercontrat (D1 ESN)
  assertIncludes(r.pain_points, "pp_esn_intercontrat", "pain_points");
  // D1 signal B does NOT add pp_esn_croyances (only signal A does)
  assertNotIncludes(r.pain_points, "pp_esn_croyances", "pain_points");

  // offre_produit: vue_ensemble + triple_pipeline_detail (ESN)
  assertIncludes(r.offre_produit, "vue_ensemble", "offre_produit");
  assertIncludes(r.offre_produit, "triple_pipeline_detail", "offre_produit");

  // messaging_angles: position_0_intention (D1/B) + vocabulaire
  assertIncludes(r.messaging_angles, "position_0_intention", "messaging_angles");
  assertIncludes(r.messaging_angles, "vocabulaire", "messaging_angles");
  // Should NOT have position_3_outil (only for D1/A)
  assertNotIncludes(r.messaging_angles, "position_3_outil", "messaging_angles");
}

// ---------------------------------------------------------------------------
// Test: M1 + Segment A + Signal D (no signal → cold outreach)
// ---------------------------------------------------------------------------

async function testM1_SegA_SignalD() {
  console.log("\n=== M1 + Segment A + Signal D (no signal) ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M1", "A", "D");

  // icp_segments: segment_a only (signal D → no signaux_intention)
  assertIncludes(r.icp_segments, "segment_a", "icp_segments");
  assertNotIncludes(r.icp_segments, "signaux_intention", "icp_segments");

  // pain_points: pp_generiques_b2b (non-ESN)
  assertIncludes(r.pain_points, "pp_generiques_b2b", "pain_points");

  // offre_produit: vue_ensemble
  assertIncludes(r.offre_produit, "vue_ensemble", "offre_produit");

  // messaging_angles: position_4_personne (A/C|D) + vocabulaire
  assertIncludes(r.messaging_angles, "position_4_personne", "messaging_angles");
  assertIncludes(r.messaging_angles, "vocabulaire", "messaging_angles");
  // No position_1_systeme (only A/A)
  assertNotIncludes(r.messaging_angles, "position_1_systeme", "messaging_angles");

  // qualification: empty for M1
  assertEmpty(r.qualification, "qualification");
}

// ---------------------------------------------------------------------------
// Test: M2 relance (situation 2) + Segment B → RAG léger
// ---------------------------------------------------------------------------

async function testM2_Relance_SegB() {
  console.log("\n=== M2 relance + Segment B (RAG léger) ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "B", "D", "relance");

  // icp_segments: segment_b only
  assertIncludes(r.icp_segments, "segment_b", "icp_segments");
  assert(r.icp_segments.length === 1, "icp_segments has exactly 1 entry");

  // pain_points: pp_generiques_b2b (non-ESN)
  assertIncludes(r.pain_points, "pp_generiques_b2b", "pain_points");
  assert(r.pain_points.length === 1, "pain_points has exactly 1 entry");

  // Only 2 keys present (icp_segments + pain_points), rest stripped
  assert(Object.keys(r).length === 2, `relance has exactly 2 keys (got ${Object.keys(r).length})`);
  assert(!r.messaging_angles, "no messaging_angles key (stripped)");
  assert(!r.offre_produit, "no offre_produit key (stripped)");
  assert(!r.qualification, "no qualification key (stripped)");
}

// ---------------------------------------------------------------------------
// Test: M2 dernier_message (situation 3) → no RAG
// ---------------------------------------------------------------------------

async function testM2_DernierMessage() {
  console.log("\n=== M2 dernier_message → no RAG ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "B", "D", "dernier_message");

  assert(Object.keys(r).length === 0, "dernier_message returns empty object (no keys)");
  assert(!r.icp_segments, "no icp_segments key");
  assert(!r.pain_points, "no pain_points key");
  assert(!r.messaging_angles, "no messaging_angles key");
  assert(!r.offre_produit, "no offre_produit key");
  assert(!r.qualification, "no qualification key");
}

// ---------------------------------------------------------------------------
// Test: M2 reponse (situation 1) + question produit → offre_produit injecté
// ---------------------------------------------------------------------------

async function testM2_Reponse_QuestionProduit() {
  console.log("\n=== M2 reponse + question_produit ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "B", "D", "reponse", "question_produit");

  // icp_segments: segment_b
  assertIncludes(r.icp_segments, "segment_b", "icp_segments");

  // pain_points: pp_generiques_b2b
  assertIncludes(r.pain_points, "pp_generiques_b2b", "pain_points");

  // offre_produit: vue_ensemble + composants
  assertIncludes(r.offre_produit, "vue_ensemble", "offre_produit");
  assertIncludes(r.offre_produit, "composants", "offre_produit");

  // qualification: questions_diagnostic + closing
  assertIncludes(r.qualification, "questions_diagnostic", "qualification");
  assertIncludes(r.qualification, "closing", "qualification");

  // messaging_angles: empty for M2 reponse
  assertEmpty(r.messaging_angles, "messaging_angles");
}

// ---------------------------------------------------------------------------
// Test: M2 reponse + objection_prix
// ---------------------------------------------------------------------------

async function testM2_Reponse_ObjectionPrix() {
  console.log("\n=== M2 reponse + objection_prix ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "C", "D", "reponse", "objection_prix");

  assertIncludes(r.icp_segments, "segment_c", "icp_segments");
  assertIncludes(r.offre_produit, "pricing", "offre_produit");
  assertIncludes(r.qualification, "obj_prix", "qualification");
  assertIncludes(r.qualification, "closing", "qualification");
  assertEmpty(r.pain_points, "pain_points");
}

// ---------------------------------------------------------------------------
// Test: M2 reponse + objection_esn (ESN-specific)
// ---------------------------------------------------------------------------

async function testM2_Reponse_ObjectionEsn() {
  console.log("\n=== M2 reponse + objection_esn ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "D1", "D", "reponse", "objection_esn");

  assertIncludes(r.icp_segments, "segment_d1", "icp_segments");
  assertIncludes(r.pain_points, "pp_esn_croyances", "pain_points");
  assertIncludes(r.offre_produit, "triple_pipeline_detail", "offre_produit");
  assertIncludes(r.qualification, "obj_esn", "qualification");
}

// ---------------------------------------------------------------------------
// Test: M2 reponse + conformite (minimal — no segment)
// ---------------------------------------------------------------------------

async function testM2_Reponse_Conformite() {
  console.log("\n=== M2 reponse + conformite ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "B", "D", "reponse", "conformite");

  // conformite only injects qualification
  assertEmpty(r.icp_segments, "icp_segments");
  assertEmpty(r.pain_points, "pain_points");
  assertEmpty(r.messaging_angles, "messaging_angles");
  assertEmpty(r.offre_produit, "offre_produit");
  assertIncludes(r.qualification, "obj_conformite", "qualification");
}

// ---------------------------------------------------------------------------
// Test: M2 reponse + general (default fallback)
// ---------------------------------------------------------------------------

async function testM2_Reponse_General() {
  console.log("\n=== M2 reponse + general (default) ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "D2", "D", "reponse", "general");

  assertIncludes(r.icp_segments, "segment_d2", "icp_segments");
  assertIncludes(r.pain_points, "pp_commerciaux", "pain_points");
  assertIncludes(r.qualification, "questions_diagnostic", "qualification");
  assertEmpty(r.offre_produit, "offre_produit");
}

// ---------------------------------------------------------------------------
// Test: M2 relance D1 → ESN-specific pain point
// ---------------------------------------------------------------------------

async function testM2_Relance_D1() {
  console.log("\n=== M2 relance + Segment D1 ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "D1", "D", "relance");

  assertIncludes(r.icp_segments, "segment_d1", "icp_segments");
  assertIncludes(r.pain_points, "pp_esn_intercontrat", "pain_points");
  assertEmpty(r.messaging_angles, "messaging_angles");
  assertEmpty(r.offre_produit, "offre_produit");
}

// ---------------------------------------------------------------------------
// Test: M2 relance D2 → pp_commerciaux
// ---------------------------------------------------------------------------

async function testM2_Relance_D2() {
  console.log("\n=== M2 relance + Segment D2 ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M2", "D2", "D", "relance");

  assertIncludes(r.icp_segments, "segment_d2", "icp_segments");
  assertIncludes(r.pain_points, "pp_commerciaux", "pain_points");
}

// ---------------------------------------------------------------------------
// Test: mapGojiberrySignal()
// ---------------------------------------------------------------------------

async function testMapGojiberrySignal() {
  console.log("\n=== mapGojiberrySignal() ===");

  const { mapGojiberrySignal } = await import("../lib/rag/mapping");

  // Known signal types → A
  assert(mapGojiberrySignal("ENGAGEMENT_KEYWORD") === "A", "ENGAGEMENT_KEYWORD → A");
  assert(mapGojiberrySignal("ENGAGEMENT_EXPERT") === "A", "ENGAGEMENT_EXPERT → A");
  assert(mapGojiberrySignal("COMPETITOR_ENGAGEMENT") === "A", "COMPETITOR_ENGAGEMENT → A");

  // Known signal types → B
  assert(mapGojiberrySignal("NEW_ROLE") === "B", "NEW_ROLE → B");

  // Known signal types → C
  assert(mapGojiberrySignal("ICP_TOP_ACTIVE") === "C", "ICP_TOP_ACTIVE → C");

  // Null / unknown → D (fallback)
  assert(mapGojiberrySignal(null) === "D", "null → D");
  assert(mapGojiberrySignal("UNKNOWN_TYPE") === "D", "unknown type → D");
  assert(mapGojiberrySignal("") === "D", "empty string → D");
}

// ---------------------------------------------------------------------------
// Test: Fallback for unknown segment (M2 no m2Situation → falls to relance)
// ---------------------------------------------------------------------------

async function testFallbackUnknownM2Situation() {
  console.log("\n=== M2 fallback (no m2Situation) ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  // Calling M2 without m2Situation should fallback to relance behavior
  const r = resolveRagSections("M2", "B", "D");

  assertIncludes(r.icp_segments, "segment_b", "icp_segments");
  assertIncludes(r.pain_points, "pp_generiques_b2b", "pain_points");
  assertEmpty(r.messaging_angles, "messaging_angles");
  assertEmpty(r.offre_produit, "offre_produit");
  assertEmpty(r.qualification, "qualification");
}

// ---------------------------------------------------------------------------
// Test: M1 + Segment D2 + Signal A (ESN D2 path)
// ---------------------------------------------------------------------------

async function testM1_SegD2_SignalA() {
  console.log("\n=== M1 + Segment D2 + Signal A ===");

  const { resolveRagSections } = await import("../lib/rag/mapping");
  const r = resolveRagSections("M1", "D2", "A");

  // ESN D2 specifics
  assertIncludes(r.icp_segments, "segment_d2", "icp_segments");
  assertIncludes(r.icp_segments, "triple_pipeline", "icp_segments");
  assertIncludes(r.icp_segments, "signaux_intention", "icp_segments");

  // D2 pain points: pp_esn_intercontrat + pp_commerciaux
  assertIncludes(r.pain_points, "pp_esn_intercontrat", "pain_points");
  assertIncludes(r.pain_points, "pp_commerciaux", "pain_points");

  // D2/A: position_0_intention + position_1_systeme
  assertIncludes(r.messaging_angles, "position_0_intention", "messaging_angles");
  assertIncludes(r.messaging_angles, "position_1_systeme", "messaging_angles");
  assertIncludes(r.messaging_angles, "vocabulaire", "messaging_angles");

  // ESN offre_produit
  assertIncludes(r.offre_produit, "vue_ensemble", "offre_produit");
  assertIncludes(r.offre_produit, "triple_pipeline_detail", "offre_produit");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("==============================================");
  console.log("  PROSPECTOR - RAG Resolver Tests");
  console.log("==============================================");

  // M1 tests
  await testM1_SegB_SignalA();
  await testM1_SegD1_SignalB();
  await testM1_SegA_SignalD();
  await testM1_SegD2_SignalA();

  // M2 tests
  await testM2_Relance_SegB();
  await testM2_DernierMessage();
  await testM2_Reponse_QuestionProduit();
  await testM2_Reponse_ObjectionPrix();
  await testM2_Reponse_ObjectionEsn();
  await testM2_Reponse_Conformite();
  await testM2_Reponse_General();
  await testM2_Relance_D1();
  await testM2_Relance_D2();

  // mapGojiberrySignal
  await testMapGojiberrySignal();

  // Fallbacks
  await testFallbackUnknownM2Situation();

  // Summary
  console.log("\n==============================================");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("==============================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
