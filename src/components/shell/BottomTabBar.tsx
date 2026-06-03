"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor, tabsFor, type World } from "./nav";

// On phone the Settings slot reads "More" and also covers Customers.
const TAB_LABEL: Record<string, string> = { "/settings": "More" };

export function BottomTabBar({ world }: { world: World }) {
  const pathname = usePathname() ?? "/";
  const nav = navFor(world);
  const tabs = tabsFor(world);

  const isActive = (href: string) => {
    if (pathname === href || pathname.startsWith(href + "/")) return true;
    if (href === "/settings" && pathname.startsWith("/customers")) return true;
    return false;
  };

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-surface border-t border-line flex z-20">
      {tabs.map((href) => {
        const item = nav.find((n) => n.href === href);
        if (!item) return null;
        const Icon = item.icon;
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-meta font-semibold ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon size={20} />
            {TAB_LABEL[href] ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}
