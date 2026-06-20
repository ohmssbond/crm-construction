# Worker work-notes → Description of Work (slice 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a worker append work-performed notes on a job; surface them under Description of Work in the admin report and the `.xlsx` export.

**Architecture:** A new per-worker `job_work_notes` table feeds a worker "Notes" tab (add/edit/remove own). `getJobReport` reads all of a job's notes (admin RLS), labeling each by tech (worker name) + date; the report page and the billing export render them beneath the admin `job.description`.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), TypeScript, Supabase (Postgres/RLS), Vitest, Tailwind v4, exceljs.

**Spec:** `docs/superpowers/specs/2026-06-20-tb-worker-work-notes-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing server-action / client-component code.
- Do NOT run `git push`, `supabase db push`, or `vercel` — operator-run at cutover.
- Each task builds green on its own (data/actions/UI are additive; `getJobReport` gains an extra return field before its consumers use it).

---

## File Structure

- `supabase/migrations/20260620000001_job_work_notes.sql` — **create**: table + RLS.
- `src/lib/data/worker.ts` — **modify**: `getJobWorkNotesForWorker(jobId)`.
- `src/app/(worker)/log/actions.ts` — **modify**: `addJobWorkNote` / `updateJobWorkNote` / `removeJobWorkNote`.
- `src/app/(worker)/log/WorkNotesControl.tsx` — **create**: the Notes-tab client component.
- `src/app/(worker)/log/[jobId]/page.tsx` — **modify**: fetch notes + add a "Notes" tab.
- `src/lib/data/tb-report.ts` — **modify**: read all work notes; add `workNotes` to the return.
- `src/app/(timebilling)/tb/jobs/[id]/page.tsx` — **modify**: show notes under Description.
- `src/lib/export/billing-ticket.ts` + `.test.ts` — **modify**: `workNotes` through the transform + writer.

---

## Task 1: Migration — `job_work_notes` table + RLS

**Files:**
- Create: `supabase/migrations/20260620000001_job_work_notes.sql`

No automated test (DDL applied at cutover). Verify by reading against the spec.

- [ ] **Step 1: Create the migration file**

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

- [ ] **Step 2: Sanity-check the RLS helpers exist**

Run: `grep -n "is_tb_member\|is_tb_admin" supabase/migrations/20260616000003_jobs.sql`
Expected: both helpers are defined there. (Do NOT run `supabase db push`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000001_job_work_notes.sql
git commit -m "Add job_work_notes table + RLS (worker work notes)"
```

---

## Task 2: Worker data read + actions

**Files:**
- Modify: `src/lib/data/worker.ts`
- Modify: `src/app/(worker)/log/actions.ts`

No unit test (Supabase reads/writes, RLS-enforced); covered by build + manual checks.

- [ ] **Step 1: Add `getJobWorkNotesForWorker` to `worker.ts`**

The file imports `{ fmtDateTime } from "./format"`. Change that import to also bring `fmtZonedDate`:
```ts
import { fmtDateTime, fmtZonedDate } from "./format";
```
Append:
```ts
/** The signed-in worker's own work notes for a job (chronological), each with a
 *  display date in the org tz. */
export async function getJobWorkNotesForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("job_work_notes")
    .select("id, body, created_at")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((n) => ({
    id: n.id as string,
    body: n.body as string,
    dateLabel: fmtZonedDate(n.created_at as string, ctx.org.timezone),
  }));
}
```

- [ ] **Step 2: Add the three actions to `src/app/(worker)/log/actions.ts`**

Append to the END (the file already imports `validateLabel`; `workerCtx`, `createClient`, `revalidatePath` are defined/imported):
```ts
export async function addJobWorkNote(jobId: string, body: string): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const text = validateLabel(body);
  if (text === null) return "Enter a note.";
  const supabase = await createClient();
  await supabase.from("job_work_notes").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    body: text,
  });
  revalidatePath(`/log/${jobId}`);
}

export async function updateJobWorkNote(noteId: string, jobId: string, body: string): Promise<string | void> {
  const { userId } = await workerCtx();
  const text = validateLabel(body);
  if (text === null) return "Enter a note.";
  const supabase = await createClient();
  await supabase
    .from("job_work_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobWorkNote(noteId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  await supabase.from("job_work_notes").delete().eq("id", noteId).eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds (new and not yet called).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/worker.ts "src/app/(worker)/log/actions.ts"
git commit -m "Add worker work-note read + add/update/remove actions"
```

---

## Task 3: `WorkNotesControl` + the Notes tab

**Files:**
- Create: `src/app/(worker)/log/WorkNotesControl.tsx`
- Modify: `src/app/(worker)/log/[jobId]/page.tsx`

- [ ] **Step 1: Create `WorkNotesControl.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { addJobWorkNote, updateJobWorkNote, removeJobWorkNote } from "./actions";

type Note = { id: string; body: string; dateLabel: string };

export function WorkNotesControl({ jobId, notes }: { jobId: string; notes: Note[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const msg = await addJobWorkNote(jobId, body);
      if (typeof msg === "string") setError(msg);
      else setBody("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <textarea
          placeholder="What did you do? (e.g. Primary Bedroom - Rough wired)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className={`${fieldInput} resize-y`}
        />
        <Button type="button" disabled={pending || !body.trim()} onClick={add} className="self-end">
          Add note
        </Button>
        <FormError message={error} />
      </Card>

      <div className="flex flex-col">
        {notes.length === 0 ? (
          <p className="text-meta text-faint py-2">No notes yet.</p>
        ) : (
          notes.map((n) => <WorkNoteRow key={n.id} jobId={jobId} note={n} />)
        )}
      </div>
    </div>
  );
}

function WorkNoteRow({ jobId, note }: { jobId: string; note: Note }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const msg = await updateJobWorkNote(note.id, jobId, body);
      if (typeof msg === "string") setError(msg);
      else setEditing(false);
    });
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-2 border-b border-line-2 last:border-b-0">
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
          <div className="flex items-center gap-3 self-end text-meta">
            <button type="button" disabled={pending || !body.trim()} onClick={save} className="text-accent font-semibold">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBody(note.body);
                setError(null);
              }}
              className="text-faint"
            >
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className="text-body flex-1 min-w-0 whitespace-pre-wrap">{note.body}</span>
            <div className="flex items-center gap-3 text-meta shrink-0">
              <button type="button" onClick={() => setEditing(true)} className="text-muted hover:text-text">
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await removeJobWorkNote(note.id, jobId); })}
                className="text-faint hover:text-[#b42318]"
              >
                Remove
              </button>
            </div>
          </div>
          <span className="text-[11px] text-faint">{note.dateLabel}</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the Notes tab into `[jobId]/page.tsx`**

(a) Imports — add `getJobWorkNotesForWorker` to the worker-data import and import the control:
```tsx
import { getJobTimeForWorker, getJobMaterialsForWorker, getJobPhotosForWorker, getJobWorkNotesForWorker } from "@/lib/data/worker";
```
and (next to the other `../` component imports):
```tsx
import { WorkNotesControl } from "../WorkNotesControl";
```

(b) Fetch the notes — extend the `Promise.all`:
```tsx
  const [materialLines, catalog, photos, ctx, workNotes] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
    getJobPhotosForWorker(jobId),
    getWorkspaceContext(),
    getJobWorkNotesForWorker(jobId),
  ]);
```

(c) Build the tab content — just before the `return (`, add:
```tsx
  const notesTab = <WorkNotesControl jobId={jobId} notes={workNotes} />;
```

(d) Add the tab — in the `<Tabs tabs={[...]} />`, add a fourth entry after Photos:
```tsx
        tabs={[
          { label: "Time", content: timeTab },
          { label: "Materials", content: materialsTab },
          { label: "Photos", content: photosTab },
          { label: "Notes", content: notesTab },
        ]}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds; no unused-import errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(worker)/log/WorkNotesControl.tsx" "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "Add worker Notes tab (WorkNotesControl)"
```

---

## Task 4: `getJobReport` reads work notes

**Files:**
- Modify: `src/lib/data/tb-report.ts`

No unit test (Supabase reads); covered by build + manual checks.

- [ ] **Step 1: Import `fmtZonedDate`**

Change:
```ts
import { fmtDateTime, fmtJobLocation } from "./format";
```
to:
```ts
import { fmtDateTime, fmtJobLocation, fmtZonedDate } from "./format";
```

- [ ] **Step 2: Read the work notes**

Immediately AFTER the photos block (the `if (paths.length) { … createSignedUrls … }` block and its blank line), and BEFORE the `// 5. Worker emails` comment, insert:
```ts
  // 4b. Work notes (across all workers; admin_read)
  const { data: noteRows } = await supabase
    .from("job_work_notes")
    .select("worker_user_id, body, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const notes = noteRows ?? [];
```

- [ ] **Step 3: Extend the worker-id set to note authors**

Change:
```ts
  // 5. Worker emails (service-role; only ids that appear in time entries)
  const workerIds = [...new Set(timeEntries.map((e) => e.worker_user_id as string))];
```
to:
```ts
  // 5. Worker emails/names (service-role; ids across time entries + work notes)
  const workerIds = [
    ...new Set([
      ...timeEntries.map((e) => e.worker_user_id as string),
      ...notes.map((n) => n.worker_user_id as string),
    ]),
  ];
```

- [ ] **Step 4: Build the labeled `workNotes`**

Immediately AFTER the `names` block (the `if (workerIds.length) { … tb_workers … }` block that populates `names`) and BEFORE the `// Group time by worker` comment, insert:
```ts
  const workNotes = notes.map((n) => ({
    tech: workerLabel(names[n.worker_user_id as string] ?? null, emails[n.worker_user_id as string] ?? null, n.worker_user_id as string),
    dateLabel: fmtZonedDate(n.created_at as string, tz),
    body: n.body as string,
  }));
```
(`workerLabel` is already imported; `tz` is defined earlier as `ctx.org.timezone`.)

- [ ] **Step 5: Add `workNotes` to the return**

In the returned object, add `workNotes,` after the `photos,` line:
```ts
    time: { workers, grandTotalHours },
    materials: { lines, subtotal, currency: matCurrency },
    photos,
    workNotes,
  };
```

- [ ] **Step 6: Verify it builds**

Run: `npm run build`
Expected: build succeeds (the new field is unused by consumers yet).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/tb-report.ts
git commit -m "Read job work notes in getJobReport (labeled by tech + date)"
```

---

## Task 5: Show notes under Description on the job page

**Files:**
- Modify: `src/app/(timebilling)/tb/jobs/[id]/page.tsx`

- [ ] **Step 1: Render the notes in the Description KeyValue**

The page currently has:
```tsx
        <KeyValue label="Description" value={job.description ?? "—"} />
```
Replace it with:
```tsx
        <KeyValue
          label="Description"
          value={
            <div className="flex flex-col gap-1">
              <span>{job.description ?? "—"}</span>
              {report.workNotes.map((n, i) => (
                <span key={i} className="text-faint">
                  {n.dateLabel} · {n.tech} — {n.body}
                </span>
              ))}
            </div>
          }
        />
```
(`report` is already in scope — the page does `const report = await getJobReport(id);`. `KeyValue`'s `value` accepts a `ReactNode`.)

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/page.tsx"
git commit -m "Show worker work notes under Description on the job page"
```

---

## Task 6: Work notes in the `.xlsx` export (TDD)

**Files:**
- Modify: `src/lib/export/billing-ticket.ts`
- Test: `src/lib/export/billing-ticket.test.ts`

- [ ] **Step 1: Update the test fixture + add failing tests**

In `src/lib/export/billing-ticket.test.ts`, add `workNotes: []` to the `baseReport` default object (so the fixture stays a valid `BillingReport` once the field becomes required). The fixture's return object currently is:
```ts
  return {
    job: { name: "Job A", siteAddress: "1 Main St", description: "Fix it", notes: "be careful" },
    customer: { name: "Acme", email: "a@acme.com", phone: "555-1212" },
    time: { workers: [], grandTotalHours: 0 },
    materials: { lines: [], subtotal: 0, currency: "USD" },
    ...over,
  };
```
Change it to add the `workNotes` line:
```ts
  return {
    job: { name: "Job A", siteAddress: "1 Main St", description: "Fix it", notes: "be careful" },
    customer: { name: "Acme", email: "a@acme.com", phone: "555-1212" },
    time: { workers: [], grandTotalHours: 0 },
    materials: { lines: [], subtotal: 0, currency: "USD" },
    workNotes: [],
    ...over,
  };
```
Then append a new describe block at the end of the file:
```ts
describe("jobBillingRows — work notes", () => {
  test("passes work notes through (date + body)", () => {
    const r = jobBillingRows(
      baseReport({
        workNotes: [
          { dateLabel: "Jun 20", body: "Primary Bedroom - Rough wired" },
          { dateLabel: "Jun 21", body: "Kitchen - Trim out" },
        ],
      })
    );
    expect(r.workNotes).toEqual([
      { dateLabel: "Jun 20", body: "Primary Bedroom - Rough wired" },
      { dateLabel: "Jun 21", body: "Kitchen - Trim out" },
    ]);
  });

  test("empty work notes → empty array", () => {
    expect(jobBillingRows(baseReport()).workNotes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- billing-ticket`
Expected: FAIL — `BillingReport`/`BillingRows` have no `workNotes` (type error) and `r.workNotes` is undefined.

- [ ] **Step 3: Extend the types + transform + writer in `billing-ticket.ts`**

(a) In the `BillingReport` type, add `workNotes` (after `materials`):
```ts
  materials: {
    lines: { item: string; qty: string; unitCost: string | null; extended: number; currency: string }[];
    subtotal: number;
    currency: string;
  };
  workNotes: { dateLabel: string; body: string }[];
};
```

(b) In the `BillingRows` type, add `workNotes` (after `notes`):
```ts
  currency: string;
  notes: string | null;
  workNotes: { dateLabel: string; body: string }[];
};
```

(c) In `jobBillingRows`'s returned object, add (after `notes: report.job.notes,`):
```ts
    notes: report.job.notes,
    workNotes: report.workNotes.map((n) => ({ dateLabel: n.dateLabel, body: n.body })),
  };
```

(d) In `buildBillingWorkbook`, after the description row, render the notes. Change:
```ts
  ws.addRow(["Description of work", rows.description ?? ""]);
  ws.addRow([]);
```
to:
```ts
  ws.addRow(["Description of work", rows.description ?? ""]);
  for (const n of rows.workNotes) {
    ws.addRow(["", `${n.dateLabel} — ${n.body}`]);
  }
  ws.addRow([]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- billing-ticket`
Expected: PASS (the 6 prior + 2 new work-note cases).

- [ ] **Step 5: Verify the build + full suite**

Run: `npm run build`
Expected: build succeeds. (The export route passes `getJobReport`'s return — which now includes `workNotes` from Task 4 — into `jobBillingRows`, so it stays structurally compatible with the now-required `BillingReport.workNotes`.)

Run: `npm test`
Expected: all pass (75 total — the prior 73 plus 2 new work-note cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/billing-ticket.ts src/lib/export/billing-ticket.test.ts
git commit -m "Render worker work notes under Description of work in the export"
```

---

## Manual verification (controller/operator, after cutover)

Cutover applies the migration: `supabase db push` (1 table + RLS) then `vercel --prod`. Then:

1. As `timebilling:worker` on a job's **Notes** tab: add "Primary Bedroom - Rough wired" → it appears with its date; **Edit** it; **Remove** one. The worker sees only their own notes.
2. As `timebilling:admin` on `/tb/jobs/[id]`: the **Description** shows the admin description, then each worker note as `<date> · <tech> — <body>`.
3. **Export billing ticket** → the `.xlsx` "Description of work" shows the admin description row, then a `<date> — <body>` row per note.
4. A second worker's notes also appear in the admin report + export (admin aggregates all).

---

## Self-Review

**Spec coverage:**
- `job_work_notes` table + worker_rw/admin_read RLS → Task 1. ✓
- Worker read + add/update/remove (own; non-empty via `validateLabel`) → Task 2. ✓
- Notes tab (add/edit/remove, per-worker) → Task 3. ✓
- `getJobReport` reads all notes; union worker-id resolution; `workNotes` (tech + date + body) → Task 4. ✓
- On-screen Description = admin desc + notes (date · tech — body) → Task 5. ✓
- Export Description of work = admin desc row + date-prefixed note rows → Task 6. ✓
- No change to existing tables; admin description unchanged → confirmed. ✓

**Type consistency:** `getJobReport` returns `workNotes: { tech, dateLabel, body }[]` (Task 4); the report page (Task 5) reads `n.dateLabel/n.tech/n.body`; the export `BillingReport.workNotes` (Task 6) needs only `{ dateLabel, body }` — structurally satisfied by the fuller `getJobReport` return passed by the route. `BillingRows.workNotes` (`{ dateLabel, body }[]`) is produced by `jobBillingRows` and consumed by `buildBillingWorkbook`. Worker actions `addJobWorkNote(jobId, body)` / `updateJobWorkNote(noteId, jobId, body)` / `removeJobWorkNote(noteId, jobId)` match the `WorkNotesControl` call sites; `getJobWorkNotesForWorker` returns `{ id, body, dateLabel }[]` matching the control's `Note` type.

**Placeholder scan:** none — every code step shows complete code.
