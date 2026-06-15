import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Runtime targets the `beta_mission` schema, but `public` and `beta_mission`
// share the same `AppSchema` shape, so we expose the default (public) client
// type to stay compatible with the `SupabaseClient<Database>` call sites.
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database, "beta_mission">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "beta_mission" },
    }
  ) as unknown as SupabaseClient<Database>;
}
