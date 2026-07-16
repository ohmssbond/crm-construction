"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { validatePhotoAssignment } from "@/lib/data/portfolio";

export type RecordResult = { error: string | null };

/**
 * Records an `attachments` row for a file the browser uploaded DIRECTLY to
 * Storage (see UploadForm). The file never passes through this Server Action —
 * only metadata does — so there is no serverless request-body limit on uploads.
 * RLS confines the insert to the signed-in org; we additionally verify the
 * storage path sits inside this org/project so a client can't register a row
 * pointing at another tenant's object.
 */
export async function recordAttachment(
  projectId: string,
  meta: {
    path: string;
    filename: string;
    mime: string | null;
    size: number;
    category: string;
    isShared: boolean;
  }
): Promise<RecordResult> {
  if (!meta.category) return { error: "Pick a category." };
  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in." };

  if (!meta.path.startsWith(`${ctx.org.id}/${projectId}/`)) {
    return { error: "Invalid upload path." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    kind: "file",
    storage_path: meta.path,
    category: meta.category,
    filename: meta.filename,
    mime_type: meta.mime,
    size_bytes: meta.size,
    is_shared: meta.isShared,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

// ── Live-edit writes ────────────────────────────────────────────────────────
// All RLS-scoped (artisan_all → is_org_member). Updates by id rely on the policy
// USING clause to confine the change to the signed-in org; inserts supply the org.

/**
 * Tag (or clear) a photo's phase. Tagging a phase auto-shares the photo
 * (is_shared = true) so the portal gallery can show it; clearing leaves sharing
 * as-is (the contractor can still pull it back via the share toggle). Validates
 * that the attachment is a same-project image before writing.
 */
export async function setPhotoPhase(
  projectId: string,
  attachmentId: string,
  phase: "before" | "during" | "after" | null
): Promise<RecordResult> {
  const supabase = await createClient();

  if (phase !== null) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", attachmentId)
      .maybeSingle();
    const err = validatePhotoAssignment(a, projectId);
    if (err) return { error: err };
    const { error } = await supabase
      .from("attachments")
      .update({ phase, is_shared: true })
      .eq("id", attachmentId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("attachments")
      .update({ phase: null })
      .eq("id", attachmentId);
    if (error) return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

const SLOT_COLUMN = {
  cover: "cover_attachment_id",
  hero: "hero_attachment_id",
  before: "before_attachment_id",
  after: "after_attachment_id",
} as const;

/**
 * Point one of the four headline slots at a photo (or clear it). Assigning a
 * photo validates it (same-project image) and auto-shares it; clearing sets the
 * slot column to null. RLS confines both writes to the signed-in org.
 */
export async function setProjectPhotoSlot(
  projectId: string,
  slot: "cover" | "hero" | "before" | "after",
  attachmentId: string | null
): Promise<RecordResult> {
  const supabase = await createClient();
  const column = SLOT_COLUMN[slot];

  if (attachmentId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", attachmentId)
      .maybeSingle();
    const err = validatePhotoAssignment(a, projectId);
    if (err) return { error: err };
    const { error: shareErr } = await supabase
      .from("attachments")
      .update({ is_shared: true })
      .eq("id", attachmentId);
    if (shareErr) return { error: shareErr.message };
  }

  const { error } = await supabase
    .from("projects")
    .update({ [column]: attachmentId })
    .eq("id", projectId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

/** Post a status update (optional title + lead photo; optionally shared). */
export async function postUpdate(
  projectId: string,
  title: string,
  body: string,
  isShared: boolean,
  photoAttachmentId: string | null
) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // A photo on an update auto-shares it (mirrors slot/phase tagging).
  if (photoAttachmentId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", photoAttachmentId)
      .maybeSingle();
    if (validatePhotoAssignment(a, projectId)) return; // silently drop a bad photo ref
    await supabase.from("attachments").update({ is_shared: true }).eq("id", photoAttachmentId);
  }

  await supabase.from("status_updates").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    title: title.trim() || null,
    body: text,
    is_shared: isShared,
    photo_attachment_id: photoAttachmentId,
  });
  revalidatePath(`/projects/${projectId}`);
}

/** Toggle a status update's portal visibility. */
export async function setUpdateShared(projectId: string, updateId: string, shared: boolean) {
  const supabase = await createClient();
  await supabase.from("status_updates").update({ is_shared: shared }).eq("id", updateId);
  revalidatePath(`/projects/${projectId}`);
}

/** Move the project to a new stage. */
export async function setProjectStage(projectId: string, stage: string) {
  const supabase = await createClient();
  await supabase.from("projects").update({ stage }).eq("id", projectId);
  revalidatePath(`/projects/${projectId}`);
}

/** Toggle a file's portal visibility. */
export async function setAttachmentShared(projectId: string, attachmentId: string, shared: boolean) {
  const supabase = await createClient();
  await supabase.from("attachments").update({ is_shared: shared }).eq("id", attachmentId);
  revalidatePath(`/projects/${projectId}`);
}

/** Check/uncheck a task; stamp/clear the completion time. */
export async function toggleTodo(projectId: string, todoId: string, done: boolean) {
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}

/** Assign a task to a project contact (null = unassigned / your side). */
export async function setTodoOwner(
  projectId: string,
  todoId: string,
  ownerContactId: string | null
) {
  const supabase = await createClient();
  await supabase.from("todos").update({ owner_contact_id: ownerContactId || null }).eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}

/** Toggle whether a task is visible to the customer. */
export async function setTodoShared(projectId: string, todoId: string, shared: boolean) {
  const supabase = await createClient();
  await supabase.from("todos").update({ is_shared: shared }).eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}

/** Attach a contact to the project — this is what grants portal access. */
export async function attachContact(projectId: string, contactId: string) {
  if (!contactId) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase
    .from("project_contacts")
    .insert({ organization_id: ctx.org.id, project_id: projectId, contact_id: contactId });
  revalidatePath(`/projects/${projectId}`);
}

/** Detach a contact — removes their portal access to this project. */
export async function detachContact(projectId: string, contactId: string) {
  const supabase = await createClient();
  await supabase
    .from("project_contacts")
    .delete()
    .eq("project_id", projectId)
    .eq("contact_id", contactId);
  revalidatePath(`/projects/${projectId}`);
}

/** Add a task to the project, optionally assigned to a contact and/or shared. */
export async function addTodo(
  projectId: string,
  body: string,
  dueDate: string | null,
  ownerContactId: string | null,
  isShared: boolean
) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("todos").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    body: text,
    due_date: dueDate || null,
    owner_contact_id: ownerContactId || null,
    is_shared: isShared,
  });
  revalidatePath(`/projects/${projectId}`);
}

/** Attach an external document link (Google Doc/Drive, etc.) — no upload. */
export async function addLink(
  projectId: string,
  url: string,
  filename: string,
  category: string,
  isShared: boolean
) {
  if (!url.trim() || !category) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("attachments").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    kind: "link",
    url: url.trim(),
    filename: filename.trim() || url.trim(),
    category,
    is_shared: isShared,
  });
  revalidatePath(`/projects/${projectId}`);
}
