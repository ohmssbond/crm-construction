import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** The pending invitation for a contact, if any (artisan-scoped via RLS). */
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
  return data;
}

/**
 * Look up an invitation by its token for the public accept page. Uses the admin
 * client because the invitee is unauthenticated (RLS would hide it). Returns the
 * invitation joined to its contact's name, or null if missing/already accepted.
 */
export async function getInvitationByToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("id, email, status, contact:contacts(first_name, last_name)")
    .eq("token", token)
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  return { email: data.email, contactName: contact };
}
