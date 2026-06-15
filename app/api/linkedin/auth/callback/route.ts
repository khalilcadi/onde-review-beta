import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * GET /api/linkedin/auth/callback
 * Handles the redirect from Unipile Hosted Auth after LinkedIn connection.
 * Query params: success=true|false, account_id (from Unipile on success)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const success = searchParams.get("success");
  const accountId = searchParams.get("account_id");
  const baseUrl = request.nextUrl.origin;

  // Failure case
  if (success !== "true" || !accountId) {
    const errorMsg = searchParams.get("error") || "connection_failed";
    return NextResponse.redirect(
      `${baseUrl}/settings/api-keys?linkedin=failed&error=${encodeURIComponent(errorMsg)}`
    );
  }

  try {
    // Authenticate user via session cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${baseUrl}/login?redirect=/settings/api-keys`
      );
    }

    // Check if user already has a linked account
    const { data: existing } = await supabase
      .from("linkedin_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("linkedin_accounts")
        .update({
          unipile_account_id: accountId,
          status: "active",
          account_type: "linkedin",
        })
        .eq("user_id", user.id));
    } else {
      ({ error } = await supabase.from("linkedin_accounts").insert({
        user_id: user.id,
        unipile_account_id: accountId,
        status: "active",
        account_type: "linkedin",
      }));
    }

    if (error) {
      console.error("[LinkedIn Auth Callback] DB error:", error);
      return NextResponse.redirect(
        `${baseUrl}/settings/api-keys?linkedin=failed&error=db_error`
      );
    }

    return NextResponse.redirect(
      `${baseUrl}/settings/api-keys?linkedin=connected`
    );
  } catch (err) {
    console.error("[LinkedIn Auth Callback] Error:", err);
    return NextResponse.redirect(
      `${baseUrl}/settings/api-keys?linkedin=failed&error=server_error`
    );
  }
}
