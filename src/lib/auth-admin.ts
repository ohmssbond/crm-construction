import type { User } from "@supabase/supabase-js";

/**
 * True when `email` is in the SUPER_ADMIN_EMAILS allowlist (comma-separated,
 * server-only). Read at call time so it stays testable. Empty/unset var → false.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}

/**
 * Admin-surface gate: returns the signed-in user if they're a super-admin,
 * otherwise renders a 404 (does not reveal the route exists). Call from the admin
 * layout and re-call at the top of every admin Server Action. Server deps are
 * lazy-imported so this module's unit test loads without pulling in next/headers.
 */
export async function requireSuperAdmin(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { notFound } = await import("next/navigation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) notFound();
  return user as User;
}
