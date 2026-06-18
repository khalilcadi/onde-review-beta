/**
 * Shared AI context builders for lead-based generation.
 * Used by /api/ai/generate route, generate-actions cron, score, enrich, suggest.
 *
 * V5 — Extended buildLeadSections() with:
 * - LinkedIn Profile section (headline, about, skills, creator, open profile, network, education)
 * - Parcours section (experience, education from Perplexity)
 * - Summary section (Perplexity enrichment summary)
 * - Posts: dual format support (legacy string + new object format)
 */

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface M1Response {
  variante_a: { message: string; angle: string };
  variante_b: { message: string; angle: string };
  canal: "linkedin" | "email" | "none";
  canal_recommande: "linkedin" | "email";
  persona: string;
  reasoning: string;
}

export interface M2Response {
  message: string;
  objet: string | null;
  type: "reponse" | "relance" | "dernier_message";
  canal: "linkedin" | "email";
  ton: "direct" | "empathique" | "leger";
  reasoning: string;
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

/** Try to extract and parse a JSON object from text (handles markdown fences, surrounding text). */
function extractJSON(text: string): unknown | null {
  const trimmed = text.trim();

  // Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // Strip markdown code fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch { /* continue */ }
  }

  // Extract first { ... } block (greedy to capture nested objects)
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch { /* continue */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// M1 parser (premier contact — 2 variantes)
// ---------------------------------------------------------------------------

export function parseM1Response(text: string): M1Response | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object") {
    console.error("[parseM1Response] Failed to extract JSON from AI response");
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  const va = obj.variante_a as Record<string, unknown> | undefined;
  const vb = obj.variante_b as Record<string, unknown> | undefined;

  if (!va?.message || typeof va.message !== "string" || !vb?.message || typeof vb.message !== "string") {
    // canal = "none" is valid when email-only lead can't be reached on LinkedIn
    const canal = (obj.canal as string) || "";
    if (canal === "none") {
      return {
        variante_a: { message: "", angle: "" },
        variante_b: { message: "", angle: "" },
        canal: "none",
        canal_recommande: (obj.canal_recommande as M1Response["canal_recommande"]) || "email",
        persona: (obj.persona as string) || "",
        reasoning: (obj.reasoning as string) || "",
      };
    }
    console.error("[parseM1Response] Missing or invalid variante_a/variante_b messages");
    return null;
  }

  // Validate angles are different
  const angleA = (va.angle as string) || "";
  const angleB = (vb.angle as string) || "";
  if (angleA && angleB && angleA.toLowerCase() === angleB.toLowerCase()) {
    console.warn("[parseM1Response] Both variantes have the same angle — accepting anyway");
  }

  const canal = (obj.canal as string) || "linkedin";
  const validCanaux = ["linkedin", "email", "none"];
  const validCanauxRec = ["linkedin", "email"];

  return {
    variante_a: { message: va.message as string, angle: angleA },
    variante_b: { message: vb.message as string, angle: angleB },
    canal: validCanaux.includes(canal) ? (canal as M1Response["canal"]) : "linkedin",
    canal_recommande: validCanauxRec.includes(obj.canal_recommande as string)
      ? (obj.canal_recommande as M1Response["canal_recommande"])
      : "linkedin",
    persona: (obj.persona as string) || "",
    reasoning: (obj.reasoning as string) || "",
  };
}

// ---------------------------------------------------------------------------
// M1 output sanitizer (filet de sécurité déterministe, en plus des règles prompt)
// ---------------------------------------------------------------------------

/**
 * Post-traitement déterministe d'un message M1 généré.
 * Garantit, même si le LLM dérape, les règles dures du prompt prospection_m1 :
 *  1. cadratin "—" / demi-cadratin "–" → ", " (l'espacement environnant est absorbé)
 *  2. "Frame.io" → "Frame" (jamais la forme .io ni l'URL)
 *  3. collapse des espaces doubles
 * NB : les traits d'union des mots composés (U+002D "-", ex. "aller-retour") ne sont PAS touchés.
 */
export function sanitizeM1Message(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*[—–]\s*/g, ", ") // —/– (+ espaces autour) → ", "
    .replace(/Frame\.io/gi, "Frame")        // forme .io / URL → "Frame"
    .replace(/ {2,}/g, " ")                  // collapse espaces doubles
    .trim();
}

// ---------------------------------------------------------------------------
// M2 parser (relance / réponse)
// ---------------------------------------------------------------------------

export function parseM2Response(text: string): M2Response | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object") {
    console.error("[parseM2Response] Failed to extract JSON from AI response");
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.message || typeof obj.message !== "string") {
    console.error("[parseM2Response] Missing or invalid message field");
    return null;
  }

  const validTypes = ["reponse", "relance", "dernier_message"];
  const validCanaux = ["linkedin", "email"];
  const validTons = ["direct", "empathique", "leger"];

  return {
    message: obj.message as string,
    objet: typeof obj.objet === "string" ? obj.objet : null,
    type: validTypes.includes(obj.type as string) ? (obj.type as M2Response["type"]) : "relance",
    canal: validCanaux.includes(obj.canal as string) ? (obj.canal as M2Response["canal"]) : "linkedin",
    ton: validTons.includes(obj.ton as string) ? (obj.ton as M2Response["ton"]) : "direct",
    reasoning: (obj.reasoning as string) || "",
  };
}

// ---------------------------------------------------------------------------
// Unified parser (dispatches M1/M2 or falls back to plain text)
// ---------------------------------------------------------------------------

/**
 * Parse AI generation response. Dispatches to M1 or M2 parser based on isM1 flag.
 * Falls back to plain text extraction if structured parsing fails.
 */
export function parseGenerationResponse(
  text: string,
  isM1?: boolean
): {
  message: string;
  reasoning: string | null;
  m1?: M1Response;
  m2?: M2Response;
} {
  // Try structured parsing first
  if (isM1 === true) {
    const m1 = parseM1Response(text);
    if (m1) {
      // Pick variante_a as default message (caller can choose)
      return {
        message: m1.variante_a.message || m1.variante_b.message,
        reasoning: m1.reasoning || null,
        m1,
      };
    }
  } else if (isM1 === false) {
    const m2 = parseM2Response(text);
    if (m2) {
      return {
        message: m2.message,
        reasoning: m2.reasoning || null,
        m2,
      };
    }
  }

  // Auto-detect: try M1 first (has variante_a), then M2 (has message + type), then plain text
  if (isM1 === undefined) {
    const json = extractJSON(text);
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if (obj.variante_a) {
        const m1 = parseM1Response(text);
        if (m1) {
          return {
            message: m1.variante_a.message || m1.variante_b.message,
            reasoning: m1.reasoning || null,
            m1,
          };
        }
      }
      if (obj.message && typeof obj.message === "string") {
        // Could be M2 or legacy {message, reasoning}
        if (obj.type || obj.ton || obj.objet !== undefined) {
          const m2 = parseM2Response(text);
          if (m2) {
            return { message: m2.message, reasoning: m2.reasoning || null, m2 };
          }
        }
        // Legacy format: {message, reasoning}
        return {
          message: obj.message as string,
          reasoning: (obj.reasoning as string) || null,
        };
      }
    }
  }

  // Plain text fallback
  const trimmed = text.trim();
  // Last resort: try regex for "message" field
  const msgMatch = trimmed.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (msgMatch) {
    try {
      const message = JSON.parse(`"${msgMatch[1]}"`);
      return { message, reasoning: null };
    } catch { /* fall through */ }
  }

  return { message: trimmed, reasoning: null };
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface LeadForGeneration {
  id: string;
  firstName: string;
  lastName: string;
  title?: string | null;
  company?: string | null;
  linkedinUrl: string;
  score?: number | null;
  status?: string | null;
  stage?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  enrichmentData?: {
    company?: {
      size?: string;
      industry?: string;
      funding?: string;
      revenue?: string;
      location?: string;
      website?: string;
      news?: string[];
      website_analysis?: {
        offering?: string;
        target_market?: string;
        differentiators?: string;
        team_visible?: string;
      };
    };
    person?: {
      interests?: string[];
      recentPosts?: (
        | string
        | { summary: string; sujet?: string; tension?: string | null; ton?: string; reactions: number; comments: number; date: string }
      )[];
      anciennete_poste_mois?: number | null;
      experience?: { title?: string; company?: string; dates?: string }[];
      education?: { school?: string; degree?: string }[];
    };
    signal?: {
      type?: string | null;
      detail?: string | null;
      smartai_interaction?: boolean | null;
      // Gojiberry-specific fields
      source?: "gojiberry" | "manual" | "enrichment" | null;
      gojiberry_score?: number | null;
      intent_keyword?: string | null;
      intent_post_url?: string | null;
      intent_expert_url?: string | null;
      intent_post_content?: string | null;
      import_date?: string | null;
    };
    linkedin_profile?: {
      headline?: string | null;
      about?: string | null;
      skills?: (string | { name?: string })[];
      is_creator?: boolean | null;
      is_open_profile?: boolean | null;
      network_distance?: string | null;
      follower_count?: number | null;
      shared_connections_count?: number | null;
      education?: { school?: string; degree?: string; field_of_study?: string }[];
    } | null;
    linkedin_posts?: {
      text?: string;
      timestamp?: string;
      reactions_count?: number;
      comments_count?: number;
    }[];
    scoring_detail?: {
      fit_score?: number;
      intent_score?: number;
      timing_score?: number;
      categorie?: string;
      segment_icp?: string;
      confidence?: string;
      justification?: string;
      cas_limite?: boolean;
      ajustement_ia?: string;
    };
    hook_recommande?: {
      angle: string;
      fait_concret: string | null;
      tension_icp: string;
      niveau_contexte: "fort" | "partiel" | "faible";
    } | null;
    summary?: string | null;
    /** Marqueur posé en fin d'enrichissement (gate anti-réenrichissement). */
    enriched_at?: string;
    dossier?: {
      destinataire_profil_lecture?: string;
      mecanisme?: string;
      accroche_pivot?: string | null;
      corps_message?: string | null;
      question_ouverte?: string;
      signal_declencheur?: string;
      voix?: string;
      formalite?: string;
      formalite_justification?: string;
      canal_recommande?: string;
      canal_justification?: string;
      ton?: string[];
      longueur_max?: string;
      a_eviter?: string[];
      a_integrer?: string[];
      preuves?: string[];
      objectif_reponse?: string;
      angle_qualite?: string;
      hypothese_assumee?: string | null;
      reserves?: string | null;
    } | null;
  } | null;
}

export interface UnipileRawData {
  profile?: unknown;
  recentPosts?: unknown[];
  experience?: unknown[];
  currentJobStartDate?: string | null;
  smartAIInteractions?: unknown[];
  companyPage?: unknown;
}

export interface EngagementData {
  hasAcceptedInvitation?: boolean;
  responseCount?: number;
  lastResponseDate?: string;
  profileVisitsReceived?: number;
  contentEngagement?: string;
}

// ---------------------------------------------------------------------------
// Shared sections builder (used by buildLeadContext & buildScoringContext)
// ---------------------------------------------------------------------------

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function buildLeadSections(lead: LeadForGeneration): string {
  // --- 0. Date anchor ---
  let ctx = `## Date du jour\n${getTodayISO()}\n\n`;

  // --- 1. Lead ---
  const leadFields: string[] = [`- Nom : ${lead.firstName} ${lead.lastName}`];
  if (lead.title) leadFields.push(`- Titre : ${lead.title}`);
  if (lead.company) leadFields.push(`- Entreprise : ${lead.company}`);
  leadFields.push(`- LinkedIn : ${lead.linkedinUrl}`);
  if (lead.score != null) leadFields.push(`- Score : ${lead.score}${lead.status ? ` (${lead.status})` : ""}`);
  if (lead.stage) leadFields.push(`- Stage : ${lead.stage}`);
  if (lead.tags?.length) leadFields.push(`- Tags : ${lead.tags.join(", ")}`);
  if (lead.notes) leadFields.push(`- Notes : ${lead.notes}`);
  ctx += `## Lead\n${leadFields.join("\n")}`;

  // --- 2. Entreprise ---
  if (lead.enrichmentData?.company) {
    const c = lead.enrichmentData.company;
    const companyFields: string[] = [];
    if (c.size) companyFields.push(`- Taille : ${c.size}`);
    if (c.industry) companyFields.push(`- Secteur : ${c.industry}`);
    if (c.revenue) companyFields.push(`- CA estimé : ${c.revenue}`);
    if (c.funding) companyFields.push(`- Financement : ${c.funding}`);
    if (c.location) companyFields.push(`- Localisation : ${c.location}`);
    if (c.news && c.news.length > 0) {
      companyFields.push(`- News récentes :`);
      for (const n of c.news) {
        companyFields.push(`  - ${n}`);
      }
    }
    if (companyFields.length > 0) {
      ctx += `\n\n## Entreprise\n${companyFields.join("\n")}`;
    }
  }

  // --- 2b. Offre (analyse site web) ---
  if (lead.enrichmentData?.company?.website_analysis) {
    const wa = lead.enrichmentData.company.website_analysis;
    const waParts: string[] = [];
    if (wa.offering) waParts.push(`- Offre : ${wa.offering}`);
    if (wa.target_market) waParts.push(`- Cible : ${wa.target_market}`);
    if (wa.differentiators) waParts.push(`- Diff\u00e9renciateurs : ${wa.differentiators}`);
    if (wa.team_visible) waParts.push(`- \u00c9quipe visible : ${wa.team_visible}`);
    if (waParts.length > 0) {
      ctx += `\n\n## Offre (analyse site web)\n${waParts.join("\n")}`;
    }
  }

  // --- 3. Profil (fusionné LinkedIn + Parcours) ---
  {
    const profilParts: string[] = [];
    const lp = lead.enrichmentData?.linkedin_profile;
    const p = lead.enrichmentData?.person;

    // Headline
    if (lp?.headline) profilParts.push(`- Headline : ${lp.headline}`);

    // Bio (about) — tronqué à 1500 chars
    if (lp?.about) {
      const aboutTruncated = lp.about.length > 1500 ? lp.about.slice(0, 1500) + "…" : lp.about;
      profilParts.push(`- Bio : ${aboutTruncated}`);
    }

    // Ancienneté poste actuel
    if (p?.anciennete_poste_mois != null) {
      profilParts.push(`- Anciennet\u00e9 poste actuel : ${p.anciennete_poste_mois} mois`);
    }

    // Expériences clés (max 3)
    if (p?.experience && p.experience.length > 0) {
      profilParts.push(`- Exp\u00e9rience :`);
      for (const exp of p.experience.slice(0, 3)) {
        const title = exp.title || "Poste";
        const company = exp.company ? ` \u2014 ${exp.company}` : "";
        const dates = exp.dates ? ` (${exp.dates})` : "";
        profilParts.push(`  - ${title}${company}${dates}`);
      }
    }

    // Skills top 3
    if (lp?.skills && lp.skills.length > 0) {
      const skillNames = lp.skills
        .slice(0, 3)
        .map((s) => (typeof s === "string" ? s : s.name || ""))
        .filter(Boolean);
      if (skillNames.length > 0) profilParts.push(`- Comp\u00e9tences : ${skillNames.join(", ")}`);
    }

    // Signaux notables
    if (lp?.is_creator) profilParts.push(`- Cr\u00e9ateur de contenu LinkedIn`);
    if (lp?.is_open_profile) profilParts.push(`- Profil ouvert (InMail possible)`);
    if (lp?.follower_count && lp.follower_count > 1000) {
      profilParts.push(`- Followers : ${lp.follower_count.toLocaleString("fr-FR")}`);
    }
    if (lp?.shared_connections_count && lp.shared_connections_count > 0) {
      profilParts.push(`- ${lp.shared_connections_count} connexions en commun`);
    }

    // Intérêts
    if (p?.interests && p.interests.length > 0) {
      profilParts.push(`- Int\u00e9r\u00eats : ${p.interests.join(", ")}`);
    }

    // Formation (LinkedIn d'abord, sinon Perplexity)
    const eduSource = lp?.education?.length ? lp.education : p?.education;
    if (eduSource && eduSource.length > 0) {
      const eduLines = eduSource.slice(0, 2).map((e) => {
        const school = e.school || "";
        const degree = ("degree" in e ? e.degree : "") || ("field_of_study" in e ? (e as { field_of_study?: string }).field_of_study : "") || "";
        return degree ? `${school} \u2014 ${degree}` : school;
      }).filter(Boolean);
      if (eduLines.length > 0) profilParts.push(`- Formation : ${eduLines.join(" | ")}`);
    }

    if (profilParts.length > 0) {
      ctx += `\n\n## Profil\n${profilParts.join("\n")}`;
    }
  }

  // --- 5. Signal ---
  if (lead.enrichmentData?.signal) {
    const s = lead.enrichmentData.signal;
    const signalFields: string[] = [];
    if (s.type) signalFields.push(`- Type : ${s.type}`);
    if (s.detail) signalFields.push(`- D\u00e9tail : ${s.detail}`);
    if (s.smartai_interaction) signalFields.push(`- Interaction Smart.AI : oui`);
    // Gojiberry-specific context
    if (s.source === "gojiberry") {
      if (s.gojiberry_score != null) signalFields.push(`- Score Gojiberry : ${s.gojiberry_score}/3`);
      if (s.intent_keyword) signalFields.push(`- Mot-cl\u00e9 d\u00e9clencheur : ${s.intent_keyword}`);
      if (s.intent_post_content) signalFields.push(`- Contenu du post engag\u00e9 :\n${s.intent_post_content}`);
      else if (s.intent_post_url) signalFields.push(`- Post engag\u00e9 : ${s.intent_post_url}`);
      if (s.import_date) signalFields.push(`- Date de d\u00e9tection : ${s.import_date}`);
    }
    if (signalFields.length > 0) {
      ctx += `\n\n## Signal enrichissement\n${signalFields.join("\n")}`;
    }
  }

  // --- 6. Posts récents ---
  if (lead.enrichmentData?.person?.recentPosts && lead.enrichmentData.person.recentPosts.length > 0) {
    ctx += `\n\n## Posts récents`;
    for (const post of lead.enrichmentData.person.recentPosts) {
      if (typeof post === "string") {
        // Legacy format (string simple)
        ctx += `\n- ${post}`;
      } else if (post.sujet) {
        // New structured format (sujet + tension + ton)
        const tensionPart = post.tension ? ` | Tension: ${post.tension}` : "";
        const meta = ` (${post.ton || "?"}, ${post.reactions}r/${post.comments}c — ${post.date})`;
        ctx += `\n- ${post.sujet}${tensionPart}${meta}`;
      } else {
        // Legacy object format (summary string only)
        const meta = post.reactions || post.comments
          ? ` (${post.reactions} réactions, ${post.comments} commentaires — ${post.date})`
          : post.date ? ` (${post.date})` : "";
        ctx += `\n- ${post.summary}${meta}`;
      }
    }
  }

  // --- 6b. Top 3 posts LinkedIn bruts (par engagement, commentaires pondérés 3x) ---
  const rawPosts = lead.enrichmentData?.linkedin_posts;
  if (rawPosts && rawPosts.length > 0) {
    const topPosts = [...rawPosts]
      .sort((a, b) => ((b.reactions_count || 0) + (b.comments_count || 0) * 3)
                    - ((a.reactions_count || 0) + (a.comments_count || 0) * 3))
      .slice(0, 3);

    ctx += `\n\n## Posts LinkedIn détaillés (top 3 par engagement)`;
    for (const post of topPosts) {
      const text = (post.text || "").slice(0, 800);
      if (!text) continue;
      const engagement = `${post.reactions_count || 0} réactions, ${post.comments_count || 0} commentaires`;
      const date = post.timestamp || "date inconnue";
      ctx += `\n\n### Post (${engagement} — ${date})\n${text}`;
    }
  }

  // --- 7. Résumé enrichissement ---
  if (lead.enrichmentData?.summary) {
    ctx += `\n\n## Résumé enrichissement\n${lead.enrichmentData.summary}`;
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Prospection context builder (V4)
// ---------------------------------------------------------------------------

function buildDossierSection(
  dossier: NonNullable<NonNullable<LeadForGeneration["enrichmentData"]>["dossier"]>
): string {
  let out = `## Dossier d'attaque`;
  out += `\nMécanisme : ${dossier.mecanisme ?? ""}`;
  out += `\nQualité angle : ${dossier.angle_qualite ?? ""}`;
  out += `\nAccroche pivot : ${dossier.accroche_pivot || "[aucune — angle FAIBLE]"}`;
  out += `\nSignal déclencheur : ${dossier.signal_declencheur ?? ""}`;
  out += `\nPreuves :`;
  if (Array.isArray(dossier.preuves) && dossier.preuves.length > 0) {
    for (const p of dossier.preuves) out += `\n- ${p}`;
  } else {
    out += `\n[non disponible]`;
  }
  out += `\nQuestion ouverte : ${dossier.question_ouverte ?? ""}`;
  out += `\nÀ éviter : ${Array.isArray(dossier.a_eviter) ? dossier.a_eviter.join(", ") : ""}`;
  out += `\nÀ intégrer : ${Array.isArray(dossier.a_integrer) ? dossier.a_integrer.join(", ") : ""}`;
  out += `\nTon : ${Array.isArray(dossier.ton) ? dossier.ton.join(", ") : ""}`;
  out += `\nFormalité : ${dossier.formalite ?? ""}${dossier.formalite_justification ? ` — ${dossier.formalite_justification}` : ""}`;
  out += `\nCanal recommandé : ${dossier.canal_recommande ?? ""}`;
  out += `\nLongueur max : ${dossier.longueur_max ?? ""}`;
  out += `\nProfil lecture : ${dossier.destinataire_profil_lecture ?? ""}`;
  if (dossier.reserves) out += `\nRéserves : ${dossier.reserves}`;
  return out;
}

export function buildWebResearchInput(lead: {
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
}): string {
  const NA = "[non disponible]";
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || NA;
  const company = lead.company || NA;
  const title = lead.title || NA;

  let out = `Prospect: ${fullName} — ${title} @ ${company}\n`;
  out += `LinkedIn: ${lead.linkedin_url || NA}\n`;
  out += `Queries à lancer:\n`;
  out += `A: ${company} Pappers Verif effectifs CA structure juridique\n`;
  out += `B: "${company}" actualités presse 2025 recrutement partenariat\n`;
  out += `C: "${fullName}" ${company} LinkedIn signaux`;
  return out;
}

export function buildDossierInput(
  lead: {
    first_name?: string | null;
    last_name?: string | null;
    title?: string | null;
    company?: string | null;
    linkedin_url?: string | null;
  },
  enrichmentData: Record<string, unknown> | null | undefined
): string {
  const NA = "[non disponible]";
  const ed = (enrichmentData || {}) as Record<string, unknown>;

  // --- ## Prospect ---
  let out = `## Prospect\n`;
  out += `Nom : ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || NA}\n`;
  out += `Titre : ${lead.title || NA}\n`;
  out += `Entreprise : ${lead.company || NA}\n`;
  out += `LinkedIn : ${lead.linkedin_url || NA}`;

  // --- ## Profil LinkedIn (source Unipile) ---
  const lp = ed.linkedin_profile as
    | { headline?: string | null; about?: string | null; summary?: string | null; position_duration?: string | null }
    | null
    | undefined;
  const person = ed.person as { anciennete_poste_mois?: number | null } | undefined;
  out += `\n\n## Profil LinkedIn (source Unipile)\n`;
  out += `${lp?.headline || NA}\n`;
  out += `${lp?.summary || lp?.about || "[résumé non disponible]"}\n`;
  const posDuration =
    lp?.position_duration ||
    (typeof person?.anciennete_poste_mois === "number" ? `${person.anciennete_poste_mois} mois` : null);
  out += `Ancienneté poste actuel : ${posDuration || NA}`;

  // --- ## Posts LinkedIn récents (30 jours) ---
  out += `\n\n## Posts LinkedIn récents (30 jours)\n`;
  const posts = ed.linkedin_posts as
    | Array<{ text?: string; content?: string; summary?: string; timestamp?: string; date?: string }>
    | undefined;
  if (Array.isArray(posts) && posts.length > 0) {
    const sorted = [...posts].sort((a, b) => {
      const da = Date.parse(a.timestamp || a.date || "");
      const db = Date.parse(b.timestamp || b.date || "");
      return (isNaN(db) ? -Infinity : db) - (isNaN(da) ? -Infinity : da);
    });
    out += sorted
      .slice(0, 5)
      .map((p) => {
        const date = p.timestamp || p.date || "date inconnue";
        const body = p.summary || (p.content || p.text || "").slice(0, 200);
        return `[${date}] ${body}`;
      })
      .join("\n");
  } else {
    out += `[Aucun post récent disponible]`;
  }

  // --- ## Données entreprise (source Unipile) ---
  const c = ed.company as
    | {
        industry?: string;
        size?: string;
        employee_count?: string | number;
        website?: string;
        website_analysis?: { offering?: string };
      }
    | undefined;
  out += `\n\n## Données entreprise (source Unipile)\n`;
  out += `Secteur : ${c?.industry || NA}\n`;
  const taille = c?.employee_count ?? c?.size;
  out += `Taille : ${taille != null && taille !== "" ? taille : NA}\n`;
  out += `Site web : ${c?.website || NA}\n`;
  out += `Offre déclarée : ${c?.website_analysis?.offering || "[non analysée]"}`;

  // --- ## Recherche web (source web_research) ---
  const wr = ed.web_research as
    | {
        societe?: { effectif?: string; ca?: string; structure_capitalistique?: string; code_naf?: string; date_creation?: string; source?: string };
        presse?: Array<{ titre?: string; resume?: string; date?: string; source?: string }>;
        signaux?: Array<{ type?: string; description?: string; date?: string; source?: string }>;
      }
    | undefined;
  out += `\n\n## Recherche web (source web_research)\n`;
  if (wr) {
    const soc = wr.societe;
    out += `Société (Pappers/Verif) :\n`;
    out += `  Effectif : ${soc?.effectif || "non trouvé"}\n`;
    out += `  CA : ${soc?.ca || "non trouvé"}\n`;
    out += `  Structure : ${soc?.structure_capitalistique || "non trouvée"}\n`;
    out += `  Code NAF : ${soc?.code_naf || "non disponible"}\n`;
    out += `  Création : ${soc?.date_creation || "non disponible"}\n`;
    out += `  Source : ${soc?.source || NA}\n`;

    const presse = Array.isArray(wr.presse) ? wr.presse : [];
    out += `\nPresse (${presse.length} article(s)) :\n`;
    if (presse.length > 0) {
      out += presse
        .slice(0, 4)
        .map((it) => `- [${it.date || "date inconnue"}] ${it.titre || ""} — ${it.resume || ""} (${it.source || NA})`)
        .join("\n");
    } else {
      out += `- ${NA}`;
    }

    const signaux = Array.isArray(wr.signaux) ? wr.signaux : [];
    out += `\n\nSignaux complémentaires :\n`;
    if (signaux.length > 0) {
      out += signaux
        .slice(0, 5)
        .map((it) => `- ${it.description || ""} (${it.source || NA}${it.date ? `, ${it.date}` : ""})`)
        .join("\n");
    } else {
      out += `- ${NA}`;
    }
  } else {
    out += `[Recherche web non effectuée]`;
  }

  // --- ## Signal détecté (source enrichissement) ---
  const s = ed.signal as
    | { type?: string | null; intent_keyword?: string | null; intent_post_content?: string | null }
    | undefined;
  out += `\n\n## Signal détecté (source enrichissement)\n`;
  out += `Type : ${s?.type || "FROID"}`;
  if (s?.intent_keyword) out += `\nSujet d'intérêt : ${s.intent_keyword}`;
  if (s?.intent_post_content) out += `\nPost source (extrait) : ${s.intent_post_content.slice(0, 300)}`;

  return out;
}

export function buildLeadContext(
  lead: LeadForGeneration,
  actionType: string,
  currentMessage?: string,
  feedback?: string,
  sequenceStep?: { current: number; total: number; previousMessages?: string[] }
): string {
  const isM1 = !sequenceStep || sequenceStep.current <= 1;

  let ctx: string;
  if (isM1) {
    // Slim M1 runtime context: Date + Lead + Action + Dossier d'attaque
    ctx = `## Date du jour\n${getTodayISO()}`;

    const leadFields: string[] = [`- Nom : ${lead.firstName} ${lead.lastName}`];
    if (lead.title) leadFields.push(`- Titre : ${lead.title}`);
    if (lead.company) leadFields.push(`- Entreprise : ${lead.company}`);
    leadFields.push(`- LinkedIn : ${lead.linkedinUrl}`);
    ctx += `\n\n## Lead\n${leadFields.join("\n")}`;

    ctx += `\n\n## Action\n- Type : ${actionType || "message"}`;

    const dossier = lead.enrichmentData?.dossier;
    if (dossier) {
      ctx += `\n\n${buildDossierSection(dossier)}`;
    } else {
      ctx += `\n\n## Dossier d'attaque\n[non disponible — enrichissement incomplet]`;
    }
  } else {
    ctx = buildLeadSections(lead);
    ctx += `\n\n## Action\n- Type : ${actionType || "message"}`;
  }

  if (sequenceStep) {
    ctx += `\n\n## Position dans la s\u00e9quence`;
    ctx += `\n- \u00c9tape : ${sequenceStep.current}/${sequenceStep.total}`;
    if (sequenceStep.previousMessages && sequenceStep.previousMessages.length > 0) {
      ctx += `\n- Messages pr\u00e9c\u00e9dents envoy\u00e9s :`;
      sequenceStep.previousMessages.forEach((msg, i) => {
        ctx += `\n  ${i + 1}. "${msg}"`;
      });
    }
  }

  if (currentMessage) {
    ctx += `\n\nMessage pr\u00e9c\u00e9dent (\u00e0 r\u00e9g\u00e9n\u00e9rer) :\n${currentMessage}`;
  }

  if (feedback) {
    ctx += `\n\nFeedback utilisateur :\n${feedback}`;
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Scoring context builder (V4)
// ---------------------------------------------------------------------------

export function buildScoringContext(
  lead: LeadForGeneration,
  _engagement?: EngagementData
): string {
  return buildLeadSections(lead);
}

export function buildScoringUserPrompt(lead: LeadForGeneration): string {
  const identity = [lead.title, lead.company].filter(Boolean).join(" @ ");
  return `Score ce lead : ${lead.firstName} ${lead.lastName}${identity ? ` (${identity})` : ""}.

Retourne UNIQUEMENT le JSON de scoring, sans explication ni commentaire.`;
}

// ---------------------------------------------------------------------------
// Enrichment context builders (V4)
// ---------------------------------------------------------------------------

export function buildEnrichmentContext(
  lead: LeadForGeneration,
  headline?: string | null,
  about?: string | null
): string {
  const parts = [`## Lead \u00e0 enrichir
- Nom : ${lead.firstName} ${lead.lastName}`];
  if (lead.title) parts.push(`- Titre : ${lead.title}`);
  if (lead.company) parts.push(`- Entreprise : ${lead.company}`);
  parts.push(`- LinkedIn : ${lead.linkedinUrl}`);
  if (headline) parts.push(`- Headline LinkedIn : ${headline}`);
  if (about) parts.push(`- About LinkedIn : ${about}`);

  return parts.join("\n");
}

export function buildEnrichmentUserPrompt(lead: LeadForGeneration): string {
  const namePart = `${lead.firstName} ${lead.lastName}`;
  const contextParts: string[] = [];
  if (lead.title) contextParts.push(lead.title);
  if (lead.company) contextParts.push(`chez ${lead.company}`);
  const contextStr = contextParts.length > 0 ? `, ${contextParts.join(" ")}` : "";

  const websiteUrl = (lead.enrichmentData?.company as Record<string, unknown> | undefined)?.website as string | undefined;

  const today = getTodayISO();

  return `DATE DU JOUR : ${today}

Recherche web pour : ${namePart}${contextStr}
Profil LinkedIn : ${lead.linkedinUrl}${websiteUrl ? `\nSite web entreprise : ${websiteUrl} — analyser pour comprendre l'offre et le positionnement` : ""}

Trouve uniquement les informations PUBLIQUES vérifiables :
- Actualités de l'entreprise (< 3 mois par rapport au ${today}) : recrutements, levées de fonds, lancements produit, partenariats
- CA / revenus estimés si données publiques disponibles
- Financement : montant + date si public
- Contexte sectoriel ou réglementaire impactant leur activité

IMPORTANT : pour chaque actualité ou fait daté, indique le mois et l'année. Ignore toute information datant de plus de 3 mois avant ${today}.

Retourne le résultat au format JSON d'enrichissement défini dans tes instructions système.`;
}

// ---------------------------------------------------------------------------
// Generation context builders
// ---------------------------------------------------------------------------

export function buildUserPrompt(
  lead: LeadForGeneration,
  actionType: string,
  currentMessage?: string,
  feedback?: string,
  sequenceStep?: { current: number; total: number; previousMessages?: string[] },
  options?: { withReasoning?: boolean; leadMessage?: string }
): string {
  // M1 = premier contact (step 1 ou pas de séquence), M2 = steps suivants
  const isM1 = !sequenceStep || sequenceStep.current <= 1;

  // Identité lead pour le prompt
  const leadIdentity = `${lead.firstName} ${lead.lastName}${lead.company ? ` (${lead.title} @ ${lead.company})` : lead.title ? ` (${lead.title})` : ""}`;

  // Évaluation du contexte disponible
  const hasNotes = !!(lead.notes && lead.notes.trim().length > 0);

  // Directive de contexte
  const dossier = lead.enrichmentData?.dossier;
  const angleQualite = dossier?.angle_qualite;
  let contextDirective: string;
  if (hasNotes) {
    contextDirective = `CONTEXTE RICHE : Notes disponibles, écris depuis la relation.`;
  } else if (dossier && (angleQualite === "SOLIDE" || angleQualite === "DÉGRADÉ")) {
    contextDirective = `CONTEXTE FORT : dossier d'attaque disponible (angle ${angleQualite}). Inspire-toi du brief pour le hook.`;
  } else {
    // Cas STANDARD (M1 Onde Review) : invitation bêta founder, construite depuis le segment + les basiques du lead.
    contextDirective = `MODE NORMAL : invitation bêta founder, OFFRE-FIRST. Présente Onde Review en EMBARQUANT une friction créa concrète (allers-retours de validation par mail, versions/commentaires éparpillés, liens Drive à relancer chez les clients) — jamais la catégorie sèche "un outil de review créa". Dis "bêta gratuite". Termine par UNE seule question Drive courte (≤8 mots, ex : "Vous êtes sur Google Drive chez [studio] ?"), sans question empilée ni jargon "tourner sur Drive". Frame OPTIONNEL (~moitié), jamais "Frame.io". ZÉRO familiarité supposée : tu ne connais pas le lead — bannis "vu que tu diriges X", "je pense à toi", "pile dans la cible", "bon fit". La perso vit dans le nom du studio (dans la question) + le fait que l'offre est créa. ≤55 mots (idéal 25-50), tutoiement neutre, 1re personne, aucun lien, aucun cadratin "—", zéro mirroring de douleur projeté. 3 angles tournent (offre-first ~60%, friction-first, feedback-ask). VARIE la formulation, deux leads ne reçoivent jamais un message quasi-identique.`;
  }

  if (dossier) {
    contextDirective += `\n\nÉléments de personnalisation disponibles :\n- Brief d'attaque disponible dans le contexte (voir ## Dossier d'attaque), à utiliser comme inspiration.`;
  }

  // JSON output suffix selon M1 ou M2
  const m1JsonSuffix = `\n\nIMPORTANT : Réponds en JSON strict :
{"variante_a": {"message": "...", "angle": "..."}, "variante_b": {"message": "...", "angle": "..."}, "canal": "linkedin", "canal_recommande": "linkedin", "persona": "studio_founder|studio_prod|agency_creative|agency_founder|freelance_crea|pme_crea", "reasoning": "..."}
Les 2 variantes doivent utiliser des angles DIFFÉRENTS.
Mission LinkedIn uniquement : canal = "linkedin", canal_recommande = "linkedin". Pas d'email, pas de lien, pas de pitch.
Pas de markdown, pas de backticks, juste le JSON.`;

  const m2JsonSuffix = `\n\nIMPORTANT : Réponds en JSON strict :
{"message": "...", "objet": "objet email ou null", "type": "reponse|relance|dernier_message", "canal": "linkedin|email", "ton": "direct|empathique|leger", "reasoning": "..."}
Pas de markdown, pas de backticks, juste le JSON.`;

  const jsonSuffix = options?.withReasoning
    ? (isM1 ? m1JsonSuffix : m2JsonSuffix)
    : "";

  // Position dans la séquence + situation M2
  let stepLabel = "";
  if (sequenceStep) {
    stepLabel += `\nÉtape ${sequenceStep.current}/${sequenceStep.total}${sequenceStep.current > 1 ? " (relance)" : " (premier contact)"}.`;
    if (!isM1) {
      // M2 : ajouter la situation
      if (options?.leadMessage) {
        stepLabel += `\nSituation : réponse — message du lead : "${options.leadMessage}"`;
      } else if (sequenceStep.current === sequenceStep.total) {
        stepLabel += `\nSituation : dernier_message`;
      } else {
        stepLabel += `\nSituation : relance`;
      }
    }
  }

  const charLimit = isM1 ? 1000 : 1000;

  // Régénération
  if (currentMessage) {
    if (feedback) {
      return `INSTRUCTION PRIORITAIRE — FEEDBACK UTILISATEUR (prime sur toutes les règles) :
"${feedback}"

Applique ce feedback pour réécrire le message de ${leadIdentity}.
Respecte absolument le feedback, même si cela contredit les règles habituelles de style ou de personnalisation.

${contextDirective}${stepLabel}

Message actuel (à améliorer selon le feedback) : "${currentMessage}"

MAX ${charLimit} caractères.${jsonSuffix}`;
    }

    return `Régénère un message LinkedIn pour ${leadIdentity} en changeant complètement d'angle.

${contextDirective}${stepLabel}

Message actuel (ne pas reproduire le même angle) : "${currentMessage}"

MAX ${charLimit} caractères.${jsonSuffix}`;
  }

  // Génération initiale
  return `Écris un message LinkedIn pour ${leadIdentity}.

${contextDirective}${stepLabel}

MAX ${charLimit} caractères.${jsonSuffix}`;
}
