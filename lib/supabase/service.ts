/**
 * Supabase service role client — bypasses RLS.
 * Used by cron routes and webhooks (no user session context).
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ServiceClient = ReturnType<typeof createClient<Database>>;

export function createServiceClient(): ServiceClient {
  // Runtime targets the `beta_mission` schema, but `public` and `beta_mission`
  // share the same `AppSchema` shape, so we keep the default (public) client type.
  return createClient<Database, "beta_mission">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "beta_mission" },
    }
  ) as unknown as ServiceClient;
}
