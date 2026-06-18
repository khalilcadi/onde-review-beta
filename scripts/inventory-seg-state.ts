/**
 * inventory-seg-state.ts — READ-ONLY. État courant avant le batch d'enrichissement.
 *
 * Pour seg_A et seg_C (presort), affiche : total, enrichis (enriched_at présent),
 * restants. Liste l'existence de la séquence "Onde Review — Bêta (seg_A)" et les
 * enrôlements. Compte les visites consommées aujourd'hui (plafond 30/j).
 *
 * USAGE : npx tsx scripts/inventory-seg-state.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const SEQ_NAME = "Onde Review — Bêta (seg_A)";

function presortSeg(ed: any): string | null {
  return ed?.presort?.segment ?? null;
}
function isEnriched(ed: any): boolean {
  return !!(ed && typeof ed === "object" && "enriched_at" in ed);
}
function computedSeg(ed: any): string | null {
  return ed?.scoring_detail?.segment_icp ?? null;
}

async function main() {
  const { createServiceClient } = await import("../lib/supabase/service");
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, title, company, linkedin_url, stage, score, status, tags, enrichment_data, created_at")
    .contains("tags", ["yann-connections"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const leads = rows || [];

  console.log("=".repeat(72));
  console.log(`INVENTAIRE — ${leads.length} leads yann-connections`);
  console.log("=".repeat(72));

  for (const seg of ["A", "C"]) {
    const inSeg = leads.filter((l) => presortSeg(l.enrichment_data) === seg);
    const enriched = inSeg.filter((l) => isEnriched(l.enrichment_data));
    const remaining = inSeg.filter((l) => !isEnriched(l.enrichment_data));
    console.log(`\n— presort:${seg} : total=${inSeg.length} | enrichis=${enriched.length} | restants=${remaining.length}`);
    if (remaining.length) {
      console.log(`   RESTANTS (à enrichir) :`);
      remaining.forEach((l) =>
        console.log(`     · ${l.first_name} ${l.last_name} — ${l.title || "?"} @ ${l.company || "?"} | url=${l.linkedin_url ? "✓" : "✗"}`)
      );
    }
    if (enriched.length) {
      const byComputed: Record<string, number> = {};
      enriched.forEach((l) => {
        const c = computedSeg(l.enrichment_data) || "?";
        byComputed[c] = (byComputed[c] || 0) + 1;
      });
      console.log(`   enrichis → computed_seg :`, Object.entries(byComputed).map(([k, v]) => `${k}=${v}`).join("  "));
    }
  }

  // Séquence + enrôlements
  console.log("\n" + "-".repeat(72));
  const { data: seqs } = await supabase.from("sequences").select("id, name, status, user_id");
  console.log(`Séquences existantes : ${seqs?.length || 0}`);
  (seqs || []).forEach((s) => console.log(`   · "${s.name}" (${s.status}) id=${s.id}`));
  const seq = (seqs || []).find((s) => s.name === SEQ_NAME);

  const { data: enrolls } = await supabase
    .from("sequence_leads")
    .select("id, sequence_id, lead_id, current_step, status");
  console.log(`Enrôlements (sequence_leads) total : ${enrolls?.length || 0}`);
  if (seq) {
    const inSeq = (enrolls || []).filter((e) => e.sequence_id === seq.id);
    console.log(`   dans "${SEQ_NAME}" : ${inSeq.length}`);
  }

  // Visites aujourd'hui
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: visits } = await supabase
    .from("actions")
    .select("id")
    .eq("action_type", "visit")
    .gte("sent_at", todayStart.toISOString());
  console.log(`\nVisites 'sent' aujourd'hui : ${visits?.length || 0} / 30`);
}

main().catch((e) => {
  console.error("fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
