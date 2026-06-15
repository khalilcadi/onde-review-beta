/**
 * Script: Withdraw Khalil's pending LinkedIn invitations older than 14 days.
 *
 * For each matched lead:
 *   1. Cancel the invitation on LinkedIn via Unipile (DELETE /users/invite/sent/{id})
 *   2. Update lead.stage -> 'withdrawn'
 *   3. Add tag `relance:YYYY-MM-DD` (today + 30 days) for manual relaunch
 *
 * Default behaviour is DRY RUN. Pass --apply to actually execute.
 *
 * Usage:
 *   npx tsx scripts/withdraw-khalil-old-invitations.ts            # dry run
 *   npx tsx scripts/withdraw-khalil-old-invitations.ts --apply    # execute
 *   npx tsx scripts/withdraw-khalil-old-invitations.ts --apply --limit 1
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const KHALIL_USER_ID = "14a0eedc-b156-45ab-b2c0-47eb990f4c84";
const KHALIL_ACCOUNT_ID = "8bGZCi3mQw2LgAiGGuInqw";
const AGE_THRESHOLD_DAYS = 14;
const RELAUNCH_DAYS = 30;

const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN}/api/v1`;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!;

interface UnipileInvitation {
  id: string;
  object?: string;
  date?: string;
  parsed_datetime?: string;
  invitation_text?: string | null;
  invited_user?: string;
  invited_user_id?: string;
  invited_user_public_id?: string;
}

interface UnipilePaginated<T> {
  items: T[];
  cursor?: string | null;
  object?: string;
}

async function unipileFetch<T>(
  method: "GET" | "DELETE",
  path: string,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${UNIPILE_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { "X-API-KEY": UNIPILE_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Unipile ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  // Some DELETE responses may be empty
  const text = await res.text();
  return (text ? JSON.parse(text) : ({} as T)) as T;
}

function extractIdentifier(linkedinUrl: string | null | undefined): string | null {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1].replace(/\/$/, "").toLowerCase() : null;
}

async function fetchAllSentInvitations(): Promise<UnipileInvitation[]> {
  const all: UnipileInvitation[] = [];
  let cursor: string | null | undefined;
  let page = 0;
  do {
    const params: Record<string, string | number | undefined> = {
      account_id: KHALIL_ACCOUNT_ID,
      limit: 100,
    };
    if (cursor) params.cursor = cursor;
    const resp = await unipileFetch<UnipilePaginated<UnipileInvitation>>(
      "GET",
      "/users/invite/sent",
      params
    );
    all.push(...(resp.items ?? []));
    cursor = resp.cursor;
    page++;
    if (page > 50) {
      console.error("⚠️  Pagination break (>50 pages, safety stop)");
      break;
    }
  } while (cursor);
  return all;
}

interface PendingLead {
  lead_id: string;
  full_name: string;
  company: string;
  linkedin_url: string;
  identifier: string | null;
  sent_at: Date;
  age_days: number;
  current_tags: string[] | null;
}

async function fetchOldPendingLeads(supabase: SupabaseClient): Promise<PendingLead[]> {
  const { data, error } = await supabase
    .from("actions")
    .select(
      `
      sent_at,
      lead:leads!inner(id, first_name, last_name, company, linkedin_url, stage, tags)
    `
    )
    .eq("user_id", KHALIL_USER_ID)
    .eq("action_type", "invitation")
    .eq("status", "sent")
    .order("sent_at", { ascending: true });

  if (error || !data) {
    throw new Error(`DB error: ${error?.message}`);
  }

  const now = Date.now();
  const thresholdMs = AGE_THRESHOLD_DAYS * 86400000;
  const result: PendingLead[] = [];

  for (const row of data as any[]) {
    if (!row.sent_at) continue;
    const lead = row.lead;
    if (!lead || lead.stage !== "invited") continue;
    const sentAt = new Date(row.sent_at);
    const ageMs = now - sentAt.getTime();
    if (ageMs < thresholdMs) continue;
    result.push({
      lead_id: lead.id,
      full_name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
      company: lead.company ?? "",
      linkedin_url: lead.linkedin_url ?? "",
      identifier: extractIdentifier(lead.linkedin_url),
      sent_at: sentAt,
      age_days: Math.floor(ageMs / 86400000),
      current_tags: lead.tags ?? null,
    });
  }
  return result;
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9 ]/g, " ") // strip emojis/symbols
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildInvitationIndex(
  invitations: UnipileInvitation[]
): Map<string, UnipileInvitation[]> {
  // DB stores voyager URN (ACwAAA...) but Unipile returns ACoAAA URN + public_id.
  // No direct mapping, so we match on normalized full name (multiple invitations
  // per name are possible -> store list and disambiguate by date).
  const byName = new Map<string, UnipileInvitation[]>();
  for (const inv of invitations) {
    const key = normalizeName(inv.invited_user ?? "");
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(inv);
    byName.set(key, list);
  }
  return byName;
}

function findInvitation(
  candidate: PendingLead,
  byName: Map<string, UnipileInvitation[]>
): UnipileInvitation | null {
  const key = normalizeName(candidate.full_name);
  const list = byName.get(key);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  // Disambiguate by closest parsed_datetime to action.sent_at
  let best: UnipileInvitation | null = null;
  let bestDelta = Infinity;
  for (const inv of list) {
    if (!inv.parsed_datetime) continue;
    const delta = Math.abs(
      new Date(inv.parsed_datetime).getTime() - candidate.sent_at.getTime()
    );
    if (delta < bestDelta) {
      bestDelta = delta;
      best = inv;
    }
  }
  return best;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const limitArg = process.argv.find((a) => a.startsWith("--limit"));
  const LIMIT = limitArg ? parseInt(limitArg.split("=")[1] ?? "0", 10) : 0;

  console.log("=".repeat(72));
  console.log(`Mode: ${APPLY ? "🔴 APPLY (live)" : "🟢 DRY RUN"}`);
  console.log(`User: Khalil  |  Threshold: > ${AGE_THRESHOLD_DAYS} days`);
  console.log(`Relaunch tag: relance:${addDaysISO(new Date(), RELAUNCH_DAYS)}`);
  if (LIMIT > 0) console.log(`Limit: first ${LIMIT} leads only`);
  console.log("=".repeat(72));

  if (!UNIPILE_API_KEY || !process.env.UNIPILE_DSN) {
    console.error("❌ Missing UNIPILE_API_KEY or UNIPILE_DSN in .env.local");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch leads to withdraw
  console.log("\n📋 Fetching pending invitations from DB...");
  const candidates = await fetchOldPendingLeads(supabase);
  console.log(`   Found ${candidates.length} leads (stage=invited, sent > ${AGE_THRESHOLD_DAYS}d ago)`);

  // 2. Fetch all sent invitations from Unipile (to get invitation IDs)
  console.log("\n📡 Fetching sent invitations from Unipile (paginated)...");
  const invitations = await fetchAllSentInvitations();
  console.log(`   Got ${invitations.length} sent invitations from Unipile`);
  const idx = buildInvitationIndex(invitations);
  console.log(`   Built name-index: ${idx.size} unique names`);

  // 3. Match
  type Match = {
    candidate: PendingLead;
    invitation_id: string | null;
    note: string;
  };
  const matches: Match[] = [];
  for (const c of candidates) {
    const inv = findInvitation(c, idx);
    if (!inv) {
      matches.push({
        candidate: c,
        invitation_id: null,
        note: "no matching Unipile invitation (probably already accepted)",
      });
      continue;
    }
    matches.push({ candidate: c, invitation_id: inv.id, note: "ok" });
  }

  const matched = matches.filter((m) => m.invitation_id);
  const unmatched = matches.filter((m) => !m.invitation_id);

  console.log(`\n✅ Matched (will withdraw): ${matched.length}`);
  console.log(`⚠️  Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log("\n--- Unmatched leads (no Unipile invitation found) ---");
    for (const m of unmatched) {
      console.log(
        `  - ${m.candidate.full_name.padEnd(32)} (${m.candidate.age_days}d) ${m.note}`
      );
    }
  }

  console.log("\n--- Withdraw plan ---");
  for (const m of matched) {
    console.log(
      `  ${m.candidate.full_name.padEnd(32)} | ${String(m.candidate.age_days).padStart(2)}d | inv=${m.invitation_id}`
    );
  }

  if (!APPLY) {
    console.log("\n🟢 DRY RUN — no changes made. Re-run with --apply to execute.");
    return;
  }

  // 4. Apply: withdraw + update DB
  const targets = LIMIT > 0 ? matched.slice(0, LIMIT) : matched;
  const relaunchTag = `relance:${addDaysISO(new Date(), RELAUNCH_DAYS)}`;
  let success = 0;
  let failed = 0;

  console.log(`\n🔴 APPLYING on ${targets.length} leads...`);

  for (const m of targets) {
    const c = m.candidate;
    try {
      // 1. Cancel Unipile invitation
      await unipileFetch<unknown>(
        "DELETE",
        `/users/invite/sent/${m.invitation_id}`,
        { account_id: KHALIL_ACCOUNT_ID }
      );

      // 2. Update lead in DB
      const newTags = Array.from(
        new Set([...(c.current_tags ?? []), "withdrawn", relaunchTag])
      );
      const { error: upErr } = await supabase
        .from("leads")
        .update({ stage: "withdrawn", tags: newTags })
        .eq("id", c.lead_id);

      if (upErr) throw new Error(`DB update: ${upErr.message}`);

      success++;
      console.log(`  ✅ ${c.full_name.padEnd(32)} withdrawn + tagged`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${c.full_name.padEnd(32)} ${msg.slice(0, 100)}`);
    }

    // Rate-limit politeness
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n===== SUMMARY =====");
  console.log(`  Success: ${success}`);
  console.log(`  Failed : ${failed}`);
  console.log(`  Tag relance: ${relaunchTag}`);
}

function addDaysISO(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
