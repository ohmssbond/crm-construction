"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { MaterialFormState } from "./actions";

type Defaults = {
  name?: string;
  description?: string | null;
  sku?: string | null;
  unit_price?: number | null;
  type?: string;
};

const initial: MaterialFormState = { error: null };

export function MaterialForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: MaterialFormState, fd: FormData) => Promise<MaterialFormState>;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Name" required>
          <input name="name" required defaultValue={defaults?.name ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="SKU">
            <input name="sku" defaultValue={defaults?.sku ?? ""} className={fieldInput} />
          </Field>
          <Field label="Type" required>
            <select name="type" defaultValue={defaults?.type ?? "non_inventory"} className={fieldInput}>
              <option value="service">Service</option>
              <option value="non_inventory">Non-inventory</option>
              <option value="inventory">Inventory</option>
            </select>
          </Field>
          <Field label="Unit price">
            <input name="unit_price" type="number" step="0.01" min="0" defaultValue={defaults?.unit_price ?? ""} className={fieldInput} />
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className={fieldInput} />
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
