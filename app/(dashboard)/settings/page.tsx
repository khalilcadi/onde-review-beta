import { redirect } from "next/navigation";
import { getSettings } from "@/lib/actions/settings";
import { getAuthUser } from "@/lib/actions/auth";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const { user } = await getAuthUser().catch(() => redirect("/login"));
  if (!user) redirect("/login");

  const result = await getSettings();
  const settings = result.success ? result.data.settings : {};

  return <SettingsClient initialSettings={settings as Record<string, unknown>} />;
}
