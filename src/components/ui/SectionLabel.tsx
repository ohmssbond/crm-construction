import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-section font-bold uppercase tracking-[0.5px] text-muted">
      {children}
    </h2>
  );
}
