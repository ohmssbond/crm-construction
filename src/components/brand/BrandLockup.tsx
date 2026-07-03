// src/components/brand/BrandLockup.tsx
import { BrandMark } from "./BrandMark";

export function BrandLockup({
  sublabel,
  size = 40,
  className,
}: {
  sublabel?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <BrandMark size={size} />
      <div className="min-w-0">
        <div className="text-title font-bold tracking-[-0.02em] text-text leading-none">
          Build It Together
        </div>
        {sublabel && (
          <div className="text-meta text-muted mt-1">{sublabel}</div>
        )}
      </div>
    </div>
  );
}
