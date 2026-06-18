/**
 * verify-segment-fixes.ts — Vérifie le tuning de computeSegmentIcp() sur les
 * 11 cas réels de l'échantillon Yann (scripts/test_results.csv).
 *
 * Chaque cas reproduit les VRAIES valeurs observées (title, industry, size,
 * description, nom d'entreprise, enrichissement vide le cas échéant) et vérifie
 * que le segment attendu est bien produit.
 *
 * USAGE : npx tsx scripts/verify-segment-fixes.ts
 */

import { computeSegmentIcp, type IcpSegment } from "../lib/scoring-buckets";

interface Case {
  label: string;
  title: string;
  enrichment: Parameters<typeof computeSegmentIcp>[1];
  rawCompanyName?: string | null;
  expected: IcpSegment[]; // une ou plusieurs valeurs acceptées
}

// Les 11 cas réels (échantillon Yann, test_results.csv). Valeurs exactes :
// title / industry / size / description / nom d'entreprise.
const CASES: Case[] = [
  {
    label: 'Ahmed · "Digital Manager / Chef de projet" · Brandzone Agency (edge B|C)',
    title: "Digital Manager / Chef de projet",
    enrichment: { company: { industry: "Advertising Services", size: "11-50", description: "Get in your Zone !" } },
    rawCompanyName: "Brandzone Agency",
    expected: ["B", "C"], // edge connu : B ou C accepté
  },
  {
    label: 'Socialclub · "Co-founder & CEO" · desc "agence créative 360 … studio, branding" -> D',
    title: "Co-founder & CEO",
    enrichment: { company: { industry: "Advertising Services", size: "11-50", description: "Socialclub est une agence créative 360 fondée en 2017 et articulée sur 7 verticales : branding, advertising, studio, pr…" } },
    rawCompanyName: "Socialclub",
    expected: ["D"],
  },
  {
    label: 'Kreads · "Co-founder & CEO" · desc "agence créative spécialisée Social Ads" -> D',
    title: "Co-founder & CEO",
    enrichment: { company: { industry: "Advertising Services", size: "11-50", description: "Kreads est une agence créative spécialisée dans les Social Ads. Né des besoins des clients de Roads, notre grande soeur…" } },
    rawCompanyName: "Kreads",
    expected: ["D"],
  },
  {
    label: 'Ace · "CEO – … Google Ads & SEA … Référencement Payant" · "agence de marketing digital" -> HORS_ICP',
    title: "CEO – Ace Agency | Agence Google Ads & Agence SEA spécialisée en Référencement Payant",
    enrichment: { company: { industry: "Business Consulting and Services", size: "11-50", description: "Bienvenue chez Ace Agency Située à La Valette du Var (Toulon), Ace Agency est une agence de marketing digital passionné…" } },
    rawCompanyName: "Ace Agency",
    expected: ["HORS_ICP"],
  },
  {
    label: 'La Kabine Production · "Fondateur & Producteur" · enrichissement VIDE -> A',
    title: "Fondateur & Producteur",
    enrichment: null,
    rawCompanyName: "La Kabine Production",
    expected: ["A"],
  },
  {
    label: 'Studio SEER · "Co-fondateur" · vrai studio (nom "Studio", pas d\'"agence") -> A',
    title: "Co-fondateur",
    enrichment: { company: { industry: "Advertising Services", size: "2-10", description: "UGC, Social Ads, Display, UX et création de LPs, nous vous accompagnons dans le déploiement de vos stratégies créatives…" } },
    rawCompanyName: "Studio SEER",
    expected: ["A"],
  },
  {
    label: 'Motion909 · "Fondateur" · "Movies, Videos, and Sound" -> A',
    title: "Fondateur",
    enrichment: { company: { industry: "Movies, Videos, and Sound", size: "2-10", description: "Des vidéos en motion design pour améliorer votre stratégie sur le digital !" } },
    rawCompanyName: "Motion909",
    expected: ["A"],
  },
  {
    label: 'AYA · "Stratège créatif" · "Advertising Services" -> C',
    title: "Stratège créatif",
    enrichment: { company: { industry: "Advertising Services", size: "2-10", description: "Chez AYA, on ne parle pas de simples campagnes. On ne vend pas du media buying et de la créa. On fusionne les deux …" } },
    rawCompanyName: "AYA MEDIA",
    expected: ["C"],
  },
  {
    label: 'Marguerite · "Consultant Social Ads & Creative Strategist" -> C',
    title: "Consultant Social Ads & Creative Strategist",
    enrichment: { company: { industry: "Advertising Services", size: "2-10", description: "Faisons décoller vos conversions grâce aux réseaux sociaux !…" } },
    rawCompanyName: "Marguerite - Agence Social Ads",
    expected: ["C"],
  },
  {
    label: 'Célia · "Créatrice de contenu UGC" · company "Freelance" · enrichissement VIDE -> E',
    title: "Créatrice de contenu UGC",
    enrichment: null,
    rawCompanyName: "Freelance",
    expected: ["E"],
  },
  {
    label: 'Kosmos · "Vidéaste" · "Media Production" -> F',
    title: "Vidéaste",
    enrichment: { company: { industry: "Media Production", size: "2-10", description: "Les planètes se sont alignées en décembre 2022 d'où la création de KOSMOS…" } },
    rawCompanyName: "Kosmos",
    expected: ["F"],
  },
];

function run(cases: Case[], header: string): boolean {
  console.log("\n" + "=".repeat(78));
  console.log(header);
  console.log("=".repeat(78));
  let allOk = true;
  for (const c of cases) {
    const got = computeSegmentIcp(c.title, c.enrichment, c.rawCompanyName);
    const ok = c.expected.includes(got);
    if (!ok) allOk = false;
    console.log(
      `${ok ? "✅" : "❌"} ${got.padEnd(8)} (attendu ${c.expected.join(" ou ")})  — ${c.label}`,
    );
  }
  return allOk;
}

const ok1 = run(CASES, "11 CAS RÉELS (échantillon Yann)");

console.log("\n" + "-".repeat(78));
if (ok1) {
  console.log("✅ TOUS LES CAS PASSENT.");
  process.exit(0);
} else {
  console.log("❌ AU MOINS UN CAS ÉCHOUE.");
  process.exit(1);
}
