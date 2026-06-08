"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import type { World } from "./nav";

const CREATABLE_LISTS = ["projects", "customers", "contacts"];

export function Fab({ world }: { world: World }) {
  const pathname = usePathname() ?? "/";

  // No create verb in the read-only portal.
  if (world === "portal") return null;

  const seg = pathname.split("/").filter(Boolean);
  const isList = seg.length === 1 && CREATABLE_LISTS.includes(seg[0]);
  if (!isList) return null;

  return (
    <Link
      href={`/${seg[0]}/new`}
      aria-label="New"
      className="lg:hidden fixed right-4 bottom-20 size-14 rounded-full bg-accent text-white shadow-float grid place-items-center z-30"
    >
      <Plus size={24} />
    </Link>
  );
}
