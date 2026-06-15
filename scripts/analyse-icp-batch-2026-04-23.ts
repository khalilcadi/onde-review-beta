/**
 * Analyse ICP des 99 leads enrichis du batch 2026-04-23.
 *
 * Mesures :
 *  1. Segment ICP (A/B/C/D1/D2/HORS_ICP)
 *  2. Bucket scoring (PRIORITAIRE/STANDARD/A_VERIFIER)
 *  3. Type de signal détecté (POST_DOULEUR, ICP_TOP_ACTIVE, FROID, etc.)
 *  4. Niveau de contexte du hook (fort/partiel/faible)
 *  5. Réalité du profil LinkedIn (Unipile a-t-il trouvé un vrai profil ?)
 *  6. Pattern de titre (Founder/CEO vs Directeur/Manager vs autre)
 *  7. Top 10 leads les plus intéressants (PRIORITAIRE + niveau_contexte fort)
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";

interface EnrichmentData {
  signal?: { type?: string | null };
  hook_recommande?: { angle?: string; fait_concret?: string | null; tension_icp?: string; niveau_contexte?: "fort" | "partiel" | "faible" };
  scoring_detail?: { segment_icp?: string };
  linkedin_profile?: Record<string, unknown> | null;
  linkedin_posts?: unknown[];
  person?: { recentPosts?: unknown[] };
  email_enrichment?: { email?: string | null; certainty?: string | null; status?: string };
  _source?: string;
  _import_batch?: string;
}

function bumpMap<K>(m: Map<K, number>, k: K) {
  m.set(k, (m.get(k) || 0) + 1);
}

function pct(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, score, status, stage, enrichment_data")
    .eq("user_id", KHALIL_USER_ID)
    .gte("created_at", "2026-04-23T00:00:00Z")
    .lt("created_at", "2026-04-24T00:00:00Z")
    .order("score", { ascending: false });

  if (error) { console.error(error); process.exit(1); }
  if (!leads) { console.log("aucun lead"); return; }

  const total = leads.length;
  console.log(`\n📊 ANALYSE BATCH 2026-04-23 — ${total} leads enrichis\n`);

  // 1. Segment ICP
  const segmentMap = new Map<string, number>();
  // 2. Signal type
  const signalMap = new Map<string, number>();
  // 3. Niveau de contexte
  const niveauMap = new Map<string, number>();
  // 4. Status
  const statusMap = new Map<string, number>();
  // 5. Bucket (déduit du score)
  const bucketMap = new Map<string, number>();
  // 6. Profil LinkedIn réel
  let withLinkedinProfile = 0;
  let withRecentPosts = 0;
  let withEmail = 0;
  let withFaitConcret = 0;
  // 7. Pattern de titre
  const titlePatternMap = new Map<string, number>();

  // Détaillé par lead
  const detail: Array<{
    name: string; company: string; title: string;
    score: number; status: string; segment: string; signal: string;
    niveau: string; angle: string; faitConcret: string | null; tensionIcp: string;
    hasProfile: boolean; nbPosts: number; email: string | null;
  }> = [];

  for (const l of leads) {
    const ed = (l.enrichment_data as EnrichmentData) || {};
    const segment = ed.scoring_detail?.segment_icp || "—";
    const signalType = ed.signal?.type || "—";
    const niveau = ed.hook_recommande?.niveau_contexte || "—";
    const status = l.status || "—";
    const score = l.score ?? 0;

    bumpMap(segmentMap, segment);
    bumpMap(signalMap, signalType);
    bumpMap(niveauMap, niveau);
    bumpMap(statusMap, status);

    // Bucket déduit du score (cf. scoring-buckets.ts : 80=PRIORITAIRE, 50=STANDARD, 20=A_VERIFIER)
    const bucket = score >= 80 ? "PRIORITAIRE" : score >= 50 ? "STANDARD" : "A_VERIFIER";
    bumpMap(bucketMap, bucket);

    if (ed.linkedin_profile && Object.keys(ed.linkedin_profile).length > 0) withLinkedinProfile++;
    const nbPosts = (ed.linkedin_posts as unknown[] | undefined)?.length || 0;
    if (nbPosts > 0) withRecentPosts++;
    const email = ed.email_enrichment?.email || null;
    if (email) withEmail++;
    if (ed.hook_recommande?.fait_concret) withFaitConcret++;

    const titleLower = (l.title || "").toLowerCase();
    let titlePattern = "Autre";
    if (/\b(founder|fondateur|fondatrice|co-?founder|co-?fondateur|owner|propriétaire|associé)\b/i.test(titleLower)) titlePattern = "Founder/Owner";
    else if (/\b(ceo|dg|pdg|président|dirigeant|directeur général|directrice générale|managing director)\b/i.test(titleLower)) titlePattern = "CEO/DG";
    else if (/\b(c[t|m|r|o|f]o|chief)\b/i.test(titleLower)) titlePattern = "C-Suite (CTO/CMO/COO/CFO/CRO)";
    else if (/\b(directeur|directrice|director|head of|vp |vice.president)\b/i.test(titleLower)) titlePattern = "Directeur/Head";
    else if (/\b(manager|responsable|lead)\b/i.test(titleLower)) titlePattern = "Manager/Responsable";
    else if (/\b(consultant|consultante)\b/i.test(titleLower)) titlePattern = "Consultant";
    else if (/\b(coach|formateur|formatrice)\b/i.test(titleLower)) titlePattern = "Coach/Formateur";
    bumpMap(titlePatternMap, titlePattern);

    detail.push({
      name: `${l.first_name} ${l.last_name}`,
      company: l.company || "—",
      title: l.title || "—",
      score,
      status,
      segment,
      signal: signalType,
      niveau,
      angle: ed.hook_recommande?.angle?.slice(0, 80) || "—",
      faitConcret: ed.hook_recommande?.fait_concret || null,
      tensionIcp: ed.hook_recommande?.tension_icp?.slice(0, 80) || "—",
      hasProfile: !!ed.linkedin_profile,
      nbPosts,
      email,
    });
  }

  function printMap(name: string, m: Map<string, number>, totalRef = total) {
    console.log(`\n── ${name}`);
    const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    for (const [k, n] of sorted) {
      const bar = "█".repeat(Math.round((n / totalRef) * 40));
      console.log(`  ${k.padEnd(22)} ${String(n).padStart(3)}  ${pct(n, totalRef).padStart(4)}  ${bar}`);
    }
  }

  printMap("SEGMENT ICP", segmentMap);
  printMap("BUCKET (score)", bucketMap);
  printMap("STATUS", statusMap);
  printMap("SIGNAL TYPE (classifié par IA)", signalMap);
  printMap("NIVEAU DE CONTEXTE (hook recommandé)", niveauMap);
  printMap("PATTERN DE TITRE", titlePatternMap);

  console.log(`\n── DONNÉES ENRICHIES`);
  console.log(`  Profil LinkedIn récupéré (Unipile)  : ${withLinkedinProfile}/${total} (${pct(withLinkedinProfile, total)})`);
  console.log(`  Avec posts récents (<30j)           : ${withRecentPosts}/${total} (${pct(withRecentPosts, total)})`);
  console.log(`  Avec fait concret (hook)            : ${withFaitConcret}/${total} (${pct(withFaitConcret, total)})`);
  console.log(`  Avec email Icypeas                  : ${withEmail}/${total} (${pct(withEmail, total)})`);

  // Top 10 leads les plus intéressants
  const interesting = detail
    .filter((d) => d.niveau === "fort" || d.score >= 50)
    .sort((a, b) => {
      const aw = (a.niveau === "fort" ? 2 : a.niveau === "partiel" ? 1 : 0) + (a.score / 100);
      const bw = (b.niveau === "fort" ? 2 : b.niveau === "partiel" ? 1 : 0) + (b.score / 100);
      return bw - aw;
    });

  console.log(`\n── TOP LEADS (niveau fort / score ≥50) — ${interesting.length} leads`);
  for (const l of interesting.slice(0, 15)) {
    console.log(`\n  📌 ${l.name} — ${l.title}`);
    console.log(`     ${l.company} | score=${l.score} ${l.status} | segment=${l.segment} | signal=${l.signal} | niveau=${l.niveau}`);
    console.log(`     angle: ${l.angle}`);
    if (l.faitConcret) console.log(`     fait_concret: ${l.faitConcret.slice(0, 120)}`);
  }

  // Leads HORS_ICP — pourquoi
  const horsIcp = detail.filter((d) => d.segment === "HORS_ICP");
  if (horsIcp.length > 0) {
    console.log(`\n── HORS_ICP — ${horsIcp.length} leads (raison probable : titre coach/freelance ou industry B2C)`);
    for (const l of horsIcp.slice(0, 10)) {
      console.log(`  - ${l.name} | ${l.title} | ${l.company}`);
    }
    if (horsIcp.length > 10) console.log(`  ... +${horsIcp.length - 10} autres`);
  }

  // Leads sans profil Unipile (probables faux profils)
  const noProfile = detail.filter((d) => !d.hasProfile);
  if (noProfile.length > 0) {
    console.log(`\n── SANS PROFIL UNIPILE — ${noProfile.length} leads (URL invalide ou profil inexistant)`);
    for (const l of noProfile.slice(0, 10)) {
      console.log(`  - ${l.name} | ${l.company}`);
    }
    if (noProfile.length > 10) console.log(`  ... +${noProfile.length - 10} autres`);
  }
}

main().catch(console.error);
