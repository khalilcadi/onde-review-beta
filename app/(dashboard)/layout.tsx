import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { createServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userInfo = {
    id: user.id,
    email: user.email ?? "",
    fullName:
      user.user_metadata?.full_name ??
      user.email?.split("@")[0] ??
      "Utilisateur",
    avatarUrl: user.user_metadata?.avatar_url ?? null,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={userInfo} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
