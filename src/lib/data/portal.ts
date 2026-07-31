import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { monogram } from "./format";
import { withAttachmentUrls, resolveCoverHrefs, resolveHeaderImages } from "./attachments";
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
} from "./portfolio";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { productLabel } from "@/components/shell/nav";
import { groupProjectTeam, type TeamRow } from "./projectTeam";
import { getProjectSchedule } from "./schedule";

export type PortalContext = {
  accent: string;
  orgName: string;
  brand: { name: string; tile: string; label: string };
  user: { name: string; email: string; tile: string };
};

/**
 * Portal identity + branding for the signed-in contact. Branding is read LIVE
 * from the `organizations` row via the `contact_read` RLS policy (so tenant
 * color/noun edits show up immediately), falling back to the `app_metadata`
 * stamp for sessions provisioned before that policy existed. Project/update/file
 * reads also go through the live `contact_read` policies. Returns null with no session.
 */
export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS returns only the contact's own org (contact_read on organizations).
  const { data: org } = await supabase
    .from("organizations")
    .select("name, primary_color, client_noun")
    .maybeSingle();

  const m = (user.app_metadata ?? {}) as Record<string, string | undefined>;
  const orgName = org?.name || m.org_name || "Project Hub";
  const accent = org?.primary_color || m.org_color || "#2f6f5e";
  const clientNoun = org?.client_noun || m.client_noun || "Customer";
  const email = user.email ?? "";
  const name =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    m.full_name ||
    email.split("@")[0] ||
    "Account";

  return {
    accent,
    orgName,
    brand: { name: orgName, tile: monogram(orgName), label: productLabel("portal") },
    user: { name, email, tile: monogram(name) },
  };
});

/** Projects visible to the contact (RLS: attached, non-archived), newest first. */
export async function listPortalProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, stage, start_date, end_date, cover_attachment_id, customer:customers(name)"
    )
    .order("created_at", { ascending: false });

  const projects = data ?? [];

  const coverIds = projects.map((p) => p.cover_attachment_id).filter(Boolean) as string[];
  const coverById = await resolveCoverHrefs(supabase, coverIds, { sharedOnly: true });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
    coverHref: (() => {
      const c = resolveSlot(p.cover_attachment_id, coverById);
      return c ? (c.thumbHref ?? c.href) : null;
    })(),
  }));
}

/**
 * The shaped portal project view — the shared contract rendered by
 * `PortalProjectView`. Both the real portal page (`getPortalProject`) and the
 * tenant preview (`getProjectPreview`) produce this exact shape, so the two
 * render identically.
 */
export type PortalProjectDetail = NonNullable<Awaited<ReturnType<typeof getPortalProject>>>;

/**
 * Read-only project detail for the portal: the project plus ONLY its shared
 * updates, shared attachments, and the tasks visible to this contact (the ones
 * they own or that the team shared — RLS does the filtering). Null if not visible.
 */
export async function getPortalProject(id: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, stage, organization_id, cover_attachment_id, hero_attachment_id, before_attachment_id, after_attachment_id, customer:customers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) return null;

  const [updates, attachments, tasks, org, teamRows] = await Promise.all([
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
    // No is_shared filter — RLS returns only tasks this contact owns or that are shared.
    supabase
      .from("todos")
      .select("id, body, due_date, done, completed_at, owner_contact_id")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false }),
    // Org display timezone; contact_read RLS permits reading the org row.
    supabase
      .from("organizations")
      .select("timezone, name, client_noun")
      .eq("id", project.organization_id)
      .maybeSingle(),
    supabase.rpc("portal_project_team", { p_project: id }),
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

  // Before/After strip is display-only → hand it the 600px thumb.
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

  // Resolve each task's owner to a display name via the team (contacts stay
  // unreadable to the portal — the team RPC is the only exposure). A null owner
  // means the task sits with the contractor, so it shows the tenant org name.
  const orgName = org.data?.name ?? "";
  const teamList = (teamRows.data ?? []) as TeamRow[];
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
