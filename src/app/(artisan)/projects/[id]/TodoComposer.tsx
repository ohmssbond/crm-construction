"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { ShareToggle } from "@/components/ui/ShareToggle";

export function TodoComposer({
  action,
  contacts,
  artisanLabel,
}: {
  action: (
    body: string,
    due: string | null,
    owner: string | null,
    shared: boolean
  ) => Promise<void>;
  contacts: { id: string; name: string }[];
  artisanLabel: string;
}) {
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text || pending) return;
    start(async () => {
      await action(text, due || null, owner || null, shared);
      setBody("");
      setDue("");
      setOwner("");
      setShared(false);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        className={`${fieldInput} min-w-[180px] flex-1`}
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className={`${fieldInput} max-w-[150px]`}
      />
      <select
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        aria-label="Assign to"
        className={`${fieldInput} max-w-[160px]`}
      >
        <option value="">{artisanLabel}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ShareToggle shared={shared} action={setShared} />
      <Button size="sm" onClick={submit} disabled={pending || !body.trim()} className="disabled:opacity-60">
        Add
      </Button>
    </div>
  );
}
