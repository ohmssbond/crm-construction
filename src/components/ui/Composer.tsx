"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { Button } from "./Button";
import { fieldInput } from "./Field";

export type ComposerPhoto = { id: string; filename: string | null };

export function Composer({
  placeholder = "Post an update…",
  photos,
  defaultDate,
  action,
}: {
  placeholder?: string;
  photos?: ComposerPhoto[];
  defaultDate: string;
  action?: (
    title: string,
    body: string,
    shared: boolean,
    photoAttachmentId: string | null,
    date: string | null
  ) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  // null = the picker hasn't been touched. Structural rather than comparing against
  // `defaultDate`: that prop is recomputed on every revalidate (e.g. from an unrelated
  // Server Action elsewhere on the page) and useState does NOT re-initialize from a
  // changed prop on an already-mounted component, so an equality check can go stale
  // across a midnight rollover and silently backdate the next post.
  const [date, setDate] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveDate = date ?? defaultDate;
  const dateInFuture = effectiveDate > defaultDate;

  const submit = () => {
    const text = body.trim();
    if (!text || !action || pending || dateInFuture) return;
    start(async () => {
      await action(title, text, shared, photoId, date);
      setTitle("");
      setBody("");
      setShared(false);
      setPhotoId(null);
      setDate(null);
    });
  };

  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-transparent text-[13px] font-semibold py-[6px] outline-none placeholder:text-faint"
      />
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
      <div className="flex flex-wrap items-center gap-[10px] mt-[10px] border-t border-line-2 pt-[11px]">
        <ShareToggle shared={shared} action={setShared} />
        <input
          type="date"
          value={effectiveDate}
          max={defaultDate}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
          aria-label="Update date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        {photos && photos.length > 0 && (
          <select
            value={photoId ?? ""}
            onChange={(e) => setPhotoId(e.target.value || null)}
            className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent"
          >
            <option value="">Add photo…</option>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.filename ?? "Photo"}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || !body.trim() || dateInFuture}
          className="ml-auto disabled:opacity-60 disabled:cursor-default"
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
