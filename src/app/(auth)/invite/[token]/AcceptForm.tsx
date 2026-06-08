"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Field";
import { acceptInvite, type AcceptState } from "./actions";

const initial: AcceptState = { error: null };
const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite.bind(null, token), initial);

  return (
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
      <FormError message={state.error} />
      <Button type="submit" disabled={pending} className="mt-1 justify-center disabled:opacity-60">
        {pending ? "Setting up…" : "Create account"}
      </Button>
    </form>
  );
}
