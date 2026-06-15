import { getSequences } from "@/lib/actions/sequences";
import SequencesClient from "./sequences-client";

export default async function SequencesPage() {
  const result = await getSequences();
  return (
    <SequencesClient
      initialSequences={result.success ? result.data : []}
    />
  );
}
