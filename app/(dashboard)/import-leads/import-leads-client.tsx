"use client";

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Search, Loader2, X, Upload, Building2, Linkedin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchDatagouv,
  searchDatagouvWithFilters,
  importLeadsFromDatagouv,
  type DatagouvSearchPayload,
} from "@/lib/actions/import-datagouv";
import {
  resolveLinkedInOnDemand,
  attachLinkedInToLead,
  webResolveImported,
  type LinkedInCandidate,
} from "@/lib/actions/resolve-linkedin";
import type { Dirigeant } from "@/lib/datagouv/types";

type Filters = DatagouvSearchPayload["filters"];

const PLACEHOLDER =
  "Ex : agences tech B2B de 20 à 49 salariés à Paris, 100 entreprises";

export default function ImportLeadsClient() {
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [payload, setPayload] = useState<DatagouvSearchPayload | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [webAtImport, setWebAtImport] = useState(true);

  // Résolution LinkedIn (dialog)
  const [linkedInFor, setLinkedInFor] = useState<Dirigeant | null>(null);
  const [candidates, setCandidates] = useState<LinkedInCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const people = useMemo(() => payload?.result.people ?? [], [payload]);

  // --- Recherche NL (1 appel IA) ---
  const runSearch = useCallback(async () => {
    if (!phrase.trim()) {
      toast.error("Saisis une requête de sourcing.");
      return;
    }
    setLoading(true);
    setSelected(new Set());
    const res = await searchDatagouv(phrase);
    setLoading(false);
    if (!res.success) {
      toast.error(res.error || "Échec de la recherche.");
      return;
    }
    setPayload(res.data);
    setFilters(res.data.filters);
    if (res.data.result.people.length === 0) {
      toast.info("Aucun dirigeant conforme trouvé pour ces filtres.");
    }
  }, [phrase]);

  // --- Re-recherche après édition des chips (sans IA) ---
  const rerunWithFilters = useCallback(async () => {
    if (!filters) return;
    setLoading(true);
    setSelected(new Set());
    const res = await searchDatagouvWithFilters(filters);
    setLoading(false);
    if (!res.success) {
      toast.error(res.error || "Échec de la recherche.");
      return;
    }
    setPayload(res.data);
    setFilters(res.data.filters);
    if (res.data.result.people.length === 0) {
      toast.info("Aucun dirigeant conforme pour ces filtres.");
    }
  }, [filters]);

  // --- Édition des filtres (chips) ---
  const removeFrom = (key: "naf_codes" | "effectif_codes" | "departements", code: string) => {
    setFilters((f) => (f ? { ...f, [key]: f[key].filter((c) => c !== code) } : f));
  };
  const setLimit = (value: string) => {
    const n = parseInt(value, 10);
    setFilters((f) => (f ? { ...f, limit: Number.isFinite(n) ? Math.min(Math.max(n, 1), 250) : f.limit } : f));
  };

  // --- Sélection ---
  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const allSelected = people.length > 0 && selected.size === people.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(people.map((_, i) => i)));

  // --- Import ---
  const importSelection = useCallback(async () => {
    if (!payload || selected.size === 0) return;
    const chosen: Dirigeant[] = Array.from(selected).map((i) => people[i]);
    setImporting(true);
    const res = await importLeadsFromDatagouv(chosen);
    setImporting(false);
    if (!res.success) {
      toast.error(res.error || "Échec de l'import.");
      return;
    }
    const { imported, updated, skipped, errors } = res.data;
    toast.success(
      `${imported} lead(s) créé(s)` +
        (updated ? `, ${updated} mis à jour` : "") +
        (skipped ? `, ${skipped} ignoré(s)` : "") +
        (errors.length ? ` — ${errors.length} erreur(s)` : "")
    );
    setSelected(new Set());

    // Pré-résolution LinkedIn (web Claude) à l'import — best-effort
    if (webAtImport) {
      const items = chosen.map((d) => ({
        siren: d.siren,
        firstName: d.prenom,
        lastName: d.nom,
        company: d.companyNom,
      }));
      const webRes = await webResolveImported(items);
      if (webRes.success && webRes.data.resolved > 0) {
        toast.info(
          `${webRes.data.resolved} LinkedIn pré-trouvé(s) via web (à confirmer)` +
            (webRes.data.capped ? ` — ${webRes.data.scanned} premiers traités` : "")
        );
      }
    }
  }, [payload, selected, people, webAtImport]);

  // --- Résolution LinkedIn croisée (web stocké + Unipile) ; auto-write si concordance ---
  const findLinkedIn = useCallback(async (p: Dirigeant) => {
    setLinkedInFor(p);
    setCandidates([]);
    setLoadingCandidates(true);
    const res = await resolveLinkedInOnDemand({
      siren: p.siren,
      firstName: p.prenom,
      lastName: p.nom,
      company: p.companyNom,
    });
    setLoadingCandidates(false);
    if (!res.success) {
      toast.error(res.error || "Recherche LinkedIn impossible.");
      setLinkedInFor(null);
      return;
    }
    if (res.data.attached) {
      // concordance web↔Unipile (ou score élevé) → écrit automatiquement
      toast.success(`LinkedIn attaché automatiquement à ${p.prenom} ${p.nom} (sources concordantes).`);
      setLinkedInFor(null);
      return;
    }
    setCandidates(res.data.candidates);
    if (res.data.candidates.length === 0) toast.info("Aucun candidat LinkedIn trouvé.");
  }, []);

  const confirmLinkedIn = useCallback(
    async (c: LinkedInCandidate) => {
      if (!linkedInFor || !c.profileUrl) return;
      setAttachingId(c.id);
      const res = await attachLinkedInToLead({
        siren: linkedInFor.siren,
        firstName: linkedInFor.prenom,
        lastName: linkedInFor.nom,
        profileUrl: c.profileUrl,
      });
      setAttachingId(null);
      if (!res.success) {
        toast.error(res.error || "Impossible d'attacher le profil.");
        return;
      }
      toast.success(`Profil LinkedIn attaché à ${linkedInFor.prenom} ${linkedInFor.nom}.`);
      setLinkedInFor(null);
    },
    [linkedInFor]
  );

  const funnel = payload?.result.funnel;

  return (
    <div className="space-y-8 p-6 md:p-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import Leads</h1>
        <p className="text-sm text-muted-foreground">
          {"Sourcing d'entreprises et de dirigeants depuis data.gouv, en langage naturel."}
        </p>
      </div>

      {/* Recherche */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requête de sourcing</CardTitle>
          <CardDescription>
            {"Décris ta cible : secteur, taille, zone, nombre d'entreprises à scanner."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={3}
            className="resize-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runSearch();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {"⌘/Ctrl + Entrée pour lancer"}
            </span>
            <Button onClick={runSearch} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Rechercher
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Interprétation + filtres éditables + entonnoir */}
      {payload && filters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtres interprétés</CardTitle>
            <CardDescription>{payload.interpretation}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Chips éditables */}
            <div className="flex flex-wrap gap-2">
              {filters.naf_codes.map((c) => (
                <FilterChip
                  key={`naf-${c}`}
                  label={`${c}${payload.labels.naf[c] ? ` · ${payload.labels.naf[c]}` : ""}`}
                  onRemove={() => removeFrom("naf_codes", c)}
                />
              ))}
              {filters.naf_codes.length === 0 && filters.section && (
                <Badge variant="secondary">
                  {`section ${filters.section}${payload.labels.section ? ` · ${payload.labels.section}` : ""}`}
                </Badge>
              )}
              {filters.effectif_codes.map((c) => (
                <FilterChip
                  key={`eff-${c}`}
                  label={payload.labels.effectif[c] ?? c}
                  onRemove={() => removeFrom("effectif_codes", c)}
                />
              ))}
              {filters.departements.map((c) => (
                <FilterChip
                  key={`dep-${c}`}
                  label={`${payload.labels.departements[c] ?? c} (${c})`}
                  onRemove={() => removeFrom("departements", c)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {"Entreprises à scanner"}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={250}
                  value={filters.limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="h-9 w-28"
                />
              </div>
              <Button variant="outline" onClick={rerunWithFilters} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {"Relancer avec ces filtres"}
              </Button>
            </div>

            {/* Entonnoir — aucun filtre silencieux */}
            {funnel && <Funnel funnel={funnel} />}
          </CardContent>
        </Card>
      )}

      {/* Résultats */}
      {payload && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                {`Dirigeants (${people.length})`}
              </CardTitle>
              <CardDescription>
                {`${payload.result.companies.length} entreprise(s) conforme(s) dans la zone`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={webAtImport}
                  onChange={(e) => setWebAtImport(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
                />
                {"Pré-chercher le LinkedIn (web) à l'import"}
              </label>
              <Button onClick={importSelection} disabled={selected.size === 0 || importing}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {`Importer la sélection (${selected.size})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {people.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                <Building2 className="h-8 w-8 opacity-40" />
                <p className="text-sm">{"Aucun dirigeant conforme. Élargis les filtres."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="w-10 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      <th className="py-2 pr-4 font-medium">Entreprise</th>
                      <th className="py-2 pr-4 font-medium">Dirigeant</th>
                      <th className="py-2 pr-4 font-medium">Fonction</th>
                      <th className="py-2 pr-4 font-medium">Effectif</th>
                      <th className="py-2 pr-4 font-medium">Ville</th>
                      <th className="py-2 pr-4 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p, i) => (
                      <tr
                        key={`${p.siren}-${i}`}
                        className="border-b border-border/50 hover:bg-muted/40"
                      >
                        <td className="py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(i)}
                            onChange={() => toggle(i)}
                            className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
                            aria-label={`Sélectionner ${p.prenom} ${p.nom}`}
                          />
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="font-medium text-foreground">{p.companyNom}</div>
                          <div className="text-xs text-muted-foreground">
                            {`SIREN ${p.siren}${p.company.naf ? ` · ${p.company.naf}` : ""}`}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 font-medium">{`${p.prenom} ${p.nom}`}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{p.qualite ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {p.company.effectif ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {p.company.ville ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => findLinkedIn(p)}
                            className="text-xs"
                          >
                            <Linkedin className="mr-1.5 h-3.5 w-3.5" />
                            LinkedIn
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog résolution LinkedIn (confirmation manuelle) */}
      <Dialog open={linkedInFor !== null} onOpenChange={(open) => !open && setLinkedInFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Trouver le LinkedIn</DialogTitle>
            <DialogDescription>
              {linkedInFor
                ? `Candidats pour ${linkedInFor.prenom} ${linkedInFor.nom} · ${linkedInFor.companyNom}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {loadingCandidates ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {"Recherche en cours…"}
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {"Aucun candidat trouvé."}
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.name || "—"}</span>
                      <Badge variant={c.score >= 0.6 ? "accent" : "secondary"} className="shrink-0">
                        {`${Math.round(c.score * 100)}%`}
                      </Badge>
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {c.source === "web" ? "web" : "Unipile"}
                      </Badge>
                      {c.agreement && (
                        <span className="shrink-0 text-xs font-medium text-success">
                          {"✓ concordance"}
                        </span>
                      )}
                    </div>
                    {c.headline && (
                      <div className="truncate text-xs text-muted-foreground">{c.headline}</div>
                    )}
                    {c.profileUrl && (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs text-accent hover:underline"
                      >
                        {c.profileUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    )}
                    {c.location && (
                      <div className="text-xs text-muted-foreground/70">{c.location}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => confirmLinkedIn(c)}
                    disabled={!c.profileUrl || attachingId !== null}
                  >
                    {attachingId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirmer"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 font-normal">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-sm p-0.5 hover:bg-foreground/10"
        aria-label={`Retirer ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function Funnel({ funnel }: { funnel: NonNullable<DatagouvSearchPayload["result"]["funnel"]> }) {
  const steps: { label: string; value: number }[] = [
    { label: "scannées", value: funnel.scanned },
    { label: "conformes", value: funnel.conformes },
    { label: "dirigeant PP", value: funnel.personnesPhysiques },
    { label: "siège en zone", value: funnel.siegeDansZone },
    { label: "leads", value: funnel.leadsCandidats },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </div>
          {i < steps.length - 1 && <span className="text-muted-foreground/50">→</span>}
        </div>
      ))}
    </div>
  );
}
