/**
 * Audit end-to-end du pipeline M2 relance.
 *
 * 1. Trouve un cobaye (M1 sent + M2 généré)
 * 2. Extrait toutes les données
 * 3. Reconstruit le prompt M2 exactement comme le code le fait
 * 4. Écrit AUDIT_M2_RELANCE.md
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

// ---------------------------------------------------------------------------
// Duplicate RAG mapping/context logic (self-contained, no imports from /lib)
// ---------------------------------------------------------------------------

interface RagSection {
  section_id: string;
  tags: string[];
  heading: string;
  content: string[];
}

interface RagBloc {
  bloc_id: string;
  title: string;
  sections: RagSection[];
  metadata: Record<string, unknown>;
}

type IcpSegment = "A" | "B" | "C" | "D1" | "D2" | "HORS_ICP";
type SignalTypeM1 = "A" | "B" | "C" | "D";
type M2Situation = "reponse" | "relance" | "dernier_message";

const GOJIBERRY_SIGNAL_MAP: Record<string, SignalTypeM1> = {
  ENGAGEMENT_KEYWORD: "A",
  ENGAGEMENT_EXPERT: "A",
  COMPETITOR_ENGAGEMENT: "A",
  NEW_ROLE: "B",
  ICP_TOP_ACTIVE: "C",
  INBOUND: "A",
  POST_DOULEUR: "A",
  POST_SUJET: "A",
  ACTUALITE: "B",
  SIGNAL_FAIBLE: "C",
  FROID: "D",
};

function mapGojiberrySignal(signalType: string | null): SignalTypeM1 {
  if (!signalType) return "D";
  return GOJIBERRY_SIGNAL_MAP[signalType] ?? "D";
}

function segmentSection(segment: IcpSegment): string {
  switch (segment) {
    case "A": return "segment_a";
    case "B": return "segment_b";
    case "C": return "segment_c";
    case "D1": return "segment_d1";
    case "D2": return "segment_d2";
    case "HORS_ICP": return "";
  }
}

interface ResolvedSections { [blocId: string]: string[]; }

function resolveM2Relance(segment: IcpSegment): ResolvedSections {
  const r: ResolvedSections = {
    icp_segments: [], pain_points: [], messaging_angles: [], offre_produit: [], qualification: [],
  };
  if (segment === "HORS_ICP") {
    r.pain_points.push("pp_generiques_b2b");
  } else {
    r.icp_segments.push(segmentSection(segment));
    if (segment === "D1") r.pain_points.push("pp_esn_intercontrat");
    else if (segment === "D2") r.pain_points.push("pp_commerciaux");
    else r.pain_points.push("pp_generiques_b2b");
  }
  // strip empty
  const out: ResolvedSections = {};
  for (const [k, v] of Object.entries(r)) if (v.length > 0) out[k] = v;
  return out;
}

function loadBloc(blocId: string): RagBloc | null {
  try {
    const filePath = path.resolve(process.cwd(), "knowledge", `${blocId}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function formatSectionsAsText(blocTitle: string, sections: RagSection[]): string {
  const lines: string[] = [`### ${blocTitle}`, ""];
  for (const s of sections) {
    if (s.heading) lines.push(`**${s.heading}**`);
    if (s.content.length > 0) lines.push(s.content.join("\n"));
  }
  return lines.join("\n");
}

function buildRagContextFromSections(resolved: ResolvedSections): string {
  const parts: string[] = [];
  for (const [blocId, sectionIds] of Object.entries(resolved)) {
    const bloc = loadBloc(blocId);
    if (!bloc) continue;
    const filtered = bloc.sections.filter(s => sectionIds.includes(s.section_id));
    if (filtered.length === 0) continue;
    parts.push(formatSectionsAsText(bloc.title, filtered));
  }
  if (parts.length === 0) return "";
  return `---\n\n## BASE DE CONNAISSANCES (RAG)\n\n${parts.join("\n\n---\n\n")}\n\n---\nFin de la base de connaissances.`;
}

// ---------------------------------------------------------------------------
// Reproduce buildLeadSections (from lib/ai/lead-context.ts, simplified)
// ---------------------------------------------------------------------------

function getTodayISO(): string { return new Date().toISOString().split("T")[0]; }

function buildLeadSections(lead: any): string {
  let ctx = `## Date du jour\n${getTodayISO()}\n\n`;

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
    const f: string[] = [];
    if (c.size) f.push(`- Taille : ${c.size}`);
    if (c.industry) f.push(`- Secteur : ${c.industry}`);
    if (c.revenue) f.push(`- CA estimé : ${c.revenue}`);
    if (c.funding) f.push(`- Financement : ${c.funding}`);
    if (c.location) f.push(`- Localisation : ${c.location}`);
    if (c.news?.length) {
      f.push(`- News récentes :`);
      for (const n of c.news) f.push(`  - ${n}`);
    }
    if (f.length) ctx += `\n\n## Entreprise\n${f.join("\n")}`;
  }

  if (lead.enrichmentData?.company?.website_analysis) {
    const wa = lead.enrichmentData.company.website_analysis;
    const parts: string[] = [];
    if (wa.offering) parts.push(`- Offre : ${wa.offering}`);
    if (wa.target_market) parts.push(`- Cible : ${wa.target_market}`);
    if (wa.differentiators) parts.push(`- Différenciateurs : ${wa.differentiators}`);
    if (wa.team_visible) parts.push(`- Équipe visible : ${wa.team_visible}`);
    if (parts.length) ctx += `\n\n## Offre (analyse site web)\n${parts.join("\n")}`;
  }

  const profilParts: string[] = [];
  const lp = lead.enrichmentData?.linkedin_profile;
  const p = lead.enrichmentData?.person;
  if (lp?.headline) profilParts.push(`- Headline : ${lp.headline}`);
  if (lp?.about) {
    const a = lp.about.length > 1500 ? lp.about.slice(0, 1500) + "…" : lp.about;
    profilParts.push(`- Bio : ${a}`);
  }
  if (p?.anciennete_poste_mois != null) profilParts.push(`- Ancienneté poste actuel : ${p.anciennete_poste_mois} mois`);
  if (p?.experience?.length) {
    profilParts.push(`- Expérience :`);
    for (const e of p.experience.slice(0, 3)) {
      const t = e.title || "Poste";
      const c = e.company ? ` — ${e.company}` : "";
      const d = e.dates ? ` (${e.dates})` : "";
      profilParts.push(`  - ${t}${c}${d}`);
    }
  }
  if (lp?.skills?.length) {
    const names = lp.skills.slice(0, 3).map((s: any) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
    if (names.length) profilParts.push(`- Compétences : ${names.join(", ")}`);
  }
  if (lp?.is_creator) profilParts.push(`- Créateur de contenu LinkedIn`);
  if (lp?.is_open_profile) profilParts.push(`- Profil ouvert (InMail possible)`);
  if (lp?.follower_count > 1000) profilParts.push(`- Followers : ${lp.follower_count.toLocaleString("fr-FR")}`);
  if (lp?.shared_connections_count > 0) profilParts.push(`- ${lp.shared_connections_count} connexions en commun`);
  if (p?.interests?.length) profilParts.push(`- Intérêts : ${p.interests.join(", ")}`);
  const eduSource = lp?.education?.length ? lp.education : p?.education;
  if (eduSource?.length) {
    const lines = eduSource.slice(0, 2).map((e: any) => {
      const school = e.school || "";
      const degree = e.degree || e.field_of_study || "";
      return degree ? `${school} — ${degree}` : school;
    }).filter(Boolean);
    if (lines.length) profilParts.push(`- Formation : ${lines.join(" | ")}`);
  }
  if (profilParts.length) ctx += `\n\n## Profil\n${profilParts.join("\n")}`;

  if (lead.enrichmentData?.signal) {
    const s = lead.enrichmentData.signal;
    const f: string[] = [];
    if (s.type) f.push(`- Type : ${s.type}`);
    if (s.detail) f.push(`- Détail : ${s.detail}`);
    if (s.smartai_interaction) f.push(`- Interaction Smart.AI : oui`);
    if (s.source === "gojiberry") {
      if (s.gojiberry_score != null) f.push(`- Score Gojiberry : ${s.gojiberry_score}/3`);
      if (s.intent_keyword) f.push(`- Mot-clé déclencheur : ${s.intent_keyword}`);
      if (s.intent_post_content) f.push(`- Contenu du post engagé :\n${s.intent_post_content}`);
      else if (s.intent_post_url) f.push(`- Post engagé : ${s.intent_post_url}`);
      if (s.import_date) f.push(`- Date de détection : ${s.import_date}`);
    }
    if (f.length) ctx += `\n\n## Signal enrichissement\n${f.join("\n")}`;
  }

  if (lead.enrichmentData?.person?.recentPosts?.length) {
    ctx += `\n\n## Posts récents`;
    for (const post of lead.enrichmentData.person.recentPosts) {
      if (typeof post === "string") {
        ctx += `\n- ${post}`;
      } else if (post.sujet) {
        const tension = post.tension ? ` | Tension: ${post.tension}` : "";
        ctx += `\n- ${post.sujet}${tension} (${post.ton || "?"}, ${post.reactions}r/${post.comments}c — ${post.date})`;
      } else {
        const meta = post.reactions || post.comments
          ? ` (${post.reactions} réactions, ${post.comments} commentaires — ${post.date})`
          : post.date ? ` (${post.date})` : "";
        ctx += `\n- ${post.summary}${meta}`;
      }
    }
  }

  const rawPosts = lead.enrichmentData?.linkedin_posts;
  if (rawPosts?.length) {
    const top = [...rawPosts]
      .sort((a, b) => ((b.reactions_count || 0) + (b.comments_count || 0) * 3) - ((a.reactions_count || 0) + (a.comments_count || 0) * 3))
      .slice(0, 3);
    ctx += `\n\n## Posts LinkedIn détaillés (top 3 par engagement)`;
    for (const post of top) {
      const text = (post.text || "").slice(0, 800);
      if (!text) continue;
      ctx += `\n\n### Post (${post.reactions_count || 0} réactions, ${post.comments_count || 0} commentaires — ${post.timestamp || "date inconnue"})\n${text}`;
    }
  }

  if (lead.enrichmentData?.summary) ctx += `\n\n## Résumé enrichissement\n${lead.enrichmentData.summary}`;
  return ctx;
}

function buildLeadContext(lead: any, actionType: string, sequenceStep?: { current: number; total: number; previousMessages?: string[] }): string {
  let ctx = buildLeadSections(lead);
  ctx += `\n\n## Action\n- Type : ${actionType || "message"}`;
  if (sequenceStep) {
    ctx += `\n\n## Position dans la séquence\n- Étape : ${sequenceStep.current}/${sequenceStep.total}`;
    if (sequenceStep.previousMessages?.length) {
      ctx += `\n- Messages précédents envoyés :`;
      sequenceStep.previousMessages.forEach((m, i) => { ctx += `\n  ${i + 1}. "${m}"`; });
    }
  }
  return ctx;
}

function buildUserPromptM2(lead: any, actionType: string, sequenceStep: { current: number; total: number; previousMessages?: string[] }): string {
  const leadIdentity = `${lead.firstName} ${lead.lastName}${lead.company ? ` (${lead.title} @ ${lead.company})` : lead.title ? ` (${lead.title})` : ""}`;
  const hasEnrichment = !!(lead.enrichmentData?.company || lead.enrichmentData?.person);
  const signalType = lead.enrichmentData?.signal?.type;
  const hasSignal = signalType && !["FROID", "SIGNAL_FAIBLE", "ICP_TOP_ACTIVE"].includes(signalType);
  const hasNotes = !!(lead.notes && lead.notes.trim().length > 0);

  let contextDirective: string;
  if (hasNotes) contextDirective = `CONTEXTE RICHE : Notes disponibles, écris depuis la relation.`;
  else if (hasSignal && hasEnrichment) {
    const hasFaitConcret = !!lead.enrichmentData?.hook_recommande?.fait_concret;
    contextDirective = hasFaitConcret
      ? `CONTEXTE FORT : signal ${signalType}, enrichissement dispo. Personnalise avec un fait concret.`
      : `CONTEXTE PARTIEL : signal ${signalType}, enrichissement dispo mais pas de fait concret exploitable. Utilise le contexte implicitement.`;
  } else if (hasSignal || hasEnrichment) contextDirective = `CONTEXTE PARTIEL : un élément de contexte max, utilisé implicitement.`;
  else contextDirective = `CONTEXTE FAIBLE : peu de données. Tension ICP plausible + question ouverte. 2-3 phrases max.`;

  const hooks: string[] = [];
  if (lead.enrichmentData?.hook_recommande?.fait_concret) hooks.push(`Fait concret : ${lead.enrichmentData.hook_recommande.fait_concret}`);
  if (lead.enrichmentData?.signal?.intent_keyword) hooks.push(`Sujet d'intérêt : ${lead.enrichmentData.signal.intent_keyword}`);
  const wa = lead.enrichmentData?.company?.website_analysis;
  if (wa?.offering) hooks.push(`Offre entreprise : ${wa.offering}`);
  if (hooks.length) contextDirective += `\n\nÉléments de personnalisation disponibles :\n${hooks.map(h => `- ${h}`).join("\n")}`;

  let stepLabel = `\nÉtape ${sequenceStep.current}/${sequenceStep.total} (relance).`;
  stepLabel += sequenceStep.current === sequenceStep.total
    ? `\nSituation : dernier_message`
    : `\nSituation : relance`;

  const jsonSuffix = `\n\nIMPORTANT : Réponds en JSON strict :
{"message": "...", "objet": "objet email ou null", "type": "reponse|relance|dernier_message", "canal": "linkedin|email", "ton": "direct|empathique|leger", "reasoning": "..."}
Pas de markdown, pas de backticks, juste le JSON.`;

  return `Écris un message LinkedIn pour ${leadIdentity}.\n\n${contextDirective}${stepLabel}\n\nMAX 1000 caractères.${jsonSuffix}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n🔬 Audit M2 Relance — début\n");

  // Step 1: find candidate — leads with M1 sent + M2 (pending/sent/cancelled)
  const { data: m1Actions } = await supabase
    .from("actions")
    .select("id, lead_id, sequence_id, step_id, generated_message, final_message, sent_at, created_at")
    .eq("user_id", USER_ID)
    .in("action_type", ["message", "inmail"])
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (!m1Actions?.length) {
    console.error("Aucune action M1 sent trouvée.");
    process.exit(1);
  }

  console.log(`📌 ${m1Actions.length} actions M1 sent trouvées. Cherche un M1 avec un M2 suivant (priorité bio riche)...\n`);

  // Collect all candidates first, then pick the one with richest bio
  const candidates: any[] = [];
  for (const m1 of m1Actions) {
    const { data: laterActions } = await supabase
      .from("actions")
      .select("id, status, generated_message, final_message, created_at, sent_at, step_id, generation_reasoning, generation_data, action_type")
      .eq("lead_id", m1.lead_id)
      .eq("sequence_id", m1.sequence_id)
      .in("action_type", ["message", "inmail"])
      .gt("created_at", m1.created_at)
      .order("created_at", { ascending: true });

    const m2 = laterActions?.find(a => ["sent", "pending", "validated", "cancelled"].includes(a.status));
    if (!m2) continue;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", m1.lead_id).single();
    if (!lead) continue;
    const bioLen = (lead.enrichment_data as any)?.linkedin_profile?.about?.length || 0;
    candidates.push({ lead, m1, m2, allLaterActions: laterActions, bioLen });
  }

  console.log(`  → ${candidates.length} candidats avec M1 sent + M2. Tri par bio length...`);
  candidates.sort((a, b) => b.bioLen - a.bioLen);
  candidates.slice(0, 5).forEach(c => {
    console.log(`     ${c.lead.first_name} ${c.lead.last_name} — bio=${c.bioLen}, M2 status=${c.m2.status}`);
  });

  let cobaye = candidates[0] || null;
  if (cobaye) console.log(`\n✅ Cobaye choisi : ${cobaye.lead.first_name} ${cobaye.lead.last_name} (bio ${cobaye.bioLen} chars, M2 status=${cobaye.m2.status})`);

  if (!cobaye) {
    console.log("⚠️  Aucun lead avec M1 sent + M2 trouvé. Cherche des M1 sent seuls avec bio riche (relance manquante)...\n");
    for (const m1 of m1Actions.slice(0, 30)) {
      const { data: lead } = await supabase.from("leads").select("*").eq("id", m1.lead_id).single();
      if (!lead) continue;
      const bioLen = (lead.enrichment_data as any)?.linkedin_profile?.about?.length || 0;
      if (bioLen > 500) {
        cobaye = { lead, m1, m2: null, allLaterActions: [], bioLen };
        console.log(`✅ Cobaye (M1 only) : ${lead.first_name} ${lead.last_name} (bio ${bioLen} chars) — le M2 sera simulé`);
        break;
      }
    }
  }

  if (!cobaye) {
    console.error("Impossible de trouver un cobaye.");
    process.exit(1);
  }

  const { lead, m1, m2, allLaterActions } = cobaye;
  const ed = lead.enrichment_data as any || {};
  const segment = (ed.scoring_detail?.segment_icp as IcpSegment) || "B";
  const signalTypeRaw = ed.signal?.type || null;
  const signalMapped = mapGojiberrySignal(signalTypeRaw);

  console.log(`\n📊 Segment ICP : ${segment} | Signal raw : ${signalTypeRaw} | Signal mapped : ${signalMapped}\n`);

  // Get sequence info
  const { data: sequence } = await supabase.from("sequences").select("*").eq("id", m1.sequence_id).single();
  const { data: steps } = await supabase.from("sequence_steps").select("*").eq("sequence_id", m1.sequence_id).order("step_order");

  const messageSteps = (steps || []).filter(s => ["message", "inmail"].includes(s.step_type));
  const totalMessages = messageSteps.length;

  // M1 step info
  const m1Step = steps?.find(s => s.id === m1.step_id);
  const m2Step = m2 ? steps?.find(s => s.id === m2.step_id) : null;

  // Previous messages for M2 context
  const previousMessages = [m1.final_message || m1.generated_message].filter(Boolean);
  const messageStepNumber = previousMessages.length + 1;
  const m2IsLast = m2Step ? m2Step.step_order === steps![steps!.length - 1].step_order : false;
  const m2SituationResolved: M2Situation = m2IsLast ? "dernier_message" : "relance";

  // Get conversation / messages
  const { data: conv } = await supabase.from("conversations").select("*").eq("lead_id", lead.id).maybeSingle();
  let convMessages: any[] = [];
  if (conv) {
    const { data: msgs } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("timestamp");
    convMessages = msgs || [];
  }

  // Build lead object for context
  const leadObj = {
    id: lead.id,
    firstName: lead.first_name || "",
    lastName: lead.last_name || "",
    title: lead.title,
    company: lead.company,
    linkedinUrl: lead.linkedin_url,
    score: lead.score,
    status: lead.status,
    stage: lead.stage,
    tags: lead.tags,
    notes: lead.notes,
    enrichmentData: ed,
  };

  const sequenceStepObj = {
    current: messageStepNumber,
    total: totalMessages,
    previousMessages,
  };

  // Build RAG context M2
  const resolved = resolveM2Relance(segment);
  const ragContext = buildRagContextFromSections(resolved);

  // Build runtime context M2
  const runtimeContextM2 = buildLeadContext(leadObj, m2Step?.step_type || "message", sequenceStepObj);

  // Build user prompt M2
  const userPromptM2 = buildUserPromptM2(leadObj, m2Step?.step_type || "message", sequenceStepObj);

  // Load M2 system prompt
  const defaultsPath = path.resolve(process.cwd(), "lib/ai/prompts/defaults.ts");
  const defaultsSource = fs.readFileSync(defaultsPath, "utf-8");
  const m2PromptMatch = defaultsSource.match(/prospection_m2:\s*`([\s\S]*?)`,\s*\n\s*\/\/ ---/);
  const m2SystemPrompt = m2PromptMatch ? m2PromptMatch[1].replace(/\\`/g, "`").replace(/\\\$/g, "$") : "[NOT FOUND]";

  // Also M1 for comparison
  const m1PromptMatch = defaultsSource.match(/prospection_m1:\s*`([\s\S]*?)`,\s*\n\s*\/\/ ---/);
  const m1SystemPrompt = m1PromptMatch ? m1PromptMatch[1].replace(/\\`/g, "`").replace(/\\\$/g, "$") : "[NOT FOUND]";

  // Look up ai_usage for this M2 generation
  let m2AiUsage: any = null;
  if (m2) {
    const { data: usages } = await supabase
      .from("ai_usage")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("agent_id", "prospection")
      .contains("metadata", { leadId: lead.id })
      .order("created_at", { ascending: false })
      .limit(5);
    m2AiUsage = usages?.find((u: any) => u.metadata?.stepId === m2.step_id) || usages?.[0] || null;
  }

  // Look up M1 ai_usage
  const { data: m1Usages } = await supabase
    .from("ai_usage")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("agent_id", "prospection")
    .contains("metadata", { leadId: lead.id })
    .order("created_at", { ascending: true })
    .limit(5);
  const m1AiUsage = m1Usages?.find((u: any) => u.metadata?.stepId === m1.step_id) || null;

  // User settings (model)
  const { data: settings } = await supabase.from("user_settings").select("settings").eq("user_id", USER_ID).maybeSingle();
  const aiModel = (settings?.settings as any)?.ai_model || "claude-sonnet-4-5-20250929";
  const temp = (settings?.settings as any)?.temperature ?? 0.7;

  // ---- Build the report ----
  const outPath = path.resolve(process.cwd(), "AUDIT_M2_RELANCE.md");
  const report: string[] = [];
  const sep = "─".repeat(90);

  report.push(`# AUDIT M2 RELANCE — ${getTodayISO()}\n`);
  report.push(`**Cobaye** : ${lead.first_name} ${lead.last_name} (${lead.title || "?"} @ ${lead.company || "?"})`);
  report.push(`**Lead ID** : \`${lead.id}\``);
  report.push(`**Bio length** : ${cobaye.bioLen} chars`);
  report.push(`**Segment ICP** : ${segment} | **Signal raw** : ${signalTypeRaw || "null"} | **Signal mappé** : ${signalMapped}`);
  report.push(`**M2 trouvé** : ${m2 ? `oui (status=${m2.status})` : "non — simulation"}\n`);

  // ---- Phase 1 — Cartographie ----
  report.push(`## PHASE 1 — CARTOGRAPHIE DU PIPELINE M2\n`);
  report.push(`### Trigger / cron`);
  report.push(`- **Cron** : \`GET /api/crons/generate-actions\` — schedule \`0 4,5 * * 1-5\` UTC (6-7h Paris)`);
  report.push(`- **Logique** : pour chaque sequence_leads actif, trouve le prochain step, vérifie delay + condition + quota, génère via \`callAI({ agentId: "prospection", sequenceStep, m2Situation, ... })\`.`);
  report.push(`- **Route alternative** : \`POST /api/ai/generate\` (utilisée depuis l'UI Daily Actions pour regénérer un message).\n`);

  report.push(`### Condition de déclenchement M2`);
  report.push(`- \`sequence_leads.current_step\` pointe vers le step précédent déjà complété`);
  report.push(`- Le cron calcule \`previousMessages = actions.where(lead_id + sequence_id + status='sent' + action_type in [message,inmail])\``);
  report.push(`- Si \`previousMessages.length >= 1\` → M2 (sequenceStep >= 2). Sinon M1.`);
  report.push(`- Delay \`step.delay_days\` doit être écoulé depuis le \`sent_at\` du dernier step`);
  report.push(`- Condition \`if_no_response\` (default M2) → **skip permanent** si le lead a répondu (stage=responded ou conversation inbound)\n`);

  report.push(`### Fichiers impliqués M2`);
  report.push("```");
  report.push(`app/api/crons/generate-actions/route.ts   # cron — orchestration + scheduling`);
  report.push(`app/api/ai/generate/route.ts              # route UI — utilisée depuis Daily Actions pour régénérer`);
  report.push(`lib/ai/service.ts:callAI()                # entrée IA unique, gère provider/cache/logging`);
  report.push(`lib/ai/prompts/service.ts:buildSystemPromptParts()  # route M1 vs M2 via agentId "prospection"`);
  report.push(`lib/ai/prompts/defaults.ts:prospection_m2            # PROMPT SYSTEM M2 (v4.0)`);
  report.push(`lib/rag/mapping.ts:resolveM2Relance()                # RAG sections M2`);
  report.push(`lib/rag/context.ts:buildRagContext()                 # charge & formate RAG`);
  report.push(`lib/ai/lead-context.ts:buildLeadContext()            # runtime context (lead data + previousMessages)`);
  report.push(`lib/ai/lead-context.ts:buildUserPrompt()             # user message (isM1 = sequenceStep <= 1)`);
  report.push(`lib/ai/lead-context.ts:parseM2Response()             # parser JSON M2`);
  report.push("```\n");

  report.push(`### Différences M1 vs M2 dans le code`);
  report.push(`| Dimension | M1 | M2 |`);
  report.push(`|-----------|----|----|`);
  report.push(`| System prompt | \`prospection_m1\` (v7.0) | \`prospection_m2\` (v4.0) |`);
  report.push(`| RAG mapping | \`resolveM1()\` → **vide** (zéro RAG) | \`resolveM2Relance()\` → icp_segments[X] + pain_points[Y] |`);
  report.push(`| Runtime context | **même** buildLeadContext (bio 1500, signal, segment) | **même** buildLeadContext + \`previousMessages\` |`);
  report.push(`| User prompt | stepLabel "premier contact" | stepLabel "relance" ou "dernier_message" |`);
  report.push(`| Output JSON | 2 variantes A/B + canal + persona + reasoning | 1 message + objet + type + canal + ton + reasoning |`);
  report.push(`| Humanize | fragment 40% | fragment 40% |`);
  report.push(`| Fix récents (bio 1500, signal mapping, segment dyn) | ✅ appliqués | ✅ appliqués (code partagé via buildLeadSections) |\n`);

  // ---- Phase 2/3 — Cobaye data ----
  report.push(`## PHASE 2/3 — DONNÉES DU COBAYE\n`);

  report.push(`### Lead row (DB)`);
  report.push("```json");
  report.push(JSON.stringify({
    id: lead.id,
    first_name: lead.first_name,
    last_name: lead.last_name,
    title: lead.title,
    company: lead.company,
    linkedin_url: lead.linkedin_url,
    score: lead.score,
    status: lead.status,
    stage: lead.stage,
    tags: lead.tags,
    notes: lead.notes,
  }, null, 2));
  report.push("```\n");

  report.push(`### enrichment_data (COMPLET)`);
  report.push("```json");
  report.push(JSON.stringify(ed, null, 2));
  report.push("```\n");

  // M1
  report.push(`### M1 envoyé`);
  report.push(`- **Action ID** : \`${m1.id}\``);
  report.push(`- **Step ID** : \`${m1.step_id}\``);
  report.push(`- **Step order / type** : ${m1Step?.step_order ?? "?"} / ${m1Step?.step_type ?? "?"}`);
  report.push(`- **Sent at** : ${m1.sent_at}`);
  if (m1.generation_data) {
    const gd = m1.generation_data as any;
    report.push(`- **Variante choisie par défaut** : A`);
    report.push(`- **Angle A** : ${gd.variante_a?.angle || "?"}`);
    report.push(`- **Angle B** : ${gd.variante_b?.angle || "?"}`);
    report.push(`- **Canal** : ${gd.canal || "?"} | **Persona** : ${gd.persona || "?"}`);
  }
  report.push(`\n**Message final envoyé** :`);
  report.push("```");
  report.push(m1.final_message || m1.generated_message || "[vide]");
  report.push("```\n");

  // M2
  report.push(`### M2 généré`);
  if (m2) {
    report.push(`- **Action ID** : \`${m2.id}\``);
    report.push(`- **Step ID** : \`${m2.step_id}\``);
    report.push(`- **Step order / type** : ${m2Step?.step_order ?? "?"} / ${m2Step?.step_type ?? "?"}`);
    report.push(`- **Status** : ${m2.status}`);
    report.push(`- **Created at** : ${m2.created_at}`);
    report.push(`- **Sent at** : ${m2.sent_at || "—"}`);
    if (m2.generation_reasoning) report.push(`- **Reasoning IA** : ${m2.generation_reasoning}`);
    if (m2.generation_data) {
      const gd = m2.generation_data as any;
      report.push(`- **Type** : ${gd.type} | **Ton** : ${gd.ton} | **Canal** : ${gd.canal}`);
      if (gd.objet) report.push(`- **Objet (email)** : ${gd.objet}`);
    }
    report.push(`\n**Message M2 généré** :`);
    report.push("```");
    report.push(m2.final_message || m2.generated_message || "[vide]");
    report.push("```\n");
  } else {
    report.push(`_Aucun M2 trouvé pour ce cobaye — le prompt ci-dessous est ce qui SERAIT envoyé._\n`);
  }

  // Actions suivantes
  if (allLaterActions.length > 0) {
    report.push(`### Toutes les actions postérieures au M1 (ordonnées)`);
    for (const a of allLaterActions) {
      const msg = a.final_message || a.generated_message || "[vide]";
      report.push(`- ${a.created_at} | ${a.action_type} | ${a.status} → \`${msg.slice(0, 120)}${msg.length > 120 ? "…" : ""}\``);
    }
    report.push("");
  }

  // Conversation
  report.push(`### Historique conversation (table conversations/messages)`);
  if (!conv) {
    report.push(`- **Aucune conversation en DB** pour ce lead. Le pipeline ne sait pas si le lead a répondu.`);
  } else {
    report.push(`- conversation_id: \`${conv.id}\` | status: ${conv.status} | unipile_chat_id: ${conv.unipile_chat_id || "—"}`);
    report.push(`- ${convMessages.length} message(s) en DB :`);
    for (const m of convMessages) {
      report.push(`  - ${m.timestamp} | ${m.direction} | ${(m.content || "").slice(0, 140)}`);
    }
  }
  report.push("");

  // ---- Phase 4 — Reconstitution prompt M2 ----
  report.push(`## PHASE 4 — RECONSTITUTION DU PROMPT M2\n`);
  report.push(`### 10. System prompt M2 (source : \`lib/ai/prompts/defaults.ts\` → \`prospection_m2\`, v4.0)`);
  report.push(`- User override DB : vérifié ci-dessous`);
  // Check user override
  const { data: userPromptRow } = await supabase.from("user_prompts").select("content").eq("user_id", USER_ID).eq("agent_id", "prospection_m2").maybeSingle();
  report.push(`- **user_prompts override pour prospection_m2** : ${userPromptRow?.content ? `OUI (${userPromptRow.content.length} chars) — PRIME sur le default` : "NON — utilise le default ci-dessous"}`);
  report.push(`\n\`\`\`\n${(userPromptRow?.content || m2SystemPrompt).slice(0, 200000)}\n\`\`\`\n`);

  report.push(`### 11. RAG M2 injecté`);
  report.push(`- Call : \`resolveM2Relance("${segment}")\``);
  report.push(`- Sections résolues :`);
  report.push("```json");
  report.push(JSON.stringify(resolved, null, 2));
  report.push("```");
  report.push(`- Tokens RAG estimés : ~${Math.ceil(ragContext.length / 4)} tokens (${ragContext.length} chars)\n`);
  report.push(`**Contenu RAG M2 COMPLET envoyé au LLM** :`);
  report.push("```");
  report.push(ragContext || "[RAG VIDE]");
  report.push("```\n");

  report.push(`### 12. Runtime context M2 — exact`);
  report.push(`- Construit par \`buildLeadContext(lead, actionType, sequenceStepObj)\``);
  report.push(`- Bio injectée : ${ed.linkedin_profile?.about ? `${Math.min(ed.linkedin_profile.about.length, 1500)} chars (tronquée à 1500)` : "aucune"}`);
  report.push(`- Signal injecté : ${ed.signal?.type || "aucun"}`);
  report.push(`- Segment utilisé pour RAG : ${segment} (depuis \`enrichment_data.scoring_detail.segment_icp\`)`);
  report.push(`- **previousMessages injectés** : ${previousMessages.length} (= le M1 envoyé)`);
  report.push(`- Historique conversation (messages inbound) : **NON injecté** dans le runtime M2`);
  report.push(`- Tokens runtime estimés : ~${Math.ceil(runtimeContextM2.length / 4)} tokens\n`);
  report.push(`**Runtime context COMPLET** :`);
  report.push("```");
  report.push(runtimeContextM2);
  report.push("```\n");

  report.push(`### 13. User prompt M2`);
  report.push("```");
  report.push(userPromptM2);
  report.push("```\n");

  report.push(`### 14. Paramètres API`);
  report.push(`- **Modèle** : ${aiModel}`);
  report.push(`- **Temperature** : ${temp}`);
  report.push(`- **maxTokens** : 1200`);
  report.push(`- **Provider** : Claude (3 blocs system séparés pour cache : prompt / rag / runtime)`);
  report.push(`- **Prompt caching** : uniquement sur \`agentPrompt\` (cache_control ephemeral). RAG & runtime = non cachés.\n`);

  report.push(`### 15. Entrée ai_usage DB pour ce M2`);
  if (m2AiUsage) {
    report.push(`- Created : ${m2AiUsage.created_at}`);
    report.push(`- Model : ${m2AiUsage.model || m2AiUsage.model_id}`);
    report.push(`- Tokens : in=${m2AiUsage.input_tokens} out=${m2AiUsage.output_tokens} cached=${m2AiUsage.cached_tokens}`);
    report.push(`- Cost : $${m2AiUsage.estimated_cost_usd || m2AiUsage.estimated_cost}`);
    report.push(`- Metadata : \`${JSON.stringify(m2AiUsage.metadata)}\``);
    report.push(`\n**input_text logué (tronqué) :**`);
    report.push("```");
    report.push((m2AiUsage.input_text || "[vide]").slice(0, 3000));
    report.push("```");
    report.push(`\n**output_text logué :**`);
    report.push("```");
    report.push(m2AiUsage.output_text || "[vide]");
    report.push("```\n");
  } else {
    report.push(`_Aucune entrée ai_usage trouvée pour ce M2 (lookup par metadata.leadId+stepId)._\n`);
  }

  // ---- Phase 5 — Comparaison M1 vs M2 ----
  report.push(`## PHASE 5 — COMPARAISON M1 vs M2 POUR LE MÊME LEAD\n`);

  const resolvedM1: ResolvedSections = {}; // M1 = vide
  const ragM1 = buildRagContextFromSections(resolvedM1);
  const sequenceStepM1 = { current: 1, total: totalMessages, previousMessages: [] as string[] };
  const runtimeContextM1 = buildLeadContext(leadObj, "invitation", sequenceStepM1);

  report.push(`| Dimension | M1 (post-refactor) | M2 (actuel) |`);
  report.push(`|-----------|-------------------|-------------|`);
  const bioInjected = ed.linkedin_profile?.about ? Math.min(ed.linkedin_profile.about.length, 1500) : 0;
  report.push(`| Bio injectée | ${bioInjected} chars | ${bioInjected} chars (identique) |`);
  report.push(`| Signal mappé | ${signalMapped} (${signalTypeRaw || "null"}) | ${signalMapped} (identique, mais **non utilisé** dans \`resolveM2Relance\`) |`);
  report.push(`| Segment résolu | ${segment} | ${segment} (identique) |`);
  report.push(`| Sections RAG | 0 (M1 strippé) | ${Object.keys(resolved).length} blocs / ${Object.values(resolved).flat().length} sections |`);
  report.push(`| RAG tokens estimés | 0 | ~${Math.ceil(ragContext.length / 4)} |`);
  report.push(`| M1 envoyé dans le context | N/A | **${previousMessages.length > 0 ? "OUI" : "NON"}** (dans runtime \`## Position dans la séquence\`) |`);
  report.push(`| Pitch produit dans le RAG | Non (RAG vide) | **${Object.keys(resolved).includes("offre_produit") ? "OUI" : "NON"}** (relance → offre_produit non injecté) |`);
  report.push(`| messaging_angles injecté | Non | **${Object.keys(resolved).includes("messaging_angles") ? "OUI" : "NON"}** |`);
  report.push(`| Historique conversation inbound | N/A | **NON** (table messages non injectée) |`);
  report.push(`| Nombre de variantes générées | 2 (A/B) | 1 |`);
  report.push(`| Réaction au feedback régénération | supporté | supporté |`);
  report.push(`| System prompt tokens estimés | ~${Math.ceil(m1SystemPrompt.length / 4)} | ~${Math.ceil(m2SystemPrompt.length / 4)} |\n`);

  report.push(`### Runtime context M1 vs M2 (diff attendu : uniquement "Position dans la séquence")`);
  const m1Lines = runtimeContextM1.split("\n").length;
  const m2Lines = runtimeContextM2.split("\n").length;
  report.push(`- M1 : ${runtimeContextM1.length} chars / ${m1Lines} lignes`);
  report.push(`- M2 : ${runtimeContextM2.length} chars / ${m2Lines} lignes`);
  report.push(`- Différence : +${runtimeContextM2.length - runtimeContextM1.length} chars pour M2 (le bloc "Position dans la séquence" + le M1 envoyé)\n`);

  // Write report
  fs.writeFileSync(outPath, report.join("\n"), "utf-8");
  console.log(`\n✅ Report partiel écrit : ${outPath}`);
  console.log(`📊 Sections: ${report.filter(l => l.startsWith("## ")).length} | Lines: ${report.length}`);

  // Dump JSON for later analysis
  const dumpPath = path.resolve(process.cwd(), "audit-m2-dump.json");
  fs.writeFileSync(dumpPath, JSON.stringify({
    cobaye: { lead, m1, m2, m1Step, m2Step, conv, convMessages, allLaterActions },
    segment, signalTypeRaw, signalMapped,
    resolved, ragContext, runtimeContextM1, runtimeContextM2, userPromptM2,
    m2AiUsage, m1AiUsage, userPromptOverride: userPromptRow?.content || null,
    aiModel, temp, previousMessages,
  }, null, 2), "utf-8");
  console.log(`📦 Dump JSON : ${dumpPath}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
