"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor, navLabel, productLabel, type World } from "./nav";
import { signOut } from "@/lib/auth-actions";
import { PoweredByFooter } from "@/components/brand/PoweredByFooter";

export type Brand = { tile: string; name: string; label: string };
export type ShellUser = { tile: string; name: string; email: string };

// Fallback for worlds whose layout hasn't been wired to real org data yet.
// Neutral platform placeholders (no tenant identity here).
const FALLBACK_BRAND: Record<World, Brand> = {
  artisan: { tile: "BIT", name: "Workspace", label: productLabel("artisan") },
  portal: { tile: "BIT", name: "Workspace", label: productLabel("portal") },
  timebilling: { tile: "BIT", name: "Workspace", label: productLabel("timebilling") },
};
const FALLBACK_USER: ShellUser = {
  tile: "BIT",
  name: "Account",
  email: "",
};

export function Sidebar({
  world,
  brand: brandProp,
  user: userProp,
  clientNoun,
  showTimeLink,
}: {
  world: World;
  brand?: Brand;
  user?: ShellUser;
  clientNoun?: string;
  showTimeLink?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const nav = navFor(world);
  const brand = brandProp ?? FALLBACK_BRAND[world];
  const user = userProp ?? FALLBACK_USER;

  return (
    <aside className="hidden lg:flex w-[236px] shrink-0 flex-col bg-surface border-r border-line">
      {/* Brand block */}
      <div className="flex items-center gap-3 px-4 h-[60px] border-b border-line">
        <div className="size-9 rounded-control bg-accent text-white grid place-items-center text-sub font-bold">
          {brand.tile}
        </div>
        <div className="min-w-0">
          <div className="text-body font-semibold truncate">{brand.name}</div>
          <div className="text-meta text-faint">{brand.label}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {nav.map((item) => {
          const { href, icon: Icon } = item;
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-[11px] py-[9px] rounded-control text-sub ${
                active
                  ? "bg-accent-soft text-accent font-semibold"
                  : "text-muted font-medium hover:bg-line-2"
              }`}
            >
              <Icon size={18} />
              {navLabel(item, clientNoun)}
            </Link>
          );
        })}
        {showTimeLink && (
          <Link
            href="/log"
            className="flex items-center gap-2 px-3 py-2 rounded-control text-meta text-muted hover:text-text"
          >
            Time logging
          </Link>
        )}
      </nav>

      {/* Account footer */}
      <div className="p-3 border-t border-line">
        {world === "timebilling" ? (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-8 rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-meta font-bold">
              {user.tile}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sub font-semibold truncate">{user.name}</div>
              <form action={signOut}>
                <button type="submit" className="text-meta text-faint hover:text-text">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <Link
            href={world === "portal" ? "/account" : "/settings"}
            className="flex items-center gap-3 px-2 py-2 rounded-control hover:bg-line-2"
          >
            <div className="size-8 rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-meta font-bold">
              {user.tile}
            </div>
            <div className="min-w-0">
              <div className="text-sub font-semibold truncate">{user.name}</div>
              <div className="text-meta text-faint truncate">{user.email}</div>
            </div>
          </Link>
        )}
      </div>

      {/* Platform footer */}
      <div className="px-4 py-3 border-t border-line">
        <PoweredByFooter />
      </div>
    </aside>
  );
}
