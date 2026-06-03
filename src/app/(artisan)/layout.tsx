import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";

export default function ArtisanLayout({ children }: { children: ReactNode }) {
  return <AppShell world="artisan">{children}</AppShell>;
}
