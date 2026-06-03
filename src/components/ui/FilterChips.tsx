"use client";

import { useState } from "react";

export function FilterChips({
  options,
  defaultValue,
}: {
  options: string[];
  defaultValue?: string;
}) {
  const [val, setVal] = useState(defaultValue ?? options[0]);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => {
        const on = o === val;
        return (
          <button
            key={o}
            type="button"
            onClick={() => setVal(o)}
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
