"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHome } from "@/lib/auth";

export type LoginState = { error: string | null };

/**
 * Signs the user in with email + password. The Supabase server client writes
 * the session cookies (allowed here because Server Actions can set cookies);
 * `proxy.ts` keeps them refreshed thereafter.
 *
 * The post-login destination is resolved via `resolveHome`, which reads the
 * per-product `roles` claim and `contact_id` claim from the JWT (populated
 * live by the access-token hook from `memberships`): artisan → /dashboard,
 * worker → /log, contact → /my-projects.
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

  // redirect() throws a control-flow exception — must be outside any try/catch.
  redirect(resolveHome(claims));
}
