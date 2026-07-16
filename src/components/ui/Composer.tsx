"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { Button } from "./Button";

export type ComposerPhoto = { id: string; filename: string | null };

export function Composer({
  placeholder = "Post an update…",
  photos,
  action,
}: {
  placeholder?: string;
  photos?: ComposerPhoto[];
  action?: (
    title: string,
    body: string,
    shared: boolean,
    photoAttachmentId: string | null
  ) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text || !action || pending) return;
    start(async () => {
      await action(title, text, shared, photoId);
      setTitle("");
      setBody("");
      setShared(false);
      setPhotoId(null);
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
          disabled={pending || !body.trim()}
          className="ml-auto disabled:opacity-60 disabled:cursor-default"
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
