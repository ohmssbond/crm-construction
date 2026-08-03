"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { fieldInput } from "./Field";

export type UpdatePhoto = { id: string; filename: string | null };

export function UpdateCard({
  when,
  title,
  body,
  photoId: photoIdDefault,
  shared = false,
  portal = false,
  photos,
  date,
  maxDate,
  shareAction,
  editAction,
}: {
  when: string;
  title?: string | null;
  body: string;
  photoId?: string | null;
  shared?: boolean;
  portal?: boolean;
  photos?: UpdatePhoto[];
  date: string;
  maxDate: string;
  shareAction?: (shared: boolean) => void | Promise<void>;
  editAction?: (
    title: string,
    body: string,
    photoAttachmentId: string | null,
    date: string | null
  ) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [titleV, setTitleV] = useState(title ?? "");
  const [bodyV, setBodyV] = useState(body);
  const [photoV, setPhotoV] = useState<string | null>(photoIdDefault ?? null);
  const [dateV, setDateV] = useState(date);
  const [pending, start] = useTransition();

  const startEdit = () => {
    setTitleV(title ?? "");
    setBodyV(body);
    setPhotoV(photoIdDefault ?? null);
    setDateV(date);
    setEditing(true);
  };
  const save = () => {
    if (!bodyV.trim() || !editAction) return;
    start(async () => {
      await editAction(titleV, bodyV, photoV, dateV === date ? null : dateV);
      setEditing(false);
    });
  };

  if (editing && !portal) {
    return (
      <div className="bg-surface border border-line rounded-card p-4 shadow-card flex flex-col gap-2">
        <input
          value={titleV}
          onChange={(e) => setTitleV(e.target.value)}
          disabled={pending}
          placeholder="Title (optional)"
          aria-label="Update title"
          className={`${fieldInput} text-[13px] font-semibold`}
        />
        <textarea
          value={bodyV}
          onChange={(e) => setBodyV(e.target.value)}
          disabled={pending}
          rows={3}
          aria-label="Update body"
          className={`${fieldInput} text-[13px] resize-y`}
        />
        <div className="flex flex-wrap items-center gap-[10px] pt-[6px]">
          <input
            type="date"
            value={dateV}
            max={maxDate}
            onChange={(e) => setDateV(e.target.value)}
            disabled={pending}
            aria-label="Update date"
            className={`${fieldInput} w-auto text-meta py-[5px]`}
          />
          {photos && photos.length > 0 && (
            <select
              value={photoV ?? ""}
              onChange={(e) => setPhotoV(e.target.value || null)}
              disabled={pending}
              aria-label="Update photo"
              className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent"
            >
              <option value="">No photo</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.filename ?? "Photo"}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !bodyV.trim()}
            className="ml-auto text-meta font-semibold text-accent disabled:opacity-50"
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
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card p-4 shadow-card">
      <div className="flex items-center gap-[10px] mb-2">
        {!portal && <ShareToggle defaultShared={shared} action={shareAction} />}
        <span className="text-meta text-faint ml-auto">{when}</span>
        {!portal && editAction && (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit update"
            className="text-meta text-faint hover:text-accent"
          >
            Edit
          </button>
        )}
      </div>
      {title && <p className="text-body font-semibold mb-1">{title}</p>}
      <p className="text-body text-[#344054]">{body}</p>
      {portal && (
        <div className="mt-[11px] pt-[10px] border-t border-dashed border-line text-meta text-faint">
          ↪ Acknowledge / comment — planned fast-follow (read-only today)
        </div>
      )}
    </div>
  );
}
