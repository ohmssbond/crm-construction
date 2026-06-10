"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { updatePassword, type ResetState } from "./actions";

const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";
const initial: ResetState = { error: null };

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initial);

  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <h1 className="text-title font-semibold">Set a new password</h1>
      <p className="text-sub text-muted mt-1">Choose a password to finish.</p>

      <form action={formAction} className="flex flex-col gap-3 mt-5">
        <label className="text-meta text-muted font-semibold">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className={`${inputCls} mt-1`}
          />
        </label>
        {state.error && (
          <p role="alert" className="text-meta text-[#b42318]">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="mt-1 justify-center disabled:opacity-60">
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
