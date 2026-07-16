import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { monogram } from "./format";
import { withAttachmentUrls } from "./attachments";
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
} from "./portfolio";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { productLabel } from "@/components/shell/nav";

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

  // Resolve cover photos in one batch: fetch the referenced attachments (RLS
  // returns only shared ones), keep images, sign their URLs.
  const coverIds = projects.map((p) => p.cover_attachment_id).filter(Boolean) as string[];
  const coverById = new Map<string, { href: string | null }>();
  if (coverIds.length) {
    const { data: covers } = await supabase
      .from("attachments")
      .select("id, kind, mime_type, url, storage_path")
      .in("id", coverIds)
      .eq("is_shared", true);
    const images = (covers ?? []).filter(isImageAttachment);
    const signed = await withAttachmentUrls(supabase, images);
    signed.forEach((a) => coverById.set(a.id, { href: a.href }));
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
    coverHref: resolveSlot(p.cover_attachment_id, coverById)?.href ?? null,
  }));
}

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

  const [updates, attachments, tasks, fileCategories, org] = await Promise.all([
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
      .select("id, body, due_date, done, completed_at")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false }),
    // Category labels for grouping the files view; contact_read RLS permits this.
    supabase
      .from("file_categories")
      .select("key, label")
      .eq("organization_id", project.organization_id),
    // Org display timezone; contact_read RLS permits reading the org row.
    supabase
      .from("organizations")
      .select("timezone")
      .eq("id", project.organization_id)
      .maybeSingle(),
  ]);

  // Sign all shared attachments once, then split into images (gallery/slots) vs files.
  const signed = await withAttachmentUrls(supabase, attachments.data ?? []);
  const images = signed.filter(isImageAttachment);
  const files = signed.filter((a) => !isImageAttachment(a));
  const sharedImagesById = new Map(images.map((a) => [a.id, { href: a.href }]));

  const cover = resolveSlot(project.cover_attachment_id, sharedImagesById);
  const hero = resolveSlot(project.hero_attachment_id, sharedImagesById);
  const before = resolveSlot(project.before_attachment_id, sharedImagesById);
  const after = resolveSlot(project.after_attachment_id, sharedImagesById);

  const gallery = groupPhotosByPhase(
    images.map((a) => ({ id: a.id, href: a.href, phase: a.phase }))
  );

  const shapedUpdates = (updates.data ?? []).map((u) => ({
    ...u,
    photoHref: u.photo_attachment_id
      ? (sharedImagesById.get(u.photo_attachment_id)?.href ?? null)
      : null,
  }));

  return {
    project: { ...project, customer: one(project.customer) },
    status: stageToStatus(project.stage),
    cover,
    hero,
    before,
    after,
    beforeAfter: beforeAfterVisible(before, after),
    gallery,
    files,
    updates: shapedUpdates,
    // Kept for the pre-redesign portal page (Task 8 removes these consumers):
    attachments: signed,
    fileCategories: fileCategories.data ?? [],
    tasks: tasks.data ?? [],
    timezone: org.data?.timezone ?? DEFAULT_TIMEZONE,
  };
}
