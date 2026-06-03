"use client";

import { useState } from "react";

export type Segment = { value: string; label: string };

export function SegmentedControl({
  options,
  defaultValue,
  onChange,
}: {
  options: Segment[];
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [val, setVal] = useState(defaultValue ?? options[0]?.value);
  return (
    <div className="inline-flex bg-surface border border-line rounded-[10px] p-[3px] gap-[2px]">
      {options.map((o) => {
        const on = o.value === val;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              setVal(o.value);
              onChange?.(o.value);
            }}
            className={`text-sub font-semibold px-3 py-[6px] rounded-[7px] ${
              on ? "bg-accent-soft text-accent" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
