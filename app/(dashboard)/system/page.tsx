import { getAuthUser } from "@/lib/actions/auth";
import { SystemClient } from "./system-client";

export default async function SystemPage() {
  await getAuthUser();
  return <SystemClient />;
}
