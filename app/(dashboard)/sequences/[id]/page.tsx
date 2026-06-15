import { getSequenceById, getSequenceLeads } from "@/lib/actions/sequences";
import { getAuthUser } from "@/lib/actions/auth";
import SequenceDetailClient from "./sequence-detail-client";

export default async function SequencePage({ params }: { params: { id: string } }) {
  const [result, leadsResult, { user }] = await Promise.all([
    getSequenceById(params.id),
    getSequenceLeads(params.id),
    getAuthUser(),
  ]);

  return (
    <SequenceDetailClient
      sequenceId={params.id}
      currentUserId={user.id}
      initialSequence={result.success ? {
        id: result.data.id,
        name: result.data.name,
        persona: result.data.persona || "CEO",
        status: result.data.status as "active" | "paused",
        stats: {
          totalLeads: result.data.stats.totalLeads,
          activeLeads: result.data.stats.activeLeads,
          completedLeads: result.data.stats.completedLeads,
          exitedLeads: 0,
          responseRate: result.data.stats.responseRate,
          conversionRate: result.data.stats.conversionRate,
          avgResponseTime: "N/A",
        },
      } : null}
      initialSteps={result.success ? result.data.steps : []}
      initialLeads={leadsResult.success ? leadsResult.data : []}
    />
  );
}
