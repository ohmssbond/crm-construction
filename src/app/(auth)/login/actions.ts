"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole, roleFromClaims } from "@/lib/auth";

export type LoginState = { error: string | null };

/**
 * Signs the user in with email + password. The Supabase server client writes
 * the session cookies (allowed here because Server Actions can set cookies);
 * `proxy.ts` keeps them refreshed thereafter.
 *
 * Destination follows the role stamped into `app_metadata` (artisan →
 * /dashboard, contact → /my-projects). As a fallback for any not-yet-stamped
 * user, we resolve it from membership — the SECURITY DEFINER RLS helpers let a
 * freshly signed-in user read their own `organization_members` row.
 */
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Invalid email or password." };
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const role = roleFromClaims(claims) ?? getSessionRole(data.user);
  let dest = role === "contact" ? "/my-projects" : role === "artisan" ? "/dashboard" : null;

  if (!dest) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .limit(1)
      .maybeSingle();
    dest = membership ? "/dashboard" : "/my-projects";
  }

  // redirect() throws a control-flow exception — must be outside any try/catch.
  redirect(dest);
}
