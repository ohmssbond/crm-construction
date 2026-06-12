import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";
import { monogram } from "./format";
import { withAttachmentUrls } from "./attachments";

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
    brand: { name: orgName, tile: monogram(orgName), label: `${clientNoun} portal` },
    user: { name, email, tile: monogram(name) },
  };
});

/** Projects visible to the contact (RLS: attached, non-archived), newest first. */
export async function listPortalProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, stage, start_date, end_date, customer:customers(name)")
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
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
    .select("id, name, stage, organization_id, customer:customers(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) return null;

  const [updates, attachments, tasks, fileCategories] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, body, created_at, is_shared")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, filename, category, kind, url, is_shared, storage_path, created_at")
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
  ]);

  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    tasks: tasks.data ?? [],
    fileCategories: fileCategories.data ?? [],
  };
}
