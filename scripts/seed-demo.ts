/**
 * Seed DÉMO — environnement de démonstration isolé, adapté au prospect FiveForty
 * (intégrateur & partenaire Microsoft Dynamics 365 : intégration, migration,
 * reprise de projets complexes, TMA — secteurs distribution/négoce, logistique,
 * pharma-biotech, santé/médico-social, retail, services).
 *
 * Les leads sont les PROSPECTS de FiveForty = entreprises avec un enjeu ERP réel
 * (DSI, DAF, COO, DG, Directeur des opérations) sur des signaux de projet Dynamics
 * 365 : version AX/NAV hors support, échéance facturation électronique sept. 2026,
 * offre d'emploi chef de projet Dynamics 365, levée de fonds / build-up, projet ERP
 * en difficulté ou intégrateur défaillant.
 *
 * Contexte temporel : démo calée sur JUIN 2026. Tous les signaux / posts sont datés
 * des 3 derniers mois (mars-mai 2026) pour respecter la règle de fraîcheur M1
 * (ne jamais référencer un fait > 3 mois). Échéance facturation électronique :
 * 1er septembre 2026 (réception pour toutes, émission grandes entreprises + ETI).
 *
 * Crée un user démo dédié (demo-fiveforty@prospector.app) avec :
 *   - un lien linkedin_accounts factice (status="demo" → lecture seule, aucun envoi)
 *   - 10 leads ERP enrichis (dossiers d'attaque SOLIDE / DÉGRADÉ / FAIBLE, signaux datés)
 *   - 2 séquences + steps + sequence_leads
 *   - 4 daily actions (messages M1 ancrés sur le signal ERP, vocabulaire RAG FiveForty)
 *   - 1 conversation Émilie Garnier (inbox)
 *
 * 100% inserts DB — AUCUN appel LinkedIn, rien n'est envoyé.
 * Idempotent : wipe + reseed des seules données du user démo. NE TOUCHE PAS au RAG
 * (user_rag_data) importé via seed-demo-rag.ts.
 *
 * USAGE: npx tsx scripts/seed-demo.ts
 */
// BEFORE DEMO: ensure ANTHROPIC_API_KEY is set in .env
// The demo user has no user_api_keys — generation falls
// back to process.env.ANTHROPIC_API_KEY
// Run: npx tsx scripts/seed-demo.ts && npx tsx scripts/seed-demo-rag.ts
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Config démo ---------------------------------------------------------
const DEMO_EMAIL = "demo-fiveforty@prospector.app";
const DEMO_PASSWORD = "FiveFortyDemo2026!";
const DEMO_NAME = "Démo FiveForty";
const UNIPILE_ACCOUNT_ID = "DEMO-FIVEFORTY-2026-XXXX";

// --- Helpers temps -------------------------------------------------------
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

// =============================================================================
// 1) User démo
// =============================================================================
async function ensureDemoUser(): Promise<string> {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_NAME },
  });

  if (created?.user) {
    console.log(`  [OK] user démo créé : ${DEMO_EMAIL} (${created.user.id})`);
    return created.user.id;
  }
  if (error && !error.message.includes("already been registered")) throw error;

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list.users.find((u) => u.email === DEMO_EMAIL);
  if (!found) throw new Error("User démo introuvable après createUser");
  console.log(`  [SKIP] user démo existe déjà (${found.id})`);
  return found.id;
}

// =============================================================================
// 2) Wipe données du user démo (FK-safe order). NE TOUCHE PAS user_rag_data.
// =============================================================================
async function wipeDemoData(userId: string) {
  await supabase.from("actions").delete().eq("user_id", userId);
  await supabase.from("conversations").delete().eq("user_id", userId);
  await supabase.from("sequences").delete().eq("user_id", userId);
  await supabase.from("leads").delete().eq("user_id", userId);
  await supabase.from("linkedin_accounts").delete().eq("user_id", userId);
  console.log("  [OK] données démo précédentes nettoyées (RAG conservé)");
}

// =============================================================================
// 3) linkedin_accounts + settings
// =============================================================================
async function seedAccountAndSettings(userId: string) {
  // status "demo" (≠ "active") → le cron send-actions ignore ce compte : AUCUN envoi réel.
  await supabase.from("linkedin_accounts").insert({
    user_id: userId,
    unipile_account_id: UNIPILE_ACCOUNT_ID,
    status: "demo",
    account_type: "LINKEDIN",
  });
  await supabase.from("user_settings").upsert({
    user_id: userId,
    settings: { language: "fr", timezone: "Europe/Paris" },
  });
  // Force le nom du profil (le trigger d'auto-création ne le met pas à jour au re-run).
  await supabase.from("profiles").update({ full_name: DEMO_NAME }).eq("id", userId);
  console.log("  [OK] linkedin_accounts (status=demo) + settings + profil");
}

// =============================================================================
// 4) Leads — prospects FiveForty (enjeu ERP Dynamics 365, signaux datés)
//    Toutes les dates calées sur juin 2026 (fraîcheur M1 < 3 mois).
//
//    Répartition stages : 3 to_invite (dont 1 SANS dossier = enrichi LIVE) ·
//    3 invited · 3 connected (actions pending) · 1 responded (conversation inbox).
//    Qualité dossiers : 4 SOLIDE (3 connected + 1 to_invite) · 3 DÉGRADÉ · 2 FAIBLE.
// =============================================================================
interface FFLead {
  first: string;
  last: string;
  title: string;
  company: string;
  url: string;
  stage: string;
  status: string;
  score: number;
  createdDaysAgo: number;
  enrichment: Record<string, unknown>;
}

const FIVEFORTY_LEADS: FFLead[] = [
  // --- LEAD 1: Julien Mercier (to_invite — enrichi LIVE pendant la démo, segment B) ---
  {
    first: "Julien", last: "Mercier", title: "Directeur Administratif et Financier", company: "Distrinov",
    url: "https://linkedin.com/in/julien-mercier-4821",
    stage: "to_invite", status: "warm", score: 62, createdDaysAgo: 12,
    enrichment: {
      linkedin_profile: {
        headline: "DAF @ Distrinov | Distribution & négoce B2B | Croissance externe",
        about: "Groupe de distribution spécialisée B2B. 4 sites, 180 personnes. On structure le SI pour accompagner la croissance.",
        location: "Lyon, Auvergne-Rhône-Alpes",
        connections_count: 1620,
      },
      linkedin_posts: [
        { content: "Nous venons de finaliser l'acquisition d'un distributeur régional — 3e build-up en deux ans. L'intégration des systèmes est notre prochain chantier.", date: "2026-05-06", summary: "3e acquisition en 2 ans, intégration SI à venir" },
        { content: "Quand on grandit par croissance externe, le vrai défi n'est pas commercial, il est dans la consolidation des données.", date: "2026-04-18", summary: "Enjeu consolidation données multi-entités" },
      ],
      company: { size: "180", industry: "Distribution / Négoce B2B", website: "distrinov.fr" },
      web_research: {
        societe: { effectif: "180 salariés", ca: "48M€", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [{ titre: "Distrinov poursuit sa croissance externe", resume: "Acquisition d'un distributeur régional, 3e opération en deux ans", date: "2026-05", source: "LSA" }],
        signaux: [{ type: "build-up / acquisitions", description: "3e acquisition en deux ans — SI multi-entités à consolider", date: "2026-05-06", fraicheur: "RECENT", source: "LinkedIn + LSA" }],
        searched_at: daysAgo(12),
      },
      scoring_detail: { segment_icp: "B", score: 62, categorie: "WARM" },
      dossier: null,
    },
  },
  // --- LEAD 2: Sandrine Aubert (to_invite — SOLIDE, segment C, AX hors support) ---
  {
    first: "Sandrine", last: "Aubert", title: "Directrice des Systèmes d'Information", company: "Laboratoires Vethys",
    url: "https://linkedin.com/in/sandrine-aubert-7314",
    stage: "to_invite", status: "hot", score: 82, createdDaysAgo: 11,
    enrichment: {
      linkedin_profile: {
        headline: "DSI @ Laboratoires Vethys | Pharma-biotech | Dynamics AX",
        about: "Direction SI d'un laboratoire pharmaceutique. Traçabilité, conformité, production. 320 personnes, 2 sites.",
        location: "Tours, Centre-Val de Loire",
        connections_count: 2480,
      },
      linkedin_posts: [
        { content: "La question de la fin de support de nos outils historiques revient sur la table. Sujet de fond pour 2026.", date: "2026-05-08", summary: "Fin de support outils historiques, sujet 2026" },
        { content: "Dans la pharma, la traçabilité n'est pas une option. Notre SI doit suivre, version après version.", date: "2026-04-02", summary: "Enjeu traçabilité et conformité SI pharma" },
      ],
      company: { size: "320", industry: "Pharma-biotech", website: "vethys.com" },
      web_research: {
        societe: { effectif: "320 salariés", ca: "Non public", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [],
        signaux: [{ type: "version ERP hors support", description: "Encore sur Dynamics AX 2012 — support Microsoft terminé, migration vers D365 F&O inévitable", date: "2026-05-08", fraicheur: "RECENT", source: "LinkedIn + recoupement" }],
        searched_at: daysAgo(11),
      },
      scoring_detail: { segment_icp: "C", score: 82, categorie: "HOT", justification: "Labo pharma 320 pers. sur AX 2012 hors support, enjeu traçabilité/conformité, signal fin de support confirmé par la DSI." },
      dossier: {
        mecanisme: "Mécanisme 2 — Signal récent vérifié",
        accroche_pivot: "Vethys est encore sur Dynamics AX 2012, sorti du support Microsoft — la question n'est plus si vous migrez vers F&O, mais quand et comment.",
        corps_message: "Une version hors support, c'est l'arrêt des correctifs de sécurité et de conformité, dans un secteur pharma où la traçabilité ne tolère pas l'à-peu-près. La migration vers D365 Finance & Operations se cadre 12 à 18 mois en amont, pas dans l'urgence d'une échéance subie.",
        question_ouverte: "Avez-vous déjà cadré le périmètre et le calendrier de votre migration vers F&O, ou est-ce encore au stade de la réflexion ?",
        signal_declencheur: "Post LinkedIn mai 2026 : fin de support des outils historiques évoquée — encore sur AX 2012",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "DSI, secteur pharma réglementé, registre formel",
        canal_recommande: "linkedin_invitation",
        canal_justification: "Pas encore en relation, invitation avec note",
        ton: ["sobre", "factuel", "expert"],
        longueur_max: "300 caractères (invitation LinkedIn)",
        a_eviter: ["solution clé en main", "leader", "révolutionnaire", "garanti", "j'espère que vous allez bien"],
        a_integrer: ["AX 2012", "support", "migration", "F&O", "conformité"],
        preuves: ["Dynamics AX 2012 : support standard Microsoft terminé, support étendu en fin de vie (Microsoft Lifecycle 2024-2026)", "Une version hors support n'a plus de correctifs de sécurité ni de mises à jour de conformité (Microsoft)"],
        objectif_reponse: "Confirmer le statut de la migration et ouvrir un rendez-vous de cadrage",
        angle_qualite: "SOLIDE",
        hypothese_assumee: null,
        reserves: "Version exacte (AX 2012 R2/R3) à confirmer en cadrage",
        generated_at: daysAgo(10),
      },
    },
  },
  // --- LEAD 3: Olivier Tessier (to_invite — FAIBLE, segment A, facturation élec) ---
  {
    first: "Olivier", last: "Tessier", title: "Dirigeant", company: "Maison Valtner",
    url: "https://linkedin.com/in/olivier-tessier-5593",
    stage: "to_invite", status: "warm", score: 48, createdDaysAgo: 10,
    enrichment: {
      linkedin_profile: {
        headline: "Dirigeant @ Maison Valtner | Négoce alimentaire premium | PME",
        about: "PME familiale de négoce de produits d'épicerie fine. 45 personnes. Comptabilité et tableurs au quotidien.",
        location: "Bordeaux, Nouvelle-Aquitaine",
        connections_count: 870,
      },
      linkedin_posts: [
        { content: "Belle année pour la maison — la croissance est là, mais nos outils de gestion commencent à montrer leurs limites.", date: "2026-04-22", summary: "Croissance, outils de gestion en limite" },
      ],
      company: { size: "45", industry: "Négoce alimentaire", website: "maison-valtner.fr" },
      web_research: {
        societe: { effectif: "45 salariés", ca: "12M€", structure_capitalistique: "SARL", source: "Societe.com" },
        presse: [],
        signaux: [{ type: "échéance facturation électronique", description: "PME concernée par l'obligation de réception des factures électroniques au 1er sept. 2026", date: "2026-04", fraicheur: "FRAIS", source: "déduit cadre réglementaire" }],
        searched_at: daysAgo(10),
      },
      scoring_detail: { segment_icp: "A", score: 48, categorie: "WARM", justification: "PME négoce 45 pers. sur comptabilité + tableurs, échéance facturation électronique, pas de signal projet ERP confirmé." },
      dossier: {
        mecanisme: "Mécanisme 3 — Dissonance offre/marché",
        accroche_pivot: "Une PME de 45 personnes qui pilote sur comptabilité et tableurs aborde l'échéance de facturation électronique 2026 avec une marge réduite.",
        corps_message: null,
        question_ouverte: "Comment gérez-vous aujourd'hui la facturation et la consolidation de vos données entre vos différents outils ?",
        signal_declencheur: "PME négoce sur tableurs, échéance réception facturation électronique 1er sept. 2026",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "Dirigeant PME familiale, profil traditionnel",
        canal_recommande: "linkedin_invitation",
        canal_justification: "Pas encore en relation",
        ton: ["sobre", "factuel", "questionnant"],
        longueur_max: "300 caractères (invitation)",
        a_eviter: ["opportunité exceptionnelle", "solution clé en main", "garanti", "je me permets"],
        a_integrer: ["facturation électronique", "tableurs", "consolidation"],
        preuves: ["Réception de factures électroniques obligatoire pour toutes les entreprises au 1er septembre 2026 (economie.gouv.fr ; loi de finances 2024 art. 91)"],
        objectif_reponse: "Qualifier la maturité SI et l'existence d'un projet ERP",
        angle_qualite: "FAIBLE",
        hypothese_assumee: "Outils de gestion sous-dimensionnés pour l'échéance réglementaire — non vérifié",
        reserves: "Aucun signal de projet ERP — angle structurel + échéance réglementaire générique",
        generated_at: daysAgo(9),
      },
    },
  },
  // --- LEAD 4: Nathalie Brun (invited — DÉGRADÉ, segment D1, offre d'emploi) ---
  {
    first: "Nathalie", last: "Brun", title: "Directrice des Opérations", company: "LogiPharm Distribution",
    url: "https://linkedin.com/in/nathalie-brun-9241",
    stage: "invited", status: "warm", score: 58, createdDaysAgo: 9,
    enrichment: {
      linkedin_profile: {
        headline: "Directrice des Opérations @ LogiPharm Distribution | Logistique santé",
        about: "Distribution et logistique de produits de santé. WMS, traçabilité, multi-sites. 240 personnes.",
        location: "Lille, Hauts-de-France",
        connections_count: 1340,
      },
      linkedin_posts: [
        { content: "On recrute un chef de projet Dynamics 365 F&O pour piloter notre déploiement supply chain. Poste clé, CDI, Lille.", date: "2026-05-12", summary: "Recrutement chef de projet Dynamics 365 F&O" },
      ],
      company: { size: "240", industry: "Logistique santé / Distribution", website: "logipharm.fr" },
      web_research: {
        societe: { effectif: "240 salariés", ca: "Non public", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [],
        signaux: [{ type: "offre d'emploi Dynamics 365", description: "Recrutement chef de projet Dynamics 365 F&O — projet ERP en cours ou équipe interne en tension", date: "2026-05-12", fraicheur: "RECENT", source: "LinkedIn" }],
        searched_at: daysAgo(9),
      },
      scoring_detail: { segment_icp: "D1", score: 58, categorie: "WARM", justification: "Logistique santé 240 pers., recrutement chef de projet D365 F&O = projet ERP en cours, décideur opérations identifié." },
      dossier: {
        mecanisme: "Mécanisme 2 — Signal récent vérifié",
        accroche_pivot: "Vous recrutez un chef de projet Dynamics 365 F&O — c'est le signe d'un projet ERP qui démarre, et la phase de cadrage décide souvent de la suite.",
        corps_message: "Un déploiement supply chain D365 dans la logistique santé tient autant à l'expertise produit et sectorielle qu'au pilotage. Un partenaire qui connaît le standard F&O et les enjeux WMS sécurise le projet aux côtés de l'équipe interne.",
        question_ouverte: "Votre projet de déploiement est-il déjà cadré côté périmètre et gouvernance, ou est-ce encore en phase de structuration ?",
        signal_declencheur: "Offre d'emploi LinkedIn mai 2026 : chef de projet Dynamics 365 F&O supply chain",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "Directrice des Opérations, secteur santé, registre professionnel",
        canal_recommande: "linkedin_invitation",
        canal_justification: "Pas encore en relation",
        ton: ["sobre", "factuel", "questionnant"],
        longueur_max: "300 caractères (invitation)",
        a_eviter: ["solution clé en main", "leader", "garanti", "je me permets"],
        a_integrer: ["Dynamics 365", "cadrage", "supply chain", "WMS"],
        preuves: ["Offre d'emploi chef de projet D365 F&O publiée (LinkedIn, mai 2026)", "Une offre d'emploi de chef de projet ERP trahit un projet en cours ou en difficulté (signal P1, ICP)"],
        objectif_reponse: "Qualifier l'avancement du projet et positionner FiveForty en appui",
        angle_qualite: "DÉGRADÉ",
        hypothese_assumee: "Projet ERP au stade de structuration interne — non confirmé par la décideuse",
        reserves: "On ignore si un intégrateur est déjà retenu — l'offre peut viser une équipe 100% interne",
        generated_at: daysAgo(8),
      },
    },
  },
  // --- LEAD 5: Karim Haddad (invited — DÉGRADÉ, segment B, croissance / build-up) ---
  {
    first: "Karim", last: "Haddad", title: "Chief Operating Officer", company: "Velora Retail",
    url: "https://linkedin.com/in/karim-haddad-3847",
    stage: "invited", status: "warm", score: 54, createdDaysAgo: 8,
    enrichment: {
      linkedin_profile: {
        headline: "COO @ Velora Retail | Retail & e-commerce | Scale-up",
        about: "Marque retail omnicanale en forte croissance. Boutiques + e-commerce. 130 personnes, plusieurs entités.",
        location: "Paris, Île-de-France",
        connections_count: 1990,
      },
      linkedin_posts: [
        { content: "Levée de fonds bouclée, 3 nouvelles boutiques ouvertes ce trimestre. Notre SI doit maintenant suivre le rythme.", date: "2026-05-04", summary: "Levée de fonds + ouvertures, SI sous tension" },
        { content: "Quand chaque entité a son propre outil, le reporting consolidé devient un casse-tête mensuel.", date: "2026-04-09", summary: "SI hétérogène, reporting consolidé difficile" },
      ],
      company: { size: "130", industry: "Retail / E-commerce", website: "velora.com" },
      web_research: {
        societe: { effectif: "130 salariés", ca: "Non public", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [{ titre: "Velora Retail lève des fonds pour son expansion", resume: "Tour de table pour accélérer les ouvertures de boutiques", date: "2026-04", source: "FashionNetwork" }],
        signaux: [{ type: "levée de fonds / croissance", description: "Levée + ouvertures de boutiques — SI hétérogène multi-entités qui ne suit plus", date: "2026-05-04", fraicheur: "RECENT", source: "LinkedIn + FashionNetwork" }],
        searched_at: daysAgo(8),
      },
      scoring_detail: { segment_icp: "B", score: 54, categorie: "WARM", justification: "Retail scale-up 130 pers., levée + ouvertures, SI multi-entités non consolidé — besoin d'ERP structurant, pas de projet formalisé." },
      dossier: {
        mecanisme: "Mécanisme 3 — Dissonance offre/marché",
        accroche_pivot: "Velora grandit par ouvertures et chaque entité a son propre outil — c'est exactement quand le reporting consolidé devient ingérable que l'ERP structurant s'impose.",
        corps_message: null,
        question_ouverte: "Aujourd'hui, comment consolidez-vous le reporting entre vos différentes entités et canaux de vente ?",
        signal_declencheur: "Levée de fonds + ouvertures boutiques, SI hétérogène (LinkedIn mai 2026)",
        voix: "je", formalite: "tutoiement",
        formalite_justification: "COO scale-up retail, secteur dynamique, posts informels",
        canal_recommande: "linkedin_invitation",
        canal_justification: "Pas encore en relation",
        ton: ["direct", "factuel", "pair-à-pair"],
        longueur_max: "300 caractères (invitation)",
        a_eviter: ["solution clé en main", "opportunité", "booster", "je me permets"],
        a_integrer: ["multi-entités", "reporting consolidé", "ERP structurant"],
        preuves: ["Une levée de fonds / build-up signale un SI qui ne suit plus, besoin d'un ERP structurant multi-entités (signal P1, ICP)"],
        objectif_reponse: "Qualifier la maturité du SI et l'existence d'un projet de structuration",
        angle_qualite: "DÉGRADÉ",
        hypothese_assumee: "SI multi-entités non consolidé freine le pilotage — déduit des posts, non vérifié",
        reserves: "Pas de module ERP ni de calendrier identifié — angle structurel sur le signal croissance",
        generated_at: daysAgo(7),
      },
    },
  },
  // --- LEAD 6: Christophe Naudin (invited — FAIBLE, segment A/D1, NAV vieillissant) ---
  {
    first: "Christophe", last: "Naudin", title: "Directeur Administratif et Financier", company: "Groupe Sermat",
    url: "https://linkedin.com/in/christophe-naudin-6612",
    stage: "invited", status: "warm", score: 44, createdDaysAgo: 8,
    enrichment: {
      linkedin_profile: {
        headline: "DAF @ Groupe Sermat | Négoce de matériel industriel",
        about: "Négoce et distribution de matériel pour l'industrie. 90 personnes. ERP Dynamics NAV en place depuis des années.",
        location: "Nantes, Pays de la Loire",
        connections_count: 760,
      },
      linkedin_posts: [],
      company: { size: "90", industry: "Négoce / Distribution industrielle", website: "groupe-sermat.fr" },
      web_research: {
        societe: { effectif: "90 salariés", ca: "26M€", structure_capitalistique: "SAS", source: "Societe.com" },
        presse: [],
        signaux: [{ type: "version ERP vieillissante", description: "Dynamics NAV en place de longue date — fin de support, candidat à une montée vers Business Central / F&O", date: "2026-04", fraicheur: "FRAIS", source: "déduit profil + secteur" }],
        searched_at: daysAgo(8),
      },
      scoring_detail: { segment_icp: "D1", score: 44, categorie: "WARM" },
      dossier: {
        mecanisme: "Mécanisme 3 — Dissonance offre/marché",
        accroche_pivot: "Un négoce qui tourne sur Dynamics NAV depuis des années accumule des spécifiques et un coût de maintenance qui montent sans qu'on les chiffre.",
        corps_message: null,
        question_ouverte: "Sur quelle version de Dynamics êtes-vous aujourd'hui, et depuis combien de temps ?",
        signal_declencheur: "Dynamics NAV de longue date — fin de support, candidat à une montée de version",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "DAF, secteur négoce industriel, registre formel",
        canal_recommande: "linkedin_invitation",
        canal_justification: "Pas encore en relation",
        ton: ["sobre", "factuel", "questionnant"],
        longueur_max: "300 caractères (invitation)",
        a_eviter: ["solution clé en main", "leader", "garanti", "révolutionnaire"],
        a_integrer: ["NAV", "montée de version", "spécifiques", "maintenance"],
        preuves: ["Les versions Dynamics NAV sont sorties du support standard Microsoft (Microsoft Lifecycle 2024-2026)"],
        objectif_reponse: "Confirmer la version en place et l'ancienneté pour qualifier l'urgence",
        angle_qualite: "FAIBLE",
        hypothese_assumee: "Version NAV hors support et spécifiques accumulés — déduit, non vérifié",
        reserves: "Aucun post ni signal daté — angle basé sur la déduction version + secteur",
        generated_at: daysAgo(7),
      },
    },
  },
  // --- LEAD 7: Hélène Fabre (connected — SOLIDE, segment C, migration AX — action pending) ---
  {
    first: "Hélène", last: "Fabre", title: "Directrice des Systèmes d'Information", company: "Médipole Santé",
    url: "https://linkedin.com/in/helene-fabre-1193",
    stage: "connected", status: "hot", score: 84, createdDaysAgo: 6,
    enrichment: {
      linkedin_profile: {
        headline: "DSI @ Médipole Santé | Médico-social | Multi-établissements",
        about: "Direction SI d'un groupe d'établissements de santé et médico-social. 12 établissements, 1500 collaborateurs.",
        location: "Marseille, Provence-Alpes-Côte d'Azur",
        connections_count: 3260,
      },
      linkedin_posts: [
        { content: "Migrer un ERP de santé multi-établissements sans interrompre l'activité, c'est le sujet qui m'occupe pour les 18 prochains mois.", date: "2026-05-14", summary: "Projet migration ERP santé multi-établissements" },
        { content: "On ne maintient plus une version hors support 'parce qu'elle marche encore'. Le risque de conformité ne s'achète pas.", date: "2026-04-25", summary: "Position ferme sur le risque version hors support" },
      ],
      company: { size: "1500", industry: "Santé / Médico-social", website: "medipole-sante.fr" },
      web_research: {
        societe: { effectif: "1500 salariés", ca: "Non public", structure_capitalistique: "Association / Groupe", source: "Pappers" },
        presse: [],
        signaux: [{ type: "version ERP hors support", description: "ERP Dynamics AX en place, projet de migration vers F&O cadré sur 18 mois", date: "2026-05-14", fraicheur: "RECENT", source: "LinkedIn" }],
        searched_at: daysAgo(6),
      },
      scoring_detail: { segment_icp: "C", score: 84, categorie: "HOT", justification: "Groupe santé 1500 pers., 12 établissements, migration AX→F&O cadrée 18 mois confirmée par la DSI, enjeu conformité fort." },
      dossier: {
        mecanisme: "Mécanisme 2 — Signal récent vérifié",
        accroche_pivot: "Médipole est encore sur Dynamics AX, sorti du support Microsoft — la question n'est plus si vous migrez vers F&O, mais comment le faire sans interrompre l'activité.",
        corps_message: "Migrer un ERP multi-établissements en santé sur 18 mois, c'est d'abord un cadrage et une gouvernance solides : rationaliser les spécifiques, sécuriser la reprise de données, préparer l'adoption établissement par établissement. C'est là qu'un partenaire D365 qui connaît le secteur fait la différence.",
        question_ouverte: "Sur votre migration à 18 mois, avez-vous déjà tranché entre montée de version et réimplémentation, ou est-ce un point encore ouvert ?",
        signal_declencheur: "Post LinkedIn mai 2026 : projet de migration ERP santé multi-établissements cadré sur 18 mois",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "DSI, groupe santé, registre formel et expert",
        canal_recommande: "linkedin_message",
        canal_justification: "Déjà en relation",
        ton: ["sobre", "expert", "factuel"],
        longueur_max: "900 caractères",
        a_eviter: ["solution clé en main", "leader", "garanti", "j'espère que vous allez bien"],
        a_integrer: ["AX", "F&O", "migration", "cadrage", "adoption", "conformité"],
        preuves: ["Dynamics AX hors support standard Microsoft (Microsoft Lifecycle 2024-2026)", "Le risque récurrent d'une migration ERP : maîtrise des coûts, délais, qualité et adoption utilisateur (enjeux secteur)"],
        objectif_reponse: "Qualifier le choix montée de version vs réimplémentation et proposer un cadrage",
        angle_qualite: "SOLIDE",
        hypothese_assumee: null,
        reserves: null,
        generated_at: daysAgo(5),
      },
    },
  },
  // --- LEAD 8: Vincent Pol (connected — SOLIDE, segment D1, facturation élec — action pending) ---
  {
    first: "Vincent", last: "Pol", title: "Directeur Administratif et Financier", company: "Nutrivia",
    url: "https://linkedin.com/in/vincent-pol-4473",
    stage: "connected", status: "hot", score: 79, createdDaysAgo: 5,
    enrichment: {
      linkedin_profile: {
        headline: "DAF @ Nutrivia | Agroalimentaire & distribution | ETI",
        about: "ETI agroalimentaire, production et distribution. 4 sites, 410 personnes. Finance et supply chain.",
        location: "Rennes, Bretagne",
        connections_count: 2110,
      },
      linkedin_posts: [
        { content: "La facturation électronique de septembre 2026 n'est pas qu'un sujet IT — c'est un chantier Finance qui se prépare maintenant.", date: "2026-05-11", summary: "Facturation électronique 2026 = chantier Finance" },
        { content: "Notre ERP a bien servi, mais sur le volet réglementaire, il commence à montrer ses limites.", date: "2026-04-15", summary: "ERP en limite sur le volet réglementaire" },
      ],
      company: { size: "410", industry: "Agroalimentaire / Distribution", website: "nutrivia.fr" },
      web_research: {
        societe: { effectif: "410 salariés", ca: "95M€", structure_capitalistique: "SAS", source: "Societe.com" },
        presse: [],
        signaux: [{ type: "échéance facturation électronique", description: "ETI concernée par l'obligation d'émission au 1er sept. 2026 — chantier Finance identifié", date: "2026-05-11", fraicheur: "RECENT", source: "LinkedIn" }],
        searched_at: daysAgo(5),
      },
      scoring_detail: { segment_icp: "D1", score: 79, categorie: "HOT", justification: "ETI agro 410 pers., DAF qui pilote le chantier facturation électronique 1er sept. 2026, ERP actuel en limite réglementaire." },
      dossier: {
        mecanisme: "Mécanisme 1 — Contradiction observable",
        accroche_pivot: "Vous identifiez la facturation électronique de septembre 2026 comme un chantier Finance, mais votre ERP actuel montre déjà ses limites sur le volet réglementaire.",
        corps_message: "L'obligation d'émission au 1er septembre 2026 touche directement le périmètre Finance des ETI. D365 et l'electronic reporting permettent de s'y conformer, mais le cadrage — plateforme agréée, formats, flux — se prépare en amont, pas dans les dernières semaines. C'est exactement le type de chantier où un retard se paie cher.",
        question_ouverte: "Votre ERP actuel est-il déjà aligné sur l'obligation d'émission au 1er septembre, ou reste-t-il un périmètre à cadrer ?",
        signal_declencheur: "Post LinkedIn mai 2026 : facturation électronique sept. 2026 posée comme chantier Finance + ERP en limite réglementaire",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "DAF, ETI agroalimentaire, registre formel",
        canal_recommande: "linkedin_message",
        canal_justification: "Déjà en relation",
        ton: ["sobre", "factuel", "business"],
        longueur_max: "900 caractères",
        a_eviter: ["solution clé en main", "garanti", "leader", "je me permets"],
        a_integrer: ["facturation électronique", "1er septembre 2026", "Finance", "cadrage", "conformité"],
        preuves: ["Émission de factures électroniques obligatoire pour grandes entreprises et ETI au 1er septembre 2026 (economie.gouv.fr ; loi de finances 2024 art. 91)", "D365 Finance et l'electronic reporting couvrent l'obligation, à cadrer selon la plateforme agréée (Microsoft)"],
        objectif_reponse: "Qualifier l'état de préparation Finance et proposer un cadrage conformité",
        angle_qualite: "SOLIDE",
        hypothese_assumee: null,
        reserves: "Version ERP exacte à confirmer pour évaluer l'écart de conformité",
        generated_at: daysAgo(4),
      },
    },
  },
  // --- LEAD 9: Laurent Chevallier (connected — SOLIDE, segment D2, projet en difficulté — action pending) ---
  {
    first: "Laurent", last: "Chevallier", title: "Directeur de Programme SI", company: "Groupe Alteor",
    url: "https://linkedin.com/in/laurent-chevallier-7788",
    stage: "connected", status: "hot", score: 86, createdDaysAgo: 4,
    enrichment: {
      linkedin_profile: {
        headline: "Directeur de Programme SI @ Groupe Alteor | Distribution multi-pays",
        about: "Pilotage du programme ERP d'un groupe de distribution présent dans 5 pays. DSI structurée, gouvernance projet.",
        location: "Paris, Île-de-France",
        connections_count: 4180,
      },
      linkedin_posts: [
        { content: "Un programme ERP multi-pays, ce n'est pas qu'une question de ressources. Quand ça dérape, on ajoute rarement du monde pour s'en sortir.", date: "2026-05-09", summary: "Programme ERP multi-pays qui dérape, réflexion gouvernance" },
        { content: "Reprendre un chantier mal engagé demande d'abord un audit honnête de la situation, pas un nouveau planning optimiste.", date: "2026-04-28", summary: "Reprise de projet : audit avant replanification" },
      ],
      company: { size: "950", industry: "Distribution / Multi-pays", website: "groupe-alteor.com" },
      web_research: {
        societe: { effectif: "950 salariés", ca: "Non public", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [],
        signaux: [{ type: "projet ERP en difficulté", description: "Programme ERP D365 multi-pays en retard — réflexion ouverte sur la reprise / sécurisation", date: "2026-05-09", fraicheur: "RECENT", source: "LinkedIn" }],
        searched_at: daysAgo(4),
      },
      scoring_detail: { segment_icp: "D2", score: 86, categorie: "HOT", justification: "Groupe distribution multi-pays 950 pers., DSI structurée, programme ERP en retard, directeur de programme qui évoque ouvertement la reprise — cible reprise de projet complexe." },
      dossier: {
        mecanisme: "Mécanisme 1 — Contradiction observable",
        accroche_pivot: "Un programme ERP multi-pays qui prend du retard ne se rattrape pas en ajoutant des ressources — il se redresse par un cadrage et une reprise méthodique.",
        corps_message: "Vous le dites vous-même : reprendre un chantier mal engagé commence par un audit honnête, pas par un planning optimiste. C'est exactement l'approche d'une reprise de projet complexe — auditer la situation, sécuriser le périmètre, remettre la gouvernance en place — sans repartir de zéro quand ce n'est pas nécessaire. La DSI garde la gouvernance et arbitre.",
        question_ouverte: "Sur votre programme en cours, qu'est-ce qui bloque aujourd'hui — le cadrage, la gouvernance ou l'intégrateur en place ?",
        signal_declencheur: "Posts LinkedIn mai 2026 : programme ERP multi-pays qui dérape + réflexion sur la reprise",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "Directeur de Programme SI, grand compte multi-pays, registre formel et institutionnel",
        canal_recommande: "linkedin_message",
        canal_justification: "Déjà en relation",
        ton: ["sobre", "expert", "pair-à-pair"],
        longueur_max: "900 caractères",
        a_eviter: ["solution clé en main", "garanti", "leader", "révolutionnaire", "je me permets"],
        a_integrer: ["reprise de projet", "cadrage", "gouvernance", "audit", "sécuriser le périmètre"],
        preuves: ["Un projet ERP en difficulté vient le plus souvent d'un cadrage flou et d'une gouvernance faible, pas de l'outil (pain points ICP)", "La reprise de projets complexes : audit de la situation, sécurisation du périmètre, remise sur les rails (offre FiveForty)"],
        objectif_reponse: "Identifier le point de blocage et proposer un audit de reprise",
        angle_qualite: "SOLIDE",
        hypothese_assumee: null,
        reserves: "Nom de l'intégrateur en place et périmètre exact du dérapage à confirmer en audit",
        generated_at: daysAgo(3),
      },
    },
  },
  // --- LEAD 10: Émilie Garnier (responded — DÉGRADÉ, segment C, AX 2012 + intégrateur — conversation) ---
  {
    first: "Émilie", last: "Garnier", title: "Chief Operating Officer", company: "Pharmadis Group",
    url: "https://linkedin.com/in/emilie-garnier-1193",
    stage: "responded", status: "hot", score: 77, createdDaysAgo: 3,
    enrichment: {
      linkedin_profile: {
        headline: "COO @ Pharmadis Group | Distribution pharmaceutique | ETI",
        about: "Distribution de produits pharmaceutiques et parapharmacie. 3 sites, 280 personnes. Supply chain et conformité.",
        location: "Toulouse, Occitanie",
        connections_count: 1720,
      },
      linkedin_posts: [
        { content: "Un projet ERP qui patine, c'est de l'énergie qui ne va ni au métier ni aux équipes. On a tous connu ça.", date: "2026-05-13", summary: "Projet ERP qui patine, perte d'énergie" },
      ],
      company: { size: "280", industry: "Distribution pharmaceutique", website: "pharmadis-group.fr" },
      web_research: {
        societe: { effectif: "280 salariés", ca: "Non public", structure_capitalistique: "SAS", source: "Pappers" },
        presse: [],
        signaux: [{ type: "intégrateur défaillant", description: "Encore sur AX 2012, migration nécessaire, projet avec l'intégrateur actuel qui prend du retard", date: "2026-05-13", fraicheur: "RECENT", source: "LinkedIn + échange" }],
        searched_at: daysAgo(3),
      },
      scoring_detail: { segment_icp: "C", score: 77, categorie: "HOT", justification: "Distribution pharma 280 pers. sur AX 2012, migration nécessaire, projet en retard côté intégrateur — double signal version hors support + reprise." },
      dossier: {
        mecanisme: "Mécanisme 3 — Dissonance offre/marché",
        accroche_pivot: "Rester sur AX 2012 pendant qu'un projet de migration patine, c'est cumuler le coût d'une version hors support et celui d'un chantier qui n'avance pas.",
        corps_message: null,
        question_ouverte: "Qu'est-ce qui bloque le plus aujourd'hui sur votre projet — le cadrage, l'intégrateur en place, ou l'adoption côté équipes ?",
        signal_declencheur: "Post LinkedIn mai 2026 : projet ERP qui patine + encore sur AX 2012",
        voix: "je", formalite: "vouvoiement",
        formalite_justification: "COO, distribution pharma, registre professionnel",
        canal_recommande: "linkedin_message",
        canal_justification: "Conversation déjà engagée",
        ton: ["sobre", "factuel", "questionnant"],
        longueur_max: "900 caractères",
        a_eviter: ["solution clé en main", "garanti", "leader", "je me permets"],
        a_integrer: ["AX 2012", "migration", "reprise de projet", "cadrage"],
        preuves: ["Dynamics AX 2012 hors support standard Microsoft (Microsoft Lifecycle 2024-2026)", "La reprise de projets complexes existe précisément pour les projets en difficulté (offre FiveForty)"],
        objectif_reponse: "Qualifier le point de blocage et proposer un audit / cadrage de reprise",
        angle_qualite: "DÉGRADÉ",
        hypothese_assumee: "Intégrateur actuel à l'origine du retard — à confirmer en échange",
        reserves: "Périmètre du projet et engagement contractuel avec l'intégrateur en place inconnus",
        generated_at: daysAgo(2),
      },
    },
  },
];

async function seedLeads(userId: string): Promise<Record<string, string>> {
  const rows = FIVEFORTY_LEADS.map((lead) => ({
    user_id: userId,
    first_name: lead.first,
    last_name: lead.last,
    title: lead.title,
    company: lead.company,
    linkedin_url: lead.url,
    score: lead.score,
    status: lead.status,
    stage: lead.stage,
    tags: ["demo", "fiveforty"],
    enrichment_data: lead.enrichment,
    created_at: daysAgo(lead.createdDaysAgo),
    updated_at: daysAgo(lead.createdDaysAgo),
  }));

  const { data, error } = await supabase
    .from("leads")
    .insert(rows)
    .select("id, first_name, last_name, stage, enrichment_data");
  if (error) throw error;

  // Map "Prénom Nom" -> id, pour rattacher séquences / actions / conversations.
  const byName: Record<string, string> = {};
  for (const r of data) byName[`${r.first_name} ${r.last_name}`] = r.id;

  // --- Report : total, dossiers peuplés, répartition par stage ---
  const withDossier = data.filter((r) => {
    const e = r.enrichment_data as { dossier?: unknown } | null;
    return e?.dossier != null;
  }).length;
  const byStage = data.reduce<Record<string, number>>((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`  [OK] ${data.length} leads FiveForty insérés`);
  console.log(`       dossier peuplé : ${withDossier}/${data.length}`);
  console.log(
    `       par stage : ${Object.entries(byStage)
      .map(([s, n]) => `${s}=${n}`)
      .join(" · ")}`
  );
  return byName;
}

const CREATED_DAYS_BY_NAME: Record<string, number> = Object.fromEntries(
  FIVEFORTY_LEADS.map((l) => [`${l.first} ${l.last}`, l.createdDaysAgo])
);

// =============================================================================
// 5) Séquences + steps + sequence_leads
// =============================================================================
async function seedSequences(userId: string, leadIds: Record<string, string>) {
  const defs = [
    {
      name: "Prospects ERP — Entreprises",
      persona: "icp",
      stats: { active: 7, responded: 0 },
      steps: [
        { step_type: "invitation", delay_days: 0, condition: "always", step_order: 1, generation_mode: "ai", template: null },
        { step_type: "message", delay_days: 1, condition: "invitation_accepted", step_order: 2, generation_mode: "ai", template: null },
        { step_type: "message", delay_days: 2, condition: "if_no_response", step_order: 3, generation_mode: "ai", template: null },
        { step_type: "message", delay_days: 6, condition: "if_no_response", step_order: 4, generation_mode: "ai", template: null },
      ],
      // [nom, current_step]
      leads: [
        ["Julien Mercier", 1],
        ["Sandrine Aubert", 1],
        ["Olivier Tessier", 1],
        ["Karim Haddad", 1],
        ["Christophe Naudin", 1],
        ["Hélène Fabre", 2],
        ["Vincent Pol", 2],
      ] as [string, number][],
    },
    {
      name: "Prospects ERP — Reprise de projet",
      persona: "icp",
      stats: { active: 3, responded: 1 },
      steps: [
        { step_type: "invitation", delay_days: 0, condition: "always", step_order: 1, generation_mode: "ai", template: null },
        { step_type: "message", delay_days: 1, condition: "invitation_accepted", step_order: 2, generation_mode: "ai", template: null },
        { step_type: "message", delay_days: 4, condition: "if_no_response", step_order: 3, generation_mode: "ai", template: null },
      ],
      // Leads avec signal "projet en difficulté" ou "intégrateur défaillant".
      leads: [
        ["Nathalie Brun", 1],
        ["Laurent Chevallier", 2],
        ["Émilie Garnier", 3],
      ] as [string, number][],
    },
  ];

  let totalSteps = 0;
  let totalAttached = 0;

  for (const def of defs) {
    const { data: seq, error: seqErr } = await supabase
      .from("sequences")
      .insert({ user_id: userId, name: def.name, persona: def.persona, status: "active", stats: def.stats, created_at: daysAgo(12) })
      .select("id")
      .single();
    if (seqErr) throw seqErr;

    const { error: stepErr } = await supabase
      .from("sequence_steps")
      .insert(def.steps.map((s) => ({ sequence_id: seq!.id, ...s })));
    if (stepErr) throw stepErr;
    totalSteps += def.steps.length;

    const slRows = def.leads
      .filter(([name]) => leadIds[name])
      .map(([name, step]) => ({
        sequence_id: seq!.id,
        lead_id: leadIds[name],
        current_step: step,
        status: "active",
        entered_at: daysAgo((CREATED_DAYS_BY_NAME[name] ?? 6) - 1),
      }));
    if (slRows.length) {
      const { error: slErr } = await supabase.from("sequence_leads").insert(slRows);
      if (slErr) throw slErr;
    }
    totalAttached += slRows.length;
  }

  console.log(`  [OK] ${defs.length} séquences + ${totalSteps} steps + ${totalAttached} leads rattachés`);
}

// =============================================================================
// 6) Actions — Daily Actions (3 pending à valider live + 1 validated programmée)
//    Messages M1 ancrés sur l'accroche_pivot du dossier + signal + question_ouverte.
//    Vocabulaire RAG : sobre, factuel, business, pas de superlatifs.
// =============================================================================
async function seedActions(userId: string, leadIds: Record<string, string>) {
  const farFuture = new Date(now + 30 * 86_400_000).toISOString();

  const pending: { name: string; message: string; gen: Record<string, unknown>; createdDaysAgo: number }[] = [
    {
      name: "Hélène Fabre",
      createdDaysAgo: 3,
      message:
        "Bonjour Hélène,\n\nMédipole est encore sur Dynamics AX, sorti du support Microsoft — la question n'est plus si vous migrez vers F&O, mais comment le faire sans interrompre l'activité de vos établissements.\n\nMigrer un ERP multi-établissements sur 18 mois, c'est d'abord un cadrage et une gouvernance solides : rationaliser les spécifiques, sécuriser la reprise de données, préparer l'adoption établissement par établissement. C'est là qu'un partenaire D365 qui connaît la santé fait la différence.\n\nSur votre migration à 18 mois, avez-vous déjà tranché entre montée de version et réimplémentation, ou est-ce un point encore ouvert ?",
      gen: { variante: "a", angle: "Mécanisme 2 — Migration AX→F&O santé", dossier_qualite: "SOLIDE" },
    },
    {
      name: "Vincent Pol",
      createdDaysAgo: 2,
      message:
        "Bonjour Vincent,\n\nVous identifiez la facturation électronique de septembre 2026 comme un chantier Finance, mais votre ERP actuel montre déjà ses limites sur le volet réglementaire.\n\nL'obligation d'émission au 1er septembre 2026 touche directement le périmètre Finance des ETI. D365 et l'electronic reporting permettent de s'y conformer, mais le cadrage — plateforme agréée, formats, flux — se prépare en amont, pas dans les dernières semaines.\n\nVotre ERP actuel est-il déjà aligné sur l'obligation d'émission au 1er septembre, ou reste-t-il un périmètre à cadrer ?",
      gen: { variante: "a", angle: "Mécanisme 1 — Facturation électronique sept. 2026", dossier_qualite: "SOLIDE" },
    },
    {
      name: "Laurent Chevallier",
      createdDaysAgo: 1,
      message:
        "Bonjour Laurent,\n\nUn programme ERP multi-pays qui prend du retard ne se rattrape pas en ajoutant des ressources — il se redresse par un cadrage et une reprise méthodique.\n\nVous le dites vous-même : reprendre un chantier mal engagé commence par un audit honnête, pas par un planning optimiste. C'est l'approche d'une reprise de projet complexe — auditer la situation, sécuriser le périmètre, remettre la gouvernance en place — sans repartir de zéro quand ce n'est pas nécessaire. La DSI garde la main et arbitre.\n\nSur votre programme en cours, qu'est-ce qui bloque aujourd'hui — le cadrage, la gouvernance ou l'intégrateur en place ?",
      gen: { variante: "a", angle: "Mécanisme 1 — Reprise de projet complexe", dossier_qualite: "SOLIDE" },
    },
  ];

  const rows: Record<string, unknown>[] = pending
    .filter((p) => leadIds[p.name])
    .map((p) => ({
      user_id: userId,
      lead_id: leadIds[p.name],
      action_type: "message",
      status: "pending",
      generated_message: p.message,
      final_message: null,
      scheduled_at: null,
      generation_data: p.gen,
      created_at: daysAgo(p.createdDaysAgo),
    }));

  // 1 action validated, programmée +30j → jamais ramassée par le cron (compte en status=demo de toute façon).
  const nathalieMsg =
    "Bonjour Nathalie,\n\nVous recrutez un chef de projet Dynamics 365 F&O — c'est le signe d'un projet ERP qui démarre, et la phase de cadrage décide souvent de la suite.\n\nUn déploiement supply chain D365 en logistique santé tient autant à l'expertise produit et sectorielle qu'au pilotage. Un partenaire qui connaît le standard F&O et les enjeux WMS sécurise le projet aux côtés de votre équipe interne.\n\nVotre projet est-il déjà cadré côté périmètre et gouvernance, ou est-ce encore en phase de structuration ?";
  if (leadIds["Nathalie Brun"]) {
    rows.push({
      user_id: userId,
      lead_id: leadIds["Nathalie Brun"],
      action_type: "message",
      status: "validated",
      generated_message: nathalieMsg,
      final_message: nathalieMsg,
      validated_at: daysAgo(1),
      scheduled_at: farFuture,
      generation_data: { variante: "a", angle: "Mécanisme 2 — Offre d'emploi D365 F&O", dossier_qualite: "DÉGRADÉ" },
      created_at: daysAgo(1),
    });
  }

  const { error } = await supabase.from("actions").insert(rows);
  if (error) throw error;
  const p = rows.filter((r) => r.status === "pending").length;
  const v = rows.filter((r) => r.status === "validated").length;
  console.log(`  [OK] ${rows.length} actions (${p} pending · ${v} validated)`);
}

// =============================================================================
// 7) Conversation Émilie Garnier (inbox) — 3 messages, M1 ancré sur le signal
// =============================================================================
async function seedConversation(userId: string, leadIds: Record<string, string>) {
  const leadId = leadIds["Émilie Garnier"];
  if (!leadId) {
    console.log("  [SKIP] conversation Émilie Garnier — lead introuvable");
    return;
  }

  const msgs = [
    {
      direction: "outbound",
      ago: 3,
      content:
        "Bonjour Émilie,\n\nRester sur AX 2012 pendant qu'un projet de migration patine, c'est cumuler le coût d'une version hors support et celui d'un chantier qui n'avance pas.\n\nDans la plupart des cas, ce n'est pas l'outil qui bloque, mais le cadrage et la gouvernance du projet. La reprise de projets complexes existe précisément pour ces situations : auditer la situation, sécuriser le périmètre, remettre sur les rails.\n\nQu'est-ce qui bloque le plus aujourd'hui sur votre projet — le cadrage, l'intégrateur en place, ou l'adoption côté équipes ?",
    },
    { direction: "inbound", ago: 2, content: "Effectivement, on est encore sur AX 2012 et on sait qu'il faut migrer. Notre projet avec l'intégrateur actuel prend du retard, ça m'intéresse d'échanger." },
    {
      direction: "outbound",
      ago: 1,
      content:
        "Merci de votre retour. Avant de parler solution, ça vaut le coup de poser un diagnostic rapide de la situation — version, périmètre, point de blocage. Je vous propose 20 minutes cette semaine, mardi ou jeudi : qu'est-ce qui vous arrange ?",
    },
  ];

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      lead_id: leadId,
      channel: "linkedin",
      unipile_chat_id: "demo-chat-emilie-garnier-2026",
      status: "read",
      attendee_name: "Émilie Garnier",
      attendee_profile_url: "https://linkedin.com/in/emilie-garnier-1193",
      updated_at: daysAgo(1),
    })
    .select("id")
    .single();
  if (convErr) throw convErr;

  const { error: msgErr } = await supabase.from("messages").insert(
    msgs.map((m) => ({
      conversation_id: conv!.id,
      direction: m.direction,
      content: m.content,
      timestamp: daysAgo(m.ago),
    }))
  );
  if (msgErr) throw msgErr;

  console.log(`  [OK] 1 conversation (Émilie Garnier) + ${msgs.length} messages`);
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  console.log("\n=== SEED DÉMO (FiveForty — Microsoft Dynamics 365) ===\n");
  const userId = await ensureDemoUser();
  await wipeDemoData(userId);
  await seedAccountAndSettings(userId);
  const leadIds = await seedLeads(userId);
  await seedSequences(userId, leadIds);
  await seedActions(userId, leadIds);
  await seedConversation(userId, leadIds);

  console.log(`\n✅ Démo prête. Connexion : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("   (inserts DB only · crons inactifs en local · RAG FiveForty conservé)\n");
}

main().catch((e) => {
  console.error("\n❌ Seed démo échoué :", e);
  process.exit(1);
});
