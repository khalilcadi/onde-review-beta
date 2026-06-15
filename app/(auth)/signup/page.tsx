"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Password validation
  const passwordRequirements = [
    { label: "Au moins 8 caractères", met: password.length >= 8 },
    { label: "Une majuscule", met: /[A-Z]/.test(password) },
    { label: "Un chiffre", met: /\d/.test(password) },
  ];

  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const allRequirementsMet = passwordRequirements.every((r) => r.met);
  const canSubmit = name && email && allRequirementsMet && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Show success message - user may need to confirm email
    setSuccess(true);
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setGoogleLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg border border-border p-8 w-full">
            <div className="py-4 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">
                Compte cr&eacute;&eacute; !
              </h2>
              <p className="text-muted-foreground">
                V&eacute;rifiez votre email pour confirmer votre inscription,
                puis connectez-vous.
              </p>
              <Button
                variant="accent"
                className="mt-4 h-11 px-8"
                onClick={() => router.push("/login")}
              >
                Aller &agrave; la connexion
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card">
            <span className="text-xl font-semibold text-foreground">P</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Cr&eacute;er un compte
          </h1>
          <p className="text-muted-foreground mt-2">
            Rejoignez PROSPECTOR et boostez votre prospection
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-lg border border-border p-8 w-full">
          <div className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Google Sign Up */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continuer avec Google
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground">ou</span>
              </div>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Nom complet</Label>
                <Input
                  id="signup-name"
                  type="text"
                  className="h-11"
                  placeholder="Jean Dupont"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  className="h-11"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Mot de passe</Label>
                <Input
                  id="signup-password"
                  type="password"
                  className="h-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {/* Password Requirements */}
                {password && (
                  <div className="space-y-1.5 pt-2">
                    {passwordRequirements.map((req, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 text-xs ${
                          req.met
                            ? "text-success"
                            : "text-muted-foreground"
                        }`}
                      >
                        {req.met ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        {req.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm-password">Confirmer le mot de passe</Label>
                <Input
                  id="signup-confirm-password"
                  type="password"
                  className={`h-11 ${
                    confirmPassword && !passwordsMatch
                      ? "border-destructive focus-visible:ring-destructive/30"
                      : ""
                  }`}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5" />
                    Les mots de passe ne correspondent pas
                  </p>
                )}
                {passwordsMatch && (
                  <p className="text-xs text-success flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Les mots de passe correspondent
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full h-11"
                disabled={loading || !canSubmit}
              >
                {loading ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cr&eacute;ation...
                  </span>
                ) : (
                  "Créer mon compte"
                )}
              </Button>
            </form>

            {/* Login Link */}
            <p className="text-center text-sm text-muted-foreground">
              D&eacute;j&agrave; un compte ?{" "}
              <Link
                href="/login"
                className="font-medium text-accent hover:underline"
              >
                Se connecter
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          En cr&eacute;ant un compte, vous acceptez nos{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Conditions d&apos;utilisation
          </Link>{" "}
          et{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Politique de confidentialit&eacute;
          </Link>
        </p>
      </div>
    </div>
  );
}
