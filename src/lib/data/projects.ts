import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { contactName } from "./format";
import { withAttachmentUrls } from "./attachments";
import { partitionContacts, availableStaff as computeAvailableStaff } from "./reps";
import { getProjectSchedule } from "./schedule";

// org_crm_staff()'s declared Returns shape (database.types.ts). The rpc() call
// itself types as `any` here (createClient() doesn't pass the Database
// generic), so this annotation replaces what would otherwise be lost type info.
type StaffMember = { user_id: string; full_name: string; email: string };

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

  const [updates, todos, projectContacts, attachments, fileCategories, allContacts, staff] =
    await Promise.all([
      supabase
        .from("status_updates")
        .select("id, title, body, created_at, is_shared, photo_attachment_id")
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
        .is("archived_at", null)
        .order("label", { ascending: true }),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, type")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase.rpc("org_crm_staff"),
    ]);

  const allAttached = (projectContacts.data ?? [])
    .map((pc) => one(pc.contact))
    .filter((c): c is NonNullable<typeof c> => c != null);
  const { customers: contacts, reps: repRows } = partitionContacts(allAttached);

  // Rep display names live-derive from the staff member's CURRENT full_name
  // (org_crm_staff), not the snapshot stored on the rep bridge contact at
  // assignment time — so a later account rename is reflected everywhere.
  const staffList = (staff.data ?? []) as StaffMember[];
  const staffNameById = new Map(staffList.map((s) => [s.user_id, s.full_name]));
  const reps = repRows.map((r) => ({
    ...r,
    name: (r.user_id ? staffNameById.get(r.user_id) : null) ?? contactName(r),
  }));

  const attachedIds = new Set(allAttached.map((c) => c.id));
  const availableContacts = (allContacts.data ?? []).filter(
    (c) => c.type !== "rep" && !attachedIds.has(c.id)
  );
  const availableStaff = computeAvailableStaff(staffList, reps);

  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    todos: todos.data ?? [],
    contacts,
    reps,
    availableContacts,
    availableStaff,
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    schedule: await getProjectSchedule(supabase, id),
    fileCategories: fileCategories.data ?? [],
  };
}
