import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Invites are valid for 7 days from creation (enforced in code off created_at). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isInviteExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > INVITE_TTL_MS;
}

/** The (non-expired) pending invitation for a contact, if any. RLS-scoped. */
export async function getPendingInvitation(contactId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("id, token, email, created_at")
    .eq("contact_id", contactId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && isInviteExpired(data.created_at)) return null;
  return data;
}

/**
 * Look up an invitation by its token for the public accept page. Uses the admin
 * client because the invitee is unauthenticated (RLS would hide it). Returns the
 * invitation joined to its contact's name, or null if missing / already accepted
 * / expired.
 */
export async function getInvitationByToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("id, email, status, created_at, contact:contacts(first_name, last_name)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.status !== "pending" || isInviteExpired(data.created_at)) return null;
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  return { email: data.email, contactName: contact };
}
