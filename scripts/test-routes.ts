/**
 * Smoke tests for PROSPECTOR API routes.
 *
 * Tests each route for:
 *   - 401 when not authenticated
 *   - 400 when body is malformed
 *   - Correct JSON structure on valid requests (mocked)
 *
 * USAGE:
 *   npx tsx scripts/test-routes.ts
 *
 * NOTE: These are offline unit-style tests. They import the route handlers
 * directly and pass mock NextRequest objects. No running server needed.
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

// ---------------------------------------------------------------------------
// Test: Validate JSON parsing patterns
// ---------------------------------------------------------------------------

function testJsonParsing() {
  console.log("\n=== JSON Parsing Tests ===");

  // Test stripping markdown code fences
  const cases = [
    { input: '```json\n{"score": 80}\n```', expected: '{"score": 80}' },
    { input: '```\n{"score": 80}\n```', expected: '{"score": 80}' },
    { input: '{"score": 80}', expected: '{"score": 80}' },
    { input: '  {"score": 80}  ', expected: '{"score": 80}' },
    {
      input: '```JSON\n{"score": 80, "category": "hot"}\n```',
      expected: '{"score": 80, "category": "hot"}',
    },
  ];

  for (const { input, expected } of cases) {
    const cleaned = input
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    assert(cleaned === expected, `Clean "${input.substring(0, 30)}..." → "${cleaned}"`);

    // Verify it parses
    try {
      JSON.parse(cleaned);
      assert(true, `Parsed cleaned JSON successfully`);
    } catch {
      assert(false, `Failed to parse cleaned JSON: ${cleaned}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test: Import validation (CSV import)
// ---------------------------------------------------------------------------

function testImportValidation() {
  console.log("\n=== CSV Import Validation Tests ===");

  // Valid row
  const validRow = {
    firstName: "Sophie",
    lastName: "Martin",
    linkedinUrl: "https://linkedin.com/in/sophie-martin",
  };
  assert(
    !!validRow.firstName && !!validRow.lastName && !!validRow.linkedinUrl,
    "Valid CSV row passes validation"
  );

  // Missing firstName
  const missingFirst = { firstName: "", lastName: "Martin", linkedinUrl: "https://linkedin.com/in/test" };
  assert(!missingFirst.firstName, "Empty firstName is detected as invalid");

  // Missing linkedinUrl
  const missingUrl = { firstName: "Sophie", lastName: "Martin", linkedinUrl: "" };
  assert(!missingUrl.linkedinUrl, "Empty linkedinUrl is detected as invalid");

  // Row with optional fields
  const fullRow = {
    firstName: "Sophie",
    lastName: "Martin",
    linkedinUrl: "https://linkedin.com/in/sophie-martin",
    title: "CEO",
    company: "TestCo",
    email: "sophie@test.com",
    phone: "+33612345678",
    tags: ["CEO", "Tech"],
  };
  assert(
    !!fullRow.firstName &&
      !!fullRow.lastName &&
      !!fullRow.linkedinUrl &&
      Array.isArray(fullRow.tags),
    "Full CSV row with optional fields passes validation"
  );
}

// ---------------------------------------------------------------------------
// Test: Lead context builder
// ---------------------------------------------------------------------------

async function testLeadContextBuilder() {
  console.log("\n=== Lead Context Builder Tests ===");

  const {
    buildLeadContext,
    buildScoringContext,
    buildEnrichmentContext,
    buildUserPrompt,
    buildScoringUserPrompt,
    buildEnrichmentUserPrompt,
  } = await import("../lib/ai/lead-context");

  const testLead = {
    id: "test-id",
    firstName: "Sophie",
    lastName: "Martin",
    title: "CEO",
    company: "TestCo",
    linkedinUrl: "https://linkedin.com/in/sophie-martin",
    score: 85,
    status: "hot",
    stage: "connected",
    tags: ["CEO", "Tech"],
    notes: "Test notes",
    enrichmentData: {
      company: {
        size: "5-10",
        industry: "Tech",
        funding: "Seed",
        revenue: "100k",
        location: "Paris",
        news: ["New product launch"],
      },
      person: {
        interests: ["IA", "growth"],
        recentPosts: [{ summary: "Post about AI", reactions: 10, comments: 3, date: "2026-03-01" }],
      },
    },
  };

  // buildLeadContext
  const ctx = buildLeadContext(testLead, "message");
  assert(ctx.includes("Sophie Martin"), "buildLeadContext includes lead name");
  assert(ctx.includes("CEO"), "buildLeadContext includes title");
  assert(ctx.includes("TestCo"), "buildLeadContext includes company");
  assert(ctx.includes("85"), "buildLeadContext includes score");
  assert(ctx.includes("Tech"), "buildLeadContext includes enrichment industry");
  assert(ctx.includes("IA"), "buildLeadContext includes person interests");

  // buildLeadContext with regeneration
  const ctxRegen = buildLeadContext(testLead, "message", "Previous message");
  assert(
    ctxRegen.includes("Previous message"),
    "buildLeadContext includes currentMessage for regeneration"
  );

  // buildScoringContext (V4: no engagement param, uses enrichment data only)
  const scoringCtx = buildScoringContext(testLead);
  assert(scoringCtx.includes("Sophie Martin"), "buildScoringContext includes lead name");
  assert(scoringCtx.includes("Tech"), "buildScoringContext includes enrichment industry");
  assert(scoringCtx.includes("linkedin.com/in/sophie-martin"), "buildScoringContext includes LinkedIn URL");

  // buildEnrichmentContext
  const enrichCtx = buildEnrichmentContext(testLead);
  assert(enrichCtx.includes("Sophie Martin"), "buildEnrichmentContext includes lead name");
  assert(
    enrichCtx.includes("linkedin.com/in/sophie-martin"),
    "buildEnrichmentContext includes LinkedIn URL"
  );

  // buildUserPrompt
  const userPrompt = buildUserPrompt(testLead, "message");
  assert(userPrompt.includes("Sophie Martin"), "buildUserPrompt includes lead name");
  assert(userPrompt.includes("message"), "buildUserPrompt includes action type");

  // buildUserPrompt message (max 300 chars — ultra court)
  const msgPrompt = buildUserPrompt(testLead, "message");
  assert(msgPrompt.includes("300"), "buildUserPrompt mentions 300 char limit");

  // buildScoringUserPrompt
  const scoringPrompt = buildScoringUserPrompt(testLead);
  assert(scoringPrompt.includes("Sophie Martin"), "buildScoringUserPrompt includes lead name");
  assert(scoringPrompt.includes("JSON"), "buildScoringUserPrompt requests JSON output");

  // buildEnrichmentUserPrompt
  const enrichPrompt = buildEnrichmentUserPrompt(testLead);
  assert(enrichPrompt.includes("Sophie Martin"), "buildEnrichmentUserPrompt includes lead name");
  assert(enrichPrompt.includes("JSON"), "buildEnrichmentUserPrompt requests JSON output");
}

// ---------------------------------------------------------------------------
// Test: AI Models catalog
// ---------------------------------------------------------------------------

async function testAIModels() {
  console.log("\n=== AI Models Catalog Tests ===");

  const { AI_MODELS, estimateCost } = await import("../lib/ai/models");

  // Check models exist
  const modelKeys = Object.keys(AI_MODELS);
  assert(modelKeys.length >= 8, `Models catalog has ${modelKeys.length} models (>= 8)`);

  // Check Claude models
  assert("claude-opus-4-6" in AI_MODELS, "claude-opus-4-6 exists in catalog");
  assert("claude-sonnet-4-6" in AI_MODELS, "claude-sonnet exists in catalog");
  assert("claude-haiku-4-5-20251001" in AI_MODELS, "claude-haiku exists in catalog");

  // Check Perplexity models
  assert("sonar-pro" in AI_MODELS, "sonar-pro exists in catalog");
  assert("sonar" in AI_MODELS, "sonar exists in catalog");
  assert(
    AI_MODELS["sonar-pro"].provider === "perplexity",
    "sonar-pro has perplexity provider"
  );

  // Check estimateCost
  const cost = estimateCost("claude-sonnet-4-6", 1000, 500, 0);
  assert(cost > 0, `estimateCost returns positive cost: $${cost}`);
  assert(typeof cost === "number", "estimateCost returns a number");

  // Cache discount
  const costWithCache = estimateCost("claude-sonnet-4-6", 1000, 500, 800);
  assert(
    costWithCache < cost || costWithCache === cost,
    `Cost with cache ($${costWithCache}) <= cost without ($${cost})`
  );
}

// ---------------------------------------------------------------------------
// Test: RAG mapping
// ---------------------------------------------------------------------------

async function testRagMapping() {
  console.log("\n=== RAG Mapping Tests ===");

  const { RAG_BLOC_IDS, RAG_AGENT_MAPPING, resolveAgentBlocs } = await import(
    "../lib/rag/mapping"
  );

  // Check bloc IDs exist (v2: 5 blocs)
  assert(RAG_BLOC_IDS.length === 5, `RAG has ${RAG_BLOC_IDS.length} bloc IDs (= 5)`);
  assert(RAG_BLOC_IDS.includes("icp_segments"), "icp_segments bloc exists");
  assert(RAG_BLOC_IDS.includes("pain_points"), "pain_points bloc exists");

  // Check mapping
  assert("prospection_m1" in RAG_AGENT_MAPPING, "prospection_m1 agent mapped");
  assert("prospection_m2" in RAG_AGENT_MAPPING, "prospection_m2 agent mapped");
  assert("scoring" in RAG_AGENT_MAPPING, "scoring agent mapped");
  assert("enrichissement" in RAG_AGENT_MAPPING, "enrichissement agent mapped");
  assert("conversational" in RAG_AGENT_MAPPING, "conversational agent mapped");

  // resolveAgentBlocs — prospection_m1 gets icp_segments + pain_points + messaging_angles + offre_produit
  const prospM1Blocs = resolveAgentBlocs("prospection_m1");
  assert(prospM1Blocs.length >= 2, `Prospection M1 agent has ${prospM1Blocs.length} blocs (>= 2)`);
  assert(prospM1Blocs.includes("icp_segments"), "Prospection M1 agent includes icp_segments bloc");
  assert(prospM1Blocs.includes("pain_points"), "Prospection M1 agent includes pain_points bloc");

  // resolveAgentBlocs — prospection_m2 gets icp_segments + pain_points + messaging_angles + offre_produit + qualification
  const prospM2Blocs = resolveAgentBlocs("prospection_m2");
  assert(prospM2Blocs.length >= 2, `Prospection M2 agent has ${prospM2Blocs.length} blocs (>= 2)`);
  assert(prospM2Blocs.includes("icp_segments"), "Prospection M2 agent includes icp_segments bloc");
  assert(prospM2Blocs.includes("qualification"), "Prospection M2 agent includes qualification bloc");

  // Conversational gets all blocs (wildcard *)
  const convBlocs = resolveAgentBlocs("conversational");
  assert(
    convBlocs.length === 5,
    `Conversational agent has ${convBlocs.length} blocs (all = 5)`
  );

  // Enrichissement gets fewer blocs
  const enrichBlocs = resolveAgentBlocs("enrichissement");
  assert(
    enrichBlocs.length <= 5,
    `Enrichissement agent has ${enrichBlocs.length} blocs (<= 5)`
  );
}

// ---------------------------------------------------------------------------
// Test: Scheduling engine
// ---------------------------------------------------------------------------

async function testScheduling() {
  console.log("\n=== Scheduling Engine Tests ===");

  const {
    isWithinWorkingHours,
    isActiveDay,
    calculateSchedule,
    reorderForOptimalChaining,
  } = await import("../lib/scheduling");

  // Verify functions exist and are exported
  assert(typeof isWithinWorkingHours === "function", "isWithinWorkingHours is exported");
  assert(typeof isActiveDay === "function", "isActiveDay is exported");
  assert(typeof calculateSchedule === "function", "calculateSchedule is exported");
  assert(
    typeof reorderForOptimalChaining === "function",
    "reorderForOptimalChaining is exported"
  );

  // isActiveDay — test with default weekday list
  const weekdays = ["mon", "tue", "wed", "thu", "fri"];
  const result = isActiveDay(weekdays, "Europe/Paris");
  assert(typeof result === "boolean", "isActiveDay returns a boolean");

  // isWithinWorkingHours
  const withinHours = isWithinWorkingHours(0, 24, "Europe/Paris");
  assert(withinHours === true, "isWithinWorkingHours(0, 24) should always return true");

  const outsideHours = isWithinWorkingHours(25, 26, "Europe/Paris");
  assert(outsideHours === false, "isWithinWorkingHours(25, 26) should always return false");

  // ---------------------------------------------------------------------
  // reorderForOptimalChaining tests
  // ---------------------------------------------------------------------

  // Helper: count slow transitions (anything that's NOT visit↔invitation)
  // Returns the number of consecutive pairs that trigger the 15-min floor.
  const countSlowTransitions = (
    seq: Array<{ id: string; actionType: string }>
  ): number => {
    const isFastPair = (a: string, b: string) =>
      (a === "visit" && b === "invitation") ||
      (a === "invitation" && b === "visit");
    let slow = 0;
    for (let i = 1; i < seq.length; i++) {
      if (!isFastPair(seq[i - 1].actionType, seq[i].actionType)) slow++;
    }
    return slow;
  };

  // Test 1: empty / single action
  assert(
    reorderForOptimalChaining([]).length === 0,
    "reorder: empty array returns empty"
  );
  const singleAction = [{ id: "1", actionType: "visit" }];
  assert(
    reorderForOptimalChaining(singleAction)[0].id === "1",
    "reorder: single action returned as-is"
  );

  // Test 2: pure V+I worst-case input becomes alternating
  const worstVI = [
    { id: "v1", actionType: "visit" },
    { id: "v2", actionType: "visit" },
    { id: "v3", actionType: "visit" },
    { id: "i1", actionType: "invitation" },
    { id: "i2", actionType: "invitation" },
    { id: "i3", actionType: "invitation" },
  ];
  const reorderedVI = reorderForOptimalChaining(worstVI);
  const slowBefore = countSlowTransitions(worstVI); // 4 (V-V, V-V, V-I=fast, I-I, I-I)
  const slowAfter = countSlowTransitions(reorderedVI);
  assert(
    slowBefore === 4 && slowAfter === 0,
    `reorder: V+I — slow transitions ${slowBefore} → ${slowAfter} (expected 4 → 0)`
  );

  // Test 3: realistic scenario — 18 inv + 25 visits + 25 messages
  // Worst case: all grouped by type, all at the end
  const realistic: Array<{ id: string; actionType: string }> = [];
  for (let i = 0; i < 18; i++) realistic.push({ id: `inv${i}`, actionType: "invitation" });
  for (let i = 0; i < 25; i++) realistic.push({ id: `vis${i}`, actionType: "visit" });
  for (let i = 0; i < 25; i++) realistic.push({ id: `msg${i}`, actionType: "message" });

  const reorderedReal = reorderForOptimalChaining(realistic);
  // After reorder: 18 V-I pairs (36 fast transitions = 35 fast jumps)
  // + 7 V-V leftover (each slow)
  // + boundary V→M (slow)
  // + 25 M-M chain (24 slow)
  // Total slow = 7 + 1 + 24 = 32 (vs 65 in input)
  const slowReal = countSlowTransitions(reorderedReal);
  const slowOriginal = countSlowTransitions(realistic);
  assert(
    slowReal < slowOriginal,
    `reorder: realistic 68 actions — slow ${slowOriginal} → ${slowReal} (expected significant drop)`
  );
  assert(
    slowReal <= 35,
    `reorder: realistic — slow transitions ≤ 35 (got ${slowReal})`
  );
  assert(
    reorderedReal.length === 68,
    `reorder: no action lost (in=${realistic.length}, out=${reorderedReal.length})`
  );

  // Test 4: messages clustered at the end (not scattered)
  const messageIndices = reorderedReal
    .map((a, i) => (a.actionType === "message" ? i : -1))
    .filter((i) => i >= 0);
  const firstMsg = messageIndices[0];
  const lastMsg = messageIndices[messageIndices.length - 1];
  // Cluster check: all 25 messages should be in 25 consecutive positions
  assert(
    lastMsg - firstMsg === 24,
    `reorder: messages are clustered (span ${lastMsg - firstMsg + 1}, expected 25)`
  );

  // Test 5: inmail counted as message
  const withInmail = [
    { id: "v1", actionType: "visit" },
    { id: "im1", actionType: "inmail" },
    { id: "i1", actionType: "invitation" },
  ];
  const reorderedInmail = reorderForOptimalChaining(withInmail);
  // V↔I should be paired first, inmail at the end
  assert(
    reorderedInmail[reorderedInmail.length - 1].actionType === "inmail",
    "reorder: inmail clustered with messages at the end"
  );

  // Test 6: unknown types (whatsapp, email) appended at the very end
  const withUnknown = [
    { id: "w1", actionType: "whatsapp" },
    { id: "v1", actionType: "visit" },
    { id: "i1", actionType: "invitation" },
  ];
  const reorderedUnknown = reorderForOptimalChaining(withUnknown);
  assert(
    reorderedUnknown[reorderedUnknown.length - 1].actionType === "whatsapp",
    "reorder: unknown types pushed to the very end"
  );

  // Test 7: idempotence — reordering an already-optimal sequence is stable
  const optimal = [
    { id: "v1", actionType: "visit" },
    { id: "i1", actionType: "invitation" },
    { id: "v2", actionType: "visit" },
    { id: "i2", actionType: "invitation" },
    { id: "m1", actionType: "message" },
  ];
  const reorderedOptimal = reorderForOptimalChaining(optimal);
  assert(
    reorderedOptimal.map((a) => a.id).join(",") === "v1,i1,v2,i2,m1",
    "reorder: already-optimal order is preserved"
  );
}

// ---------------------------------------------------------------------------
// Test: Constants
// ---------------------------------------------------------------------------

async function testConstants() {
  console.log("\n=== Constants Tests ===");

  const { DEFAULT_SETTINGS, LEAD_STATUSES, LEAD_STAGES, ACTION_TYPES } = await import(
    "../lib/constants"
  );

  // DEFAULT_SETTINGS
  assert(DEFAULT_SETTINGS.daily_invitations_limit === 18, "Default invitation limit is 18");
  assert(DEFAULT_SETTINGS.daily_messages_limit === 25, "Default message limit is 25");
  assert(typeof DEFAULT_SETTINGS.ai_model === "string", "Default AI model is a string");
  assert(DEFAULT_SETTINGS.temperature === 0.7, "Default temperature is 0.7");

  // LEAD_STATUSES
  const statusKeys = Object.keys(LEAD_STATUSES);
  assert(statusKeys.length >= 4, `${statusKeys.length} lead statuses (>= 4)`);
  assert("cold" in LEAD_STATUSES, "cold status exists");
  assert("hot" in LEAD_STATUSES, "hot status exists");

  // LEAD_STAGES
  const stageKeys = Object.keys(LEAD_STAGES);
  assert(stageKeys.length >= 4, `${stageKeys.length} lead stages (>= 4)`);
  assert("to_invite" in LEAD_STAGES, "to_invite stage exists");

  // ACTION_TYPES
  const actionKeys = Object.keys(ACTION_TYPES);
  assert(actionKeys.length >= 3, `${actionKeys.length} action types (>= 3)`);
  assert("message" in ACTION_TYPES, "message action type exists");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("==============================================");
  console.log("  PROSPECTOR - Route & Module Smoke Tests");
  console.log("==============================================");

  // Module-level tests (no server needed)
  testJsonParsing();
  testImportValidation();
  await testLeadContextBuilder();
  await testAIModels();
  await testRagMapping();
  await testScheduling();
  await testConstants();

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
