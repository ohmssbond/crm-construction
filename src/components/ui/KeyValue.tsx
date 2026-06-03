import type { ReactNode } from "react";

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px] py-[7px] border-b border-line-2 last:border-b-0">
      <span className="text-muted font-semibold w-[108px] shrink-0">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}
