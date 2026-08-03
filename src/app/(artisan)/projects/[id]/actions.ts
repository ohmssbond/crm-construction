"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { validatePhotoAssignment } from "@/lib/data/portfolio";
import { sendEmail, appUrl, projectUpdateEmailHtml } from "@/lib/email";
import { noonInZone, todayInZone, DEFAULT_TIMEZONE } from "@/lib/timezones";

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
  photoAttachmentId: string | null,
  date: string | null
) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // A photo on an update auto-shares it (mirrors slot/phase tagging). If the
  // referenced photo is invalid/stale, drop ONLY the photo ref and still post
  // the update (never discard the contractor's title/body).
  let photoId = photoAttachmentId;
  if (photoId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", photoId)
      .maybeSingle();
    if (validatePhotoAssignment(a, projectId)) {
      photoId = null;
    } else {
      await supabase.from("attachments").update({ is_shared: true }).eq("id", photoId);
    }
  }

  // `date` is null when the composer's picker was left on today — then we omit
  // created_at entirely and let Postgres' now() default apply, so a same-day post is
  // stamped to the minute exactly as it always was. A picked date lands at noon in the
  // ORG's zone (never the server's), and a future date is refused outright.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  if (date && date > todayInZone(tz)) return;
  const postedAt = date ? { created_at: noonInZone(date, tz) } : {};

  await supabase.from("status_updates").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    title: title.trim() || null,
    body: text,
    is_shared: isShared,
    photo_attachment_id: photoId,
    ...postedAt,
  });
  revalidatePath(`/projects/${projectId}`);

  // Best-effort: email the project team (minus author + opted-out) a link to a
  // SHARED update. Runs after the insert so a send failure never loses the post;
  // no-op without RESEND_API_KEY.
  if (!isShared) return;
  const [{ data: authData }, { data: proj }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
  ]);
  const projectName = proj?.name ?? "your project";
  const { data: recipients } = await supabase.rpc("project_notification_recipients", {
    p_project: projectId,
    p_exclude_user: authData?.user?.id ?? null,
  });
  const base = appUrl();
  await Promise.allSettled(
    ((recipients ?? []) as { email: string; type: string }[]).map((r) =>
      sendEmail({
        to: r.email,
        subject: `New update on ${projectName}`,
        html: projectUpdateEmailHtml({
          projectName,
          title: title.trim() || null,
          body: text,
          link:
            r.type === "rep"
              ? `${base}/projects/${projectId}`
              : `${base}/my-projects/${projectId}`,
        }),
      })
    )
  );
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

/** Edit a task's body + due date. RLS (is_org_member) gates this to org staff. */
export async function updateTodo(
  projectId: string,
  todoId: string,
  body: string,
  dueDate: string | null
) {
  const trimmed = body.trim();
  if (!trimmed) return; // body is required; an empty save is a no-op
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ body: trimmed, due_date: dueDate || null })
    .eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Edit an existing status update's title, body, and photo. Mirrors postUpdate's
 * photo handling (validate + auto-share) but never re-notifies the team and never
 * changes is_shared (that stays on the separate ShareToggle). RLS scopes the write
 * to the tenant's org.
 */
export async function updateStatusUpdate(
  projectId: string,
  updateId: string,
  title: string,
  body: string,
  photoAttachmentId: string | null,
  date: string | null
) {
  const text = body.trim();
  if (!text) return; // body required; an empty save is a no-op
  const ctx = await getOrgContext();
  if (!ctx) return;

  const supabase = await createClient();

  // A photo on an update auto-shares it (mirrors postUpdate). If the referenced
  // photo is invalid/stale, drop ONLY the photo ref — never fail the save over it.
  // validatePhotoAssignment returns an error string when invalid, null when valid.
  let photoId = photoAttachmentId;
  if (photoId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", photoId)
      .maybeSingle();
    if (validatePhotoAssignment(a, projectId)) {
      photoId = null;
    } else {
      await supabase.from("attachments").update({ is_shared: true }).eq("id", photoId);
    }
  }

  // Null date = the picker was untouched, so created_at stays out of the patch and the
  // update keeps its original time — rewording a body must never silently move a
  // 4:10pm update to noon. A picked date lands at noon in the ORG's zone; a future
  // date is refused.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  if (date && date > todayInZone(tz)) return;
  const postedAt = date ? { created_at: noonInZone(date, tz) } : {};

  await supabase
    .from("status_updates")
    .update({ title: title.trim() || null, body: text, photo_attachment_id: photoId, ...postedAt })
    .eq("id", updateId);
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

/**
 * Assign a staff member to this project as a Company Rep. Lazily creates one
 * bridge contact (type='rep') for the staff member — reused across projects —
 * then links it via project_contacts. Removal reuses detachContact.
 */
export async function assignRep(projectId: string, userId: string) {
  if (!userId) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // Server actions accept any argument regardless of the UI binding, so never
  // trust projectId. Confirm it belongs to the caller's org before linking
  // (defense in depth alongside the project_contacts with-check).
  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) return;

  // The roster is the source of truth for who is staff in this org.
  // NOTE: annotated (not the brief's bare inference) — this Supabase client's
  // rpc() result types as `any` here because createClient() doesn't pass the
  // Database generic, so an unannotated .find() callback fails noImplicitAny.
  const { data: staff } = await supabase.rpc("org_crm_staff");
  const member = (staff ?? []).find(
    (s: { user_id: string; full_name: string; email: string }) => s.user_id === userId
  );
  if (!member) return;

  // One bridge contact per staff member per org (contacts.user_id is UNIQUE).
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("user_id", userId)
    .maybeSingle();

  let contactId = existing?.id ?? null;
  if (!contactId) {
    const { data: created } = await supabase
      .from("contacts")
      .insert({
        organization_id: ctx.org.id,
        user_id: userId,
        type: "rep",
        first_name: member.full_name,
        email: member.email,
      })
      .select("id")
      .single();
    contactId = created?.id ?? null;
  }
  if (!contactId) return;

  // Idempotent on unique(project_id, contact_id).
  await supabase
    .from("project_contacts")
    .insert({ organization_id: ctx.org.id, project_id: projectId, contact_id: contactId });

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
