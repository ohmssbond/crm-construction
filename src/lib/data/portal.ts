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
 * Portal identity + branding for the signed-in contact. A contact is NOT an org
 * member, so it can't read the organizations row under RLS — the branding it
 * needs is stamped into `app_metadata` when the portal login is provisioned
 * (see scripts/seed-contact-login.mjs). Project/update/file reads below still go
 * through the live `contact_read` RLS policies. Returns null with no session.
 *
 * TODO(auth-gating): once roles are stamped at login (step 4), back the branding
 * with a `contact_read` policy on `organizations` instead of metadata.
 */
export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const m = (user.app_metadata ?? {}) as Record<string, string | undefined>;
  const orgName = m.org_name || "Project Hub";
  const accent = m.org_color || "#2f6f5e";
  const clientNoun = m.client_noun || "Customer";
  const email = user.email ?? "";
  const name = m.full_name || email.split("@")[0] || "Account";

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
 * updates and shared attachments. Todos and internal data are excluded by RLS
 * (no contact policy) and never queried here. Null if the id isn't visible.
 */
export async function getPortalProject(id: string) {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, stage, customer:customers(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) return null;

  const [updates, attachments] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, body, created_at, is_shared")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, filename, category, kind, url, is_shared, storage_path")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
  ]);

  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
  };
}
