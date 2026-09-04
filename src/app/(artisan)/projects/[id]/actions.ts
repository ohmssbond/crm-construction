"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { validatePhotoAssignment } from "@/lib/data/portfolio";
import { sendEmail, appUrl, projectUpdateEmailHtml } from "@/lib/email";
import { noonInZone, todayInZone, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { shouldNotifyOnShare } from "@/lib/data/notifications";

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

/**
 * Best-effort: email the project team (minus the acting user and anyone opted out) a
 * link to an update that has just become visible to the customer, then record that it
 * announced itself.
 *
 * Shared by BOTH paths — posting as shared, and flipping the Shared toggle later — so
 * the two cannot drift apart. `notified_at` is what makes an update announce exactly
 * once across repeated toggling.
 *
 * The stamp is skipped when there were no recipients, so sharing an update before the
 * customer is attached does not burn the single notification on an empty send.
 * Sends are best-effort: a failure is swallowed and never retried, matching the
 * behavior this replaces.
 */
async function notifyProjectUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  updateId: string,
  title: string | null,
  body: string
): Promise<void> {
  const [{ data: authData }, { data: proj }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
  ]);
  const projectName = proj?.name ?? "your project";
  const { data: recipients } = await supabase.rpc("project_notification_recipients", {
    p_project: projectId,
    p_exclude_user: authData?.user?.id ?? null,
  });

  const list = (recipients ?? []) as { email: string; type: string }[];
  if (list.length === 0) return; // nobody to tell — leave notified_at null so a later share can

  const base = appUrl();
  await Promise.allSettled(
    list.map((r) =>
      sendEmail({
        to: r.email,
        subject: `New update on ${projectName}`,
        html: projectUpdateEmailHtml({
          projectName,
          title,
          body,
          link:
            r.type === "rep"
              ? `${base}/projects/${projectId}`
              : `${base}/my-projects/${projectId}`,
        }),
      })
    )
  );

  await supabase
    .from("status_updates")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", updateId)
    .eq("project_id", projectId);
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

  // `date` is null when the composer's picker was left on today — then we omit
  // created_at entirely and let Postgres' now() default apply, so a same-day post is
  // stamped to the minute exactly as it always was. A picked date lands at noon in the
  // ORG's zone (never the server's), and a future or malformed date is refused outright
  // (noonInZone returns null for anything that isn't a real calendar date).
  //
  // This guard MUST run before the photo-validation block below: that block writes
  // is_shared:true on the referenced photo as a side effect, and a rejected (future-
  // dated or malformed) post must never leave that write behind — do not reorder it
  // after.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  let postedAt: { created_at: string } | Record<string, never> = {};
  if (date) {
    if (date > todayInZone(tz)) return;
    const createdAt = noonInZone(date, tz);
    if (!createdAt) return;
    postedAt = { created_at: createdAt };
  }

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

  const { data: inserted } = await supabase
    .from("status_updates")
    .insert({
      organization_id: ctx.org.id,
      project_id: projectId,
      title: title.trim() || null,
      body: text,
      is_shared: isShared,
      photo_attachment_id: photoId,
      ...postedAt,
    })
    .select("id")
    .single();
  revalidatePath(`/projects/${projectId}`);

  // Best-effort, after the insert so a send failure never loses the post. A private
  // update announces nothing now; flipping its Shared toggle later will.
  if (!isShared || !inserted?.id) return;
  await notifyProjectUpdate(supabase, projectId, inserted.id, title.trim() || null, text);
}

/**
 * Toggle a status update's portal visibility, and — the first time it becomes visible —
 * email the project team, exactly as posting it shared would have.
 */
export async function setUpdateShared(projectId: string, updateId: string, shared: boolean) {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("status_updates")
    .select("is_shared, notified_at, title, body")
    .eq("id", updateId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return;

  await supabase
    .from("status_updates")
    .update({ is_shared: shared })
    .eq("id", updateId)
    .eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`);

  if (shouldNotifyOnShare(row.is_shared, shared, row.notified_at)) {
    await notifyProjectUpdate(supabase, projectId, updateId, row.title, row.body);
  }
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

  // Null date = the picker was untouched, so created_at stays out of the patch and the
  // update keeps its original time — rewording a body must never silently move a
  // 4:10pm update to noon. A picked date lands at noon in the ORG's zone; a future or
  // malformed date is refused (noonInZone returns null for anything that isn't a real
  // calendar date).
  //
  // This guard MUST run before the photo-validation block below: that block writes
  // is_shared:true on the referenced photo as a side effect, and a rejected (future-
  // dated or malformed) edit must never leave that write behind — do not reorder it
  // after.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  let postedAt: { created_at: string } | Record<string, never> = {};
  if (date) {
    if (date > todayInZone(tz)) return;
    const createdAt = noonInZone(date, tz);
    if (!createdAt) return;
    postedAt = { created_at: createdAt };
  }

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

/**
 * Re-file an attachment under a different category.
 *
 * `attachments.category` is validated by a PER-ORG foreign key
 * (attachments_category_fk → file_categories(organization_id, key)), NOT a table-wide
 * CHECK — the valid set differs per tenant, so an unknown key would surface as a
 * foreign-key violation. Validate first and return quietly instead, matching this
 * file's convention for invalid input.
 */
export async function setAttachmentCategory(
  projectId: string,
  attachmentId: string,
  category: string
) {
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // Scope the lookup by organization_id explicitly, not by RLS visibility alone: RLS
  // admits every org the caller belongs to, so a user in two orgs could match two rows
  // and blow up maybeSingle(). The FK is (organization_id, key), so the session's org is
  // exactly the right scope.
  const { data: known } = await supabase
    .from("file_categories")
    .select("key")
    .eq("organization_id", ctx.org.id)
    .eq("key", category)
    .is("archived_at", null)
    .maybeSingle();
  if (!known) return; // not one of this org's categories

  // Scope the update by organization_id too, not just (id, project_id): getOrgContext
  // picks one of the caller's orgs arbitrarily when they belong to several, so without
  // this a key validated against org A could be written onto a row that actually
  // belongs to org B, tripping the per-org FK as an unhandled 500.
  await supabase
    .from("attachments")
    .update({ category })
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .eq("organization_id", ctx.org.id);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Delete an attachment: the row AND its object in the project-files bucket.
 *
 * Row first, then storage. A failed storage remove leaves an invisible orphan;
 * storage-first would leave a row pointing at a file that no longer exists, which shows
 * up as a broken link in the customer's portal. Links (kind='link') have no object.
 *
 * The five references to attachments (the four project photo slots and
 * status_updates.photo_attachment_id) are all `on delete set null`, so a used
 * attachment empties its slot rather than dangling. The UI warns before this point.
 */
export async function deleteAttachment(projectId: string, attachmentId: string) {
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("storage_path, kind")
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return;

  // The storage remove below must not run unless the row actually went away —
  // otherwise a failed/zero-row delete plus an unconditional storage remove would
  // destroy the object while the row (and its portal link) survives, which is exactly
  // the broken-link outcome the row-first ordering exists to prevent.
  const { error: delErr, count } = await supabase
    .from("attachments")
    .delete({ count: "exact" })
    .eq("id", attachmentId)
    .eq("project_id", projectId);
  if (delErr || !count) return;

  if (row.kind === "file" && row.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from("project-files")
      .remove([row.storage_path as string]);
    // The row is already gone at this point, so a failed remove leaves an orphaned
    // object with no trace anywhere unless we log it — surface the path so it can be
    // found and cleaned up manually.
    if (rmErr) console.error("orphaned storage object", row.storage_path, rmErr.message);
  }
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
