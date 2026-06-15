import { getLeadById } from "@/lib/actions/leads";
import { getLeadHistory } from "@/lib/actions/actions";
import { getSequences } from "@/lib/actions/sequences";
import { getAuthUser } from "@/lib/actions/auth";
import LeadDetailClient from "./lead-detail-client";

export default async function LeadPage({ params }: { params: { id: string } }) {
  const { user } = await getAuthUser();
  const [leadResult, historyResult, sequencesResult] = await Promise.all([
    getLeadById(params.id),
    getLeadHistory(params.id),
    getSequences(),
  ]);

  if (!leadResult.success) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Lead non trouv&eacute;</p>
      </div>
    );
  }

  return (
    <LeadDetailClient
      lead={leadResult.data}
      history={historyResult.success ? historyResult.data : []}
      sequences={sequencesResult.success ? sequencesResult.data : []}
      currentUserId={user.id}
    />
  );
}
