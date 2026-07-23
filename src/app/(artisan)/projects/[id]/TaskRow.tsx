"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";
import { ShareToggle } from "@/components/ui/ShareToggle";

export function TaskRow({
  text,
  due,
  dueDate: dueDateDefault,
  done: doneDefault,
  completed,
  owner: ownerDefault,
  shared,
  contacts,
  artisanLabel,
  toggleAction,
  ownerAction,
  shareAction,
  editAction,
}: {
  text: string;
  due?: string;
  dueDate: string | null;
  done: boolean;
  completed?: string;
  owner: string | null;
  shared: boolean;
  contacts: { id: string; name: string }[];
  artisanLabel: string;
  toggleAction: (done: boolean) => Promise<void>;
  ownerAction: (owner: string | null) => Promise<void>;
  shareAction: (shared: boolean) => Promise<void>;
  editAction: (body: string, dueDate: string | null) => Promise<void>;
}) {
  const [done, setDone] = useState(doneDefault);
  const [owner, setOwner] = useState(ownerDefault ?? "");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(text);
  const [dueDate, setDueDate] = useState(dueDateDefault ?? "");
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
  const startEdit = () => {
    setBody(text);
    setDueDate(dueDateDefault ?? "");
    setEditing(true);
  };
  const save = () => {
    if (!body.trim()) return;
    start(async () => {
      await editAction(body, dueDate || null);
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-[15px] py-[11px] border-b border-line-2 last:border-b-0">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={pending}
          aria-label="Task"
          className={`${fieldInput} flex-1 min-w-[160px]`}
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={pending}
          aria-label="Due date"
          className={`${fieldInput} text-meta py-[5px]`}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !body.trim()}
          className="text-meta font-semibold text-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-meta text-faint hover:text-body"
        >
          Cancel
        </button>
      </div>
    );
  }

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
        <option value="">{artisanLabel}</option>
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
      <button
        type="button"
        onClick={startEdit}
        disabled={pending}
        aria-label="Edit task"
        className="text-meta text-faint hover:text-accent disabled:opacity-60"
      >
        Edit
      </button>
    </div>
  );
}
