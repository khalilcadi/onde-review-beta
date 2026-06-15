/**
 * Full flow integration tests for 5 test leads.
 *
 * Phase A (offline): RAG resolution, context building, prompt building
 * Phase B (online, requires ANTHROPIC_API_KEY): AI generation + output validation
 *
 * USAGE:
 *   npx tsx scripts/test-full-flow.ts            # Phase A only (no API key needed)
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/test-full-flow.ts   # Phase A + B
 *
 * Estimated cost Phase B: ~$0.05 (5 calls × Sonnet)
 */

import "dotenv/config";

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

function assertIncludes(text: string, needle: string, label: string) {
  assert(text.includes(needle), `${label} contains "${needle}"`);
}

// ---------------------------------------------------------------------------
// 5 test leads
// ---------------------------------------------------------------------------

import type { LeadForGeneration } from "../lib/ai/lead-context";

const LEAD_1_ESN_D1_NEW_ROLE: LeadForGeneration = {
  id: "test-lead-1",
  firstName: "Thomas",
  lastName: "Durand",
  title: "Directeur Général",
  company: "NexTech Solutions",
  linkedinUrl: "https://linkedin.com/in/thomas-durand-nextech",
  score: 72,
  status: "warm",
  stage: "to_invite",
  tags: ["goji:NEW_ROLE"],
  notes: null,
  enrichmentData: {
    company: {
      size: "35 salariés",
      industry: "ESN / Consulting IT",
      location: "Lyon, France",
      revenue: "4M€",
      website_analysis: {
        offering: "Conseil et développement logiciel, DevOps, Cloud",
        target_market: "Grands comptes et ETI industrielles",
        differentiators: "Expertise cloud native, certifications AWS/Azure",
        team_visible: "Oui — page équipe avec 25 consultants listés",
      },
    },
    person: {
      anciennete_poste_mois: 3,
      experience: [
        { title: "Directeur Général", company: "NexTech Solutions", dates: "Jan 2026 - Present" },
        { title: "Directeur Commercial", company: "Capgemini", dates: "2019-2025" },
      ],
      interests: ["transformation digitale", "IA générative", "management"],
      recentPosts: [
        {
          summary: "Partage sur les défis du recrutement en ESN",
          sujet: "Recrutement consultants seniors",
          tension: "Pénurie de talents tech vs croissance du marché",
          ton: "réflexif",
          reactions: 45,
          comments: 12,
          date: "2026-03-20",
        },
      ],
    },
    signal: {
      type: "NEW_ROLE",
      detail: "Nouveau poste de DG chez NexTech Solutions depuis janvier 2026",
      source: "gojiberry",
      gojiberry_score: 2,
      import_date: "2026-03-15",
    },
    linkedin_profile: {
      headline: "DG @NexTech Solutions | Ex-Capgemini | Cloud & Digital Transformation",
      about: "Passionné par l'accompagnement des entreprises dans leur transformation digitale. 15 ans d'expérience dans le conseil IT.",
      skills: ["Cloud Computing", "Business Development", "Digital Strategy"],
      is_creator: true,
      is_open_profile: false,
      follower_count: 3200,
      shared_connections_count: 8,
    },
    scoring_detail: {
      fit_score: 75,
      intent_score: 60,
      timing_score: 80,
      categorie: "warm",
      segment_icp: "D1",
      confidence: "haute",
      justification: "ESN 35 personnes, nouveau DG, signal NEW_ROLE",
      cas_limite: false,
      ajustement_ia: "aucun",
    },
    hook_recommande: {
      angle: "Nouveau rôle de DG + enjeux ESN intercontrat",
      fait_concret: "Prise de poste DG janvier 2026, ex-Capgemini",
      tension_icp: "Intercontrat et dépendance au réseau fondateur",
      niveau_contexte: "fort",
    },
  },
};

const LEAD_2_B2B_SEG_B_ENGAGEMENT: LeadForGeneration = {
  id: "test-lead-2",
  firstName: "Sophie",
  lastName: "Martin",
  title: "Directrice Marketing",
  company: "GrowthLab Agency",
  linkedinUrl: "https://linkedin.com/in/sophie-martin-growthlab",
  score: 65,
  status: "cold",
  stage: "to_invite",
  tags: ["goji:ENGAGEMENT_KEYWORD"],
  notes: null,
  enrichmentData: {
    company: {
      size: "20 salariés",
      industry: "Agence marketing B2B",
      location: "Paris, France",
      revenue: "2.5M€",
      website_analysis: {
        offering: "Growth marketing, acquisition B2B, content marketing",
        target_market: "SaaS B2B et startups tech",
        differentiators: "Approche data-driven, spécialiste LinkedIn Ads",
      },
    },
    person: {
      anciennete_poste_mois: 18,
      experience: [
        { title: "Directrice Marketing", company: "GrowthLab Agency", dates: "Oct 2024 - Present" },
        { title: "Head of Growth", company: "Plezi", dates: "2021-2024" },
      ],
      interests: ["growth hacking", "B2B marketing", "LinkedIn marketing"],
      recentPosts: [
        {
          summary: "Les 3 erreurs des agences qui veulent scaler leur acquisition",
          sujet: "Scaling acquisition agence",
          tension: "Dépendance au fondateur pour le business development",
          ton: "pédagogique",
          reactions: 120,
          comments: 28,
          date: "2026-03-25",
        },
      ],
    },
    signal: {
      type: "ENGAGEMENT_KEYWORD",
      detail: "A liké un post sur l'automatisation de la prospection B2B",
      source: "gojiberry",
      gojiberry_score: 3,
      intent_keyword: "automatisation prospection",
      import_date: "2026-03-28",
    },
    linkedin_profile: {
      headline: "Directrice Marketing @GrowthLab | Ex-Plezi | Growth B2B",
      about: "J'aide les entreprises B2B à structurer leur acquisition client de manière prévisible.",
      skills: ["Growth Marketing", "LinkedIn Ads", "Content Strategy"],
      is_creator: true,
      is_open_profile: true,
      follower_count: 5400,
      shared_connections_count: 12,
    },
    scoring_detail: {
      fit_score: 70,
      intent_score: 85,
      timing_score: 60,
      categorie: "warm",
      segment_icp: "B",
      confidence: "haute",
      justification: "Agence B2B 20 personnes, signal engagement keyword sur prospection",
      cas_limite: false,
      ajustement_ia: "aucun",
    },
    hook_recommande: {
      angle: "Engagement sur automatisation prospection + douleur scaling",
      fait_concret: "A liké un post sur l'automatisation prospection B2B",
      tension_icp: "Dépendance au fondateur pour le business development",
      niveau_contexte: "fort",
    },
  },
};

const LEAD_3_NO_SIGNAL_SEG_A: LeadForGeneration = {
  id: "test-lead-3",
  firstName: "Pierre",
  lastName: "Leclerc",
  title: "CEO",
  company: "DigitalPulse",
  linkedinUrl: "https://linkedin.com/in/pierre-leclerc-digitalpulse",
  score: 40,
  status: "cold",
  stage: "to_invite",
  tags: [],
  notes: null,
  enrichmentData: {
    company: {
      size: "8 salariés",
      industry: "Agence digitale",
      location: "Bordeaux, France",
    },
    person: {
      anciennete_poste_mois: 48,
      experience: [
        { title: "CEO & Fondateur", company: "DigitalPulse", dates: "2022 - Present" },
      ],
    },
    signal: {
      type: null,
      source: null,
    },
    linkedin_profile: {
      headline: "CEO @DigitalPulse | Agence digitale Bordeaux",
      about: null,
      skills: ["Web Development", "UX Design"],
      is_creator: false,
      is_open_profile: false,
      follower_count: 450,
      shared_connections_count: 2,
    },
    scoring_detail: {
      fit_score: 50,
      intent_score: 10,
      timing_score: 30,
      categorie: "cold",
      segment_icp: "A",
      confidence: "moyenne",
      justification: "Petite agence digitale, pas de signal, contexte faible",
      cas_limite: false,
      ajustement_ia: "aucun",
    },
    hook_recommande: null,
  },
};

const LEAD_4_D1_M2_RELANCE: LeadForGeneration = {
  id: "test-lead-4",
  firstName: "Marc",
  lastName: "Petit",
  title: "DG",
  company: "InfoPro Consulting",
  linkedinUrl: "https://linkedin.com/in/marc-petit-infopro",
  score: 68,
  status: "warm",
  stage: "invited",
  tags: ["goji:NEW_ROLE"],
  notes: null,
  enrichmentData: {
    company: {
      size: "42 salariés",
      industry: "ESN / SSII",
      location: "Toulouse, France",
      revenue: "5M€",
    },
    person: {
      anciennete_poste_mois: 6,
      experience: [
        { title: "DG", company: "InfoPro Consulting", dates: "Oct 2025 - Present" },
        { title: "Directeur BU", company: "Sopra Steria", dates: "2018-2025" },
      ],
    },
    signal: {
      type: "NEW_ROLE",
      detail: "Nouveau DG depuis octobre 2025",
      source: "gojiberry",
      gojiberry_score: 2,
    },
    linkedin_profile: {
      headline: "DG @InfoPro Consulting | Transformation digitale | Ex-Sopra",
      skills: ["IT Consulting", "Business Management"],
      is_open_profile: false,
    },
    scoring_detail: {
      fit_score: 72,
      intent_score: 45,
      timing_score: 65,
      categorie: "warm",
      segment_icp: "D1",
      confidence: "haute",
      justification: "ESN 42 personnes, nouveau DG",
      cas_limite: false,
      ajustement_ia: "aucun",
    },
  },
};

const LEAD_5_B_M2_DERNIER: LeadForGeneration = {
  id: "test-lead-5",
  firstName: "Julie",
  lastName: "Bernard",
  title: "Fondatrice",
  company: "Boost Digital",
  linkedinUrl: "https://linkedin.com/in/julie-bernard-boost",
  score: 55,
  status: "cold",
  stage: "invited",
  tags: [],
  notes: null,
  enrichmentData: {
    company: {
      size: "15 salariés",
      industry: "Agence growth B2B",
      location: "Nantes, France",
    },
    person: {
      anciennete_poste_mois: 36,
      experience: [
        { title: "Fondatrice", company: "Boost Digital", dates: "2023 - Present" },
      ],
    },
    signal: {
      type: null,
      source: null,
    },
    linkedin_profile: {
      headline: "Fondatrice @Boost Digital | Agence Growth B2B | Nantes",
      skills: ["Growth Marketing", "Sales Enablement"],
      is_open_profile: false,
    },
    scoring_detail: {
      fit_score: 60,
      intent_score: 20,
      timing_score: 40,
      categorie: "cold",
      segment_icp: "B",
      confidence: "moyenne",
      justification: "Agence growth 15 personnes, pas de signal récent",
      cas_limite: false,
      ajustement_ia: "aucun",
    },
  },
};

// ---------------------------------------------------------------------------
// Phase A: Offline tests (RAG, context, prompt building)
// ---------------------------------------------------------------------------

async function phaseA_ragResolution() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  PHASE A: RAG Resolution & Context Building  ║");
  console.log("╚══════════════════════════════════════════════╝");

  const { resolveRagSections, mapGojiberrySignal } = await import("../lib/rag/mapping");
  const { buildRagContext } = await import("../lib/rag/context");
  const { buildLeadContext, buildUserPrompt } = await import("../lib/ai/lead-context");

  // =========================================================================
  // Lead 1: ESN D1 + NEW_ROLE → M1
  // =========================================================================
  console.log("\n--- Lead 1: ESN D1 + NEW_ROLE (M1) ---");

  const signal1 = mapGojiberrySignal("NEW_ROLE");
  assert(signal1 === "B", "NEW_ROLE → signal B");

  const rag1 = resolveRagSections("M1", "D1", signal1);
  assert(rag1.icp_segments.includes("segment_d1"), "L1 RAG: segment_d1");
  assert(rag1.icp_segments.includes("triple_pipeline"), "L1 RAG: triple_pipeline (ESN)");
  assert(rag1.icp_segments.includes("signaux_intention"), "L1 RAG: signaux_intention (signal B)");
  assert(rag1.pain_points.includes("pp_esn_intercontrat"), "L1 RAG: pp_esn_intercontrat");
  assert(!rag1.pain_points.includes("pp_esn_croyances"), "L1 RAG: NO pp_esn_croyances (signal B, not A)");
  assert(rag1.messaging_angles.includes("position_0_intention"), "L1 RAG: position_0_intention (D1/B)");
  assert(rag1.messaging_angles.includes("vocabulaire"), "L1 RAG: vocabulaire");
  assert(rag1.offre_produit.includes("triple_pipeline_detail"), "L1 RAG: triple_pipeline_detail (ESN)");

  // Build RAG context and verify injection
  const ragText1 = await buildRagContext(rag1);
  assert(ragText1.includes("BASE DE CONNAISSANCES (RAG)"), "L1 RAG text: header present");
  assert(ragText1.includes("triple_pipeline") || ragText1.includes("Triple Pipeline") || ragText1.length > 500, "L1 RAG text: substantial content");

  // Build runtime context
  const ctx1 = buildLeadContext(LEAD_1_ESN_D1_NEW_ROLE, "invitation", undefined, undefined, { current: 1, total: 5 });
  assertIncludes(ctx1, "Thomas Durand", "L1 context: lead name");
  assertIncludes(ctx1, "NexTech Solutions", "L1 context: company");
  assertIncludes(ctx1, "ESN", "L1 context: ESN industry");
  assertIncludes(ctx1, "NEW_ROLE", "L1 context: signal type");
  assertIncludes(ctx1, "Étape : 1/5", "L1 context: sequence step");

  // Build user prompt
  const prompt1 = buildUserPrompt(LEAD_1_ESN_D1_NEW_ROLE, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });
  assertIncludes(prompt1, "Thomas Durand", "L1 prompt: lead identity");
  assertIncludes(prompt1, "variante_a", "L1 prompt: M1 JSON format requested");
  assertIncludes(prompt1, "variante_b", "L1 prompt: 2 variants requested");
  assertIncludes(prompt1, "CONTEXTE FORT", "L1 prompt: strong context (signal + enrichment)");
  assertIncludes(prompt1, "persona", "L1 prompt: persona field requested");

  // =========================================================================
  // Lead 2: Segment B + ENGAGEMENT_KEYWORD → M1
  // =========================================================================
  console.log("\n--- Lead 2: Segment B + ENGAGEMENT_KEYWORD (M1) ---");

  const signal2 = mapGojiberrySignal("ENGAGEMENT_KEYWORD");
  assert(signal2 === "A", "ENGAGEMENT_KEYWORD → signal A");

  const rag2 = resolveRagSections("M1", "B", signal2);
  assert(rag2.icp_segments.includes("segment_b"), "L2 RAG: segment_b");
  assert(rag2.icp_segments.includes("signaux_intention"), "L2 RAG: signaux_intention (signal A)");
  assert(rag2.pain_points.includes("pp_generiques_b2b"), "L2 RAG: pp_generiques_b2b");
  assert(rag2.messaging_angles.includes("position_1_systeme"), "L2 RAG: position_1_systeme (B/A)");
  assert(rag2.messaging_angles.includes("position_3_outil"), "L2 RAG: position_3_outil (B/A)");
  assert(rag2.offre_produit.includes("vue_ensemble"), "L2 RAG: vue_ensemble");

  const ragText2 = await buildRagContext(rag2);
  assert(ragText2.length > 500, "L2 RAG text: substantial content");

  const ctx2 = buildLeadContext(LEAD_2_B2B_SEG_B_ENGAGEMENT, "invitation", undefined, undefined, { current: 1, total: 5 });
  assertIncludes(ctx2, "Sophie Martin", "L2 context: lead name");
  assertIncludes(ctx2, "ENGAGEMENT_KEYWORD", "L2 context: signal type");
  assertIncludes(ctx2, "automatisation prospection", "L2 context: intent keyword");

  const prompt2 = buildUserPrompt(LEAD_2_B2B_SEG_B_ENGAGEMENT, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });
  assertIncludes(prompt2, "CONTEXTE FORT", "L2 prompt: strong context");
  assertIncludes(prompt2, "variante_a", "L2 prompt: M1 format");

  // =========================================================================
  // Lead 3: Segment A + no signal (D) → M1 prudent
  // =========================================================================
  console.log("\n--- Lead 3: Segment A + no signal (M1 prudent) ---");

  const signal3 = mapGojiberrySignal(null);
  assert(signal3 === "D", "null signal → D");

  const rag3 = resolveRagSections("M1", "A", signal3);
  assert(rag3.icp_segments.includes("segment_a"), "L3 RAG: segment_a");
  assert(!rag3.icp_segments.includes("signaux_intention"), "L3 RAG: NO signaux_intention (signal D)");
  assert(rag3.messaging_angles.includes("position_4_personne"), "L3 RAG: position_4_personne (A/D)");
  assert(!rag3.messaging_angles.includes("position_1_systeme"), "L3 RAG: NO position_1_systeme (A/D)");

  const ctx3 = buildLeadContext(LEAD_3_NO_SIGNAL_SEG_A, "invitation");
  assertIncludes(ctx3, "Pierre Leclerc", "L3 context: lead name");
  assertIncludes(ctx3, "DigitalPulse", "L3 context: company");
  // No signal section should be minimal
  assert(!ctx3.includes("Score Gojiberry"), "L3 context: no Gojiberry score (no signal)");

  const prompt3 = buildUserPrompt(LEAD_3_NO_SIGNAL_SEG_A, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });
  assertIncludes(prompt3, "CONTEXTE PARTIEL", "L3 prompt: partial context (enrichment but no signal)");
  assertIncludes(prompt3, "variante_a", "L3 prompt: still M1 format");

  // =========================================================================
  // Lead 4: Segment D1, step 3 → M2 relance
  // =========================================================================
  console.log("\n--- Lead 4: Segment D1, step 3 (M2 relance) ---");

  const rag4 = resolveRagSections("M2", "D1", "B", "relance");
  assert(rag4.icp_segments.includes("segment_d1"), "L4 RAG: segment_d1");
  assert(rag4.pain_points.includes("pp_esn_intercontrat"), "L4 RAG: pp_esn_intercontrat");
  assert(!rag4.messaging_angles, "L4 RAG: no messaging_angles key (relance = léger)");
  assert(!rag4.offre_produit, "L4 RAG: no offre_produit key (relance)");
  assert(!rag4.qualification, "L4 RAG: no qualification key (relance)");
  assert(Object.keys(rag4).length === 2, `L4 RAG: only 2 keys (got ${Object.keys(rag4).length})`);

  const ragText4 = await buildRagContext(rag4);
  assert(ragText4.length > 0 && ragText4.length < ragText1.length, `L4 RAG text: lighter than M1 (${ragText4.length} < ${ragText1.length})`);

  const ctx4 = buildLeadContext(LEAD_4_D1_M2_RELANCE, "message", undefined, undefined, {
    current: 3, total: 5,
    previousMessages: [
      "Bonjour Marc, j'ai vu votre prise de poste chez InfoPro...",
      "Marc, je reviens vers vous suite à mon message précédent..."
    ],
  });
  assertIncludes(ctx4, "Étape : 3/5", "L4 context: step 3/5");
  assertIncludes(ctx4, "Messages précédents envoyés", "L4 context: previous messages");

  const prompt4 = buildUserPrompt(LEAD_4_D1_M2_RELANCE, "message", undefined, undefined, {
    current: 3, total: 5,
    previousMessages: [
      "Bonjour Marc, j'ai vu votre prise de poste chez InfoPro...",
      "Marc, je reviens vers vous suite à mon message précédent..."
    ],
  }, { withReasoning: true });
  assertIncludes(prompt4, "Étape 3/5", "L4 prompt: step label");
  assertIncludes(prompt4, "relance", "L4 prompt: situation relance");
  assert(!prompt4.includes("variante_a"), "L4 prompt: NOT M1 format (no variante_a)");
  assertIncludes(prompt4, '"message"', "L4 prompt: M2 JSON format");
  assertIncludes(prompt4, '"ton"', "L4 prompt: M2 ton field");

  // =========================================================================
  // Lead 5: Segment B, step 5 (last) → M2 dernier_message
  // =========================================================================
  console.log("\n--- Lead 5: Segment B, step 5/5 (M2 dernier_message) ---");

  const rag5 = resolveRagSections("M2", "B", "D", "dernier_message");
  assert(Object.keys(rag5).length === 0, "L5 RAG: no keys at all (dernier_message → stripEmpty)");
  assert(!rag5.icp_segments, "L5 RAG: no icp_segments key");
  assert(!rag5.pain_points, "L5 RAG: no pain_points key");
  assert(!rag5.messaging_angles, "L5 RAG: no messaging_angles key");
  assert(!rag5.offre_produit, "L5 RAG: no offre_produit key");
  assert(!rag5.qualification, "L5 RAG: no qualification key");

  const ragText5 = await buildRagContext(rag5);
  assert(ragText5 === "", "L5 RAG text: completely empty (no RAG for dernier_message)");

  const ctx5 = buildLeadContext(LEAD_5_B_M2_DERNIER, "message", undefined, undefined, {
    current: 5, total: 5,
    previousMessages: [
      "Bonjour Julie, je me permets de vous contacter...",
      "Julie, je reviens vers vous...",
      "Bonjour Julie, un dernier essai...",
      "Julie, je me permets une dernière relance...",
    ],
  });
  assertIncludes(ctx5, "Étape : 5/5", "L5 context: step 5/5");

  const prompt5 = buildUserPrompt(LEAD_5_B_M2_DERNIER, "message", undefined, undefined, {
    current: 5, total: 5,
    previousMessages: [
      "Bonjour Julie, je me permets de vous contacter...",
      "Julie, je reviens vers vous...",
      "Bonjour Julie, un dernier essai...",
      "Julie, je me permets une dernière relance...",
    ],
  }, { withReasoning: true });
  assertIncludes(prompt5, "dernier_message", "L5 prompt: situation dernier_message");
  assertIncludes(prompt5, "Étape 5/5", "L5 prompt: step 5/5");
  assert(!prompt5.includes("variante_a"), "L5 prompt: M2 format (no variants)");
}

// ---------------------------------------------------------------------------
// Phase B: Online tests (AI generation + output validation)
// ---------------------------------------------------------------------------

async function phaseB_aiGeneration() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  PHASE B: SKIPPED (no ANTHROPIC_API_KEY)     ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("  Set ANTHROPIC_API_KEY to run AI generation tests.");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  PHASE B: AI Generation + Output Validation   ║");
  console.log("╚══════════════════════════════════════════════╝");

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { resolveRagSections, mapGojiberrySignal } = await import("../lib/rag/mapping");
  const { buildRagContext } = await import("../lib/rag/context");
  const { buildLeadContext, buildUserPrompt, parseM1Response, parseM2Response } = await import("../lib/ai/lead-context");
  const { PROMPTS_DEFAULTS } = await import("../lib/ai/prompts/defaults");

  const client = new Anthropic({ apiKey });
  const MODEL = "claude-sonnet-4-5-20250929";
  const MAX_TOKENS = 600;

  // Helper: call Claude with prompt + RAG + runtime + user prompt
  async function generate(
    agentPrompt: string,
    ragText: string,
    runtimeCtx: string,
    userPrompt: string
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];

    if (agentPrompt) {
      systemBlocks.push({ type: "text", text: agentPrompt, cache_control: { type: "ephemeral" } });
    }
    if (ragText) {
      systemBlocks.push({ type: "text", text: ragText });
    }
    if (runtimeCtx) {
      systemBlocks.push({ type: "text", text: runtimeCtx });
    }

    const result = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      system: systemBlocks,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = result.content.find((c) => c.type === "text");
    const text = textContent && "text" in textContent ? textContent.text.trim() : "";

    return {
      text,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    };
  }

  // Helper: check vouvoiement
  function checkVouvoiement(text: string, label: string) {
    const tuPatterns = /\b(tu |t'|ton |ta |tes |toi )/i;
    const vousPatterns = /\b(vous |votre |vos |v')\b/i;
    const hasTu = tuPatterns.test(text);
    const hasVous = vousPatterns.test(text);
    // Should use vous, not tu
    if (hasTu && !hasVous) {
      assert(false, `${label}: uses tutoiement instead of vouvoiement`);
    } else {
      assert(true, `${label}: vouvoiement OK`);
    }
  }

  // =========================================================================
  // Lead 1: ESN D1 + NEW_ROLE → M1 (2 variantes, angles ESN)
  // =========================================================================
  console.log("\n--- Lead 1: ESN D1 + NEW_ROLE (M1 generation) ---");

  const signal1 = mapGojiberrySignal("NEW_ROLE");
  const rag1 = resolveRagSections("M1", "D1", signal1);
  const ragText1 = await buildRagContext(rag1);
  const ctx1 = buildLeadContext(LEAD_1_ESN_D1_NEW_ROLE, "invitation", undefined, undefined, { current: 1, total: 5 });
  const prompt1 = buildUserPrompt(LEAD_1_ESN_D1_NEW_ROLE, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });

  const res1 = await generate(PROMPTS_DEFAULTS.prospection_m1, ragText1, ctx1, prompt1);
  console.log(`  Tokens: ${res1.inputTokens} in / ${res1.outputTokens} out`);

  const m1_1 = parseM1Response(res1.text);
  assert(m1_1 !== null, "L1 output: valid M1 JSON parsed");
  if (m1_1) {
    assert(m1_1.variante_a.message.length > 0, "L1 output: variante_a has message");
    assert(m1_1.variante_b.message.length > 0, "L1 output: variante_b has message");
    assert(m1_1.variante_a.angle.length > 0, "L1 output: variante_a has angle");
    assert(m1_1.variante_b.angle.length > 0, "L1 output: variante_b has angle");
    assert(m1_1.variante_a.angle.toLowerCase() !== m1_1.variante_b.angle.toLowerCase(), "L1 output: angles are different");
    assert(m1_1.variante_a.message.length <= 1000, `L1 output: variante_a under 1000 chars (${m1_1.variante_a.message.length})`);
    assert(m1_1.variante_b.message.length <= 1000, `L1 output: variante_b under 1000 chars (${m1_1.variante_b.message.length})`);
    assert(["linkedin", "email", "none"].includes(m1_1.canal), `L1 output: valid canal "${m1_1.canal}"`);
    assert(m1_1.persona.length > 0, "L1 output: persona present");
    assert(m1_1.reasoning.length > 0, "L1 output: reasoning present");
    checkVouvoiement(m1_1.variante_a.message, "L1 variante_a");
    checkVouvoiement(m1_1.variante_b.message, "L1 variante_b");
  }
  assert(res1.inputTokens > 0 && res1.inputTokens < 10000, `L1 tokens: input ${res1.inputTokens} in range`);
  assert(res1.outputTokens > 0 && res1.outputTokens <= MAX_TOKENS, `L1 tokens: output ${res1.outputTokens} <= ${MAX_TOKENS}`);

  // =========================================================================
  // Lead 2: Segment B + ENGAGEMENT_KEYWORD → M1
  // =========================================================================
  console.log("\n--- Lead 2: Segment B + ENGAGEMENT_KEYWORD (M1 generation) ---");

  const signal2 = mapGojiberrySignal("ENGAGEMENT_KEYWORD");
  const rag2 = resolveRagSections("M1", "B", signal2);
  const ragText2 = await buildRagContext(rag2);
  const ctx2 = buildLeadContext(LEAD_2_B2B_SEG_B_ENGAGEMENT, "invitation", undefined, undefined, { current: 1, total: 5 });
  const prompt2 = buildUserPrompt(LEAD_2_B2B_SEG_B_ENGAGEMENT, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });

  const res2 = await generate(PROMPTS_DEFAULTS.prospection_m1, ragText2, ctx2, prompt2);
  console.log(`  Tokens: ${res2.inputTokens} in / ${res2.outputTokens} out`);

  const m1_2 = parseM1Response(res2.text);
  assert(m1_2 !== null, "L2 output: valid M1 JSON parsed");
  if (m1_2) {
    assert(m1_2.variante_a.message.length > 0, "L2 output: variante_a has message");
    assert(m1_2.variante_b.message.length > 0, "L2 output: variante_b has message");
    assert(m1_2.variante_a.message.length <= 1000, `L2 output: variante_a under 1000 chars (${m1_2.variante_a.message.length})`);
    assert(["linkedin", "email", "none"].includes(m1_2.canal), `L2 output: valid canal "${m1_2.canal}"`);
    assert(m1_2.reasoning.length > 0, "L2 output: reasoning present");
    checkVouvoiement(m1_2.variante_a.message, "L2 variante_a");
    checkVouvoiement(m1_2.variante_b.message, "L2 variante_b");
  }
  assert(res2.inputTokens < 10000, `L2 tokens: input ${res2.inputTokens} in range`);
  assert(res2.outputTokens <= MAX_TOKENS, `L2 tokens: output ${res2.outputTokens} <= ${MAX_TOKENS}`);

  // =========================================================================
  // Lead 3: Segment A + no signal → M1 prudent, email recommended check
  // =========================================================================
  console.log("\n--- Lead 3: Segment A + no signal (M1 prudent) ---");

  const signal3 = mapGojiberrySignal(null);
  const rag3 = resolveRagSections("M1", "A", signal3);
  const ragText3 = await buildRagContext(rag3);
  const ctx3 = buildLeadContext(LEAD_3_NO_SIGNAL_SEG_A, "invitation", undefined, undefined, { current: 1, total: 5 });
  const prompt3 = buildUserPrompt(LEAD_3_NO_SIGNAL_SEG_A, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });

  const res3 = await generate(PROMPTS_DEFAULTS.prospection_m1, ragText3, ctx3, prompt3);
  console.log(`  Tokens: ${res3.inputTokens} in / ${res3.outputTokens} out`);

  const m1_3 = parseM1Response(res3.text);
  assert(m1_3 !== null, "L3 output: valid M1 JSON parsed");
  if (m1_3) {
    assert(m1_3.variante_a.message.length > 0 || m1_3.canal === "none", "L3 output: has message or canal=none");
    if (m1_3.canal !== "none") {
      assert(m1_3.variante_a.message.length <= 1000, `L3 output: variante_a under 1000 chars (${m1_3.variante_a.message.length})`);
      checkVouvoiement(m1_3.variante_a.message, "L3 variante_a");
    }
    assert(m1_3.reasoning.length > 0, "L3 output: reasoning present");
    // Log whether email was recommended (interesting for no-signal lead)
    console.log(`  Canal: ${m1_3.canal} | Recommandé: ${m1_3.canal_recommande} | Persona: ${m1_3.persona}`);
  }
  assert(res3.inputTokens < 10000, `L3 tokens: input ${res3.inputTokens} in range`);

  // =========================================================================
  // Lead 4: D1, step 3 → M2 relance courte
  // =========================================================================
  console.log("\n--- Lead 4: D1 step 3 (M2 relance) ---");

  const rag4 = resolveRagSections("M2", "D1", "B", "relance");
  const ragText4 = await buildRagContext(rag4);
  const seqStep4 = {
    current: 3, total: 5,
    previousMessages: [
      "Bonjour Marc, j'ai vu votre prise de poste chez InfoPro, félicitations. Curieux de savoir comment vous abordez le développement commercial dans une ESN de 40 personnes.",
      "Marc, je reviens vers vous. L'intercontrat est souvent le premier frein à la croissance en ESN — c'est un sujet que vous avez en tête chez InfoPro ?",
    ],
  };
  const ctx4 = buildLeadContext(LEAD_4_D1_M2_RELANCE, "message", undefined, undefined, seqStep4);
  const prompt4 = buildUserPrompt(LEAD_4_D1_M2_RELANCE, "message", undefined, undefined, seqStep4, { withReasoning: true });

  const res4 = await generate(PROMPTS_DEFAULTS.prospection_m2, ragText4, ctx4, prompt4);
  console.log(`  Tokens: ${res4.inputTokens} in / ${res4.outputTokens} out`);

  const m2_4 = parseM2Response(res4.text);
  assert(m2_4 !== null, "L4 output: valid M2 JSON parsed");
  if (m2_4) {
    assert(m2_4.message.length > 0, "L4 output: has message");
    assert(m2_4.message.length <= 1000, `L4 output: under 1000 chars (${m2_4.message.length})`);
    assert(["reponse", "relance", "dernier_message"].includes(m2_4.type), `L4 output: valid type "${m2_4.type}"`);
    assert(["direct", "empathique", "leger"].includes(m2_4.ton), `L4 output: valid ton "${m2_4.ton}"`);
    assert(m2_4.reasoning.length > 0, "L4 output: reasoning present");
    checkVouvoiement(m2_4.message, "L4 message");
    console.log(`  Type: ${m2_4.type} | Ton: ${m2_4.ton} | Canal: ${m2_4.canal}`);
  }
  assert(res4.inputTokens < 10000, `L4 tokens: input ${res4.inputTokens} in range`);
  assert(res4.outputTokens <= MAX_TOKENS, `L4 tokens: output ${res4.outputTokens} <= ${MAX_TOKENS}`);
  // M2 relance should use LESS input tokens than M1 (lighter RAG)
  assert(res4.inputTokens < res1.inputTokens, `L4 tokens: lighter than L1 M1 (${res4.inputTokens} < ${res1.inputTokens})`);

  // =========================================================================
  // Lead 5: B, step 5/5 → M2 dernier_message
  // =========================================================================
  console.log("\n--- Lead 5: B step 5/5 (M2 dernier_message) ---");

  const rag5 = resolveRagSections("M2", "B", "D", "dernier_message");
  const ragText5 = await buildRagContext(rag5);
  assert(ragText5 === "", "L5 RAG text: empty (no RAG for dernier_message)");

  const seqStep5 = {
    current: 5, total: 5,
    previousMessages: [
      "Bonjour Julie, je me permets de vous contacter car je m'intéresse aux agences growth B2B comme Boost Digital.",
      "Julie, je reviens vers vous — la dépendance au fondateur pour le développement commercial, c'est un sujet chez Boost Digital ?",
      "Bonjour Julie, un dernier essai. Beaucoup d'agences growth que j'accompagne ont structuré leur acquisition en 3 mois.",
      "Julie, je comprends que le timing n'est peut-être pas le bon. Si le sujet de l'acquisition client revient, je reste disponible.",
    ],
  };
  const ctx5 = buildLeadContext(LEAD_5_B_M2_DERNIER, "message", undefined, undefined, seqStep5);
  const prompt5 = buildUserPrompt(LEAD_5_B_M2_DERNIER, "message", undefined, undefined, seqStep5, { withReasoning: true });

  const res5 = await generate(PROMPTS_DEFAULTS.prospection_m2, ragText5, ctx5, prompt5);
  console.log(`  Tokens: ${res5.inputTokens} in / ${res5.outputTokens} out`);

  const m2_5 = parseM2Response(res5.text);
  assert(m2_5 !== null, "L5 output: valid M2 JSON parsed");
  if (m2_5) {
    assert(m2_5.message.length > 0, "L5 output: has message");
    assert(m2_5.message.length <= 1000, `L5 output: under 1000 chars (${m2_5.message.length})`);
    assert(m2_5.reasoning.length > 0, "L5 output: reasoning present");
    checkVouvoiement(m2_5.message, "L5 message");
    console.log(`  Type: ${m2_5.type} | Ton: ${m2_5.ton} | Canal: ${m2_5.canal}`);
  }
  assert(res5.inputTokens < 10000, `L5 tokens: input ${res5.inputTokens} in range`);
  // Dernier message should use the LEAST input tokens (no RAG at all)
  assert(res5.inputTokens < res4.inputTokens, `L5 tokens: lighter than L4 relance (${res5.inputTokens} < ${res4.inputTokens})`);

  // =========================================================================
  // Cross-lead token comparison
  // =========================================================================
  console.log("\n--- Token comparison across leads ---");
  const tokenSummary = [
    { label: "L1 M1 ESN D1", input: res1.inputTokens, output: res1.outputTokens },
    { label: "L2 M1 B2B B", input: res2.inputTokens, output: res2.outputTokens },
    { label: "L3 M1 A cold", input: res3.inputTokens, output: res3.outputTokens },
    { label: "L4 M2 relance", input: res4.inputTokens, output: res4.outputTokens },
    { label: "L5 M2 dernier", input: res5.inputTokens, output: res5.outputTokens },
  ];
  for (const t of tokenSummary) {
    console.log(`  ${t.label.padEnd(18)} — ${t.input} in / ${t.output} out`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("==============================================");
  console.log("  PROSPECTOR - Full Flow Integration Tests");
  console.log("==============================================");

  await phaseA_ragResolution();
  await phaseB_aiGeneration();

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
