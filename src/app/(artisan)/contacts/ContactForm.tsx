"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import { createContact, type FormState } from "../actions";

const initial: FormState = { error: null };

export function ContactForm({
  customers,
  clientNoun,
}: {
  customers: { id: string; name: string }[];
  clientNoun: string;
}) {
  const [state, formAction, pending] = useActionState(createContact, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex gap-3">
          <Field label="First name">
            <input name="first_name" className={fieldInput} />
          </Field>
          <Field label="Last name">
            <input name="last_name" className={fieldInput} />
          </Field>
        </div>
        <Field label="Email">
          <input name="email" type="email" className={fieldInput} />
        </Field>
        <Field label="Phone">
          <input name="phone" className={fieldInput} />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue="customer" className={fieldInput}>
            <option value="customer">Customer</option>
            <option value="partner">Partner</option>
            <option value="prospect">Prospect</option>
          </select>
        </Field>
        <Field label={clientNoun}>
          <select name="customer_id" defaultValue="" className={fieldInput}>
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
          {pending ? "Saving…" : "Create contact"}
        </Button>
      </div>
    </form>
  );
}
