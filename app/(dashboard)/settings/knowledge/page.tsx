import { getRagBlocs, getUserRagOverrides } from "@/lib/actions/rag";
import { KnowledgeClient } from "./knowledge-client";

export default async function KnowledgePage() {
  const [blocsResult, overridesResult] = await Promise.all([
    getRagBlocs(),
    getUserRagOverrides(),
  ]);

  const blocs = blocsResult.success ? blocsResult.data : [];
  const overrides = overridesResult.success ? overridesResult.data : {};

  return (
    <KnowledgeClient
      initialBlocs={blocs}
      initialOverrides={overrides}
    />
  );
}
