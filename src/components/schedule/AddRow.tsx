"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";

/**
 * Inline "+ Phase" / "+ Task" control: a link-style button that reveals a name input.
 * Name is the only field at creation — dates are filled in afterwards via row Edit,
 * which keeps adding fast.
 */
export function AddRow({
  label,
  placeholder,
  action,
  indent = false,
}: {
  label: string;
  placeholder: string;
  action: (name: string) => Promise<void>;
  indent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      await action(name);
      setName("");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div className={`px-[15px] py-[9px] ${indent ? "pl-[34px]" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-meta font-semibold text-accent"
        >
          + {label}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 px-[15px] py-[9px] ${indent ? "pl-[34px]" : ""}`}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        disabled={pending}
        placeholder={placeholder}
        aria-label={label}
        className={`${fieldInput} flex-1 min-w-[160px]`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="text-meta font-semibold text-accent disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="text-meta text-faint hover:text-body"
      >
        Cancel
      </button>
    </div>
  );
}
