// src/components/brand/PoweredByFooter.tsx
import { BrandMark } from "./BrandMark";

export function PoweredByFooter({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-[6px] text-meta text-faint ${className ?? ""}`}
    >
      <span className="uppercase tracking-[0.05em]">powered by</span>
      <BrandMark size={16} />
      <span className="font-semibold text-muted tracking-[-0.01em]">
        Build It Together
      </span>
    </div>
  );
}
