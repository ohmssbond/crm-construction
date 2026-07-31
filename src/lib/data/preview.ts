import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { contactName } from "./format";
import { withAttachmentUrls, resolveHeaderImages } from "./attachments";
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
} from "./portfolio";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { groupProjectTeam, type TeamRow } from "./projectTeam";
import { getProjectSchedule } from "./schedule";
import type { PortalProjectDetail } from "./portal";

/** Which portal audience the tenant is previewing. */
export type PreviewRole = "customer" | "partner";

// org_crm_staff()'s Returns shape (the loosely-typed rpc() loses it otherwise).
type StaffMember = { user_id: string; full_name: string; email: string };

/**
 * The tenant-side preview of what a customer/partner sees for a project. Produces
 * the SAME shape as `getPortalProject` (rendered by the same `PortalProjectView`),
 * but built from the tenant's own staff access (RLS `is_org_member`) filtered to
 * shared content — no portal/contact identity, no impersonation. Null if the id
 * isn't visible to the signed-in staff member.
 *
 * `role` is the seam for future divergence: today both audiences see the same
 * shared view (see the task filter below); the parameter lets the projections
 * split later without touching callers.
 */
export async function getProjectPreview(
  id: string,
  role: PreviewRole
): Promise<PortalProjectDetail | null> {
  const supabase = await createClient();

  // Same columns as getPortalProject so the shaped `project` matches exactly.
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, stage, organization_id, cover_attachment_id, hero_attachment_id, before_attachment_id, after_attachment_id, customer:customers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) return null;

  // Both audiences currently see only shared tasks. Encoded per-role so the seam
  // is real: when customer/partner task visibility diverges, branch here.
  const sharedTasksOnly: Record<PreviewRole, boolean> = { customer: true, partner: true };

  const [updates, attachments, tasks, org, projectContacts, staff] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, title, body, created_at, is_shared, photo_attachment_id")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select(
        "id, filename, category, kind, url, is_shared, storage_path, mime_type, phase, created_at"
      )
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    (() => {
      let q = supabase
        .from("todos")
        .select("id, body, due_date, done, completed_at, owner_contact_id")
        .eq("project_id", id);
      // A portal viewer never sees unshared tasks; the tenant preview mirrors that.
      if (sharedTasksOnly[role]) q = q.eq("is_shared", true);
      return q
        .order("done", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false });
    })(),
    supabase
      .from("organizations")
      .select("timezone, name, client_noun")
      .eq("id", project.organization_id)
      .maybeSingle(),
    supabase
      .from("project_contacts")
      .select("contact:contacts(id, first_name, last_name, email, type, user_id, company)")
      .eq("project_id", id),
    supabase.rpc("org_crm_staff"),
  ]);

  // Sign all shared attachments once, then split into images (gallery/slots) vs files.
  const signed = await withAttachmentUrls(supabase, attachments.data ?? []);
  const images = signed.filter(isImageAttachment);
  const files = signed.filter((a) => !isImageAttachment(a));
  const sharedImagesById = new Map(
    images.map((a) => [a.id, { href: a.href, thumbHref: a.thumbHref }])
  );

  const cover = resolveSlot(project.cover_attachment_id, sharedImagesById);
  const beforeSlot = resolveSlot(project.before_attachment_id, sharedImagesById);
  const afterSlot = resolveSlot(project.after_attachment_id, sharedImagesById);

  const headerImages = await resolveHeaderImages(
    supabase,
    {
      cover: project.cover_attachment_id,
      hero: project.hero_attachment_id,
      before: project.before_attachment_id,
      after: project.after_attachment_id,
    },
    sharedImagesById,
    images
  );

  const before = beforeSlot ? { href: beforeSlot.thumbHref ?? beforeSlot.href, thumbHref: beforeSlot.thumbHref } : null;
  const after = afterSlot ? { href: afterSlot.thumbHref ?? afterSlot.href, thumbHref: afterSlot.thumbHref } : null;

  const gallery = groupPhotosByPhase(
    images.map((a) => ({ id: a.id, href: a.href, thumbHref: a.thumbHref, phase: a.phase }))
  );

  const shapedUpdates = (updates.data ?? []).map((u) => ({
    ...u,
    photoHref: u.photo_attachment_id
      ? (sharedImagesById.get(u.photo_attachment_id)?.thumbHref ??
         sharedImagesById.get(u.photo_attachment_id)?.href ??
         null)
      : null,
  }));

  // Build the team roster from the project's attached contacts (staff RLS reads
  // its own org's contacts directly — no portal_project_team RPC). Rep names
  // live-derive from the staff member's CURRENT full_name, mirroring getProjectDetail.
  const staffList = (staff.data ?? []) as StaffMember[];
  const staffNameById = new Map(staffList.map((s) => [s.user_id, s.full_name]));
  const attached = (projectContacts.data ?? [])
    .map((pc) => one(pc.contact))
    .filter((c): c is NonNullable<typeof c> => c != null);
  const teamList: TeamRow[] = attached.map((c) => ({
    id: c.id,
    name: (c.type === "rep" && c.user_id ? staffNameById.get(c.user_id) : null) ?? contactName(c),
    email: c.email,
    type: c.type,
    company: c.company ?? null,
  }));

  const orgName = org.data?.name ?? "";
  const ownerNameById = new Map(teamList.map((r) => [r.id, r.name]));
  const shapedTasks = (tasks.data ?? []).map((t) => ({
    ...t,
    ownerName: t.owner_contact_id
      ? (ownerNameById.get(t.owner_contact_id) ?? orgName)
      : orgName,
  }));

  return {
    project: { ...project, customer: one(project.customer) },
    status: stageToStatus(project.stage),
    cover,
    headerImages,
    before,
    after,
    beforeAfter: beforeAfterVisible(before, after),
    gallery,
    files,
    updates: shapedUpdates,
    tasks: shapedTasks,
    schedule: await getProjectSchedule(supabase, id),
    timezone: org.data?.timezone ?? DEFAULT_TIMEZONE,
    team: groupProjectTeam(teamList),
    orgName,
    clientNoun: org.data?.client_noun ?? "Customer",
  };
}
