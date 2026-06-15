"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  GitBranch,
  List,
  Inbox,
  Bot,
  FileText,
  Settings,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/actions", label: "Actions", icon: CheckSquare },
  { href: "/pipeline", label: "Pipeline", icon: Users },
  { href: "/sequences", label: "Séquences", icon: GitBranch },
  { href: "/lists", label: "Listes", icon: List },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/cockpit", label: "Cockpit", icon: Bot },
  { href: "/logs", label: "Logs IA", icon: FileText },
  { href: "/settings", label: "Réglages", icon: Settings },
  { href: "/settings/knowledge", label: "Connaissances", icon: BookOpen },
];

export function MobileNav() {
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState({ initials: "", name: "", email: "" });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const fullName = data.user?.user_metadata?.full_name
        ?? data.user?.email?.split("@")[0]
        ?? "Utilisateur";
      const email = data.user?.email ?? "";
      const initials = fullName.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2);
      setUserInfo({ initials, name: fullName, email });
    });
  }, []);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground">
              <span className="text-sm font-semibold">P</span>
            </div>
            <span className="text-base font-semibold">PROSPECTOR</span>
          </SheetTitle>
        </SheetHeader>

        <nav className="p-3">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <SheetTrigger key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150",
                      isActive
                        ? "bg-muted text-accent font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 opacity-70" />
                    {item.label}
                  </Link>
                </SheetTrigger>
              );
            })}
          </div>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground text-sm font-medium">
              {userInfo.initials || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{userInfo.name || "Utilisateur"}</div>
              <div className="text-xs text-muted-foreground truncate">{userInfo.email}</div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
