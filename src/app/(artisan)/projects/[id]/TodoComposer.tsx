"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";

export function TodoComposer({
  action,
}: {
  action: (body: string, due: string | null) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text || pending) return;
    start(async () => {
      await action(text, due || null);
      setBody("");
      setDue("");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a to-do…"
        className={fieldInput}
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className={`${fieldInput} max-w-[160px]`}
      />
      <Button size="sm" onClick={submit} disabled={pending || !body.trim()} className="disabled:opacity-60">
        Add
      </Button>
    </div>
  );
}
