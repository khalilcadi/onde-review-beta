import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await sb
  .from("leads")
  .select("id, first_name, last_name, title, company, tags, score, enrichment_data")
  .not("enrichment_data", "is", null)
  .order("score", { ascending: false })
  .limit(100);

if (error) throw error;

const results = (data || []).filter((l) => {
  const t = (l.title || "").toLowerCase();
  const c = (l.company || "").toLowerCase();
  const ed = (l.enrichment_data || {}) as Record<string, unknown>;
  const ind = ((ed.company as Record<string, string> | undefined)?.industry || "").toLowerCase();

  const isESN =
    c.includes("esn") || c.includes("ssii") ||
    ind.includes("information technology") || ind.includes("it services") ||
    ind.includes("software") || ind.includes("informatique") ||
    c.includes("consulting") || c.includes("conseil") ||
    c.includes("tech") || c.includes("digital") ||
    c.includes("solutions") || c.includes("systèmes");

  const isDecideur =
    t.includes("directeur") || t.includes("founder") ||
    t.includes("fondateur") || t.includes("ceo") ||
    t.includes("dg") || t.includes("associé") ||
    t.includes("partner") || t.includes("head of") ||
    t.includes("président") || t.includes("gérant") ||
    t.includes("manager");

  const hasLinkedinPosts =
    Array.isArray(ed.linkedin_posts) && (ed.linkedin_posts as unknown[]).length > 0;

  return isESN && isDecideur && hasLinkedinPosts;
});

console.log(`\nTrouvé ${results.length} leads ICP avec posts LinkedIn :\n`);
results.slice(0, 15).forEach((l) => {
  const ed = (l.enrichment_data || {}) as Record<string, unknown>;
  const posts = (ed.linkedin_posts as unknown[] | undefined)?.length ?? 0;
  const hasDossier = !!(ed.dossier);
  console.log(
    `${l.id} | score=${l.score} | ${l.first_name} ${l.last_name} | ${l.title} | ${l.company} | posts=${posts} | dossier=${hasDossier ? "✓" : "✗"}`
  );
});
}

main().catch((e) => { console.error(e); process.exit(1); });
