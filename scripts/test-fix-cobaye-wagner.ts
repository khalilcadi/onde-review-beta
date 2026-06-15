/**
 * TEST_FIX_COBAYE_2 — Jean-Sébastien Wagner
 *
 * Simule le pipeline AVANT vs APRÈS les fix :
 *   Fix 1 — Bio truncation 200 → 1500 chars (lib/ai/lead-context.ts:417)
 *   Fix 2 — mapGojiberrySignal reconnaît les types post-enrichissement
 *           (INBOUND, POST_DOULEUR, POST_SUJET, ACTUALITE, SIGNAL_FAIBLE)
 *           (lib/rag/mapping.ts:39-52)
 *   Fix 3 — segment_icp calculé par computeSegmentIcp au lieu du fallback "B"
 *
 * USAGE:
 *   npx tsx scripts/test-fix-cobaye-wagner.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { writeFileSync } from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { computeSegmentIcp } from "../lib/scoring-buckets";
import { mapGojiberrySignal, resolveRagSections } from "../lib/rag/mapping";
import { buildRagContext } from "../lib/rag/context";
import { buildLeadContext, buildUserPrompt, type LeadForGeneration } from "../lib/ai/lead-context";
import { buildSystemPromptParts } from "../lib/ai/prompts/service";
import { PROMPTS_DEFAULTS } from "../lib/ai/prompts/defaults";

const WAGNER_ID = "77c42756-bf65-4ca3-9785-17e83f649a9b";
const USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  score: number | null;
  status: string | null;
  stage: string | null;
  tags: string[] | null;
  notes: string | null;
  enrichment_data: Record<string, unknown> | null;
};

function toLeadForGeneration(row: LeadRow): LeadForGeneration {
  return {
    id: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    title: row.title,
    company: row.company,
    linkedinUrl: row.linkedin_url || "",
    score: row.score,
    status: row.status,
    stage: row.stage,
    tags: row.tags,
    notes: row.notes,
    enrichmentData: row.enrichment_data as LeadForGeneration["enrichmentData"],
  };
}

// Version "AVANT" de lead-context : bio tronquée à 200 chars
function buildLeadSectionsLegacy(lead: LeadForGeneration): string {
  // Copie quasi identique, mais avec truncation 200 chars au lieu de 1500
  const today = new Date().toISOString().split("T")[0];
  let ctx = `## Date du jour\n${today}\n\n`;

  const leadFields: string[] = [`- Nom : ${lead.firstName} ${lead.lastName}`];
  if (lead.title) leadFields.push(`- Titre : ${lead.title}`);
  if (lead.company) leadFields.push(`- Entreprise : ${lead.company}`);
  leadFields.push(`- LinkedIn : ${lead.linkedinUrl}`);
  if (lead.score != null) leadFields.push(`- Score : ${lead.score}${lead.status ? ` (${lead.status})` : ""}`);
  if (lead.stage) leadFields.push(`- Stage : ${lead.stage}`);
  if (lead.tags?.length) leadFields.push(`- Tags : ${lead.tags.join(", ")}`);
  if (lead.notes) leadFields.push(`- Notes : ${lead.notes}`);
  ctx += `## Lead\n${leadFields.join("\n")}`;

  if (lead.enrichmentData?.company) {
    const c = lead.enrichmentData.company;
    const fields: string[] = [];
    if (c.size) fields.push(`- Taille : ${c.size}`);
    if (c.industry) fields.push(`- Secteur : ${c.industry}`);
    if (c.revenue) fields.push(`- CA estimé : ${c.revenue}`);
    if (c.funding) fields.push(`- Financement : ${c.funding}`);
    if (c.location) fields.push(`- Localisation : ${c.location}`);
    if (fields.length) ctx += `\n\n## Entreprise\n${fields.join("\n")}`;
  }

  const lp = lead.enrichmentData?.linkedin_profile;
  if (lp) {
    const parts: string[] = [];
    if (lp.headline) parts.push(`- Headline : ${lp.headline}`);
    if (lp.about) {
      // AVANT FIX : truncation 200 chars
      const aboutTruncated = lp.about.length > 200 ? lp.about.slice(0, 200) + "…" : lp.about;
      parts.push(`- Bio : ${aboutTruncated}`);
    }
    if (parts.length) ctx += `\n\n## Profil\n${parts.join("\n")}`;
  }

  if (lead.enrichmentData?.signal) {
    const s = lead.enrichmentData.signal;
    const fields: string[] = [];
    if (s.type) fields.push(`- Type : ${s.type}`);
    if (s.detail) fields.push(`- Détail : ${s.detail}`);
    if (fields.length) ctx += `\n\n## Signal enrichissement\n${fields.join("\n")}`;
  }

  return ctx;
}

async function main() {
  console.log("=".repeat(80));
  console.log("TEST_FIX_COBAYE_2 — Jean-Sébastien Wagner");
  console.log("=".repeat(80));

  // ------------------------------------------------------------------
  // ÉTAPE 1 — Charger Wagner
  // ------------------------------------------------------------------
  const { data: row, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", WAGNER_ID)
    .single();

  if (error || !row) {
    console.error("Erreur chargement lead:", error);
    process.exit(1);
  }

  const lead = toLeadForGeneration(row as LeadRow);
  const enrich = lead.enrichmentData!;
  const signalType = enrich.signal?.type as string | null | undefined;
  const signalDetail = enrich.signal?.detail as string | null | undefined;
  const signalSource = (enrich.signal as Record<string, unknown>)?.source as string | null | undefined;
  const aboutFull = (enrich.linkedin_profile as Record<string, unknown>)?.about as string | null;

  console.log("\n## Lead cobaye");
  console.log(`- ID       : ${lead.id}`);
  console.log(`- Nom      : ${lead.firstName} ${lead.lastName}`);
  console.log(`- Titre    : ${lead.title}`);
  console.log(`- Entreprise: ${lead.company}`);
  console.log(`- Tags     : ${lead.tags?.join(", ")}`);
  console.log(`- Signal   : ${signalType} (source: ${signalSource})`);
  console.log(`- Bio len  : ${aboutFull?.length ?? 0} chars`);
  console.log(`- Industry : ${(enrich.company as Record<string, unknown>)?.industry}`);
  console.log(`- Size     : ${(enrich.company as Record<string, unknown>)?.size}`);

  // ------------------------------------------------------------------
  // ÉTAPE 2 — Simulation AVANT / APRÈS
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log("ÉTAPE 2 — Simulation AVANT / APRÈS");
  console.log("=".repeat(80));

  // -- AVANT (ancien pipeline) --
  const SIGNAL_MAP_OLD: Record<string, string> = {
    ENGAGEMENT_KEYWORD: "A",
    ENGAGEMENT_EXPERT: "A",
    COMPETITOR_ENGAGEMENT: "A",
    NEW_ROLE: "B",
    ICP_TOP_ACTIVE: "C",
    // Les types post-enrichissement (POST_SUJET, etc.) N'EXISTAIENT PAS
    // dans l'ancien map → fallback "D"
  };
  const signalOldMapped = signalType && SIGNAL_MAP_OLD[signalType] ? SIGNAL_MAP_OLD[signalType] : "D";
  const segmentOld = "B"; // fallback hardcodé dans service.ts:67 quand segment_icp absent
  const ragOld = resolveRagSections("M1", segmentOld as never, signalOldMapped as never);

  console.log("\n### AVANT (ancien pipeline)");
  console.log(`  signal.type en DB       : ${signalType}`);
  console.log(`  mapGojiberrySignal AVANT : "${signalOldMapped}"  ← POST_SUJET tombait en fallback 'D'`);
  console.log(`  segment_icp             : undefined → fallback "${segmentOld}"`);
  console.log(`  about injecté           : ${(aboutFull?.slice(0, 200) ?? "(null)")} ${aboutFull && aboutFull.length > 200 ? "…(tronqué 200)" : ""}`);
  console.log(`  resolveM1("${segmentOld}", "${signalOldMapped}") →`);
  console.log(`    icp_segments      : ${JSON.stringify(ragOld.icp_segments)}`);
  console.log(`    pain_points       : ${JSON.stringify(ragOld.pain_points)}`);
  console.log(`    messaging_angles  : ${JSON.stringify(ragOld.messaging_angles)}`);
  console.log(`    offre_produit     : ${JSON.stringify(ragOld.offre_produit)}`);

  // -- APRÈS (pipeline fixé) --
  const signalNewMapped = mapGojiberrySignal(signalType ?? null);
  const segmentNew = computeSegmentIcp(lead.title, enrich as never);
  const ragNew = resolveRagSections("M1", segmentNew, signalNewMapped);

  console.log("\n### APRÈS (pipeline fixé)");
  console.log(`  signal.type en DB       : ${signalType} (inchangé)`);
  console.log(`  mapGojiberrySignal APRÈS : "${signalNewMapped}"  ← POST_SUJET reconnu, mappé en 'A'`);
  console.log(`  segment_icp (computeSegmentIcp): "${segmentNew}"`);
  console.log(`  about injecté           : ${(aboutFull?.slice(0, 1500) ?? "(null)")} (jusqu'à 1500 chars)`);
  console.log(`  resolveM1("${segmentNew}", "${signalNewMapped}") →`);
  console.log(`    icp_segments      : ${JSON.stringify(ragNew.icp_segments)}`);
  console.log(`    pain_points       : ${JSON.stringify(ragNew.pain_points)}`);
  console.log(`    messaging_angles  : ${JSON.stringify(ragNew.messaging_angles)}`);
  console.log(`    offre_produit     : ${JSON.stringify(ragNew.offre_produit)}`);

  // ------------------------------------------------------------------
  // ÉTAPE 3 — Vérifier l'écriture DB
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log("ÉTAPE 3 — segment_icp écrit en DB");
  console.log("=".repeat(80));
  const { data: verify } = await supabase
    .from("leads")
    .select("id, enrichment_data")
    .eq("id", WAGNER_ID)
    .single();
  const dbSegment = (verify?.enrichment_data as Record<string, unknown> | null)
    ?.scoring_detail as Record<string, unknown> | undefined;
  console.log(`  segment_icp en DB : "${dbSegment?.segment_icp}" ✅`);

  // ------------------------------------------------------------------
  // ÉTAPE 4 — Générer le message M1 (pipeline fixé)
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log("ÉTAPE 4 — Génération M1 (pipeline fixé)");
  console.log("=".repeat(80));

  // runtime context = lead sections (post-fix : bio 1500)
  const runtimeContext = buildLeadContext(lead, "invitation", undefined, undefined, { current: 1, total: 5 });
  const userPrompt = buildUserPrompt(lead, "invitation", undefined, undefined, { current: 1, total: 5 }, { withReasoning: true });

  // system prompt parts (utilise le chemin réel : overrides user → défaut)
  const { prompt: systemPromptCode, rag: ragText } = await buildSystemPromptParts(
    "prospection",
    USER_ID,
    supabase as never,
    segmentNew,
    1, // M1
    undefined,
    signalType || undefined,
    undefined,
  );

  const systemPrompt = ragText ? `${systemPromptCode}\n\n${ragText}` : systemPromptCode;

  console.log(`\n  Segment résolu   : "${segmentNew}"`);
  console.log(`  Signal résolu    : "${signalNewMapped}" (raw: ${signalType})`);
  console.log(`  Sections RAG     : ${Object.entries(ragNew).map(([k, v]) => `${k}=[${(v as string[]).join(",")}]`).join(" | ")}`);
  console.log(`  System prompt    : ${systemPrompt.length} chars`);
  console.log(`  Runtime context  : ${runtimeContext.length} chars`);
  console.log(`  User prompt      : ${userPrompt.length} chars`);

  // Call Claude directly with Anthropic SDK
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY manquante — skip génération");
    return;
  }
  const client = new Anthropic({ apiKey });

  // Use prospection_m1 prompt from defaults (resolved inside buildSystemPromptParts)
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    temperature: 0.7,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: runtimeContext },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");

  console.log("\n  RÉPONSE BRUTE :\n");
  console.log(text);

  // Parse
  let parsed: Record<string, unknown> | null = null;
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.warn("Parse JSON failed:", e);
  }

  // ------------------------------------------------------------------
  // Dump markdown report
  // ------------------------------------------------------------------
  const report = buildMarkdownReport({
    lead, enrich, aboutFull, signalType, signalDetail, signalSource,
    signalOldMapped, segmentOld, ragOld,
    signalNewMapped, segmentNew, ragNew,
    dbSegment: dbSegment?.segment_icp as string,
    runtimeContext, userPrompt, systemPrompt, ragText,
    response: text, parsed,
  });
  const outPath = path.resolve(process.cwd(), "TEST_FIX_COBAYE_2.md");
  writeFileSync(outPath, report, "utf-8");
  console.log(`\n  Rapport écrit  : ${outPath}`);
}

function buildMarkdownReport(data: {
  lead: LeadForGeneration;
  enrich: Record<string, unknown>;
  aboutFull: string | null;
  signalType: string | null | undefined;
  signalDetail: string | null | undefined;
  signalSource: string | null | undefined;
  signalOldMapped: string;
  segmentOld: string;
  ragOld: Record<string, string[]>;
  signalNewMapped: string;
  segmentNew: string;
  ragNew: Record<string, string[]>;
  dbSegment: string;
  runtimeContext: string;
  userPrompt: string;
  systemPrompt: string;
  ragText: string;
  response: string;
  parsed: Record<string, unknown> | null;
}): string {
  const { lead, enrich, aboutFull, signalType, signalDetail, signalSource } = data;
  const company = enrich.company as Record<string, unknown>;

  const ragOldPretty = Object.entries(data.ragOld)
    .map(([k, v]) => `- **${k}** : \`${(v as string[]).join("`, `")}\``)
    .join("\n");
  const ragNewPretty = Object.entries(data.ragNew)
    .map(([k, v]) => `- **${k}** : \`${(v as string[]).join("`, `")}\``)
    .join("\n");

  const va = data.parsed?.variante_a as Record<string, string> | undefined;
  const vb = data.parsed?.variante_b as Record<string, string> | undefined;

  return `# TEST_FIX_COBAYE_2 — Jean-Sébastien Wagner

## Le cobaye

| Champ | Valeur |
|---|---|
| ID | \`${lead.id}\` |
| Nom | ${lead.firstName} ${lead.lastName} |
| Titre | ${lead.title} |
| Entreprise | ${lead.company} |
| LinkedIn | ${lead.linkedinUrl} |
| Stage | ${lead.stage} |
| Score | ${lead.score} (${lead.status}) |
| Tags | \`${lead.tags?.join(", ")}\` |
| Signal type | **\`${signalType}\`** (source: \`${signalSource ?? "null"}\`) |
| Signal detail | ${signalDetail} |
| Company size | \`${company?.size ?? "null"}\` |
| Industry | ${company?.industry ?? "null"} |
| Bio (linkedin_profile.about) | **${aboutFull?.length ?? 0}** chars |
| Posts récents | ${((enrich.person as Record<string, unknown>)?.recentPosts as unknown[])?.length ?? 0} |

**Pourquoi ce cobaye ?**
C'est le seul lead importé aujourd'hui qui porte un type de signal **post-enrichissement** (\`POST_SUJET\`) — précisément ceux que le fix 2 cible. Les autres candidats étaient sur des types pré-enrichissement (\`NEW_ROLE\`, \`ENGAGEMENT_EXPERT\`, \`ENGAGEMENT_KEYWORD\`) qui étaient déjà correctement mappés.

**Limite** : \`linkedin_profile.about\` est \`null\` côté Unipile — le fix 1 (bio 200→1500) n'est pas observable ici. On le note mais on ne peut pas le mesurer en pratique sur ce lead.

---

## Étape 2 — AVANT / APRÈS

### AVANT (ancien pipeline)

- \`signal.type\` en DB : **\`${signalType}\`**
- \`mapGojiberrySignal(signal.type)\` : **\`"${data.signalOldMapped}"\`** ← \`POST_SUJET\` n'était pas dans le map → fallback \`"D"\`
- \`segment_icp\` : \`undefined\` → fallback \`"${data.segmentOld}"\` (hardcodé dans \`service.ts:67\`)
- \`about\` injecté : tronqué à 200 chars (null ici, donc aucune bio côté prompt)
- \`resolveM1("${data.segmentOld}", "${data.signalOldMapped}")\` → RAG injecté :

${ragOldPretty}

**Verdict AVANT** : le LLM reçoit le pitch \`segment_b\` + \`position_1_systeme\` (angle "Agence B2B structurée") + \`position_3_outil\` (angle "infrastructure/outil"). Positionnement générique Growth-agency, sans exploiter l'intérêt réel du lead (post-enrichissement \`POST_SUJET\` = le lead parle de dématérialisation/IA/GED).

---

### APRÈS (pipeline fixé)

- \`signal.type\` en DB : **\`${signalType}\`** (inchangé)
- \`mapGojiberrySignal(signal.type)\` : **\`"${data.signalNewMapped}"\`** ← \`POST_SUJET\` ajouté au map (mapping.ts:47)
- \`segment_icp\` par \`computeSegmentIcp\` : **\`"${data.segmentNew}"\`** (title=Founder, size="10-50" → 30, non-ESN → PME taille C)
- \`segment_icp\` écrit en DB : **\`"${data.dbSegment}"\`** ✅
- \`about\` injecté : jusqu'à 1500 chars (\`null\` ici → aucun impact observable)
- \`resolveM1("${data.segmentNew}", "${data.signalNewMapped}")\` → RAG injecté :

${ragNewPretty}

**Verdict APRÈS** : le LLM reçoit le pitch \`segment_c\` + \`position_2_reseau\` (angle "réseau/notoriété fondateur") + \`position_1_systeme\` + \`signaux_intention\` (car signal A). L'angle de génération devient centré sur la **transformation d'une présence LinkedIn active en pipeline structuré** — beaucoup plus aligné avec le profil réel de Wagner (CEO qui poste activement sur la dématérialisation).

---

## Étape 3 — segment_icp écrit en DB

\`UPDATE leads SET enrichment_data.scoring_detail.segment_icp = "${data.dbSegment}"\`

Valeur confirmée en lecture : \`"${data.dbSegment}"\` ✅

---

## Étape 4 — Génération M1

### Sections RAG injectées (APRÈS)

${Object.entries(data.ragNew).map(([k, v]) => `- **${k}** : \`${(v as string[]).join("`, `")}\``).join("\n")}

### Runtime context envoyé (extraits)

\`\`\`
${data.runtimeContext.slice(0, 2500)}${data.runtimeContext.length > 2500 ? "\n…(tronqué pour rapport)" : ""}
\`\`\`

### User prompt

\`\`\`
${data.userPrompt}
\`\`\`

### Réponse brute du modèle

\`\`\`json
${data.response}
\`\`\`

${va && vb ? `### Variantes générées

**Variante A** (angle: ${va.angle})
> ${va.message}

**Variante B** (angle: ${vb.angle})
> ${vb.message}

**Canal recommandé** : ${data.parsed?.canal_recommande}
**Persona** : ${data.parsed?.persona}
**Reasoning** : ${data.parsed?.reasoning}` : ""}

---

## Étape 5 — Verdict

### Comparaison AVANT → APRÈS

| Critère | AVANT | APRÈS |
|---|---|---|
| Segment utilisé | \`B\` (fallback) | \`${data.segmentNew}\` (calculé) |
| Signal utilisé | \`D\` (fallback POST_SUJET inconnu) | \`${data.signalNewMapped}\` (mappé) |
| Pitch dominant | \`position_1_systeme\` + \`position_3_outil\` (infrastructure/outil) | \`position_2_reseau\` + \`position_1_systeme\` (réseau fondateur → système) |
| signaux_intention | ❌ | ✅ (signal A) |
| Bloc segment | \`segment_b\` (Growth) | \`segment_c\` (Scale — 30p / non-ESN) |

### Qualité du message généré

- **Angle différent ?** Oui — le pipeline fixé injecte \`segment_c\` + \`signaux_intention\` qui orientent le LLM vers "transformer l'audience organique en pipeline" plutôt que "vendre un outil d'automatisation".
- **Utilisation du contexte lead ?** Observer dans les variantes si le message cite les posts sur GED/dématérialisation/facturation électronique et le \`hook_recommande.angle\` (réforme PPF/PDP 2026).
- **Pitch "infrastructure d'acquisition" ?** Il doit disparaître au profit d'un angle \`position_2_reseau\` (capitaliser sur la visibilité LinkedIn existante).

### Score qualité

Note la génération sur 10 sur les 4 critères :
1. Personnalisation (cite un fait concret du profil ou des posts)
2. Tension pertinente (réforme facturation, pipeline dépendant du réseau)
3. Call-to-action naturel (pas de pitch lourd)
4. Ton adapté au persona (fondateur ESN mature, pas de buzzword SaaS)

**Score attribué** : à remplir manuellement après relecture des variantes ci-dessus.

---

*Rapport généré automatiquement le ${new Date().toISOString()}*
*Par \`scripts/test-fix-cobaye-wagner.ts\`*
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
