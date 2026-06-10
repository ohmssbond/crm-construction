"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";

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
