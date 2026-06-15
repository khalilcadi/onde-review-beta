"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { updateSettings } from "@/lib/actions/settings";

interface SettingsClientProps {
  initialSettings: Record<string, unknown>;
}

export default function SettingsClient({ initialSettings }: SettingsClientProps) {
  const router = useRouter();
  const [localSettings, setLocalSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateSettings(localSettings);
      if (result.success) {
        toast.success("Réglages enregistrés");
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSaving(false);
    }
  };

  const get = (key: string, fallback: unknown = 0) =>
    (localSettings[key] as never) ?? fallback;

  const set = (key: string, value: unknown) =>
    setLocalSettings({ ...localSettings, [key]: value });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Réglages</h1>
          <p className="text-muted-foreground">
            Configurez votre expérience PROSPECTOR
          </p>
        </div>
        <Button variant="accent" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>

      {/* Quotas LinkedIn */}
      <Card>
        <CardHeader>
          <CardTitle>Quotas LinkedIn</CardTitle>
          <CardDescription>
            Définissez les limites quotidiennes pour protéger votre compte
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Invitations / jour</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("daily_invitations_limit", 15) as number}
                onChange={(e) =>
                  set("daily_invitations_limit", parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Recommandé : 15-25
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Messages / jour</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("daily_messages_limit", 10) as number}
                onChange={(e) =>
                  set("daily_messages_limit", parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Recommandé : 10-30
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Visites profil / jour</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("daily_visits_limit", 30) as number}
                onChange={(e) =>
                  set("daily_visits_limit", parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Recommandé : 30-50
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Pause automatique</div>
              <p className="text-sm text-muted-foreground">
                Arrêter les envois si quota atteint
              </p>
            </div>
            <input
              type="checkbox"
              checked={get("pause_on_quota", true) as boolean}
              onChange={(e) => set("pause_on_quota", e.target.checked)}
              className="h-5 w-5"
            />
          </div>
        </CardContent>
      </Card>

      {/* Intervalles */}
      <Card>
        <CardHeader>
          <CardTitle>Intervalles anti-détection</CardTitle>
          <CardDescription>
            Espacement aléatoire entre les actions LinkedIn
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Intervalle minimum (sec)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("interval_min_seconds", 120) as number}
                onChange={(e) =>
                  set("interval_min_seconds", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Intervalle maximum (sec)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("interval_max_seconds", 480) as number}
                onChange={(e) =>
                  set("interval_max_seconds", parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Les actions seront espacées de {((get("interval_min_seconds", 120) as number) / 60).toFixed(0)} à{" "}
            {((get("interval_max_seconds", 480) as number) / 60).toFixed(0)} minutes aléatoirement.
          </p>
        </CardContent>
      </Card>

      {/* Horaires */}
      <Card>
        <CardHeader>
          <CardTitle>Horaires d&apos;activité</CardTitle>
          <CardDescription>
            Définissez les plages horaires d&apos;envoi automatique
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Heure de début</label>
              <input
                type="number"
                min="0"
                max="23"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("start_hour", 9) as number}
                onChange={(e) =>
                  set("start_hour", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Heure de fin</label>
              <input
                type="number"
                min="0"
                max="23"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={get("end_hour", 19) as number}
                onChange={(e) =>
                  set("end_hour", parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Jours actifs</label>
            <div className="flex gap-2 mt-2">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day, i) => {
                const dayCode = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][i];
                const activeDays = (get("active_days", ["mon", "tue", "wed", "thu", "fri"]) as string[]);
                const isActive = activeDays.includes(dayCode);
                return (
                  <button
                    key={day}
                    className={`px-3 py-1 rounded text-sm ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    onClick={() => {
                      const newDays = isActive
                        ? activeDays.filter((d) => d !== dayCode)
                        : [...activeDays, dayCode];
                      set("active_days", newDays);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
