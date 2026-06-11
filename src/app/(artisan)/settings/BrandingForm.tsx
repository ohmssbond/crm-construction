"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import { updateBranding, type BrandingState } from "../actions";

const initial: BrandingState = { error: null, saved: false };
const PRESETS = ["#2f6f5e", "#199DB7", "#6d5ae6", "#c2410c", "#0f766e", "#be123c"];

export function BrandingForm({
  defaults,
}: {
  defaults: {
    name: string;
    primary_color: string;
    member_noun: string;
    client_noun: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateBranding, initial);
  const [color, setColor] = useState(defaults.primary_color);
  const soft = `color-mix(in srgb, ${color} 14%, #fff)`;

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Business name" required>
          <input name="name" required defaultValue={defaults.name} className={fieldInput} />
        </Field>

        <Field label="Brand color">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Brand color picker"
              className="h-9 w-12 rounded-control border border-line bg-surface p-1"
            />
            <input
              name="primary_color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              pattern="#[0-9a-fA-F]{6}"
              aria-label="Brand color hex"
              className={`${fieldInput} w-[120px] font-mono`}
            />
            <div className="flex gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setColor(p)}
                  style={{ background: p }}
                  aria-label={`Use ${p}`}
                  className="h-6 w-6 rounded-full border border-line"
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="text-meta px-2 py-1 rounded-control font-semibold"
              style={{ background: soft, color }}
            >
              Active nav
            </span>
            <span
              className="text-meta px-3 py-1 rounded-control font-semibold text-white"
              style={{ background: color }}
            >
              Button preview
            </span>
          </div>
        </Field>

        <div className="flex gap-3">
          <Field label="Role noun (e.g. Builder)" required>
            <input name="member_noun" required defaultValue={defaults.member_noun} className={fieldInput} />
          </Field>
          <Field label="Client noun (e.g. Customer)" required>
            <input name="client_noun" required defaultValue={defaults.client_noun} className={fieldInput} />
          </Field>
        </div>
      </Card>

      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Saving…" : "Save branding"}
        </Button>
        {state.saved && !pending && (
          <span className="text-meta text-accent font-semibold">Saved ✓</span>
        )}
      </div>
    </form>
  );
}
