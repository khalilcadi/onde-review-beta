import { getTeamData } from "@/lib/actions/dashboard";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const result = await getTeamData();
  const members = result.success ? result.data : [];

  return <TeamClient members={members} />;
}
