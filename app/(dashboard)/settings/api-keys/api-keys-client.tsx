"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ExternalLink,
  Loader2,
  X,
  Zap,
  Unplug,
  RefreshCw,
  ChevronDown,
  Brain,
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
import { saveApiKey, updateSettings } from "@/lib/actions/settings";
import { AI_MODELS, getModelsByProvider } from "@/lib/ai/models";
import type { AIModelId, AIProvider } from "@/lib/ai/models";
import {
  connectLinkedIn,
  connectLinkedInWithCookies,
  disconnectLinkedIn,
  getLinkedInAccountStatus,
  syncLinkedInFromUnipile,
} from "@/lib/actions/linkedin";
import type { LinkedInAccountInfo } from "@/lib/actions/linkedin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// =============================================================================
// Types
// =============================================================================

interface ApiKeyConfig {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  docsUrl: string;
  keyType: "claude" | "openai" | "perplexity";
  logo: React.ReactNode;
}

interface ApiKeysClientProps {
  initialKeyStatus: {
    hasClaudeKey: boolean;
    hasOpenaiKey: boolean;
    hasPerplexityKey: boolean;
  };
  initialLinkedInAccount: LinkedInAccountInfo | null;
  initialSettings?: {
    ai_provider?: string;
    ai_model?: string;
  };
}

type TestStatus = "idle" | "testing" | "success" | "error";

// =============================================================================
// Logos
// =============================================================================

const UnipileLogo = () => (
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
    <span className="text-foreground font-semibold text-lg">U</span>
  </div>
);

const ClaudeLogo = () => (
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-foreground"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  </div>
);

const OpenAILogo = () => (
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-foreground" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  </div>
);

const PerplexityLogo = () => (
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
    <Zap className="h-5 w-5 text-foreground" />
  </div>
);

// =============================================================================
// Config
// =============================================================================

const API_KEYS: ApiKeyConfig[] = [
  {
    id: "claude",
    name: "Claude (Anthropic)",
    description: "Génération de messages IA personnalisés",
    placeholder: "sk-ant-xxxxxxxxxxxx",
    docsUrl: "https://console.anthropic.com",
    keyType: "claude",
    logo: <ClaudeLogo />,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Alternative pour la génération de messages (GPT-4o, GPT-5...)",
    placeholder: "sk-xxxxxxxxxxxx",
    docsUrl: "https://platform.openai.com/api-keys",
    keyType: "openai",
    logo: <OpenAILogo />,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Enrichissement automatique des leads",
    placeholder: "pplx-xxxxxxxxxxxx",
    docsUrl: "https://perplexity.ai/settings/api",
    keyType: "perplexity",
    logo: <PerplexityLogo />,
  },
];

// =============================================================================
// Component
// =============================================================================

export function ApiKeysClient({
  initialKeyStatus,
  initialLinkedInAccount,
  initialSettings,
}: ApiKeysClientProps) {
  const searchParams = useSearchParams();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState(initialKeyStatus);

  // AI model selection state
  const [aiProvider, setAiProvider] = useState<AIProvider>(
    (initialSettings?.ai_provider as AIProvider) || "claude"
  );
  const [aiModel, setAiModel] = useState<string>(
    initialSettings?.ai_model || "claude-opus-4-6"
  );
  const [savingModel, setSavingModel] = useState(false);

  // LinkedIn state
  const [linkedInAccount, setLinkedInAccount] =
    useState<LinkedInAccountInfo | null>(initialLinkedInAccount);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInStatus, setLinkedInStatus] = useState<string | null>(null);

  // Cookie dialog state
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [liAtValue, setLiAtValue] = useState("");
  const [userAgentValue, setUserAgentValue] = useState("");
  const [liAtVisible, setLiAtVisible] = useState(false);

  // Check URL params for LinkedIn connection result
  useEffect(() => {
    const linkedInParam = searchParams.get("linkedin");
    if (linkedInParam === "connected") {
      setLinkedInStatus("connected");
      // Refresh the account data
      getLinkedInAccountStatus().then((result) => {
        if (result.success) {
          setLinkedInAccount((prev) =>
            prev ? { ...prev, status: result.data.status } : prev
          );
        }
      });
    } else if (linkedInParam === "failed") {
      setLinkedInStatus("failed");
    }
  }, [searchParams]);

  const isKeyConfigured = (id: string): boolean => {
    switch (id) {
      case "claude":
        return keyStatus.hasClaudeKey;
      case "openai":
        return keyStatus.hasOpenaiKey;
      case "perplexity":
        return keyStatus.hasPerplexityKey;
      default:
        return false;
    }
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async (id: string, keyType: "claude" | "openai" | "perplexity") => {
    const key = keys[id];
    if (!key) return;

    setSaving(id);
    const result = await saveApiKey(keyType, key);
    setSaving(null);

    if (result.success) {
      setKeys((prev) => ({ ...prev, [id]: "" }));
      // Update local status
      setKeyStatus((prev) => ({
        ...prev,
        [`has${keyType.charAt(0).toUpperCase() + keyType.slice(1)}Key`]: true,
      }));
      setTestStatus((prev) => ({ ...prev, [id]: "success" }));
      toast.success("Clé API sauvegardée");
      setTimeout(() => {
        setTestStatus((prev) => ({ ...prev, [id]: "idle" }));
      }, 3000);
    } else {
      setTestStatus((prev) => ({ ...prev, [id]: "error" }));
      toast.error("Erreur lors de la sauvegarde de la clé");
      setTimeout(() => {
        setTestStatus((prev) => ({ ...prev, [id]: "idle" }));
      }, 3000);
    }
  };

  const handleConnectLinkedIn = async () => {
    setLinkedInLoading(true);
    setLinkedInStatus(null);
    const result = await connectLinkedIn(window.location.origin);
    if (result.success) {
      window.location.href = result.data.authUrl;
    } else {
      setLinkedInStatus("error");
      toast.error(`Erreur connexion LinkedIn : ${result.error}`);
      setLinkedInLoading(false);
    }
  };

  const handleSyncLinkedIn = async () => {
    setLinkedInLoading(true);
    setLinkedInStatus(null);
    const result = await syncLinkedInFromUnipile();
    setLinkedInLoading(false);
    if (result.success) {
      setLinkedInAccount(result.data);
      setLinkedInStatus("connected");
      toast.success("Compte LinkedIn synchronisé depuis Unipile");
    } else {
      toast.error(`Erreur sync : ${result.error}`);
    }
  };

  const handleDisconnectLinkedIn = async () => {
    setLinkedInLoading(true);
    const result = await disconnectLinkedIn();
    setLinkedInLoading(false);
    if (result.success) {
      setLinkedInAccount(null);
      setLinkedInStatus(null);
      toast.success("LinkedIn déconnecté");
    } else {
      toast.error("Erreur lors de la déconnexion");
    }
  };

  const handleOpenCookieDialog = () => {
    setUserAgentValue(navigator.userAgent);
    setLiAtValue("");
    setCookieDialogOpen(true);
  };

  const handleConnectWithCookies = async () => {
    if (!liAtValue.trim()) return;
    setLinkedInLoading(true);
    setCookieDialogOpen(false);
    const result = await connectLinkedInWithCookies(liAtValue.trim(), userAgentValue);
    setLinkedInLoading(false);
    if (result.success) {
      setLinkedInAccount(result.data);
      setLinkedInStatus("connected");
      setLiAtValue("");
      toast.success("LinkedIn connecté via cookies !");
    } else {
      setLinkedInStatus("error");
      toast.error(`Erreur connexion LinkedIn : ${result.error}`);
    }
  };

  const handleTestLinkedIn = async () => {
    setLinkedInLoading(true);
    const result = await getLinkedInAccountStatus();
    setLinkedInLoading(false);
    if (result.success) {
      setLinkedInStatus(result.data.isConnected ? "connected" : "error");
    } else {
      setLinkedInStatus("error");
    }
  };

  const handleProviderChange = (provider: AIProvider) => {
    setAiProvider(provider);
    const models = getModelsByProvider(provider);
    if (models.length > 0) {
      setAiModel(models[0]);
    }
  };

  const handleSaveModel = async () => {
    setSavingModel(true);
    try {
      const result = await updateSettings({
        ai_provider: aiProvider,
        ai_model: aiModel,
      });
      if (result.success) {
        toast.success("Modèle IA sauvegardé");
      } else {
        toast.error(result.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur serveur");
    } finally {
      setSavingModel(false);
    }
  };

  const availableModels = getModelsByProvider(aiProvider);

  const getTestButtonContent = (status: TestStatus) => {
    switch (status) {
      case "testing":
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Test en cours...
          </>
        );
      case "success":
        return (
          <>
            <Check className="mr-2 h-4 w-4 text-green-500" />
            Connexion OK
          </>
        );
      case "error":
        return (
          <>
            <X className="mr-2 h-4 w-4 text-red-500" />
            Échec
          </>
        );
      default:
        return "Tester connexion";
    }
  };

  const isLinkedInConnected =
    linkedInAccount !== null && linkedInAccount.status === "active";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Clés API</h1>
        <p className="text-muted-foreground">
          Configurez vos clés API pour activer les intégrations
        </p>
      </div>

      {/* Security Warning */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              Vos clés sont chiffrées et stockées de manière sécurisée
            </p>
            <p className="text-sm text-amber-700">
              Elles ne sont jamais exposées côté client et sont utilisées
              uniquement pour les appels API côté serveur. Ne partagez jamais
              vos clés avec des tiers.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Connection result feedback */}
      {linkedInStatus === "connected" && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <Check className="h-5 w-5 text-green-600" />
            <p className="font-medium text-green-800">
              Compte LinkedIn connecté avec succès !
            </p>
          </CardContent>
        </Card>
      )}
      {linkedInStatus === "failed" && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <X className="h-5 w-5 text-red-600" />
            <p className="font-medium text-red-800">
              La connexion LinkedIn a échoué. Veuillez réessayer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* API Keys Cards */}
      <div className="space-y-4">
        {API_KEYS.map((apiKey) => (
          <Card key={apiKey.id} className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {apiKey.logo}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {apiKey.name}
                      {isKeyConfigured(apiKey.id) ? (
                        <Badge variant="success" className="ml-2">
                          <Check className="mr-1 h-3 w-3" />
                          Connectée
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">
                          Non configurée
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {apiKey.description}
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={apiKey.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Docs
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={visibleKeys[apiKey.id] ? "text" : "password"}
                      placeholder={apiKey.placeholder}
                      className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-mono pr-10 focus:outline-none focus:ring-2 focus:ring-ring"
                      value={keys[apiKey.id] || ""}
                      onChange={(e) =>
                        setKeys({ ...keys, [apiKey.id]: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleVisibility(apiKey.id)}
                    >
                      {visibleKeys[apiKey.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    variant="accent"
                    onClick={() => handleSave(apiKey.id, apiKey.keyType)}
                    disabled={saving === apiKey.id || !keys[apiKey.id]}
                  >
                    {saving === apiKey.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sauvegarde...
                      </>
                    ) : (
                      "Sauvegarder"
                    )}
                  </Button>
                </div>

                <div className="text-center text-xs text-muted-foreground">
                  {getTestButtonContent(testStatus[apiKey.id] || "idle")}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Model Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Brain className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle>Modèle IA</CardTitle>
              <CardDescription className="mt-1">
                Choisissez le provider et le modèle utilisé pour la génération de messages
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Provider</label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
                >
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Modèle</label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  {availableModels.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {AI_MODELS[modelId].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Le modèle sélectionné sera utilisé pour la génération de messages et le scoring.
                Perplexity est utilisé automatiquement pour l&apos;enrichissement.
              </p>
              <Button
                variant="accent"
                size="sm"
                onClick={handleSaveModel}
                disabled={savingModel}
              >
                {savingModel ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  "Sauvegarder"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LinkedIn Connection */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <UnipileLogo />
            <div>
              <CardTitle className="flex items-center gap-2">
                Connexion LinkedIn via Unipile
                {isLinkedInConnected ? (
                  <Badge variant="success" className="ml-2">
                    <Check className="mr-1 h-3 w-3" />
                    Connecté
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-2">
                    Non connecté
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Connectez votre compte LinkedIn pour activer les fonctionnalités
                de prospection automatisée
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#0A66C2] flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </div>
              <div>
                <div className="font-medium">LinkedIn</div>
                <div className="text-sm text-muted-foreground">
                  {isLinkedInConnected
                    ? `Connecté (ID: ${linkedInAccount?.unipileAccountId.slice(0, 8)}...)`
                    : "Non connecté - Configurez Unipile pour activer"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isLinkedInConnected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestLinkedIn}
                    disabled={linkedInLoading}
                  >
                    {linkedInLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Tester</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnectLinkedIn}
                    disabled={linkedInLoading}
                    className="text-destructive hover:text-destructive"
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Déconnecter
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSyncLinkedIn}
                    disabled={linkedInLoading}
                  >
                    {linkedInLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Synchronisation...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync depuis Unipile
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleOpenCookieDialog}
                    disabled={linkedInLoading}
                  >
                    Connecter via cookies
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleConnectLinkedIn}
                    disabled={linkedInLoading}
                  >
                    Connecter via Unipile
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            La connexion LinkedIn nécessite une clé API Unipile valide. Unipile
            gère la connexion OAuth de manière sécurisée.
          </p>
        </CardContent>
      </Card>

      {/* Cookie connection dialog */}
      <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connecter via cookie li_at</DialogTitle>
            <DialogDescription>
              Dans Chrome : F12 → Application → Cookies → linkedin.com → copier la valeur de <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">li_at</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Cookie li_at
              </label>
              <div className="relative">
                <input
                  type={liAtVisible ? "text" : "password"}
                  placeholder="AQEDAxxxxxxxxxxxxxxxx..."
                  className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-mono pr-10 focus:outline-none focus:ring-2 focus:ring-ring"
                  value={liAtValue}
                  onChange={(e) => setLiAtValue(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setLiAtVisible((v) => !v)}
                >
                  {liAtVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                User Agent
              </label>
              <input
                type="text"
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                value={userAgentValue}
                onChange={(e) => setUserAgentValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Pré-rempli avec votre navigateur actuel — ne pas modifier sauf si vous avez copié le cookie depuis un autre navigateur.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setCookieDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                variant="accent"
                onClick={handleConnectWithCookies}
                disabled={!liAtValue.trim() || linkedInLoading}
              >
                {linkedInLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  "Connecter"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
