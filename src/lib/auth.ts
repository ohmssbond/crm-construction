import type { User } from "@supabase/supabase-js";

export type SessionRole = "artisan" | "contact" | null;

function asRole(value: unknown): SessionRole {
  return value === "artisan" || value === "contact" ? value : null;
}

/**
 * Role from the JWT custom claim stamped by the `custom_access_token_hook`
 * (derived live from memberships / contacts at token time). This is the
 * source of truth once the hook is registered.
 */
export function roleFromClaims(
  claims: Record<string, unknown> | null | undefined
): SessionRole {
  return asRole(claims?.user_role);
}

/**
 * Role from `app_metadata.role` — the provisioning-time stamp. Used as a
 * fallback for tokens minted before the access-token hook was enabled.
 */
export function getSessionRole(user: User | null): SessionRole {
  return asRole(user?.app_metadata?.role);
}
