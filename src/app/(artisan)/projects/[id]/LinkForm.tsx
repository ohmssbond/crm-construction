"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ShareToggle } from "@/components/ui/ShareToggle";
import { fieldInput } from "@/components/ui/Field";

export function LinkForm({
  action,
  categories,
}: {
  action: (url: string, name: string, category: string, shared: boolean) => Promise<void>;
  categories: { key: string; label: string }[];
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!url.trim() || !category || pending) return;
    start(async () => {
      await action(url, name, category, shared);
      setUrl("");
      setName("");
      setCategory("");
      setShared(false);
    });
  };

  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card flex flex-wrap items-center gap-3">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a document link (Drive, Docs…)"
        className={`${fieldInput} max-w-[260px]`}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Label (optional)"
        className={`${fieldInput} max-w-[170px]`}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${fieldInput} max-w-[150px]`}>
        <option value="" disabled>
          Category…
        </option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <ShareToggle shared={shared} action={setShared} />
      <Button
        size="sm"
        onClick={submit}
        disabled={pending || !url.trim() || !category}
        className="ml-auto disabled:opacity-60"
      >
        Add link
      </Button>
    </div>
  );
}
