import type { ReactNode } from "react";

export function Banner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="flex gap-[10px] items-start bg-accent-soft text-accent rounded-control px-[13px] py-[11px] text-sub"
      style={{ border: "1px solid color-mix(in srgb, var(--accent) 22%, #fff)" }}
    >
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
