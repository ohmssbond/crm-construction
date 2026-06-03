import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-surface border border-line rounded-card shadow-card overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
