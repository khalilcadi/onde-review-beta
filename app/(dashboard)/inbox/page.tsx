import { getConversations } from "@/lib/actions/conversations";
import InboxClient from "./inbox-client";

export default async function InboxPage() {
  const result = await getConversations();
  return (
    <InboxClient
      initialConversations={result.success ? result.data : []}
    />
  );
}
