"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { FormState } from "../actions";

const initial: FormState = { error: null };

type Defaults = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  type?: string;
  customer_id?: string | null;
};

export function ContactForm({
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
  const [type, setType] = useState(defaults?.type ?? "customer");

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Name" required hint="Enter at least a first or last name.">
          <div className="flex gap-3">
            <input name="first_name" placeholder="First" defaultValue={defaults?.first_name ?? ""} className={fieldInput} />
            <input name="last_name" placeholder="Last" defaultValue={defaults?.last_name ?? ""} className={fieldInput} />
          </div>
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={fieldInput} />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={defaults?.phone ?? ""} className={fieldInput} />
        </Field>
        {type === "partner" && (
          <Field label="Company">
            <input name="company" defaultValue={defaults?.company ?? ""} className={fieldInput} />
          </Field>
        )}
        <Field label="Type" required>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldInput}
          >
            <option value="customer">Customer</option>
            <option value="partner">Partner</option>
            <option value="prospect">Prospect</option>
          </select>
        </Field>
        <Field label={clientNoun}>
          <select name="customer_id" defaultValue={defaults?.customer_id ?? ""} className={fieldInput}>
            <option value="">— none —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
