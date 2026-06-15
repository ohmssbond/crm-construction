import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth-admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin(); // 404s for non-admins

  return (
    <div className="mx-auto max-w-[860px] px-5 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Admin · Tenants</h1>
        <p className="text-meta text-muted">
          Manage tenant logins. Changes take effect immediately.
        </p>
      </header>
      {children}
    </div>
  );
}
