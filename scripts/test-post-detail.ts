/**
 * Test: récupérer toutes les données disponibles sur un post LinkedIn via Unipile.
 *
 * Usage:
 *   npx tsx scripts/test-post-detail.ts <post-urn-or-url>
 *
 * Example:
 *   npx tsx scripts/test-post-detail.ts "urn:li:activity:7462779318402740224"
 *   npx tsx scripts/test-post-detail.ts "linkedin.com/feed/update/urn:li:activity:7462779318402740224"
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const input = process.argv[2] || "urn:li:activity:7462779318402740224";

  // Extraire l'URN depuis une URL ou une URN directe
  const urnMatch = input.match(/(urn:li:activity:\d+)/);
  const urn = urnMatch ? urnMatch[1] : input;
  const activityId = urn.replace("urn:li:activity:", "");

  const apiKey = process.env.UNIPILE_API_KEY;
  const dsn = process.env.UNIPILE_DSN || "api1.unipile.com:13111";

  if (!apiKey) {
    console.error("Missing UNIPILE_API_KEY in .env.local");
    process.exit(1);
  }

  const baseUrl = `https://${dsn}/api/v1`;

  async function rawFetch(path: string, params: Record<string, string> = {}, method = "GET") {
    const url = new URL(`${baseUrl}${path}`);
    if (method === "GET") {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "X-API-KEY": apiKey!,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    return { status: res.status, ok: res.ok, json, text };
  }

  // 0. Auto-detect account
  const accountsRes = await rawFetch("/accounts");
  const accounts = (accountsRes.json as { items?: unknown[] })?.items || accountsRes.json as unknown[] || [];
  let accountId = "";
  if (Array.isArray(accounts) && accounts.length > 0) {
    const linkedinAcc = accounts.find(
      (a: unknown) => (a as { provider?: string; status?: string }).provider === "LINKEDIN"
    ) || accounts[0];
    accountId = (linkedinAcc as { id: string }).id;
  }
  if (!accountId) {
    console.error("No Unipile account found.");
    process.exit(1);
  }
  console.log(`Account ID: ${accountId}`);
  console.log(`Post URN: ${urn}`);
  console.log(`Activity ID: ${activityId}`);
  console.log("─".repeat(60));

  // Formats d'ID à tester
  const candidates = [
    urn,                                     // urn:li:activity:7462779318402740224
    activityId,                              // 7462779318402740224
    encodeURIComponent(urn),                 // urn%3Ali%3Aactivity%3A...
  ];

  // ── 1. GET /posts/{id} — variantes ──
  console.log("\n1) GET /posts/{id} — variantes");
  for (const id of candidates) {
    const r = await rawFetch(`/posts/${id}`, { account_id: accountId });
    console.log(`  /posts/${id.slice(0, 50)} → ${r.status} ${r.ok ? "✓" : "✗"}`);
    if (r.ok) {
      console.log("  ┌─ Clés disponibles:", Object.keys(r.json as object));
      console.log("  └─ Données complètes:");
      console.log(JSON.stringify(r.json, null, 2));
    } else {
      console.log("  └─ Erreur:", r.text.slice(0, 200));
    }
  }

  // ── 2. GET /posts/{id} sans account_id ──
  console.log("\n2) GET /posts/{id} sans account_id");
  for (const id of candidates.slice(0, 2)) {
    const r = await rawFetch(`/posts/${id}`);
    console.log(`  /posts/${id.slice(0, 50)} → ${r.status} ${r.ok ? "✓" : "✗"}`);
    if (r.ok) {
      console.log("  ┌─ Clés:", Object.keys(r.json as object));
      console.log("  └─", JSON.stringify(r.json, null, 2));
    } else {
      console.log("  └─ Erreur:", r.text.slice(0, 200));
    }
  }

  // ── 3. GET /posts/{id}/comments ──
  console.log("\n3) GET /posts/{id}/comments");
  for (const id of candidates.slice(0, 2)) {
    const r = await rawFetch(`/posts/${id}/comments`, { account_id: accountId, limit: "20" });
    console.log(`  /posts/${id.slice(0, 50)}/comments → ${r.status} ${r.ok ? "✓" : "✗"}`);
    if (r.ok) {
      const items = (r.json as { items?: unknown[] })?.items || [];
      console.log(`  ┌─ ${Array.isArray(items) ? items.length : "?"} commentaire(s)`);
      if (Array.isArray(items) && items.length > 0) {
        console.log("  ├─ Clés d'un commentaire:", Object.keys(items[0] as object));
        console.log("  └─ Commentaires:");
        console.log(JSON.stringify(items, null, 2));
      }
    } else {
      console.log("  └─ Erreur:", r.text.slice(0, 200));
    }
  }

  // ── 4. GET /posts/{id}/reactions ──
  console.log("\n4) GET /posts/{id}/reactions");
  for (const id of candidates.slice(0, 2)) {
    const r = await rawFetch(`/posts/${id}/reactions`, { account_id: accountId, limit: "50" });
    console.log(`  /posts/${id.slice(0, 50)}/reactions → ${r.status} ${r.ok ? "✓" : "✗"}`);
    if (r.ok) {
      const items = (r.json as { items?: unknown[] })?.items || [];
      console.log(`  ┌─ ${Array.isArray(items) ? items.length : "?"} réaction(s)`);
      if (Array.isArray(items) && items.length > 0) {
        console.log("  ├─ Clés d'une réaction:", Object.keys(items[0] as object));
        // Compter par type
        const byType: Record<string, number> = {};
        for (const reaction of items as { type?: string }[]) {
          const t = reaction.type || "unknown";
          byType[t] = (byType[t] || 0) + 1;
        }
        console.log("  ├─ Breakdown par type:", byType);
        console.log("  └─ Premières réactions:");
        console.log(JSON.stringify((items as unknown[]).slice(0, 3), null, 2));
      }
    } else {
      console.log("  └─ Erreur:", r.text.slice(0, 200));
    }
  }

  // ── 5. GET /users/posts (own posts — chercher ce post) ──
  console.log("\n5) GET /users/posts — chercher dans ses propres posts");
  const ownPosts = await rawFetch("/users/posts", { account_id: accountId, limit: "20" });
  console.log(`  Status: ${ownPosts.status} ${ownPosts.ok ? "✓" : "✗"}`);
  if (ownPosts.ok) {
    const items = (ownPosts.json as { items?: unknown[] })?.items || [];
    console.log(`  ${Array.isArray(items) ? items.length : "?"} post(s) récupéré(s)`);
    if (Array.isArray(items) && items.length > 0) {
      console.log("  Clés disponibles sur un post:", Object.keys(items[0] as object));
      // Chercher le post cible
      const target = items.find((p: unknown) => {
        const ps = p as { id?: string; social_id?: string };
        return ps.id?.includes(activityId) || ps.social_id?.includes(activityId) || ps.id === urn;
      });
      if (target) {
        console.log("  ✓ Post cible trouvé:");
        console.log(JSON.stringify(target, null, 2));
      } else {
        console.log("  Post cible non trouvé dans les 20 premiers. Premiers posts:");
        console.log(JSON.stringify(items.slice(0, 2), null, 2));
      }
    }
  } else {
    console.log("  Erreur:", ownPosts.text.slice(0, 200));
  }

  // ── 6. LinkedIn raw endpoint ──
  console.log("\n6) GET /linkedin/raw — post via API native LinkedIn");
  const rawEndpoints = [
    `/linkedin/raw?account_id=${accountId}&url=${encodeURIComponent(`https://www.linkedin.com/feed/update/${urn}/`)}`,
    `/linkedin/raw?account_id=${accountId}&url=${encodeURIComponent(`https://www.linkedin.com/feed/update/${urn}/&type=MAIN_FEED`)}`,
  ];
  for (const endpoint of rawEndpoints) {
    const url = new URL(`${baseUrl}${endpoint.split("?")[0]}`);
    const qsMatch = endpoint.match(/\?(.+)/);
    if (qsMatch) {
      for (const part of qsMatch[1].split("&")) {
        const [k, v] = part.split("=");
        url.searchParams.set(decodeURIComponent(k), decodeURIComponent(v));
      }
    }
    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": apiKey!, Accept: "application/json" },
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    console.log(`  ${url.pathname}${url.search.slice(0, 60)}... → ${res.status} ${res.ok ? "✓" : "✗"}`);
    if (res.ok) {
      console.log("  Clés:", json && typeof json === 'object' ? Object.keys(json as object) : "N/A");
      console.log(JSON.stringify(json, null, 2).slice(0, 500));
    } else {
      console.log("  Erreur:", text.slice(0, 200));
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("RÉSUMÉ — Données récupérables sur ce post:");
  console.log("  • Texte du post");
  console.log("  • Timestamp de publication");
  console.log("  • Nombre de réactions (reactions_count)");
  console.log("  • Nombre de commentaires (comments_count)");
  console.log("  • Liste des réactions avec profil + type");
  console.log("  • Liste des commentaires avec auteur + texte");
  console.log("  ✗ Impressions (vues) — non exposées par Unipile");
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message ?? err);
  process.exit(1);
});
