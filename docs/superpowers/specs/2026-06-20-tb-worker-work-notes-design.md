# T&B Worker work-notes → Description of Work (slice 9)

_Design spec · 2026-06-20_

> Time & Billing build, slice 9 — let a worker log short work-performed notes on a
> job (e.g. "Primary Bedroom - Rough wired") that **accumulate** on the job and feed
> **Description of Work** in the admin report and the `.xlsx` billing export, beneath
> the admin's job description. Builds on the worker `/log` job detail, `getJobReport`
> (slice 6), worker names (7a), and the billing export (slice 8).

## Goal

A new **Notes** tab on the worker job screen where a worker appends short work notes
(add / edit / remove their own). The job's work notes (across all workers) then show
under **Description of Work** on the admin report/collapsed job page and in the
exported `.xlsx`, after the admin-set `job.description`.

## Decisions

| Topic | Decision |
|---|---|
| Storage | New **`job_work_notes`** table (per-worker, appended, timestamped). Worker-self RLS + admin read — same shape as `job_material_lines`. |
| Relationship to admin description | **Both shown.** The admin `job.description` is the lead-in; the worker notes are appended beneath it in Description of Work. `job.description` is unchanged. |
| Granularity | **Job-level**, addable any time the worker is on the job (not bound to a clock-in session). Each note carries `created_at` + author. |
| Ownership | **Per-worker:** a worker sees/edits/removes only their own notes (like materials/photos). The admin report aggregates everyone's. |
| Attribution | Export "Description of work": admin description, then one **date-prefixed** body line per note (`Jun 20 — Primary Bedroom - Rough wired`). On-screen report: date **+ tech name** per note (`Jun 20 · Jose — …`). |

## Schema — migration `supabase/migrations/20260620000001_job_work_notes.sql`

```sql
-- Worker-authored work-performed notes on a job; appended, surfaced in the
-- Description of Work (report + export). Per-worker ownership.
create table job_work_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on job_work_notes (organization_id, job_id);

alter table job_work_notes enable row level security;

create policy worker_rw on job_work_notes for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_work_notes for select to authenticated
  using (is_tb_admin(organization_id));
```

## Worker side

**Data — `src/lib/data/worker.ts`:** `getJobWorkNotesForWorker(jobId)` — the signed-in
worker's own notes for the job (`id, body, created_at`), ordered by `created_at`, each
mapped to `{ id, body, dateLabel: fmtZonedDate(created_at, tz) }` (org tz via
`getWorkspaceContext`).

**Actions — `src/app/(worker)/log/actions.ts`** (each `workerCtx()` first; reuse
`validateLabel` for the non-empty body check, returning an inline error string):
- `addJobWorkNote(jobId, body)` — insert `{ organization_id, job_id, worker_user_id,
  body }`.
- `updateJobWorkNote(noteId, jobId, body)` — update own row's `body` + `updated_at`.
- `removeJobWorkNote(noteId, jobId)` — delete own row.
All `revalidatePath('/log/${jobId}')`.

**UI — `src/app/(worker)/log/WorkNotesControl.tsx` (new client component):** a textarea
+ **Add** (calls `addJobWorkNote`); a list of the worker's own notes (each shows its
`dateLabel`) with an inline **edit** (textarea → `updateJobWorkNote`) and **remove**
(`removeJobWorkNote`); empty state otherwise. Mirrors `MaterialsControl`/`PhotosControl`
(useTransition + `FormError`). Wired as a 4th **"Notes"** tab in
`src/app/(worker)/log/[jobId]/page.tsx` (Time / Materials / Photos / **Notes**), fed by
`getJobWorkNotesForWorker(jobId)`.

## Report + export side

**`getJobReport` — `src/lib/data/tb-report.ts`:** add a read of **all** the job's work
notes (admin `admin_read`):
```ts
const { data: noteRows } = await supabase
  .from("job_work_notes")
  .select("worker_user_id, body, created_at")
  .eq("job_id", jobId)
  .order("created_at", { ascending: true });
const notes = noteRows ?? [];
```
Extend the existing distinct-worker-id set to the **union** of time-entry authors **and**
note authors (so emails/names resolve for note-only authors), then build:
```ts
const workNotes = notes.map((n) => ({
  tech: workerLabel(names[n.worker_user_id] ?? null, emails[n.worker_user_id] ?? null, n.worker_user_id as string),
  dateLabel: fmtZonedDate(n.created_at as string, tz),
  body: n.body as string,
}));
```
(`fmtZonedDate` is added to the existing `./format` import; `workerLabel` is already
imported from 7a.) Add `workNotes` to the returned object.

**On-screen — `src/app/(timebilling)/tb/jobs/[id]/page.tsx`:** replace the `Description`
KeyValue value with the admin description **plus** the notes list:
```tsx
<KeyValue label="Description" value={
  <div className="flex flex-col gap-1">
    <span>{job.description ?? "—"}</span>
    {report.workNotes.map((n, i) => (
      <span key={i} className="text-faint">{n.dateLabel} · {n.tech} — {n.body}</span>
    ))}
  </div>
} />
```

**Export — `src/lib/export/billing-ticket.ts`:**
- `BillingReport` gains `workNotes: { dateLabel: string; body: string }[]` (the full
  `getJobReport` return, with `tech` too, stays structurally compatible).
- `BillingRows` gains `workNotes: { dateLabel: string; body: string }[]`; `jobBillingRows`
  maps `report.workNotes` → `{ dateLabel, body }`.
- `buildBillingWorkbook`: after the `["Description of work", rows.description ?? ""]`
  row, render one row per note: `ws.addRow(["", `${n.dateLabel} — ${n.body}`])`.

## Testing

- **Unit** (`src/lib/export/billing-ticket.test.ts`): extend `jobBillingRows` — `workNotes`
  pass through to `BillingRows.workNotes` (date + body), and an empty-notes case. (The
  `baseReport` fixture gains `workNotes: []`.)
- **Manual**:
  1. As `timebilling:worker` on a job's **Notes** tab: add "Primary Bedroom - Rough
     wired" → it appears with its date; edit it; remove one.
  2. As `timebilling:admin`: the job page Description shows the admin description then the
     worker note(s) with date + tech; **Export billing ticket** → the `.xlsx` Description
     of work has the admin line then a date-prefixed note row.
  3. A second worker's notes also appear in the admin report; each worker sees only their
     own on the Notes tab.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (1 table + RLS), `vercel --prod`, then the manual checks. New table
only — no change to existing tables.

## Out of scope (later)

- Tying a note to a specific clock-in session / time entry; per-note billable flag.
- Admin editing/curating worker notes; crew-shared (cross-worker) note visibility on the
  worker side.
- Rich text; reordering notes (they stay chronological by `created_at`).
