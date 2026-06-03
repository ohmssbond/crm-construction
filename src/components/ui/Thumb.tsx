import type { ReactNode } from "react";

export function Thumb({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`size-[38px] rounded-control grid place-items-center text-[16px] bg-line-2 text-muted shrink-0 ${className}`}
    >
      {children}
    </div>
  );
}
