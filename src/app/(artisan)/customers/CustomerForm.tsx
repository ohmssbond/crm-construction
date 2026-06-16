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
  defaults?: {
    name?: string;
    bill_line1?: string | null;
    bill_line2?: string | null;
    bill_city?: string | null;
    bill_state?: string | null;
    bill_postal_code?: string | null;
    bill_country?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  };
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
          <input name="bill_line1" placeholder="Street address" defaultValue={defaults?.bill_line1 ?? ""} className={fieldInput} />
        </Field>
        <Field label="Address line 2">
          <input name="bill_line2" defaultValue={defaults?.bill_line2 ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="City">
            <input name="bill_city" defaultValue={defaults?.bill_city ?? ""} className={fieldInput} />
          </Field>
          <Field label="State">
            <input name="bill_state" defaultValue={defaults?.bill_state ?? ""} className={fieldInput} />
          </Field>
          <Field label="Postal code">
            <input name="bill_postal_code" defaultValue={defaults?.bill_postal_code ?? ""} className={fieldInput} />
          </Field>
        </div>
        <Field label="Country">
          <input name="bill_country" defaultValue={defaults?.bill_country ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="Email">
            <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={fieldInput} />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={defaults?.phone ?? ""} className={fieldInput} />
          </Field>
        </div>
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
