import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg px-4">
      <div className="w-full max-w-[380px]">{children}</div>
    </div>
  );
}
