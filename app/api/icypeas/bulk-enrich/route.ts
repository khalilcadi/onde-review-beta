import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { bulkSearch } from "@/lib/icypeas/client";

/**
 * POST /api/icypeas/bulk-enrich
 * Protected route: launches Icypeas bulk email search for leads missing email.
 * Results arrive asynchronously via webhook.
 */
export async function POST() {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Fetch leads owned by user: have firstName + lastName + company, but no email
    const { data: leads, error: dbError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, company, email, enrichment_data")
      .eq("user_id", user.id)
      .is("email", null)
      .not("first_name", "is", null)
      .not("last_name", "is", null);

    if (dbError) {
      console.error("[Bulk Enrich] DB error:", dbError.message);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ sent: 0, message: "Aucun lead éligible" });
    }

    // Filter: skip leads that already have email_enrichment data
    const eligible = leads.filter((l) => {
      const enrichment = l.enrichment_data as Record<string, unknown> | null;
      return !enrichment?.email_enrichment;
    });

    if (eligible.length === 0) {
      return NextResponse.json({ sent: 0, message: "Tous les leads ont déjà été enrichis" });
    }

    // Build bulk data: [firstName, lastName, domain]
    const data: [string, string, string][] = [];
    const externalIds: string[] = [];

    for (const lead of eligible) {
      // Domain source: enrichment company website (priority) or lead.company (fallback)
      let domain: string | null = null;
      const enrichment = lead.enrichment_data as Record<string, unknown> | null;
      const company = enrichment?.company as Record<string, unknown> | undefined;
      const websiteUrl = company?.website as string | undefined;

      if (websiteUrl) {
        try {
          domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
        } catch {
          domain = websiteUrl.replace(/^www\./, "");
        }
      }

      if (!domain && lead.company) {
        domain = lead.company;
      }

      if (!domain || !lead.first_name || !lead.last_name) continue;

      data.push([lead.first_name, lead.last_name, domain]);
      externalIds.push(lead.id);
    }

    if (data.length === 0) {
      return NextResponse.json({ sent: 0, message: "Aucun lead avec domaine disponible" });
    }

    // Determine webhook URL
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL
        || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null)
        || "http://localhost:3000";
    const webhookUrl = `${baseUrl}/api/webhooks/icypeas`;

    console.log(`[Bulk Enrich] webhookUrl=${webhookUrl} (APP_URL=${process.env.NEXT_PUBLIC_APP_URL ?? "unset"}, VERCEL_URL=${process.env.NEXT_PUBLIC_VERCEL_URL ?? "unset"})`);

    const batchName = `Prospector batch ${new Date().toISOString().slice(0, 10)}`;
    const result = await bulkSearch(batchName, data, externalIds, webhookUrl);

    if (!result) {
      return NextResponse.json({ error: "Icypeas bulk search failed" }, { status: 502 });
    }

    return NextResponse.json({
      sent: data.length,
      bulkFileId: result.file,
      message: `${data.length} lead${data.length > 1 ? "s" : ""} envoyé${data.length > 1 ? "s" : ""} pour enrichissement email`,
    });
  } catch (err) {
    console.error("[Bulk Enrich] Unexpected error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
