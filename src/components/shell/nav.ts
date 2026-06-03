import type { ComponentType } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Users,
  MoreHorizontal,
  FileText,
  User,
} from "lucide-react";

export type World = "artisan" | "portal";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
};

export const artisanNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/settings", label: "Settings", icon: MoreHorizontal },
];
// Mobile bottom bar = 4 thumb targets; Customers moves under "More" (Settings).
export const artisanTabs = ["/dashboard", "/projects", "/contacts", "/settings"];

export const portalNav: NavItem[] = [
  { href: "/my-projects", label: "My Projects", icon: FileText },
  { href: "/account", label: "Account", icon: User },
];
export const portalTabs = ["/my-projects", "/account"];

export const navFor = (world: World): NavItem[] =>
  world === "portal" ? portalNav : artisanNav;

export const tabsFor = (world: World): string[] =>
  world === "portal" ? portalTabs : artisanTabs;
