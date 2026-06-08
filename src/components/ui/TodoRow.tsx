"use client";

import { useState, useTransition } from "react";

export function TodoRow({
  text,
  due,
  done: doneDefault = false,
  action,
}: {
  text: string;
  due?: string;
  done?: boolean;
  action?: (done: boolean) => void | Promise<void>;
}) {
  const [done, setDone] = useState(doneDefault);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !done;
    setDone(next);
    if (action) start(() => void action(next));
  };
  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      className="w-full flex items-center gap-[12px] px-[15px] py-[12px] border-b border-line-2 last:border-b-0 text-left disabled:opacity-70"
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
