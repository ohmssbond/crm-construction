"use client";

import { useState } from "react";

export function TodoRow({
  text,
  due,
  done: doneDefault = false,
}: {
  text: string;
  due?: string;
  done?: boolean;
}) {
  const [done, setDone] = useState(doneDefault);
  return (
    <button
      type="button"
      onClick={() => setDone((v) => !v)}
      className="w-full flex items-center gap-[12px] px-[15px] py-[12px] border-b border-line-2 last:border-b-0 text-left"
    >
      <span
        className={`size-5 rounded-[6px] grid place-items-center shrink-0 text-white text-[12px] ${
          done ? "bg-accent border-2 border-accent" : "border-2 border-[#cfd4dc]"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={`text-body flex-1 ${done ? "text-faint line-through" : ""}`}>
        {text}
      </span>
      {due && <span className="text-meta text-faint">{done ? "done" : `due ${due}`}</span>}
    </button>
  );
}
