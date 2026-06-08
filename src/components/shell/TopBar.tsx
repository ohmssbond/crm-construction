"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { navFor, navLabel, type World } from "./nav";

const SINGULAR: Record<string, string> = {
  projects: "Project",
  customers: "Customer",
  contacts: "Contact",
  "my-projects": "Project",
};

function titleFor(world: World, pathname: string, clientNoun?: string): string {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return navFor(world)[0]?.label ?? "";
  if (seg.length >= 2) {
    if (seg[0] === "customers" && clientNoun) return clientNoun;
    return SINGULAR[seg[0]] ?? "Detail";
  }
  const item = navFor(world).find((n) => n.href === "/" + seg[0]);
  return item ? navLabel(item, clientNoun) : "";
}

export function TopBar({ world, clientNoun }: { world: World; clientNoun?: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const isDetail = pathname.split("/").filter(Boolean).length >= 2;

  return (
    <header className="h-[60px] shrink-0 bg-surface border-b border-line flex items-center gap-2 px-4 lg:px-6">
      {isDetail && (
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="lg:hidden -ml-1 size-9 grid place-items-center rounded-control text-muted hover:bg-line-2"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <h1 className="text-title font-semibold">{titleFor(world, pathname, clientNoun)}</h1>
    </header>
  );
}
