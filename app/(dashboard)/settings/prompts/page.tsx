import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/actions/auth";
import { getUserPrompt } from "@/lib/actions/settings";
import { PROMPTS_DEFAULTS } from "@/lib/ai/prompts/defaults";
import PromptsClient from "./prompts-client";

const AGENT_IDS = ["prospection_m1", "prospection_m2", "scoring", "enrichissement", "conversational"] as const;

export default async function PromptsPage() {
  const { user } = await getAuthUser().catch(() => redirect("/login"));
  if (!user) redirect("/login");

  // Load user overrides for each agent, fallback to defaults
  const promptEntries = await Promise.all(
    AGENT_IDS.map(async (agentId) => {
      const result = await getUserPrompt(agentId);
      const userPrompt = result.success ? result.data : null;
      return [
        agentId,
        userPrompt ?? PROMPTS_DEFAULTS[agentId as keyof typeof PROMPTS_DEFAULTS] ?? "",
      ] as const;
    })
  );

  const initialPrompts: Record<string, string> = Object.fromEntries(promptEntries);

  return <PromptsClient initialPrompts={initialPrompts} />;
}
