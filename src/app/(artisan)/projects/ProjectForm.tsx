"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { FormState } from "../actions";

const initial: FormState = { error: null };

type Defaults = {
  name?: string;
  customer_id?: string | null;
  stage?: string;
  start_date?: string | null;
  end_date?: string | null;
};

export function ProjectForm({
  action,
  customers,
  clientNoun,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  customers: { id: string; name: string }[];
  clientNoun: string;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Project name" required>
          <input name="name" required defaultValue={defaults?.name ?? ""} className={fieldInput} />
        </Field>
        <Field label={clientNoun} required>
          <select name="customer_id" required defaultValue={defaults?.customer_id ?? ""} className={fieldInput}>
            <option value="" disabled>
              Choose a {clientNoun.toLowerCase()}…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select name="stage" defaultValue={defaults?.stage ?? "proposal"} className={fieldInput}>
            <option value="proposal">Proposal</option>
            <option value="signed">Signed</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <div className="flex gap-3">
          <Field label="Start date">
            <input name="start_date" type="date" defaultValue={defaults?.start_date ?? ""} className={fieldInput} />
          </Field>
          <Field label="End date">
            <input name="end_date" type="date" defaultValue={defaults?.end_date ?? ""} className={fieldInput} />
          </Field>
        </div>
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
