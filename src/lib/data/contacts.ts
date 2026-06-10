import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";

// Pure display helpers live in format.ts (client-safe); re-exported here so
// existing server-side imports keep working.
export { contactName, contactInitials } from "./format";

/** Contacts list for the artisan, RLS-scoped, newest first (excludes archived). */
export async function listContacts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, type, user_id")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Archived contacts for the restore view, newest-archived first. */
export async function listArchivedContacts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  return data ?? [];
}

/** A contact plus its customer and the (non-archived) projects it's attached to. */
export async function getContactDetail(id: string) {
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, phone, type, user_id, customer:customers(id, name)"
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!contact) return null;

  const { data: links } = await supabase
    .from("project_contacts")
    .select("project:projects(id, name, stage, archived_at)")
    .eq("contact_id", id);

  const projects = (links ?? [])
    .map((l) => one(l.project))
    .filter((p): p is NonNullable<typeof p> => p != null && p.archived_at == null);

  return { contact: { ...contact, customer: one(contact.customer) }, projects };
}
