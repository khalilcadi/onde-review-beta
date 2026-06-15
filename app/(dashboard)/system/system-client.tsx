"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Database,
  Bot,
  GitBranch,
  Clock,
  Shield,
  Cpu,
  Zap,
  ExternalLink,
  ChevronRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import {
  LEAD_STAGES,
  ACTION_TYPES,
  ACTION_STATUSES,
  ANTI_DETECTION_DELAYS,
  DEFAULT_SETTINGS,
  SCORING_THRESHOLDS,
  SCORING_CATEGORIES,
  MESSAGE_LIMITS,
  TONE_RULES,
} from "@/lib/constants";
import { RAG_AGENT_MAPPING, RAG_BLOC_IDS } from "@/lib/rag/mapping";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a delay range into a human-readable label (e.g. "4-8 min") */
function formatDelay(value: { min: number; max: number }): string {
  const minMins = Math.round(value.min / 60_000);
  const maxMins = Math.round(value.max / 60_000);
  return `${minMins}-${maxMins} min`;
}

/** A delay is considered "fast" if its max ≤ 5 min (V↔I natural pattern) */
function isFastDelay(value: { min: number; max: number }): boolean {
  return value.max <= 5 * 60_000;
}

/** A delay is considered "slow" if its min ≥ 8 min (writing-heavy transitions) */
function isSlowDelay(value: { min: number; max: number }): boolean {
  return value.min >= 8 * 60_000;
}

/** Resolve RAG blocs for display — handles the '*' wildcard */
function resolveRagBlocsForDisplay(agentId: string): string[] {
  const mapping = RAG_AGENT_MAPPING[agentId];
  if (!mapping) return [];
  if ((mapping as readonly string[]).includes("*")) {
    return [`TOUS (${RAG_BLOC_IDS.length} blocs)`];
  }
  return [...mapping];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage metadata (colors + behaviors — not in constants because UI-specific)
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_META: Record<
  string,
  {
    color: string;
    actions: string[];
    agentBehavior: string;
    trigger: string;
    next: string;
  }
> = {
  to_invite: {
    color: "bg-slate-100 border-slate-300 text-slate-700",
    actions: ["visit", "invitation"],
    agentBehavior:
      "Approche legere et curieuse. Zero mention de Smart.AI ou JARVIS. Connexion humaine uniquement.",
    trigger: "Etat initial (import CSV ou creation manuelle)",
    next: "Cron send-actions envoie invitation",
  },
  invited: {
    color: "bg-blue-50 border-blue-200 text-blue-700",
    actions: ["\u2014"],
    agentBehavior:
      "En attente d\u2019acceptation. Aucune action automatique possible.",
    trigger: "Action invitation envoyee via Unipile",
    next: "Webhook relation.created \u2192 connected",
  },
  connected: {
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
    actions: ["message"],
    agentBehavior:
      "Valeur subtile. Peut evoquer automatisation, productivite, structure. Pas de pitch direct.",
    trigger: "Webhook Unipile : relation.created",
    next: "Premier message envoye \u2192 in_sequence",
  },
  in_sequence: {
    color: "bg-orange-50 border-orange-200 text-orange-700",
    actions: ["message", "relance"],
    agentBehavior:
      "Relances avec valeur nouvelle. Chaque relance = CTA different.",
    trigger: "Premier message envoye par le cron",
    next: "Webhook message.received \u2192 responded",
  },
  responded: {
    color: "bg-yellow-50 border-yellow-200 text-yellow-700",
    actions: ["reponse"],
    agentBehavior:
      "Pitch possible, social proof permis, CTA vers call 15 min.",
    trigger: "Webhook Unipile : message.received",
    next: "Manuel : user update \u2192 meeting",
  },
  meeting: {
    color: "bg-green-50 border-green-200 text-green-700",
    actions: ["\u2014"],
    agentBehavior:
      "En attente du call. Pas d\u2019actions automatiques.",
    trigger: "Mise a jour manuelle par l\u2019utilisateur",
    next: "Manuel : user update \u2192 closed",
  },
  closed: {
    color: "bg-purple-50 border-purple-200 text-purple-700",
    actions: ["\u2014"],
    agentBehavior:
      "Converti ou perdu. Hors sequence. Lead archive.",
    trigger: "Mise a jour manuelle",
    next: "\u2014",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent metadata (routes, models, inputs, outputs — UI-specific descriptions)
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_META: Record<
  string,
  {
    label: string;
    routes: string[];
    model: string;
    temp: string;
    inputFields: string[];
    outputFormat: string;
    color: string;
  }
> = {
  prospection: {
    label: "PROSPECTION",
    routes: ["/api/ai/generate", "/api/ai/suggest"],
    model: "claude-sonnet (configurable)",
    temp: "0.7",
    inputFields: [
      "buildLeadContext() : lead complet + enrichmentData",
      "actionType : invitation | message | inmail | email | relance | reponse",
      "currentMessage (si regeneration)",
      "conversation.messages[] (route suggest)",
    ],
    outputFormat:
      "Texte brut \u2192 humanizeMessage() \u2192 fragment(s) LinkedIn",
    color: "border-blue-200",
  },
  scoring: {
    label: "SCORING",
    routes: ["/api/ai/score"],
    model: "claude-haiku",
    temp: "0.3",
    inputFields: [
      "buildScoringContext() : lead complet + enrichmentData",
      "engagement.hasAcceptedInvitation",
      "engagement.responseCount",
      "engagement.lastResponseDate",
      "engagement.profileVisitsReceived",
      "engagement.contentEngagement",
    ],
    outputFormat:
      "JSON : { score: 0-100, breakdown: { critere: note } }",
    color: "border-orange-200",
  },
  enrichissement: {
    label: "ENRICHISSEMENT",
    routes: ["/api/ai/enrich"],
    model: "perplexity sonar-pro",
    temp: "\u2014",
    inputFields: [
      "buildEnrichmentContext() : nom, titre, entreprise, linkedin, email",
      "buildEnrichmentUserPrompt() : requete web naturelle",
    ],
    outputFormat:
      "JSON : { company: { size, industry, funding, revenue, location, news[] }, person: { interests[], recentPosts[], experience[], education[] } }",
    color: "border-purple-200",
  },
  conversational: {
    label: "CONVERSATIONAL",
    routes: ["/api/ai/chat"],
    model: "claude-sonnet (configurable)",
    temp: "0.7",
    inputFields: [
      "leads_total, leads_hot, en_sequence",
      "taux_reponse (semaine / mois)",
      "rdv_planifies",
      "quotas : invitations, messages, visites (x/max)",
      "top_leads_chauds[] (top 5)",
      "funnel_pipeline : compteurs par stage",
      "sequences_actives[] : nom, leads, taux",
      "equipe[] : nom, actions, taux, RDV",
    ],
    outputFormat:
      "Reponse naturelle sur le pipeline, business et connaissance Smart.AI",
    color: "border-green-200",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Action status colors for the anti-detection tab
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-50 border-slate-200",
  validated: "bg-blue-50 border-blue-200",
  processing: "bg-amber-50 border-amber-200",
  sent: "bg-green-50 border-green-200",
  failed: "bg-red-50 border-red-200",
  cancelled: "bg-slate-50 border-slate-200",
};

const ACTION_STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: "Generee par cron, attente validation user",
  validated: "User a approuve + scheduled_at assigne",
  processing: "Atomic lock \u2014 cron en cours d\u2019envoi",
  sent: "Envoye via Unipile avec succes",
  failed: "Erreur Unipile \u2014 error_message rempli",
  cancelled: "Annule par l\u2019utilisateur",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function SystemClient() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Carte systeme</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Architecture interne de PROSPECTOR -- donnees, logique, regles des agents
        </p>
      </div>

      <Tabs defaultValue="flux">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="flux">Flux de donnees</TabsTrigger>
            <TabsTrigger value="lifecycle">Cycle de vie Lead</TabsTrigger>
            <TabsTrigger value="prospection">Regles Prospection</TabsTrigger>
            <TabsTrigger value="agents">Agents IA</TabsTrigger>
            <TabsTrigger value="crons">Sequences & Crons</TabsTrigger>
            <TabsTrigger value="antidetection">Anti-detection</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="flux" className="mt-6"><FluxTab /></TabsContent>
        <TabsContent value="lifecycle" className="mt-6"><LifecycleTab /></TabsContent>
        <TabsContent value="prospection" className="mt-6"><ProspectionTab /></TabsContent>
        <TabsContent value="agents" className="mt-6"><AgentsTab /></TabsContent>
        <TabsContent value="crons" className="mt-6"><CronsTab /></TabsContent>
        <TabsContent value="antidetection" className="mt-6"><AntiDetectionTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 : Flux de donnees
// ─────────────────────────────────────────────────────────────────────────────

function FluxTab() {
  const steps = [
    {
      icon: <Database className="h-4 w-4" />,
      title: "Lead (DB)",
      sub: "table leads",
      color: "bg-blue-50 border-blue-200",
      items: [
        "firstName, lastName",
        "title, company",
        "score (0-100)",
        "status: cold/warm/hot",
        "stage: to_invite \u2192 closed",
        "tags[], notes",
        "enrichmentData (JSONB)",
      ],
    },
    {
      icon: <Cpu className="h-4 w-4" />,
      title: "buildLeadContext()",
      sub: "lib/ai/lead-context.ts",
      color: "bg-purple-50 border-purple-200",
      items: [
        "lead + actionType",
        "+ currentMessage (regen)",
        "\u2192 string Markdown",
        "enrichment si present",
      ],
    },
    {
      icon: <Zap className="h-4 w-4" />,
      title: "System Prompt",
      sub: "assemble par callAI()",
      color: "bg-amber-50 border-amber-200",
      items: [
        "\u2460 Prompt agent (DB/defaut)",
        `\u2461 Blocs RAG (${(RAG_AGENT_MAPPING.prospection_m1 as readonly string[])?.length ?? '?'} pour prospection M1)`,
        "\u2462 runtimeContext (buildLeadContext)",
      ],
    },
    {
      icon: <Bot className="h-4 w-4" />,
      title: "Claude API",
      sub: "Anthropic / OpenAI",
      color: "bg-green-50 border-green-200",
      items: [
        "model: sonnet (configurable)",
        `temp: ${DEFAULT_SETTINGS.temperature}`,
        "maxTokens: 512",
        "\u2192 texte brut",
      ],
    },
    {
      icon: <GitBranch className="h-4 w-4" />,
      title: "humanizeMessage()",
      sub: "lib/humanize.ts",
      color: "bg-teal-50 border-teal-200",
      items: [
        "Decoupe en fragments |||",
        "Delais aleatoires",
        "Anti-detection",
      ],
    },
    {
      icon: <Database className="h-4 w-4" />,
      title: "Action (DB)",
      sub: "table actions",
      color: "bg-slate-50 border-slate-200",
      items: [
        "status: pending",
        "generated_message",
        "scheduled_at: NULL",
        "\u2192 user valide",
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Pipeline visuel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Pipeline de generation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 overflow-x-auto pb-2">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-start gap-2 shrink-0">
                <div className={`rounded-lg border p-3 w-40 ${step.color}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {step.icon}
                    <span className="text-xs font-semibold leading-tight">{step.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground block mb-2">{step.sub}</span>
                  <ul className="space-y-0.5">
                    {step.items.map((item) => (
                      <li key={item} className="text-xs text-foreground/70 leading-tight">{item}</li>
                    ))}
                  </ul>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-5 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exemple de contexte */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Exemple -- contexte injecte dans le system prompt</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ce que <code className="font-mono">buildLeadContext(lead, &quot;message&quot;)</code> genere (runtimeContext)
          </p>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-xs bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre">{`## Lead
- Nom : Jean Dupont
- Titre : Consultant SEO Freelance
- Entreprise : JD Consulting
- Score : 72/100
- Status : warm
- Stage : connected
- Tags : freelance, seo, marketing
- Notes : A commente notre post sur l'automatisation LinkedIn

## Entreprise
- Taille : 1-5 personnes
- Industrie : Marketing Digital
- Funding : N/A
- CA : N/A
- Localisation : Paris, France
- Actualites : Nouvelle offre SEO technique en janvier

## Personne
- Interets : automatisation, productivite, inbound marketing
- Posts recents : "Comment j'ai 2x ma productivite avec l'IA" | "Mes outils 2026"

## Action
- Type : message`}
          </pre>
        </CardContent>
      </Card>

      {/* User prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">User message envoye a Claude</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ce que <code className="font-mono">buildUserPrompt(lead, &quot;message&quot;)</code> genere
          </p>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-xs bg-muted rounded-lg p-4">{`Genere un message de type "message" sur LinkedIn pour Jean Dupont (Consultant SEO Freelance @ JD Consulting).

Retourne UNIQUEMENT le message, sans explication.`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 : Cycle de vie Lead
// ─────────────────────────────────────────────────────────────────────────────

function LifecycleTab() {
  // Build scoring cards from SCORING_CATEGORIES
  const scoringCards: {
    key: string;
    label: string;
    range: string;
    description: string;
    badgeClass: string;
    bgClass: string;
  }[] = [
    {
      key: "NO_GO",
      label: SCORING_CATEGORIES.NO_GO.label,
      range: `Score < ${SCORING_THRESHOLDS.COLD}`,
      description: `${SCORING_CATEGORIES.NO_GO.action} -- lead hors cible.`,
      badgeClass: "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100",
      bgClass: "bg-slate-50 border-slate-200",
    },
    {
      key: "COLD",
      label: SCORING_CATEGORIES.COLD.label,
      range: `Score ${SCORING_THRESHOLDS.COLD}\u2013${SCORING_THRESHOLDS.WARM - 1}`,
      description: `${SCORING_CATEGORIES.COLD.action}. Approche legere, curieuse. Connexion humaine uniquement.`,
      badgeClass: "",
      bgClass: "bg-slate-50 border-slate-200",
    },
    {
      key: "WARM",
      label: SCORING_CATEGORIES.WARM.label,
      range: `Score ${SCORING_THRESHOLDS.WARM}\u2013${SCORING_THRESHOLDS.HOT - 1}`,
      description: `${SCORING_CATEGORIES.WARM.action}. Peut evoquer automatisation, productivite. Valeur subtile.`,
      badgeClass: "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100",
      bgClass: "bg-orange-50 border-orange-200",
    },
    {
      key: "HOT",
      label: SCORING_CATEGORIES.HOT.label,
      range: `Score \u2265 ${SCORING_THRESHOLDS.HOT}`,
      description: `${SCORING_CATEGORIES.HOT.action}. Peut pitcher directement. Social proof permis. CTA call 15 min.`,
      badgeClass: "bg-red-100 text-red-700 border-red-200 hover:bg-red-100",
      bgClass: "bg-red-50 border-red-200",
    },
  ];

  // Build stages from LEAD_STAGES + STAGE_META
  const stageEntries = Object.entries(LEAD_STAGES);

  return (
    <div className="space-y-6">
      {/* Status par score */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {scoringCards.map((card) => (
          <div key={card.key} className={`rounded-lg border p-4 ${card.bgClass}`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant={card.badgeClass ? undefined : "secondary"}
                className={card.badgeClass || undefined}
              >
                {card.label}
              </Badge>
              <span className="text-sm font-semibold">{card.range}</span>
            </div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Stages */}
      <div>
        <h2 className="text-sm font-semibold mb-4">Stages -- transitions et comportement agent</h2>
        <div className="space-y-2">
          {stageEntries.map(([key, stage]) => {
            const meta = STAGE_META[key];
            if (!meta) return null;
            return (
              <div key={key} className="flex items-start gap-3">
                <div className={`shrink-0 rounded-lg border px-3 py-2 w-36 text-center ${meta.color}`}>
                  <span className="text-xs font-semibold block leading-tight">{stage.label}</span>
                  <span className="text-xs font-mono opacity-60 mt-0.5 block">{key}</span>
                </div>
                <div className="flex-1 rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {meta.actions.map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-foreground/80">{meta.agentBehavior}</p>
                  <div className="flex items-start gap-1 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <span><span className="text-foreground/50">Entree : </span>{meta.trigger}</span>
                  </div>
                  {meta.next !== "\u2014" && (
                    <div className="flex items-start gap-1 text-xs text-blue-600">
                      <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{meta.next}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3 : Regles Agent Prospection
// ─────────────────────────────────────────────────────────────────────────────

function ProspectionTab() {
  // Action types with message limits — only types that have message templates
  const messageActionTypes: {
    type: string;
    label: string;
    limit: string;
    rules: string[];
  }[] = [
    {
      type: "invitation",
      label: ACTION_TYPES.invitation.label,
      limit: `max ${MESSAGE_LIMITS.prospect} chars (strict)`,
      rules: [
        "Accroche basee sur un post ou observation concrete",
        "Raison credible de la connexion",
        "Pas de pitch, pas de lien, pas de proposition commerciale",
        "Termine par une question ouverte",
      ],
    },
    {
      type: "message",
      label: ACTION_TYPES.message.label,
      limit: `max ${MESSAGE_LIMITS.connected} chars`,
      rules: [
        "Hook personnalise (profil, post recent, actualite)",
        "Lien entre l\u2019observation et un sujet pertinent",
        "Valeur subtile liee au contexte (pas de pitch direct)",
        "CTA engageant : question ouverte, echange \u2014 jamais \u2018on s\u2019appelle ?\u2019",
      ],
    },
    {
      type: "inmail",
      label: ACTION_TYPES.inmail.label,
      limit: "max 1 900 chars",
      rules: [
        "Lead hors reseau. Justifier pourquoi on le contacte.",
        "Accroche forte et contextualisee (post, actualite, sujet commun)",
        "Corps plus developpe qu\u2019un message classique",
        "Ton legerement plus professionnel",
      ],
    },
    {
      type: "email",
      label: ACTION_TYPES.email.label,
      limit: "max 200 mots",
      rules: [
        "Objet court (max 8 mots), pas de clickbait",
        "Structure : accroche (1 phrase) \u2192 valeur (2-3 phrases) \u2192 CTA (1 phrase)",
        "Premiere ligne = objet prefixe \u2018Objet :\u2019",
        "Signature : prenom + Smart.AI",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tu/Vous */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Regle Tu / Vous</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">PAR DEFAUT</p>
              <p className="text-xs text-foreground/70 font-medium">{TONE_RULES.default}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Par defaut, le {TONE_RULES.default} est toujours sur. Mieux vaut sur-respecter.
              </p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-xs font-semibold text-green-700 mb-2">OVERRIDE</p>
              <p className="text-xs text-foreground/70">{TONE_RULES.override}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score x Stage matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Score x Stage -- Strategie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Score</th>
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Stage typique</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground">Approche agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2.5 pr-4">
                    <Badge variant="secondary">Cold &lt; {SCORING_THRESHOLDS.WARM}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">to_invite, invited</td>
                  <td className="py-2.5">Legere, curieuse. Zero mention Smart.AI. Connexion humaine uniquement.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                      Warm {SCORING_THRESHOLDS.WARM}\u2013{SCORING_THRESHOLDS.HOT - 1}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">connected, in_sequence</td>
                  <td className="py-2.5">Evoque automatisation, productivite, structure. Valeur subtile. Pas de pitch.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">
                    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                      Hot \u2265 {SCORING_THRESHOLDS.HOT}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">responded, meeting</td>
                  <td className="py-2.5">Direct sur Smart.AI. Social proof permis. CTA call 15 min.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Par type d&apos;action */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Regles par type d&apos;action</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/prompts">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Editer le prompt
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {messageActionTypes.map((at) => (
            <Card key={at.type}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold">{at.label}</CardTitle>
                  <Badge variant="outline" className="text-xs">{at.limit}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {at.rules.map((rule) => (
                    <li key={rule} className="flex items-start gap-1.5 text-xs text-foreground/70">
                      <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4 : Agents IA
// ─────────────────────────────────────────────────────────────────────────────

function AgentsTab() {
  const agentIds = Object.keys(RAG_AGENT_MAPPING);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {agentIds.length} agents -- chacun avec un contexte, un modele et des blocs RAG specifiques
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/prompts">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Editer les prompts
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agentIds.map((agentId) => {
          const meta = AGENT_META[agentId];
          if (!meta) return null;
          const ragBlocs = resolveRagBlocsForDisplay(agentId);

          return (
            <Card key={agentId} className={`border-l-4 ${meta.color}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{meta.label}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">temp {meta.temp}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {meta.routes.map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs font-mono">{r}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Modele : {meta.model}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Donnees d&apos;entree</p>
                  <ul className="space-y-0.5">
                    {meta.inputFields.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-foreground/70">
                        <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Blocs RAG injectes</p>
                  <div className="flex flex-wrap gap-1">
                    {ragBlocs.map((bloc) => (
                      <Badge key={bloc} variant="outline" className="text-xs">{bloc}</Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Output</p>
                  <p className="text-xs text-foreground/70">{meta.outputFormat}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Architecture systeme des prompts : </span>
            system = <code className="font-mono text-foreground">\u2460 Prompt agent</code> +{" "}
            <code className="font-mono text-foreground">\u2461 Blocs RAG</code> +{" "}
            <code className="font-mono text-foreground">\u2462 runtimeContext</code> -- user message = instruction de generation.
            Les prompts agents sont surchargeables par user dans la table <code className="font-mono text-foreground">user_prompts</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5 : Sequences & Crons
// ─────────────────────────────────────────────────────────────────────────────

interface FlowStepData {
  label: string;
  desc?: string;
  type?: "success" | "warn" | "info";
  indent?: boolean;
}

function FlowStep({ step }: { step: FlowStepData }) {
  const icon = step.type === "success"
    ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
    : step.type === "warn"
    ? <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;

  return (
    <div className={`flex items-start gap-2 ${step.indent ? "ml-4" : ""}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-medium">{step.label}</p>
        {step.desc && <p className="text-xs text-muted-foreground">{step.desc}</p>}
      </div>
    </div>
  );
}

function CronsTab() {
  const generateSteps: FlowStepData[] = [
    { label: "Pour chaque user avec compte LinkedIn actif" },
    { label: "isActiveDay(timezone, active_days)", desc: `Verifie que c\u2019est un jour ouvre (${DEFAULT_SETTINGS.active_days.join(", ")}, ${DEFAULT_SETTINGS.timezone})`, indent: true },
    { label: "getTodayQuotaCounts(userId)", desc: "Charge les quotas utilises aujourd\u2019hui", indent: true },
    { label: "Pour chaque sequence active de l\u2019user" },
    { label: "Pour chaque sequence_lead (status='active')" },
    { label: "Trouver next step (current_step + 1)", indent: true },
    { label: "Si pas de step \u2192 completer (sequence_lead.status = 'completed')", indent: true, type: "warn" },
    { label: "Verifier delay_days ecoule depuis dernier step", indent: true },
    { label: "Verifier condition du step (if_connected, always...)", indent: true },
    { label: "Check idempotency : action deja creee pour ce stepId ?", indent: true, type: "warn" },
    { label: "Check quota restant pour ce type d\u2019action", indent: true, type: "warn" },
    { label: "callAI('prospection') \u2192 message genere", indent: true, type: "success" },
    { label: "Creer action (status='pending', scheduled_at=NULL)", indent: true, type: "success" },
  ];

  const sendSteps: FlowStepData[] = [
    { label: "Sleep aleatoire 0-30s", desc: "Jitter : casse la signature bot du cron 2min regulier" },
    { label: "Atomic lock : validated \u2192 processing (max 10 actions)", desc: "Empeche les double-envois si le cron se recouvre" },
    { label: "Si 0 actions \u2192 exit early", type: "warn" },
    { label: "Pour chaque groupe d\u2019actions par user" },
    { label: `Verifier working hours (${DEFAULT_SETTINGS.start_hour}h-${DEFAULT_SETTINGS.end_hour}h, timezone user)`, indent: true, type: "warn" },
    { label: "Recuperer le compte LinkedIn actif (unipile_account_id)", indent: true },
    { label: "Pour chaque action" },
    { label: "Anti-detection : verifier delai depuis derniere action", indent: true, type: "warn" },
    { label: "executeLinkedInAction() via Unipile", indent: true, type: "success" },
    { label: "visit \u2192 getUserProfile(identifier)", indent: true },
    { label: "invitation \u2192 sendInvitation(identifier, message)", indent: true },
    { label: "message \u2192 createChat() + sendMessage() (avec fragments)", indent: true },
    { label: "processing \u2192 sent (sent_at = now)", indent: true, type: "success" },
    { label: "advanceSequenceStep() \u2192 sequence_leads.current_step++", indent: true, type: "success" },
    { label: "Erreur \u2192 status = 'failed', error_message sauvegarde", indent: true, type: "warn" },
  ];

  const conditions = [
    { type: "always", desc: "Toujours executer, peu importe le stage du lead" },
    { type: "if_connected", desc: "lead.stage in ['connected', 'in_sequence', 'responded']" },
    { type: "if_no_response", desc: "Aucun message recu depuis delay_days jours" },
    { type: "if_responded", desc: "lead.stage = 'responded'" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cron generate */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Cron generate-actions</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              <code className="font-mono">GET /api/crons/generate-actions</code><br />
              {String(DEFAULT_SETTINGS.daily_generation_hour).padStart(2, "0")}h00 Paris ({DEFAULT_SETTINGS.active_days.join(", ")}) -- max 300s
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generateSteps.map((step, i) => (
                <FlowStep key={i} step={step} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cron send */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Cron send-actions</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              <code className="font-mono">GET /api/crons/send-actions</code><br />
              Toutes les 2min ({DEFAULT_SETTINGS.start_hour}h-{DEFAULT_SETTINGS.end_hour}h, {DEFAULT_SETTINGS.active_days.join(", ")}) -- max 60s
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sendSteps.map((step, i) => (
                <FlowStep key={i} step={step} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Conditions de step (StepCondition.type)</CardTitle>
          <p className="text-xs text-muted-foreground">Chaque step dans une sequence peut avoir une condition d&apos;execution</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {conditions.map((c) => (
              <div key={c.type} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded shrink-0">{c.type}</code>
                <span className="text-xs text-foreground/70">{c.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle sequence_leads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Cycle de vie sequence_leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "active", color: "bg-green-50 border-green-200 text-green-700" },
              { label: "\u2192 current_step++ apres chaque envoi", color: "bg-muted border-border text-muted-foreground" },
              { label: "completed", color: "bg-slate-50 border-slate-200 text-slate-600" },
              { label: "ou paused", color: "bg-amber-50 border-amber-200 text-amber-700" },
            ].map((item) => (
              <div key={item.label} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${item.color}`}>
                {item.label}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Le champ <code className="font-mono">current_step</code> (INTEGER) indique le dernier step complete.
            Le cron recherche le step d&apos;ordre <code className="font-mono">current_step + 1</code> dans <code className="font-mono">sequence_steps</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 6 : Anti-detection & Timing
// ─────────────────────────────────────────────────────────────────────────────

function AntiDetectionTab() {
  const matrixTypes = ["visit", "invitation", "message"] as const;

  // Build the delay matrix from ANTI_DETECTION_DELAYS
  const getDelay = (from: string, to: string) => {
    const key = `${from}_to_${to}`;
    return ANTI_DETECTION_DELAYS[key];
  };

  // Build action statuses from ACTION_STATUSES
  const statusEntries = Object.entries(ACTION_STATUSES);

  return (
    <div className="space-y-6">
      {/* Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Matrice des delais anti-detection</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Delai minimum entre deux actions LinkedIn. Defini dans <code className="font-mono">ANTI_DETECTION_DELAYS</code> (lib/constants.ts)
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr>
                  <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-muted-foreground">De / Vers</th>
                  {matrixTypes.map((t) => (
                    <th key={t} className="border border-border bg-muted px-3 py-2 font-semibold capitalize">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixTypes.map((from) => (
                  <tr key={from}>
                    <td className="border border-border bg-muted px-3 py-2 font-semibold capitalize">{from}</td>
                    {matrixTypes.map((to) => {
                      const delay = getDelay(from, to);
                      if (!delay) return <td key={to} className="border border-border px-3 py-2 text-center">\u2014</td>;
                      const fast = isFastDelay(delay);
                      const slow = isSlowDelay(delay);
                      const cellClass = fast
                        ? "bg-green-50 text-green-700"
                        : slow
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700";
                      return (
                        <td key={to} className={`border border-border px-3 py-2 text-center font-mono ${cellClass}`}>
                          {formatDelay(delay)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded bg-green-100 border border-green-200 inline-block" />1-3 min (naturel, V \u2194 I)</div>
            <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />4-8 min (clic/scroll humain)</div>
            <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" />8-18 min (\u00e9criture message)</div>
          </div>
        </CardContent>
      </Card>

      {/* Quotas & horaires */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Horaires actifs</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plage</span>
                <span className="font-semibold">{String(DEFAULT_SETTINGS.start_hour).padStart(2, "0")}h00 -- {String(DEFAULT_SETTINGS.end_hour).padStart(2, "0")}h00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timezone</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.timezone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jours</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.active_days.join(", ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Generation</span>
                <span className="font-semibold">{String(DEFAULT_SETTINGS.daily_generation_hour).padStart(2, "0")}h00 Paris</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Quotas journaliers (defaut)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invitations</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.daily_invitations_limit} / jour</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Messages</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.daily_messages_limit} / jour</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visites</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.daily_visits_limit} / jour</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alerte quota</span>
                <span className="font-semibold">{DEFAULT_SETTINGS.quota_alert_threshold}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Scheduling non-uniforme</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs text-foreground/70">
              <p>Bursts de <span className="font-semibold text-foreground">2-3 actions</span> rapprochees ({DEFAULT_SETTINGS.interval_min_seconds}-{Math.round(DEFAULT_SETTINGS.interval_min_seconds * 1.5)}s)</p>
              <p>Puis gaps plus longs entre bursts ({DEFAULT_SETTINGS.interval_max_seconds}-{DEFAULT_SETTINGS.interval_max_seconds * 2}s)</p>
              <p>Anti-detection : floor sur le delai minimum entre types</p>
              <p>Si hors horaires \u2192 roll sur le prochain jour actif</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action statuses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Cycle de vie d&apos;une action</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {statusEntries.map(([key, status], i) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`rounded-md border px-2.5 py-1.5 text-xs ${ACTION_STATUS_COLORS[key] || "bg-muted border-border"}`}>
                  <span className="font-mono font-semibold block">{key}</span>
                  <span className="text-xs text-muted-foreground">{ACTION_STATUS_DESCRIPTIONS[key] || status.label}</span>
                </div>
                {i < statusEntries.length - 1 && i !== 3 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
