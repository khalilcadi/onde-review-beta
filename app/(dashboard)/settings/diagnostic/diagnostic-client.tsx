"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Server,
  Database,
  Key,
  Linkedin,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  checkEnvironment,
  testSupabaseConnection,
  testUnipileConnection,
  testApiKey,
  getLinkedInStatus,
} from "@/lib/actions/diagnostic";
import type {
  EnvCheckResult,
  SupabaseTestResult,
  UnipileTestResult,
  ApiKeyTestResult,
  LinkedInDiagResult,
} from "@/lib/actions/diagnostic";

// =============================================================================
// Types
// =============================================================================

interface DiagnosticClientProps {
  initialEnv: EnvCheckResult | null;
  initialSupabase: SupabaseTestResult | null;
  initialSupabaseError: string | null;
  initialKeyStatus: {
    hasClaudeKey: boolean;
    hasOpenaiKey: boolean;
    hasPerplexityKey: boolean;
  } | null;
  initialLinkedIn: LinkedInDiagResult | null;
}

type RowStatus = "success" | "warning" | "error" | "loading" | "idle";

// =============================================================================
// Sub-component: DiagnosticRow
// =============================================================================

function DiagnosticRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: RowStatus;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium font-mono">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm ${
            status === "error"
              ? "text-red-600"
              : status === "warning"
                ? "text-amber-600"
                : "text-muted-foreground"
          }`}
        >
          {detail}
        </span>
        {status === "loading" && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        )}
        {status === "warning" && (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        )}
        {status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
        {status === "idle" && (
          <div className="h-4 w-4 rounded-full border-2 border-muted" />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DiagnosticClient({
  initialEnv,
  initialSupabase,
  initialSupabaseError,
  initialKeyStatus,
  initialLinkedIn,
}: DiagnosticClientProps) {
  // Data states
  const [envData, setEnvData] = useState(initialEnv);
  const [supabaseData, setSupabaseData] = useState(initialSupabase);
  const [supabaseError, setSupabaseError] = useState(initialSupabaseError);
  const [unipileData, setUnipileData] = useState<UnipileTestResult | null>(
    null
  );
  const [unipileError, setUnipileError] = useState<string | null>(null);
  const [linkedInData, setLinkedInData] = useState(initialLinkedIn);
  const [apiKeyResults, setApiKeyResults] = useState<
    Record<string, ApiKeyTestResult>
  >({});

  // Loading states
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);

  // =========================================================================
  // Handlers
  // =========================================================================

  async function runAllTests() {
    setIsRunningAll(true);
    setLoadingEnv(true);
    setLoadingConnections(true);
    setLoadingKeys(true);

    await Promise.allSettled([
      // Environment
      checkEnvironment().then((r) => {
        if (r.success) setEnvData(r.data);
        setLoadingEnv(false);
      }),
      // Supabase
      testSupabaseConnection().then((r) => {
        if (r.success) {
          setSupabaseData(r.data);
          setSupabaseError(null);
        } else {
          setSupabaseData(null);
          setSupabaseError(r.error);
        }
      }),
      // Unipile
      testUnipileConnection().then((r) => {
        if (r.success) {
          setUnipileData(r.data);
          setUnipileError(null);
        } else {
          setUnipileData(null);
          setUnipileError(r.error);
        }
      }),
      // LinkedIn
      getLinkedInStatus().then((r) => {
        if (r.success) setLinkedInData(r.data);
        setLoadingConnections(false);
      }),
      // API Keys
      Promise.all([
        testApiKey("claude"),
        testApiKey("openai"),
        testApiKey("perplexity"),
      ]).then(([claude, openai, perplexity]) => {
        const results: Record<string, ApiKeyTestResult> = {};
        if (claude.success) results.claude = claude.data;
        if (openai.success) results.openai = openai.data;
        if (perplexity.success) results.perplexity = perplexity.data;
        setApiKeyResults(results);
        setLoadingKeys(false);
      }),
    ]);

    setIsRunningAll(false);
  }

  // =========================================================================
  // Derived status helpers
  // =========================================================================

  function getApiKeyStatus(
    keyType: "claude" | "openai" | "perplexity"
  ): { status: RowStatus; detail: string } {
    // If we have a test result, use it
    const result = apiKeyResults[keyType];
    if (result) {
      if (!result.present) return { status: "error", detail: "Non configurée" };
      if (result.valid === true) return { status: "success", detail: "Valide (testée)" };
      if (result.valid === false)
        return {
          status: "error",
          detail: result.error
            ? `Invalide : ${result.error.slice(0, 60)}`
            : "Invalide",
        };
    }

    // Fallback to initial key status (presence only)
    if (initialKeyStatus) {
      const hasKey =
        keyType === "claude"
          ? initialKeyStatus.hasClaudeKey
          : keyType === "openai"
            ? initialKeyStatus.hasOpenaiKey
            : initialKeyStatus.hasPerplexityKey;

      if (hasKey) return { status: "warning", detail: "Présente (non testée)" };
      return { status: "error", detail: "Non configurée" };
    }

    return { status: "idle", detail: "Inconnu" };
  }

  // =========================================================================
  // Render
  // =========================================================================

  const envConfigured = envData
    ? envData.checks.filter((c) => c.present).length
    : 0;
  const envTotal = envData ? envData.checks.length : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Diagnostic Syst&egrave;me
          </h1>
          <p className="text-muted-foreground mt-1">
            V&eacute;rifiez la configuration et les connexions de votre
            installation
          </p>
        </div>
        <Button
          variant="accent"
          onClick={runAllTests}
          disabled={isRunningAll}
        >
          {isRunningAll ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Tester tout
        </Button>
      </div>

      {/* Section 1: Environment Variables */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <Server className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle>Variables d&apos;environnement</CardTitle>
                <CardDescription>
                  Pr&eacute;sence des variables requises (valeurs non
                  affich&eacute;es)
                </CardDescription>
              </div>
            </div>
            {envData && (
              <span className="text-sm text-muted-foreground">
                {envConfigured}/{envTotal}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingEnv ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : envData ? (
            <div className="space-y-1">
              {envData.checks.map((check) => (
                <DiagnosticRow
                  key={check.name}
                  label={check.name}
                  status={check.present ? "success" : "error"}
                  detail={check.present ? "Configuré" : "Manquant"}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Impossible de v&eacute;rifier les variables
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Connections */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Database className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle>Connexions</CardTitle>
              <CardDescription>
                Test de connectivit&eacute; aux services externes
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingConnections && !supabaseData && !unipileData ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Supabase */}
              <DiagnosticRow
                label="Supabase"
                status={
                  supabaseData
                    ? "success"
                    : supabaseError
                      ? "error"
                      : "idle"
                }
                detail={
                  supabaseData
                    ? `Connecté (${supabaseData.latencyMs}ms)`
                    : supabaseError
                      ? `Erreur : ${supabaseError.slice(0, 60)}`
                      : "Non testé"
                }
              />

              {/* Unipile */}
              <DiagnosticRow
                label="Unipile"
                status={
                  unipileData
                    ? "success"
                    : unipileError
                      ? "error"
                      : "idle"
                }
                detail={
                  unipileData
                    ? `Connecté (${unipileData.accountCount} compte${unipileData.accountCount > 1 ? "s" : ""})`
                    : unipileError
                      ? `Erreur : ${unipileError.slice(0, 60)}`
                      : "Cliquez sur Tester tout"
                }
              />

              {/* LinkedIn */}
              <DiagnosticRow
                label="LinkedIn"
                status={
                  linkedInData
                    ? linkedInData.hasAccount
                      ? linkedInData.status === "active"
                        ? "success"
                        : "warning"
                      : "error"
                    : "idle"
                }
                detail={
                  linkedInData
                    ? linkedInData.hasAccount
                      ? linkedInData.status === "active"
                        ? "Actif"
                        : `Statut : ${linkedInData.status}`
                      : "Non connecté"
                    : "Non testé"
                }
              />

              {/* Unipile account details */}
              {unipileData &&
                unipileData.accounts.length > 0 &&
                unipileData.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between py-2 px-3 ml-6 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {account.name}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        account.status.toLowerCase() === "connected"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {account.status}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: User API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Key className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <CardTitle>Cl&eacute;s API utilisateur</CardTitle>
              <CardDescription>
                V&eacute;rification des cl&eacute;s API stock&eacute;es
                (chiffr&eacute;es AES-256-GCM)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingKeys ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {(
                [
                  { key: "claude" as const, label: "Claude (Anthropic)" },
                  { key: "openai" as const, label: "OpenAI" },
                  { key: "perplexity" as const, label: "Perplexity" },
                ] as const
              ).map(({ key, label }) => {
                const { status, detail } = getApiKeyStatus(key);
                return (
                  <DiagnosticRow
                    key={key}
                    label={label}
                    status={status}
                    detail={detail}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
