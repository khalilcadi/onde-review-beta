import { getLeads } from "@/lib/actions/leads";
import { getAuthUser } from "@/lib/actions/auth";
import PipelineClient from "./pipeline-client";

export default async function PipelinePage() {
  const { user } = await getAuthUser();
  const result = await getLeads(user.id);
  return (
    <PipelineClient
      initialLeads={result.success ? result.data : []}
      currentUserId={user.id}
    />
  );
}
