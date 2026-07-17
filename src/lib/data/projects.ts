import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { withAttachmentUrls } from "./attachments";

/** Projects list for the artisan, RLS-scoped, newest first (excludes archived). */
export async function listProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, stage, start_date, end_date, customer:customers(name), project_contacts(count)"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
    contactCount: p.project_contacts?.[0]?.count ?? 0,
  }));
}

/** Editable fields for the project edit form. Null if not visible / archived. */
export async function getProject(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, customer_id, stage, start_date, end_date")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  return data;
}

/** Archived projects for the restore view, newest-archived first. */
export async function listArchivedProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  return data ?? [];
}

/**
 * Everything the project detail screen renders, in one place. All reads are
 * RLS-scoped to the signed-in org; returns null when the id isn't visible.
 */
export async function getProjectDetail(id: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, stage, start_date, end_date, customer:customers(id, name), cover_attachment_id, hero_attachment_id, before_attachment_id, after_attachment_id"
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!project) return null;

  const [updates, todos, projectContacts, attachments, fileCategories, allContacts] =
    await Promise.all([
      supabase
        .from("status_updates")
        .select("id, body, created_at, is_shared")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("todos")
        .select("id, body, due_date, done, completed_at, is_shared, owner_contact_id")
        .eq("project_id", id)
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("project_contacts")
        .select(
          "contact:contacts(id, first_name, last_name, email, type, user_id)"
        )
        .eq("project_id", id),
      supabase
        .from("attachments")
        .select(
          "id, filename, category, kind, url, is_shared, storage_path, created_at, mime_type, phase"
        )
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("file_categories")
        .select("key, label, sort")
        .order("sort", { ascending: true }),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
    ]);

  const contacts = (projectContacts.data ?? [])
    .map((pc) => one(pc.contact))
    .filter((c): c is NonNullable<typeof c> => c != null);

  const attachedIds = new Set(contacts.map((c) => c.id));
  const availableContacts = (allContacts.data ?? []).filter((c) => !attachedIds.has(c.id));

  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    todos: todos.data ?? [],
    contacts,
    availableContacts,
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    fileCategories: fileCategories.data ?? [],
  };
}
