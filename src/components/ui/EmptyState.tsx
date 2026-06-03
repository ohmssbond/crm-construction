import type { ReactNode } from "react";

export function EmptyState({
  glyph,
  title,
  action,
}: {
  glyph: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-5 text-muted border border-dashed border-line rounded-card">
      <div className="text-[32px] mb-[10px]">{glyph}</div>
      <div className="text-body">{title}</div>
      {action && <div className="mt-[10px] inline-flex">{action}</div>}
    </div>
  );
}
