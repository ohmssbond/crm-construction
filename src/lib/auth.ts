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

type Claims = Record<string, unknown> | null | undefined;

export type Product = "crm" | "timebilling";

/** A staff role for a product, read from the `roles` claim object (or null). */
export function productRole(claims: Claims, product: Product): string | null {
  const roles = claims?.roles;
  if (roles && typeof roles === "object") {
    const r = (roles as Record<string, unknown>)[product];
    return typeof r === "string" ? r : null;
  }
  return null;
}

/** True when the token represents a portal contact. */
export function isContact(claims: Claims): boolean {
  const id = claims?.contact_id;
  return typeof id === "string" && id.length > 0;
}

/** Where a freshly-authenticated user should land, by role precedence. */
export function resolveHome(claims: Claims): string {
  if (productRole(claims, "crm")) return "/dashboard";
  if (productRole(claims, "timebilling") === "worker") return "/log";
  if (isContact(claims)) return "/my-projects";
  return "/login";
}
