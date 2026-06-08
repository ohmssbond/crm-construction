import type { ReactNode } from "react";

export const fieldInput =
  "w-full rounded-control border border-line bg-surface px-3 py-[9px] text-body outline-none focus:border-accent";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-meta text-muted font-semibold">
      {label}
      {children}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-meta text-[#b42318] bg-[#fef3f2] border border-[#fda29b] rounded-control px-3 py-2"
    >
      {message}
    </p>
  );
}
