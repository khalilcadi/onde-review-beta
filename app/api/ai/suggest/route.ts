import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/service";
import {
  buildLeadContext,
  type LeadForGeneration,
} from "@/lib/ai/lead-context";

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

    const { conversation, lead, currentSuggestion, feedback, m2Situation } =
      await req.json();

    // Validate m2Situation
    const validSituations = ["reponse", "relance", "dernier_message"] as const;
    const resolvedSituation = validSituations.includes(m2Situation)
      ? (m2Situation as (typeof validSituations)[number])
      : undefined;

    // Build lead context using shared V4 builder
    const leadForCtx: LeadForGeneration = {
      id: lead?.id || "",
      firstName: lead?.firstName || "Prospect",
      lastName: lead?.lastName || "",
      title: lead?.title,
      company: lead?.company,
      linkedinUrl: lead?.linkedinUrl || "",
      score: lead?.score,
      status: lead?.status,
      stage: lead?.stage,
      tags: lead?.tags,
      notes: lead?.notes,
      enrichmentData: lead?.enrichmentData || null,
    };

    // Build conversation history
    const messagesHistory = conversation.messages
      .map(
        (m: { direction: string; content: string; timestamp?: string }) =>
          `- ${m.direction === "outbound" ? "Message envoyé" : `Réponse ${lead?.firstName || "prospect"}`}${m.timestamp ? ` le ${new Date(m.timestamp).toLocaleDateString("fr-FR")}` : ""} : ${m.content}`
      )
      .join("\n");

    const runtimeContext =
      buildLeadContext(leadForCtx, "message") +
      `\n\n## Historique messages\n${messagesHistory}`;

    // Detect lead's last message for M2 "reponse" situation
    const lastInbound = [...conversation.messages]
      .reverse()
      .find((m: { direction: string }) => m.direction === "inbound");
    const leadMessage =
      resolvedSituation === "reponse" && lastInbound
        ? lastInbound.content
        : undefined;

    let userContent =
      "Suggère une réponse à envoyer à ce prospect en tenant compte de l'historique de la conversation. Réponds en JSON strict.";

    if (currentSuggestion && feedback) {
      userContent = `Voici la suggestion précédente :\n"""\n${currentSuggestion}\n"""\n\nFeedback de l'utilisateur : ${feedback}\n\nRégénère le message en tenant compte de ce feedback et de l'historique de la conversation. Réponds en JSON strict.`;
    }

    const response = await callAI({
      userId: user.id,
      agentId: "prospection",
      runtimeContext,
      sequenceStep: 2,
      m2Situation: resolvedSituation || "relance",
      leadResponseType: leadMessage ? "question" : undefined,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      maxTokens: 1024,
      temperature: 0.7,
      metadata: {
        leadId: lead?.id,
        conversationId: conversation.id,
        m2Situation: resolvedSituation,
      },
    });

    // Parse M2 JSON response
    let message = response.text;
    let reasoning: string | null = null;
    let ton: string | null = null;
    let type: string | null = null;

    try {
      // Extract JSON from response (handles markdown fences)
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.message) {
          message = parsed.message;
          reasoning = parsed.reasoning || null;
          ton = parsed.ton || null;
          type = parsed.type || null;
        }
      }
    } catch {
      // Fallback: use raw text as message
    }

    return NextResponse.json({ message, reasoning, ton, type });
  } catch (error) {
    console.error("Suggest API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la suggestion de réponse",
      },
      { status: 500 }
    );
  }
}
