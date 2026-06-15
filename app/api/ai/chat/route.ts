import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/service";
import { getDashboardData, getTeamData } from "@/lib/actions/dashboard";
import type { DashboardData, TeamMember } from "@/lib/actions/dashboard";

function buildPipelineContext(
  dashboard: DashboardData | null,
  team: TeamMember[] | null
): string {
  let ctx = `## Données Pipeline (temps réel)\n`;

  if (dashboard) {
    const d = dashboard;
    ctx += `- Actions aujourd'hui : ${d.today.actionsTotal} total (${d.today.actionsPending} en attente, ${d.today.actionsValidated} validées, ${d.today.actionsSent} envoyées)\n`;
    ctx += `- Réponses non lues : ${d.unreadResponses}\n`;
    ctx += `- Leads chauds (score >= 70) : ${d.hotLeads.length}\n\n`;

    ctx += `## Quotas aujourd'hui\n`;
    ctx += `- Invitations : ${d.quotas.invitations.used}/${d.quotas.invitations.limit} utilisées\n`;
    ctx += `- Messages : ${d.quotas.messages.used}/${d.quotas.messages.limit} utilisés\n`;
    ctx += `- Visites profil : ${d.quotas.visits.used}/${d.quotas.visits.limit}\n\n`;

    if (d.hotLeads.length > 0) {
      ctx += `## Top leads chauds\n`;
      d.hotLeads.forEach((lead, i) => {
        const leadCtx = [lead.title, lead.company].filter(Boolean).join(" @ ");
        ctx += `${i + 1}. ${lead.firstName} ${lead.lastName}${leadCtx ? ` (${leadCtx})` : ""} - Score ${lead.score} - Stage: ${lead.stage}\n`;
      });
      ctx += `\n`;
    }

    ctx += `## Funnel Pipeline\n`;
    d.pipeline.stages.forEach((stage) => {
      ctx += `- ${stage.name} : ${stage.count}\n`;
    });
    ctx += `\n`;
  } else {
    ctx += `- Données pipeline indisponibles\n\n`;
  }

  if (team && team.length > 0) {
    ctx += `## Équipe (cette semaine)\n`;
    team.forEach((m) => {
      ctx += `- ${m.name} : ${m.stats.leadsAdded} leads ajoutés, ${m.stats.meetings} RDV\n`;
    });
    ctx += `\n`;
  }

  ctx += `## Instructions complémentaires\n`;
  ctx += `- Date du jour : ${new Date().toLocaleDateString("fr-FR")}\n`;
  ctx += `- Heure : ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  return ctx;
}

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

    const { messages } = await req.json();

    // Charger le contexte pipeline réel depuis la DB
    const [dashResult, teamResult] = await Promise.all([
      getDashboardData(),
      getTeamData(),
    ]);

    const dashboard = dashResult.success ? dashResult.data : null;
    const team = teamResult.success ? teamResult.data : null;
    const pipelineContext = buildPipelineContext(dashboard, team);

    const response = await callAI({
      userId: user.id,
      agentId: "conversational",
      runtimeContext: pipelineContext,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxTokens: 1024,
    });

    return NextResponse.json({ message: response.text });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la génération de la réponse",
      },
      { status: 500 }
    );
  }
}
