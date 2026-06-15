import { getProfileVisitors } from "@/lib/actions/visitors";
import { VisitorsClient } from "./visitors-client";

export default async function VisitorsPage() {
  const result = await getProfileVisitors();

  const initialData = result.success
    ? {
        visitors: result.data.visitors,
        insights: result.data.insights,
        viewsChangePercentage: result.data.viewsChangePercentage,
        totalViewers: result.data.totalViewers,
        rawResponse: result.data.rawResponse
          ? JSON.stringify(result.data.rawResponse, null, 2)
          : undefined,
      }
    : {
        visitors: [],
        insights: [],
        viewsChangePercentage: null,
        totalViewers: 0,
        error: result.error,
      };

  return <VisitorsClient initialData={initialData} />;
}
