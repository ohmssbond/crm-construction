"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";

const BUCKET = "project-files";

export type UploadState = { error: string | null; ok: boolean };

/**
 * Uploads a file to the private `project-files` bucket and records an
 * `attachments` row. Path convention `{org}/{project}/{ts-filename}` is what the
 * storage RLS policies key on. `projectId` is bound by the caller; RLS enforces
 * that the signed-in artisan owns both the org folder and the project.
 */
export async function uploadAttachment(
  projectId: string,
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "");
  const isShared = formData.get("is_shared") === "on";

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", ok: false };
  }
  if (!category) {
    return { error: "Pick a category.", ok: false };
  }

  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in.", ok: false };
  const orgId = ctx.org.id;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${projectId}/${Date.now()}-${safeName}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) {
    return { error: `Upload failed: ${upErr.message}`, ok: false };
  }

  const { error: insErr } = await supabase.from("attachments").insert({
    organization_id: orgId,
    project_id: projectId,
    kind: "file",
    storage_path: path,
    category,
    filename: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    is_shared: isShared,
  });
  if (insErr) {
    // Don't leave an orphaned object if the row insert is rejected.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: `Could not save attachment: ${insErr.message}`, ok: false };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, ok: true };
}

// ── Live-edit writes ────────────────────────────────────────────────────────
// All RLS-scoped (artisan_all → is_org_member). Updates by id rely on the policy
// USING clause to confine the change to the signed-in org; inserts supply the org.

/** Post a status update (optionally shared to the portal). */
export async function postUpdate(projectId: string, body: string, isShared: boolean) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("status_updates").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    body: text,
    is_shared: isShared,
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

/** Check/uncheck a to-do. */
export async function toggleTodo(projectId: string, todoId: string, done: boolean) {
  const supabase = await createClient();
  await supabase.from("todos").update({ done }).eq("id", todoId);
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

/** Add an internal to-do to the project. */
export async function addTodo(projectId: string, body: string, dueDate: string | null) {
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
