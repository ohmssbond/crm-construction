# T&B — Worker per-job history panel (self-scoped report)

**Date:** 2026-06-23
**Status:** Design — approved, pending spec review
**Surface:** Worker field app, job page `/log/[jobId]`

## Problem

When a worker logs time or materials to a job on `/log/[jobId]`, they have no
consolidated view of what they have already recorded for that job. The Time tab
shows only **today's** clock in/out; Materials/Photos/Notes tabs each show one
slice. A worker adding a new entry can't easily see their running history.

## Goal

Give the worker a persistent, read-only history of **their own** time, materials,
photos, and work notes for the job they're on — a self-scoped version of the
admin pre-invoice report. Visible below the tabs on every tab, so workers can see
what they've already added while making new additions.

## Scope

- **Job:** this job only (the job page they're on). Per-job, like the admin report.
  A cross-job personal timesheet is explicitly **out of scope** (possible future slice).
- **Worker:** the signed-in worker's own entries only.
- **Cost:** never shown. Workers must not see material cost — a structural rule in
  this codebase (the worker data functions never fetch cost). The history's materials
  section shows item + quantity only: no unit cost, no extended, no subtotal.
- **No migration.** Pure read + presentation over existing tables and RLS.

## Design (approach A — worker-scoped component + one new time query)

Decoupled from the admin report on purpose. The admin `getJobReport` uses the
service-role client to resolve worker emails/names and always carries cost; reusing
it for a worker screen would widen the attack surface and make cost-hiding depend on
a flag. Instead, the worker path reuses the already-cost-free worker data functions
and adds a single self-scoped time query.

### 1. Data layer — `src/lib/data/worker.ts`

New function:

```
getJobTimeHistoryForWorker(jobId: string)
  → { days: Day[]; grandTotalHours: number }
```

- Reads `job_time_entries` (with `job_time_segments`) for `job_id`, filtered to the
  signed-in `worker_user_id`, **all dates**, ordered by `entry_date` ascending.
- Self-scoped through the existing `worker_rw` RLS. **No service-role client; no
  email/name lookup** — the rows belong to the requesting worker.
- Each `Day`:
  ```
  { date: string;
    total: number;        // roundQuarterHours(sumSegmentHours(segments))
    noCharge: boolean;    // from job_time_entries.no_charge
    segments: { in: string; out: string }[];  // closed segments only (time_out != null)
  }
  ```
  Mirrors the admin report's per-day shape (`getJobReport`). Open (in-progress)
  segments are excluded from the displayed segment list; `sumSegmentHours` already
  ignores segments without `time_out`, so today's running clock does not inflate the
  total.
- `grandTotalHours` = sum of the daily `total` values.
- A day whose only segment is still open (no closed segments → empty `segments`,
  `total` 0) is **omitted** from `days`, so today's running clock doesn't produce an
  empty "0.00 h" history row. That in-progress time is already visible in the Time tab.
- Returns `{ days: [], grandTotalHours: 0 }` when the worker has no entries or no
  workspace context.

Reused unchanged (already all-days, already cost-free):
- `getJobMaterialsForWorker(jobId)` → `{ item, qty }[]`
- `getJobPhotosForWorker(jobId)` → photos with signed URLs + display timestamps
- `getJobWorkNotesForWorker(jobId)` → `{ body, dateLabel }[]`

If the day-grouping/totals logic is not already fully expressed by the existing
`sumSegmentHours` / `roundQuarterHours` helpers, factor the pivot into a small pure
helper (e.g. `groupTimeByDay`) so it can be unit-tested in isolation, following the
`jobBillingRows` precedent.

### 2. Component — `src/app/(worker)/log/WorkerHistory.tsx`

Read-only presentational component, modeled on the admin
`(timebilling)/tb/jobs/[id]/ReportSections.tsx`, with these differences:

- **Time:** days + per-day closed segments (`fmtTimeOfDay` in/out) + daily total,
  then a grand total. **No worker-label header** (single worker = self). `noCharge`
  days flagged "· No charge" as in the admin report.
- **Materials:** item + qty only. **No unit cost, no extended, no subtotal columns.**
- **Photos:** same thumbnail grid as the report (image vs. file tile, signed URL,
  added-at label).
- **Notes:** date-stamped note bodies.
- **Empty sections are omitted entirely** (not rendered as empty-state cards), so the
  panel shows only what the worker has actually added. If the worker has logged
  nothing at all on the job (no time, materials, photos, or notes), render one quiet
  line: "Nothing logged on this job yet."

Uses the existing `Card` UI primitive and the shared formatting helpers
(`fmtDate`, `fmtTimeOfDay`) for visual consistency with the rest of the app.

### 3. Placement / UX — `src/app/(worker)/log/[jobId]/page.tsx`

- Fetch the time history alongside the existing reads (extend the existing
  `Promise.all`).
- Render `<WorkerHistory>` **below `<Tabs>`**, under a divider and a heading
  **"Your entries on this job"** — persistent across all tabs.
- After clock in/out or any add (existing Server Actions already call
  `revalidatePath`), the server re-render refreshes the panel automatically.

## Testing

- Unit test the time-history grouping/totals transform (the new pure helper, or the
  function's day-shaping if no helper is extracted): multiple days, multiple segments
  per day, open segment excluded from segments + total, no-charge flag carried,
  grand total = sum of daily totals, empty input → empty result. Mirror the
  `jobBillingRows` test style.
- Gates: `npm test` (Vitest) and `npm run build` green before commit/merge.

## Out of scope / deferred

- Cross-job personal timesheet ("all my jobs").
- Editing history from the panel (it is read-only; edits happen in the interactive tabs).
- Any cost/price visibility for workers.
- Collapsible/expandable panel sections (omit-empty keeps it short enough for now).

## Files touched

- `src/lib/data/worker.ts` — add `getJobTimeHistoryForWorker` (+ optional `groupTimeByDay` helper).
- `src/app/(worker)/log/WorkerHistory.tsx` — new presentational component.
- `src/app/(worker)/log/[jobId]/page.tsx` — fetch history, render panel below tabs.
- Test file for the time-history transform.
