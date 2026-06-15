import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Runtime targets the `beta_mission` schema, but `public` and `beta_mission`
// share the same `AppSchema` shape, so we expose the default (public) client
// type to stay compatible with the `SupabaseClient<Database>` call sites.
export function createServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies();

  return _createServerClient<Database, "beta_mission">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "beta_mission" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}
