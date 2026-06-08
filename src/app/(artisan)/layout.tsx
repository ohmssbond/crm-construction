import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { getOrgContext } from "@/lib/data/org";

export default async function ArtisanLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await getOrgContext();

  // No session/membership → render the shell with placeholder branding rather
  // than blow up; proxy.ts owns redirect-to-login once ENFORCE_AUTH is on.
  if (!ctx) return <AppShell world="artisan">{children}</AppShell>;

  const { org, user } = ctx;
  return (
    <AppShell
      world="artisan"
      accent={org.primary_color}
      brand={{
        tile: org.initials,
        name: org.name,
        label: `${org.member_noun} workspace`,
      }}
      user={{ tile: user.initials, name: user.name, email: user.email }}
      clientNoun={org.client_noun}
    >
      {children}
    </AppShell>
  );
}
