# T&B Photos/attachments (slice 5c)

_Design spec · 2026-06-18_

> Time & Billing build, slice 5c — the worker **photos/attachments** logger. Last of
> the worker job sub-slices (5a time ✅ → 5b materials ✅ → **5c photos**). Builds on
> the worker `/log` job-detail tabs and reuses the CRM's direct browser→Storage upload
> pattern. PRD §6, §8.2 Attachment, §8.8 (offline queue):
> [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Turn the job-detail **Photos** tab stub into a real photo/receipt logger: a worker
captures or picks a file, gives it a **required label**, and sees it with its
**added timestamp** and **upload status**; they can remove their own. Files upload
**directly from the browser to Storage** (no serverless size limit). Store-only —
**no OCR**. A true offline queue is deferred; the schema is built so it can be added
later without migration.

## Decisions

| Topic | Decision |
|---|---|
| Offline behavior | **Online upload now**, defer the true offline queue. On a failed/offline upload, show an inline error + **Retry** — no row is persisted (clean, since there's no local blob persistence yet). The `status`/`added_at`/`uploaded_at` columns are present so the offline-queue follow-up can switch to record-first-then-upload-with-retry **without a schema change**. |
| Record timing | **Record-after-upload:** the `job_attachments` row is inserted only after the bytes land in Storage, with `status='uploaded'`, `uploaded_at = now()`. |
| Ownership | **Per-worker**, mirroring 5a/5b: row carries `worker_user_id` (the uploader); a worker sees/manages only their own photos; admin reads all. |
| Line management | **Add + remove only.** Relabel = remove and re-add. |
| File types/size | **No type limit** (PRD); the picker uses `accept="image/*,application/pdf"` + `capture` for mobile camera, but any file the browser sends is accepted. Size bound is the bucket's default Storage limit (not tightened in MVP). |
| Storage | **New private bucket `job-files`**, separate from the CRM `project-files` (its storage RLS must key on T&B membership, not CRM). Path `{orgId}/{jobId}/{ts}-{safeName}`. |
| Thumbnails | Signed URLs (batch), like the CRM's `withAttachmentUrls`. Images render a thumbnail; non-images (e.g. PDF) render a file glyph. No server-side image processing in MVP. |

## Schema — migration `supabase/migrations/20260618000001_job_attachments.sql`

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

`is_tb_member` / `is_tb_admin` exist from the jobs migration. The storage policy
mirrors the CRM `project-files` policy (`(storage.foldername(name))[1]` = the org id
in the path), but gates on T&B membership.

## Pure helper — `src/lib/data/worktime.ts`

Add a deterministic, unit-tested validator beside the existing ones:

```ts
/** Validate a worker-entered photo label. Returns the trimmed label if non-empty,
 *  else null (caller surfaces a user-facing error). */
export function validateLabel(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

## Data — `src/lib/data/worker.ts`

- `getJobPhotosForWorker(jobId)` — the signed-in worker's own `job_attachments` rows
  for the job (`id, label, filename, mime_type, status, added_at, storage_path`),
  ordered by `added_at` desc, each resolved to a short-lived **signed URL** for the
  `job-files` bucket (batch `createSignedUrls`, mirroring `withAttachmentUrls`). The
  returned shape exposes `href` (signed URL) + an `isImage` flag (derived from
  `mime_type`) for the UI; `storage_path` itself need not reach the client.

  The signing is inline in `getJobPhotosForWorker` (a single batch
  `supabase.storage.from("job-files").createSignedUrls(paths, 3600)`); the existing
  `withAttachmentUrls` is hardcoded to `project-files`, so this slice signs against
  `job-files` directly rather than reusing it.

## Actions — `src/app/(worker)/log/actions.ts` (each `requireTbWorker()` via `workerCtx`)

- `recordJobPhoto(jobId, meta)` where `meta = { path, label, filename, mime, size }`
  — validate `label` with `validateLabel` (return error string if null); verify
  `meta.path` starts with `{orgId}/{jobId}/` (reject otherwise, like the CRM's
  `recordAttachment`); insert a `job_attachments` row with `worker_user_id`,
  `organization_id`, `status='uploaded'`, `uploaded_at = now()`, `added_at = now()`.
  `revalidatePath`.
- `removeJobPhoto(photoId, jobId)` — look up the worker's own row to get its
  `storage_path`, delete the row, and remove the storage object from `job-files`.
  `revalidatePath`.

Both return `Promise<string | void>` (inline error), matching the 5a/5b pattern.
RLS enforces per-worker ownership; the path-prefix check is defense-in-depth.

## UI — `src/app/(worker)/log/PhotosControl.tsx` (new client component)

Replaces the Photos tab stub in `[jobId]/page.tsx`. Props:
`{ jobId, orgId, photos }` where `photos` is the worker's resolved rows
(`id, label, status, added_at, href, isImage, mime_type`).

- **Add row:** a file `<input type="file" accept="image/*,application/pdf" capture>`
  + a required **label** field + **Add** button. On submit: upload the file directly
  to `job-files` at `{orgId}/{jobId}/{Date.now()}-{safeName}` via the browser Supabase
  client (mirroring the CRM `UploadForm`), then call `recordJobPhoto(jobId, meta)`.
  On upload error → inline error + the file stays selected for **Retry**; on a
  `recordJobPhoto` error → remove the just-uploaded object (no orphan) and show the
  error. Uses `useTransition` + the shared `FormError`.
- **Grid:** each photo = a thumbnail (the signed `href` for images; a file glyph for
  non-images) + its **label** + **added** timestamp (`fmtDateTime(added_at, tz)` from
  `src/lib/data/format.ts`, org tz) + a **status** badge + a **remove** control
  (`removeJobPhoto`).
  Empty state when none. Mirrors `MaterialsControl`/`ClockControl`.

`[jobId]/page.tsx` (server component) fetches `getJobPhotosForWorker(jobId)` and
passes it + `orgId` (from `getWorkspaceContext`/the existing job context) into
`<PhotosControl>`, replacing the Photos `stub`. The Time and Materials tabs are
untouched.

## Testing

- **Unit** (`src/lib/data/worktime.test.ts`): `validateLabel` — non-empty trimmed
  passes (and is trimmed); whitespace-only and empty return null.
- **Manual** (seed `timebilling:worker`, on a job's Photos tab):
  1. Capture/pick a file + label → it appears with a thumbnail (or glyph), the added
     timestamp, and an "uploaded" badge.
  2. Submit with a blank label → inline error, nothing uploaded.
  3. Remove a photo → its row and the storage object are both gone.
  4. Confirm only the signed-in worker's own photos show (a second worker's photo on
     the same job is not visible).
  5. A non-image (PDF) shows the file glyph and still opens via its signed URL.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (table + RLS + `job-files` bucket + storage policy), `vercel
--prod`, then the manual checks. New table + new bucket only — no change to existing
tables or the `project-files` bucket.

## Out of scope (later slices / follow-ups)

- **Offline queue** (PRD §8.8): IndexedDB-persisted pending uploads + service
  worker / Background Sync auto-retry on reconnect, surviving page reload. The schema
  (`status` queued/uploaded, `added_at` vs `uploaded_at`) is built for it.
- OCR / receipt data extraction; mapping to QBO `Attachable`.
- Relabeling an existing photo; crew-shared (cross-worker) visibility.
- Server-side thumbnail generation; per-file size/type limits.
- Pre-invoice assembly, `.xlsx` export, QBO import (later slices).
