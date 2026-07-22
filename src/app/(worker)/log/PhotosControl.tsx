"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { recordJobPhoto, removeJobPhoto } from "./actions";

const BUCKET = "job-files";

type Photo = {
  id: string;
  label: string;
  status: string;
  filename: string | null;
  addedLabel: string;
  href: string | null;
  isImage: boolean;
};

export function PhotosControl({
  jobId,
  orgId,
  photos,
}: {
  jobId: string;
  orgId: string;
  photos: Photo[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose or capture a photo.");
    if (!label.trim()) return setError("Add a label for the photo.");
    setError(null);

    start(async () => {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${jobId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      const msg = await recordJobPhoto(jobId, {
        path,
        label,
        filename: file.name,
        mime: file.type || null,
        size: file.size,
      });
      if (typeof msg === "string") {
        // Don't leave an orphaned object if the row insert is rejected.
        await supabase.storage.from(BUCKET).remove([path]);
        setError(msg);
        return;
      }

      if (fileRef.current) fileRef.current.value = "";
      setLabel("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3">
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="text-meta max-w-full file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-[6px] file:text-meta file:font-semibold"
          />
          <input
            type="text"
            placeholder="Label (e.g. Home Depot receipt)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={fieldInput}
          />
          <Button type="submit" disabled={pending} className="disabled:opacity-60">
            {pending ? "Uploading…" : "Add photo"}
          </Button>
          <FormError message={error} />
        </form>
      </Card>

      {photos.length === 0 ? (
        <p className="text-meta text-faint py-2">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <PhotoTile key={p.id} jobId={jobId} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoTile({ jobId, photo }: { jobId: string; photo: Photo }) {
  const [pending, start] = useTransition();
  return (
    <div className="border border-line rounded-card overflow-hidden flex flex-col">
      <a
        href={photo.href ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="block bg-line-2 aspect-square grid place-items-center"
      >
        {photo.isImage && photo.href ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" src={photo.href} alt={photo.label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2 text-center">
            <span className="text-2xl">📄</span>
            {photo.filename && (
              <span className="text-[11px] text-faint break-all line-clamp-2">{photo.filename}</span>
            )}
          </div>
        )}
      </a>
      <div className="p-2 flex flex-col gap-1">
        <span className="text-meta font-semibold truncate">{photo.label}</span>
        <div className="flex items-center justify-between text-faint">
          <span className="text-[11px]">{photo.addedLabel}</span>
          <span className="text-[11px] uppercase tracking-wide">{photo.status}</span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await removeJobPhoto(photo.id, jobId); })}
          className="text-[11px] text-faint hover:text-[#b42318] self-start"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
