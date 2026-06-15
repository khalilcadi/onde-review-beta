"use server";

import { createServerClient } from "@/lib/supabase/server";

export async function getAuthUser() {
  const supabase = createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Non authentifié");
  }

  return { supabase, user };
}
