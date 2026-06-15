import { getAILogs } from "@/lib/actions/ai-usage";
import { LogsClient } from "./logs-client";

export default async function LogsPage() {
  const result = await getAILogs({ limit: 25 });

  return (
    <LogsClient
      initialData={
        result.success
          ? result.data
          : { logs: [], nextCursor: null, totalCount: 0 }
      }
    />
  );
}
