"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor, navLabel, type World } from "./nav";

export type Brand = { tile: string; name: string; label: string };
export type ShellUser = { tile: string; name: string; email: string };

// Fallback for worlds whose layout hasn't been wired to real org data yet
// (currently the portal). Once wired, the layout passes `brand`/`user` in.
const FALLBACK_BRAND: Record<World, Brand> = {
  artisan: { tile: "JH", name: "J Huber Restorations", label: "Artisan workspace" },
  portal: { tile: "JH", name: "J Huber Restorations", label: "Customer portal" },
};
const FALLBACK_USER: ShellUser = {
  tile: "JH",
  name: "Jordan Huber",
  email: "jordan@jhuber.co",
};

export function Sidebar({
  world,
  brand: brandProp,
  user: userProp,
  clientNoun,
}: {
  world: World;
  brand?: Brand;
  user?: ShellUser;
  clientNoun?: string;
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
      </nav>

      {/* Account footer */}
      <div className="p-3 border-t border-line">
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
      </div>
    </aside>
  );
}
