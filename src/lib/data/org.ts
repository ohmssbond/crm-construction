import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";

export type OrgContext = {
  org: {
    id: string;
    name: string;
    primary_color: string;
    member_noun: string;
    client_noun: string;
    timezone: string;
    /** Two-letter monogram for the brand tile. */
    initials: string;
  };
  user: {
    name: string;
    email: string;
    initials: string;
    /** True when a real display name is set (vs. derived from the email). */
    hasName: boolean;
  };
};

/** "J Huber Restorations" → "JH"; "doug+jhuber" → "DJ"; "Sam" → "SA". */
function initials(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? words[0][0] + words[1][0]
      : (words[0] ?? name).slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Resolves the signed-in artisan's org + a display identity, scoped by RLS.
 * Memoized per request (React.cache) so the layout and the page it wraps share
 * one round-trip. Returns null when there's no session or no membership.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("organizations(id, name, primary_color, member_noun, client_noun, timezone)")
    .eq("user_id", user.id)
    .eq("product", "crm")
    .limit(1)
    .maybeSingle();

  const orgRow = one(data?.organizations);
  if (!orgRow) return null;
  const org = { ...orgRow, initials: initials(orgRow.name) };

  const fullName =
    (user.user_metadata?.full_name as string | undefined)?.trim() || "";
  const email = user.email ?? "";
  const name = fullName || email.split("@")[0] || "Account";

  return {
    org,
    user: {
      name,
      email,
      initials: initials(name),
      hasName: Boolean(fullName),
    },
  };
});
