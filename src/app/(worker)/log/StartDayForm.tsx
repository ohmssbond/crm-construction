"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput } from "@/components/ui/Field";
import { startDay } from "./actions";

export function StartDayForm({
  prior,
  defaultStart,
  name,
}: {
  prior: { id: string; label: string } | null;
  defaultStart: string;
  name: string | null;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      action={(fd) => {
        const priorEnd = String(fd.get("prior_end") ?? "");
        const todayStart = String(fd.get("today_start") ?? "");
        start(() => startDay(prior?.id ?? null, priorEnd, todayStart));
      }}
    >
      <div>
        <h1 className="text-title font-semibold">Good morning{name ? `, ${name}` : ""}</h1>
        <p className="text-meta text-muted">Set your hours to get started.</p>
      </div>
      <Card className="p-4 flex flex-col gap-3">
        {prior && (
          <Field label={`Close out ${prior.label}`}>
            <input name="prior_end" type="time" className={fieldInput} />
          </Field>
        )}
        <Field label="Started today" required>
          <input name="today_start" type="time" required defaultValue={defaultStart} className={fieldInput} />
        </Field>
      </Card>
      <Button type="submit" disabled={pending} className="disabled:opacity-60">
        {pending ? "Starting…" : "Start my day"}
      </Button>
      <p className="text-meta text-faint text-center">Jobs unlock after this.</p>
    </form>
  );
}
