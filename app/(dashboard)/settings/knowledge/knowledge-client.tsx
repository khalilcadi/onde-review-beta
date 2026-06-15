"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Save,
  RotateCcw,
  Info,
  Check,
  BookOpen,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  RAG_AGENT_MAPPING,
  RAG_BLOC_IDS,
  type RagBlocId,
} from "@/lib/rag/mapping";
import type { RagBloc, RagSection } from "@/lib/rag/types";
import type { RagBlocSummary } from "@/lib/actions/rag";
import {
  getRagBlocContent,
  saveRagOverride,
  resetRagOverride,
} from "@/lib/actions/rag";
import type { Json } from "@/types/database";

// =============================================================================
// Types
// =============================================================================

interface KnowledgeClientProps {
  initialBlocs: RagBlocSummary[];
  initialOverrides: Record<string, Json>;
}

// Human-readable labels for bloc IDs
const BLOC_LABELS: Record<string, string> = {
  positionnement: "Positionnement",
  icp: "ICP",
  offres: "Offres",
  use_cases: "Use Cases",
  objections: "Objections",
  regles_decisionnelles: "Règles",
  pain_points: "Pain Points",
  benchmark_marche: "Marché",
  benchmark_concurrents: "Concurrents",
  pricing: "Pricing",
  messaging: "Messaging",
  operating_rules: "Op. Rules",
  onboarding: "Onboarding",
  architecture_core: "Architecture",
  framework_arc: "Framework A.R.C.",
  manifesto: "Manifesto",
  profil_fondateur: "Profil Fondateur",
};

// Agent display names
const AGENT_NAMES: Record<string, string> = {
  prospection_m1: "Prospection M1",
  prospection_m2: "Prospection M2",
  scoring: "Scoring",
  enrichissement: "Enrichissement",
  conversational: "Conversational",
};

const AGENT_IDS = ["prospection_m1", "prospection_m2", "scoring", "enrichissement", "conversational"];

// =============================================================================
// Helper: check if an agent uses a bloc
// =============================================================================

function agentUsesBloc(agentId: string, blocId: RagBlocId): boolean {
  const mapping = RAG_AGENT_MAPPING[agentId];
  if (!mapping) return false;
  if ((mapping as readonly string[]).includes("*")) return true;
  return (mapping as readonly string[]).includes(blocId);
}

// =============================================================================
// Component
// =============================================================================

export function KnowledgeClient({
  initialBlocs,
  initialOverrides,
}: KnowledgeClientProps) {
  const [activeBloc, setActiveBloc] = useState<string>(
    initialBlocs[0]?.id ?? "positionnement"
  );
  const [blocContents, setBlocContents] = useState<Record<string, RagBloc>>(
    {}
  );
  const [editedSections, setEditedSections] = useState<
    Record<string, RagSection[]>
  >({});
  const [overrides, setOverrides] = useState<Record<string, Json>>(
    initialOverrides
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load bloc content when tab changes
  const loadBlocContent = useCallback(
    async (blocId: string) => {
      if (blocContents[blocId]) return;
      setLoading(blocId);
      const result = await getRagBlocContent(blocId);
      if (result.success) {
        setBlocContents((prev) => ({ ...prev, [blocId]: result.data }));
        // If there is a user override for this bloc, load its sections into edit state
        if (overrides[blocId]) {
          const overrideBloc = overrides[blocId] as unknown as RagBloc;
          if (overrideBloc.sections) {
            setEditedSections((prev) => ({
              ...prev,
              [blocId]: overrideBloc.sections,
            }));
          }
        }
      } else {
        toast.error(`Erreur de chargement : ${result.error}`);
      }
      setLoading(null);
    },
    [blocContents, overrides]
  );

  // Load first bloc on mount
  useEffect(() => {
    if (initialBlocs.length > 0) {
      loadBlocContent(initialBlocs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load bloc when tab changes
  useEffect(() => {
    loadBlocContent(activeBloc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBloc]);

  // Get current sections for a bloc (edited or original)
  const getCurrentSections = (blocId: string): RagSection[] => {
    if (editedSections[blocId]) return editedSections[blocId];
    if (blocContents[blocId]) return blocContents[blocId].sections;
    return [];
  };

  // Check if a bloc has been modified from original
  const isBlocModified = (blocId: string): boolean => {
    return !!overrides[blocId] || !!editedSections[blocId];
  };

  // Handle section content change
  const handleSectionContentChange = (
    blocId: string,
    sectionIndex: number,
    newContent: string
  ) => {
    const sections = getCurrentSections(blocId);
    const updated = sections.map((section, idx) => {
      if (idx !== sectionIndex) return section;
      return {
        ...section,
        content: newContent.split("\n"),
      };
    });
    setEditedSections((prev) => ({ ...prev, [blocId]: updated }));
  };

  // Handle section heading change
  const handleSectionHeadingChange = (
    blocId: string,
    sectionIndex: number,
    newHeading: string
  ) => {
    const sections = getCurrentSections(blocId);
    const updated = sections.map((section, idx) => {
      if (idx !== sectionIndex) return section;
      return { ...section, heading: newHeading };
    });
    setEditedSections((prev) => ({ ...prev, [blocId]: updated }));
  };

  // Save override
  const handleSave = async (blocId: string) => {
    const original = blocContents[blocId];
    if (!original) return;

    const sections = getCurrentSections(blocId);

    const overrideBloc: RagBloc = {
      ...original,
      sections,
    };

    setSaving(true);
    const result = await saveRagOverride(
      blocId,
      overrideBloc as unknown as Json
    );
    setSaving(false);

    if (result.success) {
      setOverrides((prev) => ({
        ...prev,
        [blocId]: overrideBloc as unknown as Json,
      }));
      toast.success("Bloc sauvegardé");
    } else {
      toast.error(result.error || "Erreur lors de la sauvegarde");
    }
  };

  // Reset override
  const handleReset = async (blocId: string) => {
    setSaving(true);
    const result = await resetRagOverride(blocId);
    setSaving(false);

    if (result.success) {
      // Remove override and edited sections
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[blocId];
        return next;
      });
      setEditedSections((prev) => {
        const next = { ...prev };
        delete next[blocId];
        return next;
      });
      toast.success("Bloc réinitialisé");
    } else {
      toast.error(result.error || "Erreur lors de la réinitialisation");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold">Base de connaissances</h1>
        <p className="text-muted-foreground">
          Consultez et personnalisez les blocs RAG inject&eacute;s dans les
          prompts IA
        </p>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex items-start gap-3 pt-6">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-blue-800">
              Comment fonctionne la base de connaissances ?
            </p>
            <p className="text-sm text-blue-700">
              Chaque bloc RAG est inject&eacute; dans le contexte des agents IA
              selon le mapping ci-dessous. Vous pouvez personnaliser le contenu
              de chaque bloc. Vos modifications sont sauvegard&eacute;es en base
              et prennent le dessus sur les valeurs par d&eacute;faut.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent-Bloc Mapping Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Mapping Agents &rarr; Blocs RAG
          </CardTitle>
          <CardDescription>
            Quels blocs de connaissances sont inject&eacute;s dans chaque agent
            IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    Bloc
                  </th>
                  {AGENT_IDS.map((agentId) => (
                    <th
                      key={agentId}
                      className="text-center py-2 px-3 font-medium text-muted-foreground"
                    >
                      {AGENT_NAMES[agentId]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...RAG_BLOC_IDS].map((blocId) => (
                  <tr key={blocId} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {BLOC_LABELS[blocId] || blocId}
                    </td>
                    {AGENT_IDS.map((agentId) => (
                      <td key={agentId} className="text-center py-2 px-3">
                        {agentUsesBloc(agentId, blocId) ? (
                          <Check className="h-4 w-4 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground/30">
                            &mdash;
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Pour modifier le mapping, &eacute;ditez{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              lib/rag/mapping.ts
            </code>
          </p>
        </CardContent>
      </Card>

      {/* Bloc Editor Tabs */}
      <Tabs
        value={activeBloc}
        onValueChange={setActiveBloc}
        className="space-y-6"
      >
        <ScrollArea className="w-full">
          <TabsList className="inline-flex h-auto p-1 w-max">
            {initialBlocs.map((bloc) => (
              <TabsTrigger
                key={bloc.id}
                value={bloc.id}
                className="flex items-center gap-1.5 py-2.5 px-3 data-[state=active]:bg-background relative whitespace-nowrap"
              >
                <span className="text-xs">
                  {BLOC_LABELS[bloc.id] || bloc.id}
                </span>
                {isBlocModified(bloc.id) && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {initialBlocs.map((blocSummary) => (
          <TabsContent
            key={blocSummary.id}
            value={blocSummary.id}
            className="space-y-4 mt-6"
          >
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {blocContents[blocSummary.id]?.title ||
                        BLOC_LABELS[blocSummary.id] ||
                        blocSummary.id}
                      {isBlocModified(blocSummary.id) && (
                        <Badge variant="warning" className="ml-2">
                          Modifi&eacute;
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {blocSummary.sectionCount} sections &bull; Bloc{" "}
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                        {blocSummary.id}
                      </code>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReset(blocSummary.id)}
                      disabled={!isBlocModified(blocSummary.id) || saving}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => handleSave(blocSummary.id)}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sauvegarde...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Sauvegarder
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading === blocSummary.id ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Chargement du bloc...
                  </div>
                ) : (
                  getCurrentSections(blocSummary.id).map(
                    (section, sectionIdx) => (
                      <div
                        key={sectionIdx}
                        className="space-y-2 rounded-lg border p-4"
                      >
                        <input
                          type="text"
                          value={section.heading}
                          onChange={(e) =>
                            handleSectionHeadingChange(
                              blocSummary.id,
                              sectionIdx,
                              e.target.value
                            )
                          }
                          className="w-full font-semibold text-sm bg-transparent border-b border-transparent focus:border-border pb-1 focus:outline-none transition-colors"
                          placeholder="Titre de la section"
                        />
                        <textarea
                          className="w-full min-h-[100px] rounded-lg border bg-muted/30 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                          value={section.content.join("\n")}
                          onChange={(e) =>
                            handleSectionContentChange(
                              blocSummary.id,
                              sectionIdx,
                              e.target.value
                            )
                          }
                          placeholder="Contenu de la section..."
                        />
                      </div>
                    )
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
