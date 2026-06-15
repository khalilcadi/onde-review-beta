import { getTodayActions } from "@/lib/actions/actions";
import ActionsClient from "./actions-client";

export default async function ActionsPage() {
  const result = await getTodayActions();
  const data = result.success
    ? result.data
    : {
        actions: [],
        stats: {
          total: 0,
          pending: 0,
          validated: 0,
          sent: 0,
          failed: 0,
        },
        quotas: {
          invitations: { used: 0, limit: 15 },
          messages: { used: 0, limit: 50 },
          visits: { used: 0, limit: 30 },
        },
      };

  return (
    <ActionsClient
      initialActions={data.actions}
      initialStats={data.stats}
      initialQuotas={data.quotas}
    />
  );
}
