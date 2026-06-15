"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Eye,
  GitBranch,
  List,
  Inbox,
  Radar,
  Bot,
  Settings,
  Key,
  FileText,
  BarChart3,
  BookOpen,
  Stethoscope,
  Network,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/actions", label: "Actions du jour", icon: CheckSquare },
  { href: "/pipeline", label: "Pipeline", icon: Users },
  { href: "/visitors", label: "Visiteurs", icon: Eye },
  { href: "/sequences", label: "Séquences", icon: GitBranch },
  { href: "/lists", label: "Listes", icon: List },
  { href: "/import-leads", label: "Import Leads", icon: Radar },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/cockpit", label: "Cockpit IA", icon: Bot },
  { href: "/logs", label: "Logs IA", icon: FileText },
];

const SETTINGS_ITEMS = [
  { href: "/settings", label: "Général", icon: Settings },
  { href: "/settings/api-keys", label: "Clés API", icon: Key },
  { href: "/settings/prompts", label: "Prompts IA", icon: FileText },
  { href: "/settings/knowledge", label: "Connaissances", icon: BookOpen },
  { href: "/settings/usage", label: "Usage IA", icon: BarChart3 },
  { href: "/settings/team", label: "Équipe", icon: Users },
  { href: "/settings/diagnostic", label: "Diagnostic", icon: Stethoscope },
  { href: "/system", label: "Carte système", icon: Network },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-[72px]" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
            <span className="text-sm font-semibold">P</span>
          </div>
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight">PROSPECTOR</span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={collapsed ? "Ouvrir le menu" : "R\u00e9duire le menu"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150",
                  isActive
                    ? "bg-muted text-accent font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Settings section */}
        <div className="mt-6 pt-6 border-t border-border">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150",
              isSettingsActive
                ? "bg-muted text-accent font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            <Settings className="h-4 w-4 shrink-0 opacity-70" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Réglages</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    settingsOpen && "rotate-180"
                  )}
                />
              </>
            )}
          </button>

          {settingsOpen && !collapsed && (
            <div className="mt-1 ml-3 space-y-1">
              {SETTINGS_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
                      isActive
                        ? "text-accent font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        {!collapsed ? (
          <div className="text-xs text-muted-foreground">
            PROSPECTOR v0.1.0
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-2 w-2 rounded-full bg-success" />
          </div>
        )}
      </div>
    </div>
  );
}
