# Photos/attachments (slice 5c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a worker capture/upload labeled job photos (receipts/site photos) on the job-detail Photos tab, with added-timestamp + upload status, and remove their own.

**Architecture:** A new per-worker `job_attachments` table (RLS mirroring `job_material_lines`) plus a new private `job-files` Storage bucket. Files upload directly from the browser to Storage (no serverless size limit, reusing the CRM `UploadForm` pattern), then a metadata-only `recordJobPhoto` action inserts the row (record-after-upload). A `PhotosControl` client component owns the picker + grid; the server `page.tsx` feeds it the worker's photos (resolved to signed URLs) + the org id.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions, browser Supabase client), TypeScript, Supabase (Postgres/RLS + Storage), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-18-tb-photos-attachments-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-action / client-component code.
- Do NOT run `git push`, `supabase db push`, or `vercel` — those are operator-run at cutover. The migration (table + bucket + storage policy) is applied to the remote DB by the operator, not during implementation.
- Each task builds green on its own (data/actions/UI are additive — they don't change existing call sites), so `npm run build` is a valid per-task gate.
- Reference pattern for the browser→Storage upload: `src/app/(artisan)/projects/[id]/UploadForm.tsx` + `recordAttachment` in that folder's `actions.ts`.

---

## File Structure

- `supabase/migrations/20260618000001_job_attachments.sql` — **create**: table + index + RLS + `job-files` bucket + storage policy.
- `src/lib/data/worktime.ts` — **modify**: add the pure `validateLabel` helper (beside `validateQty`).
- `src/lib/data/worktime.test.ts` — **modify**: add a `validateLabel` describe block.
- `src/lib/data/worker.ts` — **modify**: add `getJobPhotosForWorker(jobId)` (worker's own photos + signed URLs + formatted timestamp).
- `src/app/(worker)/log/actions.ts` — **modify**: add `recordJobPhoto`, `removeJobPhoto`.
- `src/app/(worker)/log/PhotosControl.tsx` — **create**: client component (file+label add, direct upload, grid with remove).
- `src/app/(worker)/log/[jobId]/page.tsx` — **modify**: fetch photos + org id, render `<PhotosControl>` in place of the Photos stub.

---

## Task 1: Migration — `job_attachments` table + RLS + `job-files` bucket

**Files:**
- Create: `supabase/migrations/20260618000001_job_attachments.sql`

No automated test (DDL applied at cutover by the operator). Verify by a careful read against the spec + the migration applying cleanly at cutover.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260618000001_job_attachments.sql` with exactly:

```sql
-- Job-level photos/receipts captured by a worker in the field. Per-worker
-- ownership; store-only (no OCR). Files live in the private 'job-files' bucket.
create table job_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  storage_path    text not null,
  label           text not null,
  filename        text,
  mime_type       text,
  size_bytes      bigint,
  status          text not null default 'queued' check (status in ('queued', 'uploaded')),
  added_at        timestamptz not null default now(),
  uploaded_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on job_attachments (organization_id, job_id);

alter table job_attachments enable row level security;

-- Worker manages only their own photos; admin can read all (for the pre-invoice).
create policy worker_rw on job_attachments for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_attachments for select to authenticated
  using (is_tb_admin(organization_id));

-- Private bucket for T&B job files (photos/receipts).
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', false)
on conflict (id) do nothing;

-- Any T&B member may read/write/delete objects within their org's top-level folder.
-- Per-worker ownership of the metadata is enforced on job_attachments (above).
create policy "tb member rw job files" on storage.objects for all to authenticated
  using (
    bucket_id = 'job-files'
    and is_tb_member(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'job-files'
    and is_tb_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
```

- [ ] **Step 2: Sanity-check the referenced patterns exist**

Run: `grep -n "is_tb_member" supabase/migrations/20260616000003_jobs.sql && grep -n "storage.foldername" supabase/migrations/20260602000002_rls.sql`
Expected: the first shows `is_tb_member` is defined in the jobs migration; the second shows the CRM `project-files` storage policy uses the same `storage.foldername(name)` path idiom we mirror. (Do NOT run `supabase db push`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260618000001_job_attachments.sql
git commit -m "Add job_attachments table + RLS + job-files bucket (T&B photos)"
```

---

## Task 2: `validateLabel` pure helper (TDD)

**Files:**
- Modify: `src/lib/data/worktime.ts`
- Test: `src/lib/data/worktime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `validateLabel` to the existing import at the top of `src/lib/data/worktime.test.ts` (it currently imports `timeToMinutes, sumSegmentHours, roundQuarterHours, fmtTimeOfDay, nowTimeInZone, todayInZone, validateSegmentTime, validateQty` — add `validateLabel`), then append this block:

```ts
describe("validateLabel", () => {
  test("accepts a non-empty label", () => {
    expect(validateLabel("Home Depot")).toBe("Home Depot");
  });

  test("trims surrounding whitespace", () => {
    expect(validateLabel("  receipt  ")).toBe("receipt");
  });

  test("rejects an empty string", () => {
    expect(validateLabel("")).toBeNull();
  });

  test("rejects a whitespace-only string", () => {
    expect(validateLabel("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worktime`
Expected: FAIL — `validateLabel is not a function`.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/data/worktime.ts`, immediately after the `validateQty` function:

```ts
/** Validate a worker-entered photo label. Returns the trimmed label if non-empty,
 *  else null (caller surfaces a user-facing error). */
export function validateLabel(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worktime`
Expected: PASS (4 new `validateLabel` cases + all existing worktime tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add validateLabel helper for photo labels"
```

---

## Task 3: Data — `getJobPhotosForWorker`

**Files:**
- Modify: `src/lib/data/worker.ts`

No unit test (Supabase reads + Storage signing); covered by build + manual checks.

- [ ] **Step 1: Add the `fmtDateTime` import**

At the top of `src/lib/data/worker.ts`, add (the file already imports `createClient`, `getWorkspaceContext` from `./org`, `todayInZone` from `./worktime`, `one` from `./rel`):

```ts
import { fmtDateTime } from "./format";
```

- [ ] **Step 2: Append `getJobPhotosForWorker`**

Append to `src/lib/data/worker.ts`:

```ts
/** The signed-in worker's own photos for a job, newest first, each resolved to a
 *  short-lived signed URL + a display timestamp (org tz). No storage_path leaks. */
export async function getJobPhotosForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("job_attachments")
    .select("id, label, filename, mime_type, status, added_at, storage_path")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("added_at", { ascending: false });
  const rows = data ?? [];

  const signed: Record<string, string> = {};
  const paths = rows.map((r) => r.storage_path as string);
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("job-files").createSignedUrls(paths, 3600);
    urls?.forEach((u) => {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    });
  }

  return rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    status: r.status as string,
    addedLabel: fmtDateTime(r.added_at as string, ctx.org.timezone),
    href: signed[r.storage_path as string] ?? null,
    isImage: ((r.mime_type as string | null) ?? "").startsWith("image/"),
  }));
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (The function is new and not yet called.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/worker.ts
git commit -m "Add getJobPhotosForWorker (signed URLs + display timestamp)"
```

---

## Task 4: Server actions — record / remove photo

**Files:**
- Modify: `src/app/(worker)/log/actions.ts`

No unit test (Supabase/RLS + Storage); the label validation is unit-tested in Task 2. Covered by build + manual checks.

- [ ] **Step 1: Import `validateLabel`**

In `src/app/(worker)/log/actions.ts`, the worktime import currently reads:
```ts
import { nowTimeInZone, todayInZone, validateSegmentTime, validateQty } from "@/lib/data/worktime";
```
Change it to:
```ts
import { nowTimeInZone, todayInZone, validateSegmentTime, validateQty, validateLabel } from "@/lib/data/worktime";
```

- [ ] **Step 2: Append the two actions**

Add to the END of `src/app/(worker)/log/actions.ts` (`workerCtx`, `createClient`, `revalidatePath` are already imported/defined):

```ts
export async function recordJobPhoto(
  jobId: string,
  meta: { path: string; label: string; filename: string | null; mime: string | null; size: number }
): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const label = validateLabel(meta.label);
  if (label === null) return "Add a label for the photo.";
  if (!meta.path.startsWith(`${orgId}/${jobId}/`)) return "Invalid upload path.";

  const supabase = await createClient();
  await supabase.from("job_attachments").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    storage_path: meta.path,
    label,
    filename: meta.filename,
    mime_type: meta.mime,
    size_bytes: meta.size,
    status: "uploaded",
    uploaded_at: new Date().toISOString(),
  });
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobPhoto(photoId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("job_attachments")
    .select("storage_path")
    .eq("id", photoId)
    .eq("worker_user_id", userId)
    .maybeSingle();
  if (!row) return;
  await supabase.from("job_attachments").delete().eq("id", photoId).eq("worker_user_id", userId);
  await supabase.storage.from("job-files").remove([row.storage_path as string]);
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(worker)/log/actions.ts"
git commit -m "Add record/remove server actions for job photos"
```

---

## Task 5: UI — `PhotosControl` component + wire into the job page

**Files:**
- Create: `src/app/(worker)/log/PhotosControl.tsx`
- Modify: `src/app/(worker)/log/[jobId]/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(worker)/log/PhotosControl.tsx` with:

```tsx
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
          <img src={photo.href} alt={photo.label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">📄</span>
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
```

- [ ] **Step 2: Wire it into the job page**

In `src/app/(worker)/log/[jobId]/page.tsx`:

(a) Update imports. Change:
```tsx
import { getJobTimeForWorker, getJobMaterialsForWorker } from "@/lib/data/worker";
import { listMaterialsForPicker } from "@/lib/data/materials";
import { MaterialsControl } from "../MaterialsControl";
```
to:
```tsx
import { getJobTimeForWorker, getJobMaterialsForWorker, getJobPhotosForWorker } from "@/lib/data/worker";
import { listMaterialsForPicker } from "@/lib/data/materials";
import { getWorkspaceContext } from "@/lib/data/org";
import { MaterialsControl } from "../MaterialsControl";
import { PhotosControl } from "../PhotosControl";
```

(b) Extend the existing `Promise.all` to also fetch the photos and the workspace context. Change:
```tsx
  const [materialLines, catalog] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
  ]);
```
to:
```tsx
  const [materialLines, catalog, photos, ctx] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
    getJobPhotosForWorker(jobId),
    getWorkspaceContext(),
  ]);
```

(c) Build the photos tab. Replace the `const stub = ...` line:
```tsx
  const stub = <p className="text-meta text-faint py-4">Coming soon.</p>;
```
with:
```tsx
  const photosTab = ctx ? (
    <PhotosControl jobId={jobId} orgId={ctx.org.id} photos={photos} />
  ) : (
    <p className="text-meta text-faint py-4">No workspace.</p>
  );
```

(d) In the `<Tabs tabs={[...]} />`, replace the Photos entry `{ label: "Photos", content: stub }` with `{ label: "Photos", content: photosTab }`. (The Time and Materials entries are unchanged. `stub` is now removed entirely — it was the last user.)

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds; no unused-import/variable errors (the `stub` const is gone and `getWorkspaceContext`/`PhotosControl`/`getJobPhotosForWorker` are all used).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all pass (56 total — the prior 52 plus 4 `validateLabel` cases).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/PhotosControl.tsx" "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "Add photos logger to the job Photos tab"
```

---

## Manual verification (controller/operator, after cutover)

Cutover applies the migration (table + RLS + `job-files` bucket + storage policy): `supabase db push` then `vercel --prod`. Then, signed in as the seed `timebilling:worker` on a job's Photos tab:

1. Pick/capture a file + type a label → **Add photo** → it appears as a tile with a thumbnail (or 📄 glyph), the added timestamp, and an "uploaded" badge.
2. Submit with a blank label → inline error "Add a label for the photo."; nothing uploaded.
3. Tap a tile → it opens the file via its signed URL.
4. **Remove** a photo → the tile disappears (row + storage object both gone).
5. Confirm only the signed-in worker's own photos show (a second worker's photo on the same job is not visible).
6. The Time and Materials tabs are unchanged.

---

## Self-Review

**Spec coverage:**
- New `job_attachments` table + per-worker RLS (worker_rw + admin_read) + `job-files` bucket + storage policy → Task 1. ✓
- Required label (`validateLabel`, unit-tested) → Task 2; enforced in Task 4 `recordJobPhoto`. ✓
- Direct browser→Storage upload, record-after-upload, orphan cleanup on record failure → Task 5 `PhotosControl` + Task 4. ✓
- Per-worker ownership; worker sees/manages only own → Task 3 read filters by `worker_user_id`; Task 4 actions filter by `userId`; RLS in Task 1. ✓
- Added timestamp shown (`fmtDateTime`, org tz); status badge → Task 3 `addedLabel` + Task 5 tile. ✓
- Add + remove only (no relabel) → Tasks 4 + 5. ✓
- Signed-URL thumbnails; file glyph for non-images → Task 3 (`href`, `isImage`) + Task 5 `PhotoTile`. ✓
- No OCR, no offline queue → not built; schema (`status`/`added_at`/`uploaded_at`) present for the later queue. ✓
- `accept="image/*,application/pdf"` + camera `capture` → Task 5 file input. ✓

**Type consistency:** `validateLabel(input: string): string | null` matches across Task 2 (def + tests) and Task 4 (call site). The `Photo` type in `PhotosControl` (`id, label, status, addedLabel, href, isImage`) matches the object shape returned by `getJobPhotosForWorker` in Task 3. `recordJobPhoto(jobId, { path, label, filename, mime, size })` matches the `PhotosControl` call site. `removeJobPhoto(photoId, jobId)` matches the tile's call. Bucket id `'job-files'` is identical in the migration, the data signer, the actions, and `PhotosControl`.

**Placeholder scan:** none — every code step shows complete code.

**Note on `<img>`:** the tile uses a plain `<img>` (with an eslint-disable for `@next/next/no-img-element`) rather than `next/image`, because the source is a short-lived signed URL to a private bucket — consistent with how the worker app stays minimal. `no-img-element` is a lint warning, not a build error, so the build stays green.
