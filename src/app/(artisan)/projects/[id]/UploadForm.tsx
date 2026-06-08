"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { uploadAttachment, type UploadState } from "./actions";

const initial: UploadState = { error: null, ok: false };

const controlCls =
  "rounded-control border border-line bg-surface px-3 py-[7px] text-sub outline-none focus:border-accent";

export function UploadForm({
  projectId,
  categories,
  shareLabel,
}: {
  projectId: string;
  categories: { key: string; label: string }[];
  shareLabel: string;
}) {
  const action = uploadAttachment.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the file input after a successful upload (the grid revalidates server-side).
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="bg-surface border border-line rounded-card p-[14px] shadow-card flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          required
          className="text-sub max-w-[230px] file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-[6px] file:text-sub file:font-semibold"
        />
        <select name="category" required defaultValue="" className={controlCls}>
          <option value="" disabled>
            Category…
          </option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sub text-muted">
          <input type="checkbox" name="is_shared" className="accent-[var(--accent)]" />
          {shareLabel}
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className="ml-auto disabled:opacity-60 disabled:cursor-default"
        >
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-meta text-[#b42318]">
          {state.error}
        </p>
      )}
    </form>
  );
}
