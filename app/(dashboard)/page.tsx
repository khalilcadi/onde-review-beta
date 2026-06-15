import { getDashboardData, getTeamData } from "@/lib/actions/dashboard";
import type { DashboardData, TeamMember } from "@/lib/actions/dashboard";
import { getAuthUser } from "@/lib/actions/auth";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const [dashResult, teamResult, authResult] = await Promise.all([
    getDashboardData(),
    getTeamData(),
    getAuthUser().catch(() => null),
  ]);

  const dashboard: DashboardData = dashResult.success
    ? dashResult.data
    : {
        today: { actionsTotal: 0, actionsPending: 0, actionsValidated: 0, actionsSent: 0 },
        quotas: {
          invitations: { used: 0, limit: 15 },
          messages: { used: 0, limit: 50 },
          visits: { used: 0, limit: 30 },
        },
        unreadResponses: 0,
        hotLeads: [],
        pipeline: { stages: [] },
        responseRate: { rate: 0, sent: 0, responded: 0 },
      };

  const team: TeamMember[] = teamResult.success ? teamResult.data : [];
  const userName = authResult?.user?.user_metadata?.full_name
    ?? authResult?.user?.email?.split("@")[0]
    ?? "Utilisateur";

  return <DashboardClient dashboard={dashboard} team={team} userName={userName} />;
}
