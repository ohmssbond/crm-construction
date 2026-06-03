"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor, type World } from "./nav";

const BRAND: Record<World, { tile: string; name: string; label: string }> = {
  artisan: { tile: "JH", name: "J Huber Restorations", label: "Artisan workspace" },
  portal: { tile: "JH", name: "J Huber Restorations", label: "Customer portal" },
};

export function Sidebar({ world }: { world: World }) {
  const pathname = usePathname() ?? "/";
  const nav = navFor(world);
  const brand = BRAND[world];

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
        {nav.map(({ href, label, icon: Icon }) => {
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
              {label}
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
            JH
          </div>
          <div className="min-w-0">
            <div className="text-sub font-semibold truncate">Jordan Huber</div>
            <div className="text-meta text-faint truncate">jordan@jhuber.co</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
