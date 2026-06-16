"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { JobFormState } from "./actions";

type CustomerOption = {
  id: string;
  name: string;
  bill_line1: string | null;
  bill_line2: string | null;
  bill_city: string | null;
  bill_state: string | null;
  bill_postal_code: string | null;
  bill_country: string | null;
};

type Defaults = {
  customer_id?: string;
  name?: string;
  job_line1?: string | null;
  job_line2?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_postal_code?: string | null;
  job_country?: string | null;
  description?: string | null;
  notes?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  billing_type?: string;
  contract_price?: number | null;
};

const initial: JobFormState = { error: null };

export function JobForm({
  action,
  customers,
  defaults,
  submitLabel,
}: {
  action: (prev: JobFormState, fd: FormData) => Promise<JobFormState>;
  customers: CustomerOption[];
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [loc, setLoc] = useState({
    job_line1: defaults?.job_line1 ?? "",
    job_line2: defaults?.job_line2 ?? "",
    job_city: defaults?.job_city ?? "",
    job_state: defaults?.job_state ?? "",
    job_postal_code: defaults?.job_postal_code ?? "",
    job_country: defaults?.job_country ?? "",
  });
  const [billing, setBilling] = useState(defaults?.billing_type ?? "time_and_materials");

  const setLocField = (k: keyof typeof loc, v: string) => setLoc((p) => ({ ...p, [k]: v }));

  const onCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setLoc({
      job_line1: c.bill_line1 ?? "",
      job_line2: c.bill_line2 ?? "",
      job_city: c.bill_city ?? "",
      job_state: c.bill_state ?? "",
      job_postal_code: c.bill_postal_code ?? "",
      job_country: c.bill_country ?? "",
    });
  };

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Customer" required>
          <select name="customer_id" required defaultValue={defaults?.customer_id ?? ""} onChange={(e) => onCustomer(e.target.value)} className={fieldInput}>
            <option value="" disabled>Select a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Job name" required>
          <input name="name" required defaultValue={defaults?.name ?? ""} className={fieldInput} />
        </Field>

        <Field label="Site address">
          <input name="job_line1" placeholder="Street address" value={loc.job_line1} onChange={(e) => setLocField("job_line1", e.target.value)} className={fieldInput} />
        </Field>
        <input name="job_line2" placeholder="Line 2" value={loc.job_line2} onChange={(e) => setLocField("job_line2", e.target.value)} className={fieldInput} />
        <div className="flex gap-3">
          <Field label="City"><input name="job_city" value={loc.job_city} onChange={(e) => setLocField("job_city", e.target.value)} className={fieldInput} /></Field>
          <Field label="State"><input name="job_state" value={loc.job_state} onChange={(e) => setLocField("job_state", e.target.value)} className={fieldInput} /></Field>
          <Field label="Postal"><input name="job_postal_code" value={loc.job_postal_code} onChange={(e) => setLocField("job_postal_code", e.target.value)} className={fieldInput} /></Field>
        </div>
        <Field label="Country"><input name="job_country" value={loc.job_country} onChange={(e) => setLocField("job_country", e.target.value)} className={fieldInput} /></Field>

        <div className="flex gap-3">
          <Field label="Start date"><input type="date" name="start_date" defaultValue={defaults?.start_date ?? ""} className={fieldInput} /></Field>
          <Field label="End date"><input type="date" name="end_date" defaultValue={defaults?.end_date ?? ""} className={fieldInput} /></Field>
        </div>

        <Field label="Billing type" required>
          <select name="billing_type" value={billing} onChange={(e) => setBilling(e.target.value)} className={fieldInput}>
            <option value="time_and_materials">Time &amp; materials</option>
            <option value="fixed_price">Fixed price</option>
          </select>
        </Field>
        {billing === "fixed_price" && (
          <Field label="Contract price" required>
            <input name="contract_price" type="number" step="0.01" min="0" defaultValue={defaults?.contract_price ?? ""} className={fieldInput} />
          </Field>
        )}

        <Field label="Description"><textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className={fieldInput} /></Field>
        <Field label="Notes"><textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ""} className={fieldInput} /></Field>
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
