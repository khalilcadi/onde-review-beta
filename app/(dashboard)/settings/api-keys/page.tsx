import { getSettings } from "@/lib/actions/settings";
import { getLinkedInAccount } from "@/lib/actions/linkedin";
import { ApiKeysClient } from "./api-keys-client";

export default async function ApiKeysPage() {
  const [settingsResult, linkedInResult] = await Promise.all([
    getSettings(),
    getLinkedInAccount(),
  ]);

  const keyStatus = {
    hasClaudeKey: settingsResult.success ? settingsResult.data.hasClaudeKey : false,
    hasOpenaiKey: settingsResult.success ? settingsResult.data.hasOpenaiKey : false,
    hasPerplexityKey: settingsResult.success
      ? settingsResult.data.hasPerplexityKey
      : false,
  };

  const linkedInAccount =
    linkedInResult.success ? linkedInResult.data : null;

  const aiSettings = settingsResult.success
    ? {
        ai_provider: (settingsResult.data.settings as Record<string, unknown>)?.ai_provider as string | undefined,
        ai_model: (settingsResult.data.settings as Record<string, unknown>)?.ai_model as string | undefined,
      }
    : undefined;

  return (
    <ApiKeysClient
      initialKeyStatus={keyStatus}
      initialLinkedInAccount={linkedInAccount}
      initialSettings={aiSettings}
    />
  );
}
