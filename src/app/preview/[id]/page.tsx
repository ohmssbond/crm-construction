import { redirect, notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getOrgContext } from "@/lib/data/org";
import { getProjectPreview, type PreviewRole } from "@/lib/data/preview";
import { PortalProjectView } from "@/components/portal/PortalProjectView";

export const metadata = { title: "Portal preview" };

/**
 * Tenant preview of the customer/partner portal view of a project. Staff-gated
 * (getOrgContext), portal-styled (data-world="portal" + the tenant's accent),
 * read-only. A role switcher toggles the audience; opened in a new tab from the
 * artisan project page. No portal sidebar — the preview banner is the chrome.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, getOrgContext()]);
  // Staff only — a portal contact or signed-out user has no CRM org context.
  if (!ctx) redirect("/login");

  const role: PreviewRole = sp.role === "partner" ? "partner" : "customer";
  const detail = await getProjectPreview(id, role);
  if (!detail) notFound();

  // Theme the subtree from the tenant's brand color, exactly as AppShell does
  // (override the resolved *-accent tokens, not just --accent).
  const accent = ctx.org.primary_color;
  const soft = `color-mix(in srgb, ${accent} 14%, #fff)`;
  const style = {
    "--accent": accent,
    "--accent-soft": soft,
    "--color-accent": accent,
    "--color-accent-soft": soft,
  } as CSSProperties;

  const customerLabel = ctx.org.client_noun || "Customer";
  const roleLabel = (role === "partner" ? "partner" : customerLabel).toLowerCase();

  const roleTab = (r: PreviewRole, label: string) => (
    <a
      href={`/preview/${id}?role=${r}`}
      className={`px-3 py-1 rounded-full text-meta font-medium transition-colors ${
        role === r ? "bg-accent text-white" : "bg-surface text-muted border border-line"
      }`}
    >
      {label}
    </a>
  );

  return (
    <div data-world="portal" style={style} className="min-h-dvh bg-bg">
      {/* Preview banner — signals this is a tenant-only view, not the live portal. */}
      <div className="sticky top-0 z-10 bg-accent-soft border-b border-line">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-body font-semibold text-accent">
            Preview — this is what your {roleLabel} sees
          </span>
          <div className="flex items-center gap-1.5 lg:ml-auto">
            {roleTab("customer", customerLabel)}
            {roleTab("partner", "Partner")}
          </div>
          <a href={`/projects/${id}`} className="text-meta text-accent underline whitespace-nowrap">
            Back to project
          </a>
        </div>
      </div>
      <main className="px-4 py-5 lg:px-6 pb-16">
        <div className="mx-auto w-full max-w-[1000px]">
          <PortalProjectView detail={detail} />
        </div>
      </main>
    </div>
  );
}
