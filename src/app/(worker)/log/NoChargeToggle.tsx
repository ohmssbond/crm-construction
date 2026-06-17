"use client";

import { useState, useTransition } from "react";
import { setNoCharge } from "./actions";

export function NoChargeToggle({
  entryId,
  jobId,
  initial,
}: {
  entryId: string;
  jobId: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => setNoCharge(entryId, jobId, next));
      }}
      className={`text-meta font-semibold px-3 py-1 rounded-control border ${
        on ? "bg-accent-soft text-accent border-accent" : "border-line text-muted"
      }`}
    >
      No charge / warranty{on ? " ✓" : ""}
    </button>
  );
}
