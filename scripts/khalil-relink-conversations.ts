/**
 * Khalil — Relink orphaned conversations
 * =======================================
 * Trouve les conversations Khalil avec lead_id=NULL, fetch les attendees via
 * Unipile getChatAttendees(), et tente de les rattacher à un lead par :
 *   1. Match par identifier LinkedIn (extrait de attendee.profile_url) — case-sensitive
 *   2. Fallback : match par nom complet (lowercased exact)
 *
 * Backfill aussi conversations.attendee_name et conversations.attendee_profile_url.
 *
 * Note : le type TS UnipileClient.getChatAttendees déclare Promise<UnipileAttendee[]>
 * mais l'API renvoie en réalité { object: "ChatAttendeeList", items: [...] }.
 * On caste défensivement.
 *
 * Flags :
 *   --apply              écrit en DB (sinon dry run)
 *   --delete-dead-chats  supprime les conversations dont le chat Unipile retourne
 *                        404 "Resource not found" (chats morts qui polluent la DB)
 *
 * Exemples :
 *   npx tsx scripts/khalil-relink-conversations.ts                          # dry run
 *   npx tsx scripts/khalil-relink-conversations.ts --apply                  # rattache
 *   npx tsx scripts/khalil-relink-conversations.ts --apply --delete-dead-chats
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const APPLY = process.argv.includes("--apply");
const DELETE_DEAD = process.argv.includes("--delete-dead-chats");
const DELETE_ALL_ORPHANS = process.argv.includes("--delete-all-orphans");

function extractLinkedInIdentifier(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].replace(/\/$/, "") : null; // case preserved
}

async function main() {
  console.log(
    `\n${APPLY ? "🔴 APPLY MODE" : "🟡 DRY RUN"} — relink orphaned conversations\n`
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { getUnipileClient } = await import("../lib/unipile/client");
  const unipile = getUnipileClient();

  // ── 1. Khalil's LinkedIn account ─────────────────────────────────────────
  const { data: linkedinAccounts } = await supabase
    .from("linkedin_accounts")
    .select("unipile_account_id")
    .eq("user_id", KHALIL_USER_ID);
  if (!linkedinAccounts?.length) {
    console.error("❌ Pas de linkedin_account pour Khalil");
    process.exit(1);
  }
  const accountId = linkedinAccounts[0].unipile_account_id;
  console.log(`✅ Compte Unipile : ${accountId}`);

  // ── 2. Récupère les conversations orphelines ─────────────────────────────
  const { data: orphans, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel, unipile_chat_id, attendee_name, attendee_profile_url, updated_at")
    .eq("user_id", KHALIL_USER_ID)
    .is("lead_id", null);

  if (convErr) {
    console.error("❌ Erreur lecture conversations :", convErr.message);
    process.exit(1);
  }
  if (!orphans?.length) {
    console.log("✅ Aucune conversation orpheline. Rien à faire.");
    return;
  }
  console.log(`📋 ${orphans.length} conversations orphelines trouvées`);

  // ── 3. Récupère tous les leads de Khalil pour les indexer ────────────────
  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, linkedin_url")
    .eq("user_id", KHALIL_USER_ID);
  if (!leads?.length) {
    console.error("❌ Aucun lead pour Khalil");
    process.exit(1);
  }
  console.log(`✅ ${leads.length} leads indexés pour matching`);

  // Index par identifier (case-sensitive AND lowercase fallback)
  const leadByIdentifier = new Map<string, string>();
  // Index par nom complet (lowercased)
  const leadByFullName = new Map<string, string[]>(); // valeurs en array pour détecter ambiguïtés
  for (const lead of leads) {
    const id = extractLinkedInIdentifier(lead.linkedin_url);
    if (id) {
      leadByIdentifier.set(id, lead.id);
      leadByIdentifier.set(id.toLowerCase(), lead.id);
    }
    const name = `${(lead.first_name || "").trim()} ${(lead.last_name || "").trim()}`.trim().toLowerCase();
    if (name) {
      const list = leadByFullName.get(name) || [];
      list.push(lead.id);
      leadByFullName.set(name, list);
    }
  }

  // ── 4. Pour chaque orpheline, fetch attendees + tente match ──────────────
  type Result = {
    convId: string;
    chatId: string;
    attendeeName: string | null;
    attendeeUrl: string | null;
    matchType: "by_identifier" | "by_name" | "none" | "ambiguous" | "api_error" | "dead_chat";
    matchedLeadId: string | null;
    matchedLeadName: string | null;
    note?: string;
  };
  const results: Result[] = [];

  type AttendeesResponse = {
    object?: string;
    items?: Array<{
      name?: string;
      profile_url?: string;
      is_self?: boolean | number;
      provider_id?: string;
    }>;
  };

  console.log("\n📡 Fetch attendees Unipile + matching…\n");
  for (let i = 0; i < orphans.length; i++) {
    const conv = orphans[i];
    const result: Result = {
      convId: conv.id,
      chatId: conv.unipile_chat_id || "(no chat_id)",
      attendeeName: conv.attendee_name,
      attendeeUrl: conv.attendee_profile_url,
      matchType: "none",
      matchedLeadId: null,
      matchedLeadName: null,
    };

    // Si on a déjà attendee_name/url en DB, on n'appelle pas l'API
    let attendeeName = conv.attendee_name;
    let attendeeUrl = conv.attendee_profile_url;

    if ((!attendeeName || !attendeeUrl) && conv.unipile_chat_id) {
      try {
        // Type-defensive : l'API renvoie { items: [...] } mais le type TS dit Promise<UnipileAttendee[]>
        const raw = (await unipile.getChatAttendees(
          conv.unipile_chat_id
        )) as unknown as AttendeesResponse;
        const items = raw.items || [];
        // Le "lead" = celui qui n'est pas is_self (peut être boolean false ou number 0)
        const lead = items.find((a) => !a.is_self);
        if (lead) {
          attendeeName = attendeeName || lead.name || null;
          attendeeUrl = attendeeUrl || lead.profile_url || null;
          result.attendeeName = attendeeName;
          result.attendeeUrl = attendeeUrl;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Resource not found = chat mort côté Unipile
        if (msg.toLowerCase().includes("resource not found")) {
          result.matchType = "dead_chat";
          result.note = "chat introuvable côté Unipile (supprimé ou expiré)";
        } else {
          result.matchType = "api_error";
          result.note = msg;
        }
        results.push(result);
        const icon = result.matchType === "dead_chat" ? "💀" : "❌";
        process.stdout.write(
          `  [${i + 1}/${orphans.length}] ${icon} ${result.note}\n`
        );
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
    }

    // Tentative 1 : match par identifier LinkedIn (case-sensitive d'abord)
    const id = extractLinkedInIdentifier(attendeeUrl);
    if (id) {
      const leadId = leadByIdentifier.get(id) || leadByIdentifier.get(id.toLowerCase());
      if (leadId) {
        const lead = leads.find((l) => l.id === leadId)!;
        result.matchType = "by_identifier";
        result.matchedLeadId = leadId;
        result.matchedLeadName = `${lead.first_name} ${lead.last_name}`;
      }
    }

    // Tentative 2 : match par nom complet
    if (!result.matchedLeadId && attendeeName) {
      const key = attendeeName.trim().toLowerCase();
      const matches = leadByFullName.get(key);
      if (matches && matches.length === 1) {
        const lead = leads.find((l) => l.id === matches[0])!;
        result.matchType = "by_name";
        result.matchedLeadId = matches[0];
        result.matchedLeadName = `${lead.first_name} ${lead.last_name}`;
      } else if (matches && matches.length > 1) {
        result.matchType = "ambiguous";
        result.note = `${matches.length} leads avec le même nom`;
      }
    }

    results.push(result);

    // Affichage progressif
    const icon =
      result.matchType === "by_identifier"
        ? "✅"
        : result.matchType === "by_name"
        ? "✅"
        : result.matchType === "ambiguous"
        ? "⚠️ "
        : "—";
    process.stdout.write(
      `  [${i + 1}/${orphans.length}] ${icon} ${(attendeeName || "(no name)").padEnd(28)} → ${
        result.matchedLeadName || result.note || "no match"
      }\n`
    );

    // Rate limit Unipile
    await new Promise((r) => setTimeout(r, 400));
  }

  // ── 5. Récap ─────────────────────────────────────────────────────────────
  const matched = results.filter((r) => r.matchedLeadId);
  const unmatched = results.filter((r) => !r.matchedLeadId);
  console.log("\n" + "═".repeat(80));
  console.log(`📊 RÉSULTATS`);
  console.log("═".repeat(80));
  console.log(`Matchées (rattachables) : ${matched.length}`);
  console.log(`  • par identifier      : ${matched.filter((r) => r.matchType === "by_identifier").length}`);
  console.log(`  • par nom             : ${matched.filter((r) => r.matchType === "by_name").length}`);
  console.log(`Non matchées            : ${unmatched.length}`);
  console.log(`  • ambiguës            : ${unmatched.filter((r) => r.matchType === "ambiguous").length}`);
  console.log(`  • api error           : ${unmatched.filter((r) => r.matchType === "api_error").length}`);
  console.log(`  • dead chat (404)     : ${unmatched.filter((r) => r.matchType === "dead_chat").length}`);
  console.log(`  • aucun match         : ${unmatched.filter((r) => r.matchType === "none").length}`);

  if (matched.length > 0) {
    console.log("\n✅ Détail des conversations qui seront rattachées :");
    for (const r of matched) {
      console.log(
        `  • ${r.attendeeName || "(no name)"} → ${r.matchedLeadName} [${r.matchType}]`
      );
    }
  }

  if (unmatched.length > 0) {
    console.log("\n⚠️  Conversations qui resteront orphelines :");
    for (const r of unmatched) {
      console.log(
        `  • chat=${r.chatId.slice(0, 12)}… name="${r.attendeeName || "(none)"}" url="${
          r.attendeeUrl || "(none)"
        }" → ${r.matchType}${r.note ? ` (${r.note})` : ""}`
      );
    }
  }

  // ── 6. Apply ─────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log("\n🟡 DRY RUN — aucune écriture en DB");
    console.log("    Pour appliquer : `npx tsx scripts/khalil-relink-conversations.ts --apply`");
    return;
  }

  console.log("\n🔴 APPLY MODE — écriture en cours…");
  let updates = 0;
  let errors = 0;
  for (const r of matched) {
    const update: Record<string, unknown> = { lead_id: r.matchedLeadId };
    if (r.attendeeName) update.attendee_name = r.attendeeName;
    if (r.attendeeUrl) update.attendee_profile_url = r.attendeeUrl;
    update.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from("conversations")
      .update(update)
      .eq("id", r.convId);
    if (error) {
      console.error(`  ❌ ${r.attendeeName}: ${error.message}`);
      errors++;
    } else {
      updates++;
    }
  }
  console.log(`  ✅ ${updates}/${matched.length} conversations rattachées (${errors} erreurs)`);

  // Optionnel : suppression des conversations qui ne sont pas matchées
  // --delete-dead-chats     → seulement les dead chats (404 Unipile)
  // --delete-all-orphans    → toutes les non-matchées (dead + no-match + ambiguous + api_error)
  if (DELETE_DEAD || DELETE_ALL_ORPHANS) {
    const toDelete = DELETE_ALL_ORPHANS
      ? results.filter((r) => !r.matchedLeadId)
      : results.filter((r) => r.matchType === "dead_chat");
    if (toDelete.length > 0) {
      const ids = toDelete.map((r) => r.convId);
      // Suppression des messages liés d'abord (pas de cascade implicite à coup sûr)
      const { error: msgErr } = await supabase
        .from("messages")
        .delete()
        .in("conversation_id", ids);
      if (msgErr) {
        console.error(`  ❌ Erreur suppression messages : ${msgErr.message}`);
      }
      const { error: convDelErr } = await supabase
        .from("conversations")
        .delete()
        .in("id", ids);
      if (convDelErr) {
        console.error(`  ❌ Erreur suppression conversations : ${convDelErr.message}`);
      } else {
        const label = DELETE_ALL_ORPHANS ? "orphelines" : "dead chats";
        console.log(`  ✅ ${toDelete.length} ${label} supprimées (conversations + messages)`);
      }
    }
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
