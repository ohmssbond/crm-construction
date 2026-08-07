"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "./Field";

/**
 * Row of controls under a file/photo tile: re-file it under another category, or delete
 * it outright.
 *
 * The category control is omitted entirely when no `categoryAction` is passed — that is
 * how the Photos tab opts out, since photos carry the fixed category 'photo'.
 *
 * Delete uses the inline two-step confirm shipped in ArchiveButton (never a native
 * confirm(), which blocks automation and keyboard users). `uses` names where the file is
 * currently used so the consequence is visible BEFORE the click, not after — deleting a
 * used file empties that slot via `on delete set null`.
 *
 * `name` (the same string the caller already passes to FileTile) feeds the accessible
 * names below — without it every tile's Delete/category control announces identically to
 * a screen reader.
 */
export function AttachmentControls({
  categories,
  category,
  categoryAction,
  deleteAction,
  uses,
  name,
}: {
  categories?: { key: string; label: string }[];
  category?: string;
  categoryAction?: (category: string) => Promise<void>;
  deleteAction: () => Promise<void>;
  uses: string[];
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {categoryAction && categories && (
          <select
            value={category}
            onChange={(e) => start(() => categoryAction(e.target.value))}
            disabled={pending}
            aria-label={`Category for ${name}`}
            className={`${fieldInput} flex-1 min-w-0 text-chip py-[3px]`}
          >
            {/* Cycle B archived photo/before_photo/after_photo, but existing rows still
                legitimately carry those keys. A controlled <select> whose options don't
                include the current value renders BLANK (selectedIndex -1), silently
                claiming the file has no category. Prepend a disabled option carrying the
                raw key so the control shows the truth instead — do not delete this as
                dead code. */}
            {category && !categories.some((c) => c.key === category) && (
              <option value={category} disabled>
                {category}
              </option>
            )}
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            aria-label={`Delete ${name}`}
            className="text-chip text-faint hover:text-[#b42318] disabled:opacity-60 shrink-0"
          >
            Delete
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-1">
          <span className="text-chip text-muted">
            {uses.length > 0 ? `Also used as: ${uses.join(", ")}. Delete anyway?` : "Delete this file?"}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => start(() => deleteAction())}
              disabled={pending}
              className="text-chip font-semibold text-[#b42318] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-chip text-faint hover:text-body"
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
