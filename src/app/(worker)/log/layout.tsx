import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productRole, resolveHome } from "@/lib/auth";
import { orgHasProduct } from "@/lib/data/entitlements";
import { NotEnabled } from "@/components/NotEnabled";
import { signOut } from "@/lib/auth-actions";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  // Must be a timebilling worker; otherwise send them to their own home.
  if (productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));

  // Org must be entitled to Time & Billing.
  const orgId = typeof claims?.org_id === "string" ? claims.org_id : null;
  if (!(await orgHasProduct(orgId, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  const hasCrm = !!productRole(claims, "crm");

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <span className="text-body font-semibold">Time logging</span>
        <div className="flex items-center gap-3 text-meta">
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">
              Back to CRM
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-body font-semibold hover:text-accent">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
