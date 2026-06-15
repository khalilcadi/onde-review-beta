/**
 * Script: duplicate-sequence-for-today-imports
 *
 * Ce script :
 * 1. Trouve l'utilisateur Ludwig
 * 2. Trouve sa séquence active
 * 3. La duplique avec le nom "Séquence 2026-03-27"
 * 4. Affecte uniquement les leads importés aujourd'hui par Ludwig à cette nouvelle séquence
 *
 * USAGE:
 *   npx tsx scripts/duplicate-sequence-for-today-imports.ts
 */

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

const TODAY = "2026-03-27";
const NEW_SEQUENCE_NAME = `Séquence ${TODAY}`;

async function main() {
  console.log("=== Duplication séquence Ludwig — leads du jour ===\n");

  // 1. Trouver Ludwig
  const { data: ludwigProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", "ludwig%")
    .single();

  if (profileErr || !ludwigProfile) {
    console.error("Impossible de trouver Ludwig dans profiles:", profileErr?.message);
    process.exit(1);
  }

  const ludwigId = ludwigProfile.id;
  console.log(`[OK] Ludwig trouvé — id: ${ludwigId}`);

  // 2. Trouver la séquence active de Ludwig
  const { data: sequences, error: seqErr } = await supabase
    .from("sequences")
    .select("*")
    .eq("user_id", ludwigId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (seqErr) {
    console.error("Erreur récupération séquences:", seqErr.message);
    process.exit(1);
  }

  if (!sequences || sequences.length === 0) {
    console.error("Aucune séquence active trouvée pour Ludwig.");
    process.exit(1);
  }

  if (sequences.length > 1) {
    console.log(`[INFO] ${sequences.length} séquences actives trouvées. Utilisation de la plus récente.`);
    sequences.forEach((s, i) => console.log(`  ${i + 1}. "${s.name}" (créée le ${s.created_at?.slice(0, 10)})`));
  }

  const sourceSequence = sequences[0];
  console.log(`[OK] Séquence source: "${sourceSequence.name}" (id: ${sourceSequence.id})`);

  // 3. Récupérer les steps de la séquence source
  const { data: sourceSteps, error: stepsErr } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", sourceSequence.id)
    .order("step_order", { ascending: true });

  if (stepsErr) {
    console.error("Erreur récupération steps:", stepsErr.message);
    process.exit(1);
  }

  console.log(`[OK] ${sourceSteps?.length ?? 0} étapes trouvées dans la séquence source`);

  // 4. Créer la nouvelle séquence (copie)
  const { data: newSeq, error: newSeqErr } = await supabase
    .from("sequences")
    .insert({
      user_id: ludwigId,
      name: NEW_SEQUENCE_NAME,
      persona: sourceSequence.persona,
      status: "active",
      stats: {
        totalLeads: 0,
        activeLeads: 0,
        completedLeads: 0,
        responseRate: 0,
        conversionRate: 0,
      },
    })
    .select()
    .single();

  if (newSeqErr || !newSeq) {
    console.error("Erreur création nouvelle séquence:", newSeqErr?.message);
    process.exit(1);
  }

  console.log(`[OK] Nouvelle séquence créée: "${newSeq.name}" (id: ${newSeq.id})`);

  // 5. Dupliquer les steps
  if (sourceSteps && sourceSteps.length > 0) {
    const newSteps = sourceSteps.map((step) => ({
      sequence_id: newSeq.id,
      step_type: step.step_type,
      delay_days: step.delay_days,
      template: step.template,
      condition: step.condition,
      step_order: step.step_order,
      generation_mode: step.generation_mode ?? "ai",
    }));

    const { error: stepsInsertErr } = await supabase
      .from("sequence_steps")
      .insert(newSteps);

    if (stepsInsertErr) {
      console.error("Erreur duplication steps:", stepsInsertErr.message);
      process.exit(1);
    }

    console.log(`[OK] ${newSteps.length} étapes dupliquées`);
  }

  // 6. Trouver les leads importés aujourd'hui par Ludwig
  const todayStart = `${TODAY}T00:00:00.000Z`;
  const todayEnd = `${TODAY}T23:59:59.999Z`;

  const { data: todayLeads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, first_name, last_name, linkedin_url, created_at")
    .eq("user_id", ludwigId)
    .gte("created_at", todayStart)
    .lte("created_at", todayEnd)
    .order("created_at", { ascending: true });

  if (leadsErr) {
    console.error("Erreur récupération leads du jour:", leadsErr.message);
    process.exit(1);
  }

  if (!todayLeads || todayLeads.length === 0) {
    console.error(`Aucun lead importé aujourd'hui (${TODAY}) par Ludwig.`);
    process.exit(1);
  }

  console.log(`[OK] ${todayLeads.length} leads importés aujourd'hui par Ludwig`);

  // 7. Affecter tous ces leads à la nouvelle séquence
  const sequenceLeadsToInsert = todayLeads.map((lead) => ({
    sequence_id: newSeq.id,
    lead_id: lead.id,
    current_step: 0,
    status: "active",
  }));

  const { error: assignErr } = await supabase
    .from("sequence_leads")
    .insert(sequenceLeadsToInsert);

  if (assignErr) {
    console.error("Erreur affectation leads à la séquence:", assignErr.message);
    process.exit(1);
  }

  console.log(`[OK] ${todayLeads.length} leads affectés à "${NEW_SEQUENCE_NAME}"`);

  // 8. Résumé
  console.log("\n=== RÉSUMÉ ===");
  console.log(`Séquence source    : "${sourceSequence.name}"`);
  console.log(`Nouvelle séquence  : "${NEW_SEQUENCE_NAME}" (id: ${newSeq.id})`);
  console.log(`Étapes copiées     : ${sourceSteps?.length ?? 0}`);
  console.log(`Leads affectés     : ${todayLeads.length}`);
  console.log("\nQuelques leads affectés :");
  todayLeads.slice(0, 5).forEach((l) => {
    const name = `${l.first_name} ${l.last_name}`.trim() || l.linkedin_url;
    console.log(`  - ${name}`);
  });
  if (todayLeads.length > 5) {
    console.log(`  ... et ${todayLeads.length - 5} autres`);
  }
  console.log("\n[DONE] Terminé avec succès.");
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
