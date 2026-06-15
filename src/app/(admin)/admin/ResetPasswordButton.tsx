"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { resetTenantPassword } from "./actions";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setPassword(null);
    start(async () => {
      const res = await resetTenantPassword(userId);
      if (res.error) setError(res.error);
      else setPassword(res.password ?? null);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        type="button"
        onClick={reset}
        disabled={pending}
        className="disabled:opacity-60"
      >
        {pending ? "Resetting…" : "Reset password"}
      </Button>
      {password && (
        <span className="text-meta font-mono bg-line-2 px-2 py-1 rounded-control">
          {password} <span className="text-faint">— copy now, shown once</span>
        </span>
      )}
      {error && <span className="text-meta text-[#b42318]">{error}</span>}
    </div>
  );
}
