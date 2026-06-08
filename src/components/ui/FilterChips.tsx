"use client";

import { useState } from "react";

export function FilterChips({
  options,
  defaultValue,
  value: controlled,
  onChange,
}: {
  options: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [internal, setInternal] = useState(defaultValue ?? options[0]);
  const val = controlled ?? internal;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => {
        const on = o === val;
        return (
          <button
            key={o}
            type="button"
            onClick={() => {
              if (controlled === undefined) setInternal(o);
              onChange?.(o);
            }}
            className={`shrink-0 rounded-full text-[12px] font-semibold px-[13px] py-[6px] border ${
              on ? "bg-text text-white border-text" : "bg-surface text-muted border-line"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
