"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, RotateCcw, Info, MessageSquare, Target, Search, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PROMPTS_DEFAULTS } from "@/lib/ai/prompts/defaults";
import { saveUserPrompt, resetUserPrompt } from "@/lib/actions/settings";

interface PromptConfig {
  id: keyof typeof PROMPTS_DEFAULTS;
  name: string;
  tabName: string;
  description: string;
  model: string;
  icon: React.ElementType;
  variables: string[];
}

const PROMPTS: PromptConfig[] = [
  {
    id: "prospection_m1",
    name: "Agent Prospection M1",
    tabName: "Premier Message",
    description: "Génère le premier message LinkedIn (invitation, premier contact)",
    model: "Claude Sonnet",
    icon: MessageSquare,
    variables: ["{firstName}", "{lastName}", "{title}", "{company}", "{industry}", "{companySize}"],
  },
  {
    id: "prospection_m2",
    name: "Agent Prospection M2",
    tabName: "Relances & Réponses",
    description: "Génère les relances et réponses aux leads dans les séquences",
    model: "Claude Sonnet",
    icon: MessageSquare,
    variables: ["{firstName}", "{lastName}", "{title}", "{company}", "{conversationHistory}"],
  },
  {
    id: "scoring",
    name: "Agent Scoring",
    tabName: "Lead Scorer",
    description: "Analyse et qualifie automatiquement chaque lead avec un score de 0 à 100",
    model: "Claude Haiku",
    icon: Target,
    variables: ["{firstName}", "{lastName}", "{title}", "{company}", "{linkedinActivity}", "{enrichmentData}"],
  },
  {
    id: "enrichissement",
    name: "Agent Enrichissement",
    tabName: "Enrichment",
    description: "Recherche des informations complémentaires sur les leads et leurs entreprises",
    model: "Perplexity",
    icon: Search,
    variables: ["{firstName}", "{lastName}", "{company}", "{linkedinUrl}"],
  },
  {
    id: "conversational",
    name: "Agent Conversational",
    tabName: "Reporter",
    description: "Assistant IA du Cockpit pour analyser vos performances et répondre à vos questions",
    model: "Claude Sonnet",
    icon: BarChart3,
    variables: ["{pipelineStats}", "{responseRate}", "{hotLeads}", "{todayActions}"],
  },
];

interface PromptsClientProps {
  initialPrompts: Record<string, string>;
}

export default function PromptsClient({ initialPrompts }: PromptsClientProps) {
  const [prompts, setPrompts] = useState<Record<string, string>>(initialPrompts);
  const [activePrompt, setActivePrompt] = useState<string>("prospection_m1");
  const [hasChanges, setHasChanges] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const handlePromptChange = (id: string, value: string) => {
    setPrompts({ ...prompts, [id]: value });
    setHasChanges({
      ...hasChanges,
      [id]: value !== PROMPTS_DEFAULTS[id as keyof typeof PROMPTS_DEFAULTS],
    });
  };

  const handleReset = async (id: string) => {
    const defaultValue = PROMPTS_DEFAULTS[id as keyof typeof PROMPTS_DEFAULTS];
    if (defaultValue) {
      const result = await resetUserPrompt(id);
      if (result.success) {
        setPrompts({ ...prompts, [id]: defaultValue });
        setHasChanges({ ...hasChanges, [id]: false });
        toast.success("Prompt réinitialisé");
      } else {
        toast.error(result.error || "Erreur lors de la réinitialisation");
      }
    }
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    const result = await saveUserPrompt(id, prompts[id]);
    if (result.success) {
      setHasChanges({ ...hasChanges, [id]: false });
      toast.success("Prompt sauvegardé");
    } else {
      toast.error(result.error || "Erreur lors de la sauvegarde");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Prompts IA</h1>
        <p className="text-muted-foreground">
          Personnalisez les instructions données aux agents IA pour générer du contenu adapté à votre style
        </p>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex items-start gap-3 pt-6">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">
              Comment fonctionnent les prompts ?
            </p>
            <p className="text-sm text-blue-700">
              Ces prompts sont envoyés comme instructions système à l&apos;IA. Les variables
              entre {"{}"} sont automatiquement remplacées par les données du lead lors de la génération.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activePrompt} onValueChange={setActivePrompt} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          {PROMPTS.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <TabsTrigger
                key={prompt.id}
                value={prompt.id}
                className="flex items-center gap-2 py-3 data-[state=active]:bg-background relative"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{prompt.tabName}</span>
                {hasChanges[prompt.id] && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PROMPTS.map((prompt) => (
          <TabsContent key={prompt.id} value={prompt.id} className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {prompt.name}
                      {hasChanges[prompt.id] && (
                        <Badge variant="warning" className="ml-2">
                          Modifié
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{prompt.description}</CardDescription>
                    <div className="flex items-center gap-2 pt-2">
                      <Badge variant="outline" className="text-xs">
                        Modèle : {prompt.model}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReset(prompt.id)}
                            disabled={!hasChanges[prompt.id]}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reset
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Restaurer le prompt par défaut
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => handleSave(prompt.id)}
                      disabled={!hasChanges[prompt.id] || saving}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Sauvegarde..." : "Sauvegarder"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Editor */}
                <textarea
                  className="w-full min-h-[350px] rounded-lg border bg-muted/30 p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  value={prompts[prompt.id] || ""}
                  onChange={(e) => handlePromptChange(prompt.id, e.target.value)}
                  placeholder="Instructions pour l&apos;agent IA..."
                />

                {/* Variables */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Variables disponibles</h4>
                  <div className="flex flex-wrap gap-2">
                    {prompt.variables.map((variable) => (
                      <button
                        key={variable}
                        onClick={() => {
                          const textarea = document.querySelector(`textarea`) as HTMLTextAreaElement;
                          if (textarea) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const currentValue = prompts[prompt.id] || "";
                            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
                            handlePromptChange(prompt.id, newValue);
                          }
                        }}
                        className="px-3 py-1.5 bg-background rounded-lg border text-xs font-mono hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Cliquez sur une variable pour l&apos;insérer à la position du curseur
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
