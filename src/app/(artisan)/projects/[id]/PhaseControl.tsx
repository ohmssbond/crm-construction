"use client";

import { useState, useTransition } from "react";

type Phase = "before" | "during" | "after" | null;
const OPTIONS: { value: Phase; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
  { value: null, label: "—" },
];

/** Per-photo Before/During/After/— picker on an artisan image tile. */
export function PhaseControl({
  current,
  action,
}: {
  current: Phase;
  action: (phase: Phase) => Promise<{ error: string | null }>;
}) {
  const [phase, setPhase] = useState<Phase>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (value: Phase) => {
    if (pending) return;
    const prev = phase;
    setPhase(value);
    setError(null);
    start(async () => {
      const res = await action(value);
      if (res.error) {
        setPhase(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            disabled={pending}
            onClick={() => choose(o.value)}
            className={`text-chip rounded-full px-2 py-[2px] border ${
              phase === o.value
                ? "bg-accent-soft text-accent border-accent"
                : "border-line text-muted"
            } disabled:opacity-60`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <span className="text-chip text-[#b42318]">{error}</span>}
    </div>
  );
}
