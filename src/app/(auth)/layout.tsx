// src/app/(auth)/layout.tsx
import type { CSSProperties, ReactNode } from "react";
import { BrandLockup } from "@/components/brand/BrandLockup";

// Pre-auth surfaces have no tenant, so the platform green drives CTAs.
// Mirror the runtime accent-override pattern used by the worker shell:
// set both the raw token and the Tailwind-mapped color token.
const soft = "color-mix(in srgb, #009344 14%, #fff)";
const brandAccent = {
  "--accent": "#009344",
  "--accent-soft": soft,
  "--color-accent": "#009344",
  "--color-accent-soft": soft,
} as CSSProperties;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={brandAccent}
      className="min-h-dvh grid place-items-center bg-bg px-4"
    >
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <BrandLockup sublabel="Project Hub · Time & Billing" />
        </div>
        {children}
      </div>
    </div>
  );
}
