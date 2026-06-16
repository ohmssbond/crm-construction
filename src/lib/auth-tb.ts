import type { User } from "@supabase/supabase-js";

/**
 * Gate for the T&B admin surface: returns the user if they're a `timebilling`
 * admin, else redirects to their role-home. Server deps are lazy-imported.
 */
export async function requireTbAdmin(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { redirect } = await import("next/navigation");
  const { productRole, resolveHome } = await import("@/lib/auth");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (!user || productRole(claims, "timebilling") !== "admin") redirect(resolveHome(claims));
  return user as User;
}
