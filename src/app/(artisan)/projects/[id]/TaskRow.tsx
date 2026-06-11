"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";
import { ShareToggle } from "@/components/ui/ShareToggle";

export function TaskRow({
  text,
  due,
  done: doneDefault,
  completed,
  owner: ownerDefault,
  shared,
  contacts,
  toggleAction,
  ownerAction,
  shareAction,
}: {
  text: string;
  due?: string;
  done: boolean;
  completed?: string;
  owner: string | null;
  shared: boolean;
  contacts: { id: string; name: string }[];
  toggleAction: (done: boolean) => Promise<void>;
  ownerAction: (owner: string | null) => Promise<void>;
  shareAction: (shared: boolean) => Promise<void>;
}) {
  const [done, setDone] = useState(doneDefault);
  const [owner, setOwner] = useState(ownerDefault ?? "");
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !done;
    setDone(next);
    start(() => toggleAction(next));
  };
  const changeOwner = (v: string) => {
    setOwner(v);
    start(() => ownerAction(v || null));
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-[15px] py-[11px] border-b border-line-2 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`size-5 rounded-[6px] grid place-items-center shrink-0 text-white text-[12px] disabled:opacity-60 ${
          done ? "bg-accent border-2 border-accent" : "border-2 border-[#cfd4dc]"
        }`}
      >
        {done ? "✓" : ""}
      </button>
      <span className={`text-body flex-1 min-w-[140px] ${done ? "text-faint line-through" : ""}`}>
        {text}
      </span>
      <select
        value={owner}
        onChange={(e) => changeOwner(e.target.value)}
        disabled={pending}
        aria-label="Owner"
        className={`${fieldInput} max-w-[150px] text-meta py-[5px]`}
      >
        <option value="">Unassigned</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ShareToggle defaultShared={shared} action={shareAction} compact />
      <span className="text-meta text-faint w-[96px] text-right">
        {done ? (completed ? `done ${completed}` : "done") : due ? `due ${due}` : ""}
      </span>
    </div>
  );
}
