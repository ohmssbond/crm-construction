import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { getPortalContext } from "@/lib/data/portal";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await getPortalContext();

  if (!ctx) return <AppShell world="portal">{children}</AppShell>;

  const { accent, brand, user } = ctx;
  return (
    <AppShell world="portal" accent={accent} brand={brand} user={user}>
      {children}
    </AppShell>
  );
}
