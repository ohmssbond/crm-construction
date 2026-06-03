import type { User } from "@supabase/supabase-js";

export type SessionRole = "artisan" | "contact" | null;

/**
 * Resolves a user's role from the JWT (zero DB round-trips). The role is
 * stamped into `app_metadata.role` at sign-in by a Supabase Auth hook / DB
 * trigger (not yet wired — see docs/next-steps.md). Until then this returns
 * null and `proxy.ts` keeps gating staged off.
 *
 * Mirrors the RLS model in docs/setup.md: artisan = row in
 * `organization_members`; contact = `contacts.user_id` set.
 */
export function getSessionRole(user: User | null): SessionRole {
  const role = user?.app_metadata?.role;
  return role === "artisan" || role === "contact" ? role : null;
}
