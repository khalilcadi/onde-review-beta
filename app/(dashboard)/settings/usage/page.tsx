import { getUsageStats } from "@/lib/actions/ai-usage";
import { UsageClient } from "./usage-client";

export default async function UsagePage() {
  const [todayResult, weekResult, monthResult] = await Promise.all([
    getUsageStats("today"),
    getUsageStats("week"),
    getUsageStats("month"),
  ]);

  return (
    <UsageClient
      today={todayResult.success ? todayResult.data : null}
      week={weekResult.success ? weekResult.data : null}
      month={monthResult.success ? monthResult.data : null}
    />
  );
}
