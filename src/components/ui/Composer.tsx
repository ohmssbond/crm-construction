"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { Button } from "./Button";

export function Composer({
  placeholder = "Post an update…",
  action,
}: {
  placeholder?: string;
  action?: (body: string, shared: boolean) => void | Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text || !action || pending) return;
    start(async () => {
      await action(text, shared);
      setBody("");
      setShared(false);
    });
  };

  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] py-[9px] outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-[10px] mt-[10px] border-t border-line-2 pt-[11px]">
        <ShareToggle shared={shared} action={setShared} />
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="ml-auto disabled:opacity-60 disabled:cursor-default"
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
