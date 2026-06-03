"use client";

import { usePathname } from "next/navigation";
import { Plus, Camera } from "lucide-react";
import type { World } from "./nav";

const CREATABLE_LISTS = ["projects", "customers", "contacts"];

export function Fab({ world }: { world: World }) {
  const pathname = usePathname() ?? "/";

  // No create/capture verb in the read-only portal.
  if (world === "portal") return null;

  const seg = pathname.split("/").filter(Boolean);
  const isList = seg.length === 1 && CREATABLE_LISTS.includes(seg[0]);
  const isProjectDetail = seg[0] === "projects" && seg.length >= 2;

  if (!isList && !isProjectDetail) return null;

  const Icon = isProjectDetail ? Camera : Plus;
  const label = isProjectDetail ? "Add photo" : "New";

  return (
    <button
      aria-label={label}
      className="lg:hidden fixed right-4 bottom-20 size-14 rounded-full bg-accent text-white shadow-float grid place-items-center z-30"
    >
      <Icon size={24} />
    </button>
  );
}
