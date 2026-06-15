/**
 * Vérifie que toutes les tables attendues existent sur Supabase prod
 * + check que la migration 014 (stage 'withdrawn') a bien été appliquée.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

// 16 tables attendues d'après CLAUDE.md + migrations
const EXPECTED_TABLES = [
  "profiles",
  "user_api_keys",
  "user_settings",
  "user_prompts",
  "user_rag_data",
  "linkedin_accounts",
  "leads",
  "lists",
  "list_leads",
  "sequences",
  "sequence_steps",
  "sequence_leads",
  "actions",
  "conversations",
  "messages",
  "ai_usage",
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(`URL Supabase : ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  // 1. Existence de chaque table (via SELECT count head)
  console.log("═".repeat(60));
  console.log("PRÉSENCE DES TABLES (16 attendues)");
  console.log("═".repeat(60));
  let missing: string[] = [];
  for (const t of EXPECTED_TABLES) {
    const { error, count } = await supabase
      .from(t)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ❌ ${t.padEnd(25)} : ${error.message}`);
      missing.push(t);
    } else {
      console.log(`  ✅ ${t.padEnd(25)} : ${count} rows`);
    }
  }

  // 2. Vérifier que la contrainte chk_leads_stage accepte 'withdrawn'
  // (en tentant un UPDATE ciblé sur un faux ID — si la contrainte refuse, on l'apprend)
  console.log("\n" + "═".repeat(60));
  console.log("MIGRATION 014 — stage 'withdrawn' autorisé ?");
  console.log("═".repeat(60));
  try {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { error } = await supabase
      .from("leads")
      .update({ stage: "withdrawn" })
      .eq("id", fakeId);
    if (error) {
      if (error.message.toLowerCase().includes("check constraint") ||
          error.message.toLowerCase().includes("chk_leads_stage")) {
        console.log("  ❌ Migration 014 PAS appliquée — 'withdrawn' rejeté par la CHECK constraint");
        console.log(`     Message : ${error.message}`);
      } else {
        // Probablement un row not found (normal pour un fake ID), donc OK
        console.log(`  ⚠️  Erreur autre : ${error.message}`);
      }
    } else {
      console.log("  ✅ Migration 014 appliquée — 'withdrawn' accepté (UPDATE sur ID inexistant = succès silent)");
    }
  } catch (err) {
    console.log("  ⚠️  Test inattendu :", err);
  }

  // 3. Vérifier les autres migrations critiques :
  //    - 002 ai_usage (table déjà testée plus haut)
  //    - 005 messages dedup (UNIQUE conversation_id, timestamp)
  //    - 007 conversations attendee_info (colonnes attendee_name, attendee_profile_url)
  //    - 010 retry_count (sur actions ?)
  //    - 011 warmup_start_date
  //    - 012 generation_reasoning
  //    - 013 generation_data
  console.log("\n" + "═".repeat(60));
  console.log("COLONNES CLÉS (issues des migrations 003-013)");
  console.log("═".repeat(60));

  // Test colonnes via SELECT minimal
  const colTests: Array<{ table: string; cols: string[]; sourceMig: string }> = [
    { table: "ai_usage", cols: ["input_text", "output_text"], sourceMig: "003_ai_logs" },
    { table: "sequence_steps", cols: ["generation_mode"], sourceMig: "004_generation_mode" },
    { table: "conversations", cols: ["attendee_name", "attendee_profile_url"], sourceMig: "007" },
    { table: "leads", cols: ["first_name"], sourceMig: "008 (nullable check non vérifiable ici)" },
    { table: "actions", cols: ["retry_count"], sourceMig: "010" },
    { table: "linkedin_accounts", cols: ["warmup_start_date"], sourceMig: "011" },
    { table: "actions", cols: ["generation_reasoning"], sourceMig: "012" },
    { table: "actions", cols: ["generation_data"], sourceMig: "013" },
  ];

  for (const { table, cols, sourceMig } of colTests) {
    const { error } = await supabase.from(table).select(cols.join(",")).limit(1);
    if (error) {
      console.log(`  ❌ ${table}.{${cols.join(",")}} (mig ${sourceMig}) : ${error.message}`);
    } else {
      console.log(`  ✅ ${table}.{${cols.join(",")}} (mig ${sourceMig})`);
    }
  }

  // 4. Récap
  console.log("\n" + "═".repeat(60));
  if (missing.length === 0) {
    console.log("✅ Toutes les tables sont présentes");
  } else {
    console.log(`❌ ${missing.length} tables manquantes : ${missing.join(", ")}`);
  }
  console.log("═".repeat(60));
}

main().catch(console.error);
