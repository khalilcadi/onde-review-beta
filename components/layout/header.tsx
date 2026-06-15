"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Search, Command, ChevronRight, Settings, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/actions": "Actions du jour",
  "/pipeline": "Pipeline",
  "/sequences": "Séquences",
  "/lists": "Listes",
  "/inbox": "Inbox",
  "/cockpit": "Cockpit IA",
  "/logs": "Logs IA",
  "/settings": "Réglages",
  "/settings/api-keys": "Clés API",
  "/settings/prompts": "Prompts IA",
  "/settings/team": "Équipe",
  "/settings/diagnostic": "Diagnostic",
};

const SEARCH_PAGES = [
  { type: "page", title: "Dashboard", subtitle: "Vue d&apos;ensemble", href: "/" },
  { type: "page", title: "Actions du jour", subtitle: "Valider les messages", href: "/actions" },
  { type: "page", title: "Pipeline", subtitle: "Gestion des leads", href: "/pipeline" },
  { type: "page", title: "Séquences", subtitle: "Automatisation", href: "/sequences" },
  { type: "page", title: "Inbox", subtitle: "Conversations", href: "/inbox" },
  { type: "page", title: "Cockpit IA", subtitle: "Assistant pipeline", href: "/cockpit" },
  { type: "page", title: "Réglages API", subtitle: "Configurer les clés", href: "/settings/api-keys" },
  { type: "page", title: "Prompts IA", subtitle: "Personnaliser les agents", href: "/settings/prompts" },
];

export interface HeaderUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

interface HeaderProps {
  title?: string;
  user?: HeaderUser;
}

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

export function Header({ title, user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const unreadCount = 0;

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const generateBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];

    if (pathname !== "/") {
      crumbs.push({ label: "Dashboard", href: "/" });
    }

    let currentPath = "";
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const label = ROUTE_LABELS[currentPath];
      if (label) {
        crumbs.push({ label, href: currentPath });
      } else if (segment.match(/^[a-f0-9-]+$/i)) {
        if (segments[index - 1] === "pipeline") {
          crumbs.push({ label: "Fiche Lead", href: currentPath });
        } else if (segments[index - 1] === "sequences") {
          crumbs.push({ label: "Séquence", href: currentPath });
        }
      }
    });

    return crumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredResults = searchQuery
    ? SEARCH_PAGES.filter(
        (r) =>
          r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_PAGES;

  const displayName = user?.fullName ?? "Utilisateur";
  const displayEmail = user?.email ?? "";
  const initials = user ? getInitials(user.fullName) : "U";

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
        {/* Left - Mobile nav + Breadcrumbs */}
        <div className="flex items-center gap-4">
          <MobileNav />
          <nav className="hidden md:flex items-center gap-1.5 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.href} className="flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
                {index === breadcrumbs.length - 1 ? (
                  <span className="font-semibold text-foreground">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors duration-150"
                  >
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Center - Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 transition-colors duration-150"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Rechercher...</span>
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
              <Command className="h-3 w-3" />K
            </kbd>
          </button>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 text-muted-foreground"
            onClick={() => setSearchOpen(true)}
            aria-label="Rechercher"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="py-6 text-center text-sm text-muted-foreground">
                Aucune notification
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Dark Mode Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Menu utilisateur">
                <Avatar className="h-8 w-8">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-muted text-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{displayEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Mon profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  R&eacute;glages
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                disabled={loggingOut}
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {loggingOut ? "Déconnexion..." : "Se déconnecter"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 rounded-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Recherche</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher leads, séquences, pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm focus:outline-none"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              ESC
            </kbd>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-2">
            {filteredResults.length > 0 ? (
              <div className="space-y-0.5">
                {filteredResults.map((result, index) => (
                  <Link
                    key={index}
                    href={result.href}
                    onClick={() => setSearchOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors duration-150"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium bg-muted text-muted-foreground">
                      P
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{result.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucun r&eacute;sultat pour &quot;{searchQuery}&quot;
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5">&#x2191;&#x2193;</kbd>
              <span>naviguer</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5">&#x21B5;</kbd>
              <span>ouvrir</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
