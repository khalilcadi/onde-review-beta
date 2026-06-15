import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { type LeadForGeneration } from "@/lib/ai/lead-context";
import { scoreLead } from "@/lib/ai/scoring";

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { lead } = body as { lead: LeadForGeneration };

    if (!lead || !lead.firstName || !lead.lastName) {
      return NextResponse.json(
        { error: "Données lead manquantes (firstName, lastName requis)" },
        { status: 400 }
      );
    }

    const result = await scoreLead(lead, user.id, supabase);

    if (!result) {
      return NextResponse.json(
        { error: "Erreur de parsing du résultat de scoring" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Score API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du scoring du lead",
      },
      { status: 500 }
    );
  }
}
