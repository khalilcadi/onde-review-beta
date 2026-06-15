import {
  checkEnvironment,
  testSupabaseConnection,
  getLinkedInStatus,
} from "@/lib/actions/diagnostic";
import { getSettings } from "@/lib/actions/settings";
import { DiagnosticClient } from "./diagnostic-client";

export default async function DiagnosticPage() {
  const [envResult, supabaseResult, settingsResult, linkedInResult] =
    await Promise.all([
      checkEnvironment(),
      testSupabaseConnection(),
      getSettings(),
      getLinkedInStatus(),
    ]);

  return (
    <DiagnosticClient
      initialEnv={envResult.success ? envResult.data : null}
      initialSupabase={supabaseResult.success ? supabaseResult.data : null}
      initialSupabaseError={
        !supabaseResult.success ? supabaseResult.error : null
      }
      initialKeyStatus={
        settingsResult.success
          ? {
              hasClaudeKey: settingsResult.data.hasClaudeKey,
              hasOpenaiKey: settingsResult.data.hasOpenaiKey,
              hasPerplexityKey: settingsResult.data.hasPerplexityKey,
            }
          : null
      }
      initialLinkedIn={linkedInResult.success ? linkedInResult.data : null}
    />
  );
}
