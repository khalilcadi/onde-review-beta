import { getLists } from "@/lib/actions/lists";
import ListsClient from "./lists-client";

export default async function ListsPage() {
  const result = await getLists();
  return (
    <ListsClient
      initialLists={result.success ? result.data : []}
    />
  );
}
