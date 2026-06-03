import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <AppShell world="portal">{children}</AppShell>;
}
