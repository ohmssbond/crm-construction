"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { FormState } from "../actions";

const initial: FormState = { error: null };

export function CustomerForm({
  action,
  defaults,
  submitLabel,
  nounLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: { name?: string; address?: string | null; notes?: string | null };
  submitLabel: string;
  nounLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label={`${nounLabel} name`} required>
          <input name="name" required defaultValue={defaults?.name ?? ""} className={fieldInput} />
        </Field>
        <Field label="Address">
          <input name="address" defaultValue={defaults?.address ?? ""} className={fieldInput} />
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={3} defaultValue={defaults?.notes ?? ""} className={fieldInput} />
        </Field>
      </Card>
      <FormError message={state.error} />
      <div>
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
