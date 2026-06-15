/**
 * Test script: Compare M1 Light prompt vs M1 Production prompt
 * Run: node scripts/test-m1-prompt-comparison.mjs
 */

import { readFileSync } from 'fs';
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

config({ path: '.env.local' });

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.7;
const MAX_TOKENS = 800;

// --- Lead data (from DB) ---
const lead = {
  firstName: "Ahmet",
  lastName: "Akyurek",
  title: "Founder",
  company: "KRATEO",
  linkedinUrl: "https://www.linkedin.com/in/ACwAABsI5lIB1U4Wp7YUKskMuDFfnfDf-bGIt9k",
  score: 20,
  status: "cold",
  stage: "connected",
  tags: ["gojiberry", "goji:top-active"],
  notes: null,
  enrichmentData: {
    company: {
      size: null,
      industry: "Formation en prise de parole et leadership (Edtech professionnelle)",
      funding: null,
      revenue: null,
      location: null,
      news: [],
    },
    person: {
      interests: ["prise de parole", "leadership exécutif", "pouvoir en entreprise", "psychologie sociale", "autorité naturelle"],
      experience: [
        { title: "Founder", company: "KRATEO" },
        { title: "Président", company: "Krateo" },
        { title: "Fondateur", company: "Graine d'Orateur 93" },
      ],
      education: [{ school: "Sciences Po Paris" }],
      recentPosts: [
        { ton: "vulnerable", date: "2026-04-01", sujet: "loyauté invisible freine ascension", tension: "Des professionnels compétents sabotent leur progression par loyauté inconsciente envers leur milieu d'origine", comments: 0, reactions: 6 },
        { ton: "expert", date: "2026-03-31", sujet: "Dérives des conventions éducation prioritaire", tension: "La normalisation des CEP risque de trahir leur mission d'ouverture sociale", comments: 26, reactions: 153 },
        { ton: "expert", date: "2026-03-31", sujet: "Influence et persuasion orale", tension: "Échec à convaincre par mauvais alignement entre intention et étape cognitive de l'interlocuteur", comments: 1, reactions: 22 },
        { ton: "expert", date: "2026-03-30", sujet: "Autorité personnelle en freelance", tension: "Perte du signal de statut corporate lors du passage en freelance", comments: 1, reactions: 13 },
      ],
    },
    signal: {
      type: "POST_SUJET",
      detail: "Le lead publie activement et régulièrement sur l'autorité, la présence exécutive, la persuasion et la visibilité professionnelle — sujets adjacents à la structuration et à l'impact. Profil coach/formateur indépendant avec une offre validée (+300 clients) ciblant dirigeants et entrepreneurs.",
      smartai_interaction: false,
    },
    linkedin_profile: {
      headline: "Parole & Pouvoir : de la compétence à l'influence, sans forcer ni se trahir | Dans l'ombre de +250 execs (BNP, Airbus, KPMG…)",
      about: "Vous avez été dressé à être irréprochable plutôt qu'irremplaçable.\n\nEt votre impact est saboté par vos réflexes de survie.\n\nMon rôle ? \n\nLes désactiver. \n\nPuis réarmer votre parole.",
      skills: [{ name: "Leadership" }, { name: "Finance" }, { name: "Public Speaking" }],
      is_creator: true,
      is_open_profile: true,
      follower_count: 7275,
      shared_connections_count: 114,
      education: [
        { school: "Sciences Po", degree: "Master's in Finance & Strategy" },
        { school: "The University of Texas at Austin", degree: "Management, Business, Entrepreneurship" },
      ],
    },
    hook_recommande: {
      angle: "Avec 7 000+ abonnés et une offre validée à +300 clients, la question n'est plus la crédibilité — c'est comment transformer l'audience en pipeline prévisible sans dépendre du bouche-à-oreille.",
      tension_icp: "pipeline dépendant du réseau et de la visibilité organique, sans système d'acquisition structuré derrière la présence LinkedIn",
      fait_concret: null,
      niveau_contexte: "partiel",
    },
    summary: "Ahmet Akyurek est fondateur de KRATEO, une formation en prise de parole pour dirigeants et execs (ex BNP, Airbus), visant à développer autorité et charisme via bootcamps. Parcours Sciences Po, antécédent associatif Graine d'Orateur ; profil solopreneur en services B2B qualitatifs, sans news récentes (<3 mois).",
  },
};

// --- Build runtime context (replicating buildLeadSections + buildLeadContext) ---
function buildRuntimeContext(lead) {
  const today = new Date().toISOString().split("T")[0];
  let ctx = `## Date du jour\n${today}\n\n`;

  // Lead
  const leadFields = [`- Nom : ${lead.firstName} ${lead.lastName}`];
  if (lead.title) leadFields.push(`- Titre : ${lead.title}`);
  if (lead.company) leadFields.push(`- Entreprise : ${lead.company}`);
  leadFields.push(`- LinkedIn : ${lead.linkedinUrl}`);
  if (lead.score != null) leadFields.push(`- Score : ${lead.score}${lead.status ? ` (${lead.status})` : ""}`);
  if (lead.stage) leadFields.push(`- Stage : ${lead.stage}`);
  if (lead.tags?.length) leadFields.push(`- Tags : ${lead.tags.join(", ")}`);
  ctx += `## Lead\n${leadFields.join("\n")}`;

  // Entreprise
  const c = lead.enrichmentData?.company;
  if (c) {
    const fields = [];
    if (c.industry) fields.push(`- Secteur : ${c.industry}`);
    if (fields.length) ctx += `\n\n## Entreprise\n${fields.join("\n")}`;
  }

  // Profil
  const lp = lead.enrichmentData?.linkedin_profile;
  const p = lead.enrichmentData?.person;
  const profilParts = [];
  if (lp?.headline) profilParts.push(`- Headline : ${lp.headline}`);
  if (lp?.about) {
    const aboutTruncated = lp.about.length > 200 ? lp.about.slice(0, 200) + "…" : lp.about;
    profilParts.push(`- Bio : ${aboutTruncated}`);
  }
  if (p?.experience?.length) {
    profilParts.push(`- Expérience :`);
    for (const exp of p.experience.slice(0, 3)) {
      profilParts.push(`  - ${exp.title}${exp.company ? ` — ${exp.company}` : ""}`);
    }
  }
  if (lp?.skills?.length) {
    const names = lp.skills.slice(0, 3).map(s => typeof s === "string" ? s : s.name).filter(Boolean);
    if (names.length) profilParts.push(`- Compétences : ${names.join(", ")}`);
  }
  if (lp?.is_creator) profilParts.push(`- Créateur de contenu LinkedIn`);
  if (lp?.is_open_profile) profilParts.push(`- Profil ouvert (InMail possible)`);
  if (lp?.follower_count > 1000) profilParts.push(`- Followers : ${lp.follower_count.toLocaleString("fr-FR")}`);
  if (lp?.shared_connections_count > 0) profilParts.push(`- ${lp.shared_connections_count} connexions en commun`);
  if (p?.interests?.length) profilParts.push(`- Intérêts : ${p.interests.join(", ")}`);
  const eduSource = lp?.education?.length ? lp.education : p?.education;
  if (eduSource?.length) {
    const lines = eduSource.slice(0, 2).map(e => {
      const school = e.school || "";
      const degree = e.degree || e.field_of_study || "";
      return degree ? `${school} — ${degree}` : school;
    }).filter(Boolean);
    if (lines.length) profilParts.push(`- Formation : ${lines.join(" | ")}`);
  }
  if (profilParts.length) ctx += `\n\n## Profil\n${profilParts.join("\n")}`;

  // Signal
  const s = lead.enrichmentData?.signal;
  if (s) {
    const fields = [];
    if (s.type) fields.push(`- Type : ${s.type}`);
    if (s.detail) fields.push(`- Détail : ${s.detail}`);
    if (fields.length) ctx += `\n\n## Signal enrichissement\n${fields.join("\n")}`;
  }

  // Posts récents
  if (p?.recentPosts?.length) {
    ctx += `\n\n## Posts récents`;
    for (const post of p.recentPosts) {
      if (post.sujet) {
        const tensionPart = post.tension ? ` | Tension: ${post.tension}` : "";
        const meta = ` (${post.ton || "?"}, ${post.reactions}r/${post.comments}c — ${post.date})`;
        ctx += `\n- ${post.sujet}${tensionPart}${meta}`;
      }
    }
  }

  // Résumé
  if (lead.enrichmentData?.summary) {
    ctx += `\n\n## Résumé enrichissement\n${lead.enrichmentData.summary}`;
  }

  // Action
  ctx += `\n\n## Action\n- Type : message`;

  return ctx;
}

// --- Build RAG from knowledge files ---
function loadRag() {
  const icp = JSON.parse(readFileSync('knowledge/icp_segments.json', 'utf-8'));
  const pain = JSON.parse(readFileSync('knowledge/pain_points.json', 'utf-8'));
  const msg = JSON.parse(readFileSync('knowledge/messaging_angles.json', 'utf-8'));
  const offre = JSON.parse(readFileSync('knowledge/offre_produit.json', 'utf-8'));

  // resolveM1("B", "D") sections:
  const resolvedSections = {
    icp_segments: ["segment_b"],
    pain_points: ["pp_generiques_b2b"],
    messaging_angles: ["position_1_systeme", "position_3_outil", "vocabulaire"],
    offre_produit: ["vue_ensemble"],
  };

  const blocs = [
    { bloc: icp, sectionIds: resolvedSections.icp_segments },
    { bloc: pain, sectionIds: resolvedSections.pain_points },
    { bloc: msg, sectionIds: resolvedSections.messaging_angles },
    { bloc: offre, sectionIds: resolvedSections.offre_produit },
  ];

  const parts = [];
  for (const { bloc, sectionIds } of blocs) {
    const sections = bloc.sections.filter(s => sectionIds.includes(s.section_id));
    if (!sections.length) continue;
    const lines = [`### ${bloc.title}`, ""];
    for (const section of sections) {
      if (section.heading) lines.push(`**${section.heading}**`);
      if (section.content.length) lines.push(section.content.join("\n"));
    }
    parts.push(lines.join("\n"));
  }

  return `---\n\n## BASE DE CONNAISSANCES (RAG)\n\n${parts.join("\n\n---\n\n")}\n\n---\nFin de la base de connaissances.`;
}

// --- Load prompts ---
const promptLight = readFileSync('prompts/PROMPT_M1_LIGHT_TEST.md', 'utf-8');

// Extract production prompt from defaults.ts
const defaultsContent = readFileSync('lib/ai/prompts/defaults.ts', 'utf-8');
const m1Start = defaultsContent.indexOf('prospection_m1: `');
const m1ContentStart = defaultsContent.indexOf('`', m1Start + 'prospection_m1: '.length) + 1;
// Find the matching closing backtick (not preceded by \)
let depth = 0;
let m1End = m1ContentStart;
while (m1End < defaultsContent.length) {
  if (defaultsContent[m1End] === '`' && defaultsContent[m1End - 1] !== '\\') {
    break;
  }
  m1End++;
}
const promptProd = defaultsContent.slice(m1ContentStart, m1End);

// --- Build everything ---
const runtimeContext = buildRuntimeContext(lead);
const ragContext = loadRag();

const userMessage = `Écris un premier message LinkedIn pour Ahmet Akyurek (Founder @ KRATEO).\nMAX 1 000 caractères. Texte brut uniquement.\n\nIMPORTANT : Réponds en JSON strict :\n{"variante_a": {"message": "...", "angle": "..."}, "variante_b": {"message": "...", "angle": "..."}, "reasoning": "..."}\nLes 2 variantes doivent utiliser des angles DIFFÉRENTS.\nPas de markdown, pas de backticks, juste le JSON.`;

// --- API call ---
async function callClaude(systemPrompt, ragCtx, runtimeCtx, userMsg, label) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemBlocks = [
    { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: ragCtx },
    { type: "text", text: runtimeCtx },
  ];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n[System block 1] Prompt: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`);
  console.log(`[System block 2] RAG: ${ragCtx.length} chars (~${Math.ceil(ragCtx.length / 4)} tokens)`);
  console.log(`[System block 3] Runtime: ${runtimeCtx.length} chars (~${Math.ceil(runtimeCtx.length / 4)} tokens)`);
  console.log(`[User message] ${userMsg.length} chars`);

  const start = Date.now();
  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemBlocks,
    messages: [{ role: "user", content: userMsg }],
  });
  const elapsed = Date.now() - start;

  const text = result.content.find(c => c.type === "text")?.text?.trim() || "";
  const inputTokens = result.usage.input_tokens || 0;
  const outputTokens = result.usage.output_tokens || 0;
  const cacheRead = result.usage.cache_read_input_tokens || 0;
  const cacheCreation = result.usage.cache_creation_input_tokens || 0;

  // Pricing for claude-sonnet-4-6: $3/1M in, $15/1M out, $0.30/1M cache read
  const cost = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000) + (cacheRead * 0.3 / 1_000_000);

  return { text, inputTokens, outputTokens, cacheRead, cacheCreation, cost, elapsed };
}

async function main() {
  // Display lead info
  console.log("\n" + "=".repeat(60));
  console.log("  LEAD INFO: Ahmet Akyurek");
  console.log("=".repeat(60));
  console.log(`Nom       : ${lead.firstName} ${lead.lastName}`);
  console.log(`Titre     : ${lead.title}`);
  console.log(`Entreprise: ${lead.company}`);
  console.log(`Secteur   : ${lead.enrichmentData.company.industry}`);
  console.log(`Score     : ${lead.score}`);
  console.log(`Status    : ${lead.status}`);
  console.log(`Stage     : ${lead.stage}`);
  console.log(`Tags      : ${lead.tags.join(", ")}`);
  console.log(`Segment   : B (default — pas de scoring_detail.segment_icp)`);
  console.log(`Signal    : POST_SUJET → mapGojiberrySignal → "D" (no match)`);

  // Display RAG sections
  console.log("\n" + "=".repeat(60));
  console.log("  RAG SECTIONS RESOLVED (M1, segment=B, signal=D)");
  console.log("=".repeat(60));
  console.log("icp_segments   : [segment_b]");
  console.log("pain_points    : [pp_generiques_b2b]");
  console.log("messaging_angles: [position_1_systeme, position_3_outil, vocabulaire]");
  console.log("offre_produit  : [vue_ensemble]");

  // Display runtime context
  console.log("\n" + "=".repeat(60));
  console.log("  RUNTIME CONTEXT");
  console.log("=".repeat(60));
  console.log(runtimeContext);

  // Display RAG context
  console.log("\n" + "=".repeat(60));
  console.log("  RAG CONTEXT");
  console.log("=".repeat(60));
  console.log(ragContext);

  // --- Test 1: Light prompt ---
  const r1 = await callClaude(promptLight, ragContext, runtimeContext, userMessage, "TEST 1: PROMPT M1 LIGHT (simplifié)");
  console.log(`\n[Réponse brute JSON] (${r1.elapsed}ms):`);
  console.log(r1.text);
  console.log(`\n[Tokens] Input: ${r1.inputTokens} | Output: ${r1.outputTokens} | Cache read: ${r1.cacheRead} | Cache creation: ${r1.cacheCreation}`);
  console.log(`[Coût] $${r1.cost.toFixed(4)}`);

  // --- Test 2: Production prompt ---
  const r2 = await callClaude(promptProd, ragContext, runtimeContext, userMessage, "TEST 2: PROMPT M1 PROD (v7.0)");
  console.log(`\n[Réponse brute JSON] (${r2.elapsed}ms):`);
  console.log(r2.text);
  console.log(`\n[Tokens] Input: ${r2.inputTokens} | Output: ${r2.outputTokens} | Cache read: ${r2.cacheRead} | Cache creation: ${r2.cacheCreation}`);
  console.log(`[Coût] $${r2.cost.toFixed(4)}`);

  // --- Comparison ---
  console.log("\n" + "=".repeat(60));
  console.log("  COMPARAISON CÔTE À CÔTE");
  console.log("=".repeat(60));

  try {
    const j1 = JSON.parse(r1.text);
    const j2 = JSON.parse(r2.text);

    console.log("\n--- PROMPT LIGHT ---");
    console.log(`\n[Variante A] (angle: ${j1.variante_a?.angle})`);
    console.log(j1.variante_a?.message);
    console.log(`\n[Variante B] (angle: ${j1.variante_b?.angle})`);
    console.log(j1.variante_b?.message);
    console.log(`\n[Reasoning] ${j1.reasoning}`);

    console.log("\n--- PROMPT PROD ---");
    console.log(`\n[Variante A] (angle: ${j2.variante_a?.angle})`);
    console.log(j2.variante_a?.message);
    console.log(`\n[Variante B] (angle: ${j2.variante_b?.angle})`);
    console.log(j2.variante_b?.message);
    console.log(`\n[Reasoning] ${j2.reasoning}`);

    // Char counts
    console.log("\n--- MÉTRIQUES ---");
    console.log(`LIGHT A: ${j1.variante_a?.message?.length || 0} chars | LIGHT B: ${j1.variante_b?.message?.length || 0} chars`);
    console.log(`PROD  A: ${j2.variante_a?.message?.length || 0} chars | PROD  B: ${j2.variante_b?.message?.length || 0} chars`);
    console.log(`LIGHT tokens: ${r1.inputTokens}in/${r1.outputTokens}out ($${r1.cost.toFixed(4)})`);
    console.log(`PROD  tokens: ${r2.inputTokens}in/${r2.outputTokens}out ($${r2.cost.toFixed(4)})`);
  } catch (e) {
    console.log("[ERREUR] Impossible de parser le JSON d'une des réponses:", e.message);
    console.log("\nLight raw:", r1.text);
    console.log("\nProd raw:", r2.text);
  }
}

main().catch(console.error);
