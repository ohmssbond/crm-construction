import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productRole, resolveHome } from "@/lib/auth";
import { orgHasProduct } from "@/lib/data/entitlements";
import { getWorkspaceContext } from "@/lib/data/org";
import { getWorkerName } from "@/lib/data/tb-workers";
import { NotEnabled } from "@/components/NotEnabled";
import { signOut } from "@/lib/auth-actions";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));

  const ctx = await getWorkspaceContext();
  const workerName = await getWorkerName();
  if (!(await orgHasProduct(ctx?.org.id, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  const accent = ctx?.org.primary_color;
  const soft = accent ? `color-mix(in srgb, ${accent} 14%, #fff)` : undefined;
  const style = accent
    ? ({ "--accent": accent, "--accent-soft": soft, "--color-accent": accent, "--color-accent-soft": soft } as CSSProperties)
    : undefined;
  const hasCrm = !!productRole(claims, "crm");

  return (
    <div style={style} className="min-h-dvh flex flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          {ctx && (
            <div className="size-7 rounded-control bg-accent text-white grid place-items-center text-meta font-bold shrink-0">
              {ctx.org.initials}
            </div>
          )}
          <span className="text-body font-semibold truncate">{ctx?.org.name ?? "Time logging"}</span>
          {workerName && <span className="text-meta text-muted truncate">· Hi, {workerName}</span>}
        </div>
        <div className="flex items-center gap-3 text-meta shrink-0">
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">Back to CRM</Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-body font-semibold hover:text-accent">Sign out</button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
