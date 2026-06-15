"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { changeTenantEmail, type EmailState } from "./actions";

const initial: EmailState = { error: null, saved: false };

export function ChangeEmailForm({
  userId,
  currentEmail,
}: {
  userId: string;
  currentEmail: string;
}) {
  const [state, action, pending] = useActionState(changeTenantEmail, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="email"
        type="email"
        defaultValue={currentEmail}
        aria-label="Login email"
        className={`${fieldInput} max-w-[220px]`}
      />
      <Button size="sm" type="submit" disabled={pending} className="disabled:opacity-60">
        {pending ? "Saving…" : "Update"}
      </Button>
      {state.saved && !pending && (
        <span className="text-meta text-accent font-semibold">Saved ✓</span>
      )}
      {state.error && <span className="text-meta text-[#b42318]">{state.error}</span>}
    </form>
  );
}
