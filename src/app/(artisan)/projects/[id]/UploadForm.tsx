"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { recordAttachment } from "./actions";

const BUCKET = "project-files";
const controlCls =
  "rounded-control border border-line bg-surface px-3 py-[7px] text-sub outline-none focus:border-accent";

/**
 * Uploads the file DIRECTLY from the browser to Supabase Storage (RLS lets an
 * artisan write their own org folder), then records the attachment row via a
 * Server Action that takes only metadata. The file never passes through a
 * serverless function, so there's no request-body size limit on uploads.
 */
export function UploadForm({
  projectId,
  orgId,
  categories,
  shareLabel,
  fixedCategory,
  accept,
}: {
  projectId: string;
  orgId: string;
  categories?: { key: string; label: string }[];
  shareLabel: string;
  fixedCategory?: string;
  accept?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file to upload.");
    const cat = fixedCategory ?? category;
    if (!cat) return setError("Pick a category.");
    setError(null);

    start(async () => {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${projectId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      const res = await recordAttachment(projectId, {
        path,
        filename: file.name,
        mime: file.type || null,
        size: file.size,
        category: cat,
        isShared: shared,
      });
      if (res.error) {
        // Don't leave an orphaned object if the row insert is rejected.
        await supabase.storage.from(BUCKET).remove([path]);
        setError(res.error);
        return;
      }

      // Reset for the next upload (the grid revalidates server-side).
      if (fileRef.current) fileRef.current.value = "";
      setCategory("");
      setShared(false);
    });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-surface border border-line rounded-card p-[14px] shadow-card flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          required
          accept={accept}
          className="text-sub max-w-[230px] file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-[6px] file:text-sub file:font-semibold"
        />
        {!fixedCategory && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className={controlCls}
          >
            <option value="" disabled>
              Category…
            </option>
            {(categories ?? []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sub text-muted">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            className="accent-[var(--accent)]"
          />
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
      {error && (
        <p role="alert" className="text-meta text-[#b42318]">
          {error}
        </p>
      )}
    </form>
  );
}
