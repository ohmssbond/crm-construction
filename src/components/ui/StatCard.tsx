import Link from "next/link";
import type { ComponentType } from "react";

export function StatCard({
  count,
  label,
  icon: Icon,
  href,
}: {
  count: number | string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-surface border border-line rounded-card p-4 shadow-card min-w-[150px] flex-1 hover:border-accent"
    >
      <div className="text-stat font-bold leading-none">{count}</div>
      <div className="text-[12px] text-muted mt-[7px] font-medium flex items-center gap-1.5">
        {Icon && <Icon size={14} />}
        {label}
      </div>
    </Link>
  );
}
