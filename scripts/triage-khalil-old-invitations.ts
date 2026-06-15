/**
 * Script: Triage Khalil's pending invitations (>14d) into 3 buckets:
 *
 *   ACCEPTED  -> lead is in 1st-degree relations
 *                  -> sync DB stage to 'connected'
 *   PENDING   -> still in Unipile sent invitations
 *                  -> withdraw via Unipile + stage='withdrawn' + relance tag
 *   GONE      -> not in relations and not in sent (expired/declined)
 *                  -> stage='withdrawn' + relance tag (no API call)
 *
 * Default: DRY RUN. Use --apply to execute.
 *   --bucket=accepted|pending|gone|all  to filter what to apply (default: all)
 *
 * Usage:
 *   npx tsx scripts/triage-khalil-old-invitations.ts
 *   npx tsx scripts/triage-khalil-old-invitations.ts --apply
 *   npx tsx scripts/triage-khalil-old-invitations.ts --apply --bucket=accepted
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

interface UnipileSentInvitation {
  id: string;
  invited_user?: string;
  parsed_datetime?: string;
}

interface UnipileRelation {
  first_name?: string;
  last_name?: string;
  public_identifier?: string;
  member_id?: string;
}

interface PendingLead {
  lead_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  company: string;
  linkedin_url: string;
  sent_at: Date;
  age_days: number;
  current_tags: string[] | null;
}

interface UnipileProfile {
  network_distance?: string | null;
  is_relationship?: boolean;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
}

function extractIdentifier(linkedinUrl: string | null | undefined): string | null {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1].replace(/\/$/, "") : null;
}

function isFirstDegree(nd: string | null | undefined): boolean {
  if (!nd) return false;
  const n = nd.toUpperCase().trim();
  return ["FIRST", "FIRST_DEGREE", "DISTANCE_1", "1", "1ST"].includes(n);
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
  const text = await res.text();
  return (text ? JSON.parse(text) : ({} as T)) as T;
}

async function paginateAll<T>(
  path: string,
  baseParams: Record<string, string | number | undefined>
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null | undefined;
  let pages = 0;
  do {
    const params = { ...baseParams, limit: 100 } as Record<string, string | number | undefined>;
    if (cursor) params.cursor = cursor;
    const resp = await unipileFetch<{ items: T[]; cursor?: string | null }>(
      "GET",
      path,
      params
    );
    all.push(...(resp.items ?? []));
    cursor = resp.cursor;
    pages++;
    if (pages > 200) {
      console.error(`  ⚠️  Pagination break on ${path} (>200 pages)`);
      break;
    }
  } while (cursor);
  return all;
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function fetchOldPendingLeads(supabase: SupabaseClient): Promise<PendingLead[]> {
  const { data, error } = await supabase
    .from("actions")
    .select(
      `sent_at, lead:leads!inner(id, first_name, last_name, company, linkedin_url, stage, tags)`
    )
    .eq("user_id", KHALIL_USER_ID)
    .eq("action_type", "invitation")
    .eq("status", "sent")
    .order("sent_at", { ascending: true });

  if (error || !data) throw new Error(`DB error: ${error?.message}`);

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
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      full_name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
      company: lead.company ?? "",
      linkedin_url: lead.linkedin_url ?? "",
      sent_at: sentAt,
      age_days: Math.floor(ageMs / 86400000),
      current_tags: lead.tags ?? null,
    });
  }
  return result;
}

function addDaysISO(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Triaged {
  lead: PendingLead;
  bucket: "accepted" | "pending" | "gone";
  invitation_id?: string;
  relation_public_id?: string;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const bucketArg = process.argv.find((a) => a.startsWith("--bucket"));
  const BUCKET_FILTER = (bucketArg ? bucketArg.split("=")[1] : "all") as
    | "accepted"
    | "pending"
    | "gone"
    | "all";

  console.log("=".repeat(72));
  console.log(`Mode: ${APPLY ? "🔴 APPLY (live)" : "🟢 DRY RUN"}`);
  console.log(`User: Khalil  |  Threshold: > ${AGE_THRESHOLD_DAYS} days`);
  console.log(`Bucket filter: ${BUCKET_FILTER}`);
  console.log(`Relaunch tag: relance:${addDaysISO(new Date(), RELAUNCH_DAYS)}`);
  console.log("=".repeat(72));

  if (!UNIPILE_API_KEY || !process.env.UNIPILE_DSN) {
    console.error("❌ Missing UNIPILE_API_KEY or UNIPILE_DSN in .env.local");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("\n📋 Fetching pending invitation leads from DB...");
  const candidates = await fetchOldPendingLeads(supabase);
  console.log(`   ${candidates.length} leads (stage=invited, sent > ${AGE_THRESHOLD_DAYS}d ago)`);

  console.log("\n📡 Fetching Unipile sent invitations...");
  const sent = await paginateAll<UnipileSentInvitation>("/users/invite/sent", {
    account_id: KHALIL_ACCOUNT_ID,
  });
  console.log(`   ${sent.length} sent invitations`);

  console.log("\n📡 Fetching Unipile 1st-degree relations...");
  const relations = await paginateAll<UnipileRelation>("/users/relations", {
    account_id: KHALIL_ACCOUNT_ID,
  });
  console.log(`   ${relations.length} relations`);

  // Build name indexes
  const sentByName = new Map<string, UnipileSentInvitation[]>();
  for (const inv of sent) {
    const k = normalizeName(inv.invited_user ?? "");
    if (!k) continue;
    const list = sentByName.get(k) ?? [];
    list.push(inv);
    sentByName.set(k, list);
  }

  const relationsByName = new Map<string, UnipileRelation[]>();
  for (const r of relations) {
    const k = normalizeName(`${r.first_name ?? ""} ${r.last_name ?? ""}`);
    if (!k) continue;
    const list = relationsByName.get(k) ?? [];
    list.push(r);
    relationsByName.set(k, list);
  }

  console.log(`   Indexes: ${sentByName.size} sent names, ${relationsByName.size} relation names`);

  // Triage
  const triaged: Triaged[] = [];
  for (const lead of candidates) {
    const key = normalizeName(lead.full_name);
    const rels = relationsByName.get(key);
    if (rels && rels.length > 0) {
      triaged.push({ lead, bucket: "accepted", relation_public_id: rels[0].public_identifier });
      continue;
    }
    const invs = sentByName.get(key);
    if (invs && invs.length > 0) {
      // Disambiguate by date if multiple
      let pick = invs[0];
      if (invs.length > 1) {
        let best = Infinity;
        for (const i of invs) {
          if (!i.parsed_datetime) continue;
          const delta = Math.abs(new Date(i.parsed_datetime).getTime() - lead.sent_at.getTime());
          if (delta < best) {
            best = delta;
            pick = i;
          }
        }
      }
      triaged.push({ lead, bucket: "pending", invitation_id: pick.id });
      continue;
    }
    triaged.push({ lead, bucket: "gone" });
  }

  // Safety net: per-lead profile lookup on GONE bucket (relations list might be
  // out of sync; profile endpoint hits LinkedIn directly via Unipile).
  console.log(`\n🔍 Safety check: per-profile lookup on ${triaged.filter((t) => t.bucket === "gone").length} 'gone' leads...`);
  let promoted = 0;
  for (const t of triaged) {
    if (t.bucket !== "gone") continue;
    const id = extractIdentifier(t.lead.linkedin_url);
    if (!id) continue;
    try {
      const profile = await unipileFetch<UnipileProfile>(
        "GET",
        `/users/${id}`,
        { account_id: KHALIL_ACCOUNT_ID }
      );
      const connected = isFirstDegree(profile.network_distance) || profile.is_relationship === true;
      if (connected) {
        t.bucket = "accepted";
        t.relation_public_id = profile.public_identifier;
        promoted++;
        console.log(`  ⬆️  promoted to ACCEPTED: ${t.lead.full_name} (nd=${profile.network_distance})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠️  profile lookup failed for ${t.lead.full_name}: ${msg.slice(0, 80)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`   ${promoted} leads re-classified as ACCEPTED via direct profile check`);

  const accepted = triaged.filter((t) => t.bucket === "accepted");
  const pending = triaged.filter((t) => t.bucket === "pending");
  const gone = triaged.filter((t) => t.bucket === "gone");

  console.log("\n===== TRIAGE =====");
  console.log(`  ✅ ACCEPTED (sync to connected)        : ${accepted.length}`);
  console.log(`  🔵 PENDING  (withdraw + relance tag)   : ${pending.length}`);
  console.log(`  🟠 GONE     (no API call + relance)    : ${gone.length}`);

  console.log("\n--- ACCEPTED (already connected, will sync stage='connected') ---");
  for (const t of accepted) {
    console.log(
      `  ${t.lead.full_name.padEnd(34)} | ${String(t.lead.age_days).padStart(2)}d | rel=${t.relation_public_id}`
    );
  }

  console.log("\n--- PENDING (still on LinkedIn, will withdraw) ---");
  for (const t of pending) {
    console.log(
      `  ${t.lead.full_name.padEnd(34)} | ${String(t.lead.age_days).padStart(2)}d | inv=${t.invitation_id}`
    );
  }

  console.log("\n--- GONE (expired/declined, just mark withdrawn) ---");
  for (const t of gone) {
    console.log(
      `  ${t.lead.full_name.padEnd(34)} | ${String(t.lead.age_days).padStart(2)}d`
    );
  }

  if (!APPLY) {
    console.log("\n🟢 DRY RUN — no changes made. Re-run with --apply to execute.");
    return;
  }

  // Apply
  const relaunchTag = `relance:${addDaysISO(new Date(), RELAUNCH_DAYS)}`;
  const counters = { accepted: 0, pending: 0, gone: 0, failed: 0 };

  console.log(`\n🔴 APPLYING (filter=${BUCKET_FILTER})...`);

  for (const t of triaged) {
    if (BUCKET_FILTER !== "all" && BUCKET_FILTER !== t.bucket) continue;
    const c = t.lead;
    try {
      if (t.bucket === "accepted") {
        const { error } = await supabase
          .from("leads")
          .update({ stage: "connected" })
          .eq("id", c.lead_id);
        if (error) throw new Error(`DB: ${error.message}`);
        counters.accepted++;
        console.log(`  ✅ accepted->connected: ${c.full_name}`);
      } else if (t.bucket === "pending") {
        await unipileFetch<unknown>(
          "DELETE",
          `/users/invite/sent/${t.invitation_id}`,
          { account_id: KHALIL_ACCOUNT_ID }
        );
        const newTags = Array.from(
          new Set([...(c.current_tags ?? []), "withdrawn", relaunchTag])
        );
        const { error } = await supabase
          .from("leads")
          .update({ stage: "withdrawn", tags: newTags })
          .eq("id", c.lead_id);
        if (error) throw new Error(`DB: ${error.message}`);
        counters.pending++;
        console.log(`  🔵 pending->withdrawn: ${c.full_name}`);
        await new Promise((r) => setTimeout(r, 800));
      } else {
        const newTags = Array.from(
          new Set([...(c.current_tags ?? []), "withdrawn", relaunchTag])
        );
        const { error } = await supabase
          .from("leads")
          .update({ stage: "withdrawn", tags: newTags })
          .eq("id", c.lead_id);
        if (error) throw new Error(`DB: ${error.message}`);
        counters.gone++;
        console.log(`  🟠 gone->withdrawn: ${c.full_name}`);
      }
    } catch (err) {
      counters.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${c.full_name}: ${msg.slice(0, 100)}`);
    }
  }

  console.log("\n===== APPLY SUMMARY =====");
  console.log(`  Accepted synced  : ${counters.accepted}`);
  console.log(`  Pending withdrawn: ${counters.pending}`);
  console.log(`  Gone marked      : ${counters.gone}`);
  console.log(`  Failed           : ${counters.failed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
