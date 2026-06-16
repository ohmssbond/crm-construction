import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { orgHasProduct } from "@/lib/data/entitlements";
import { NotEnabled } from "@/components/NotEnabled";

export default async function TbLayout({ children }: { children: ReactNode }) {
  await requireTbAdmin();
  const ctx = await getWorkspaceContext();
  if (!ctx) return <AppShell world="timebilling">{children}</AppShell>;

  const { org, user } = ctx;
  if (!(await orgHasProduct(org.id, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  return (
    <AppShell
      world="timebilling"
      accent={org.primary_color}
      brand={{ tile: org.initials, name: org.name, label: "Time & Billing" }}
      user={{ tile: user.initials, name: user.name, email: user.email }}
    >
      {children}
    </AppShell>
  );
}
