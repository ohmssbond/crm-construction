import type { ReactNode } from "react";

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] text-muted bg-[#fafbfc] border border-dashed border-line rounded-control px-3 py-[10px]">
      {children}
    </div>
  );
}
