# T&B Description vs. Notes of the Work Completed (slice 10)

_Design spec · 2026-06-20_

> Time & Billing build, slice 10 — a presentation refinement of slices 8 (billing
> export) + 9 (worker work-notes). Keep **Description** as the admin-only field; move
> the worker work-notes into the notes area, merged with the admin job notes, under a
> new label **"Notes of the Work Completed."** Applies to the admin job page and the
> `.xlsx` export.

## Goal

- **Description** = admin `job.description` only (no longer carries worker notes).
- **Notes of the Work Completed** = admin `job.notes` (if any) **then** the worker work
  notes — on both the admin job page (`/tb/jobs/[id]`) and the billing-ticket export.

**No schema, no new data, no migration.** `getJobReport` already returns
`job.description`, `job.notes`, and `workNotes`; the pure `jobBillingRows` transform
already carries `notes` + `workNotes`. Only **two presentation spots** change: the
report page's Description/Notes rendering and the export writer's Description/Notes
sections. `getJobReport`, `jobBillingRows`, the `job_work_notes` table, and the worker
Notes tab are unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Description | Admin `job.description` only (revert slice 9's worker-notes append in both spots). |
| Notes area | Relabeled **"Notes of the Work Completed"**; renders admin `job.notes` first (if present), then the worker notes. |
| Worker-note formatting | On screen: `<dateLabel> · <tech> — <body>` (unchanged from slice 9). Export: `<dateLabel> — <body>` per row (unchanged from slice 9), just relocated to the Notes section. |
| Empty state | If both `job.notes` and `workNotes` are empty, the on-screen Notes value shows "—". |

## Changes

### 1. Job page — `src/app/(timebilling)/tb/jobs/[id]/page.tsx`

(a) Revert the **Description** KeyValue to admin-only. It is currently:
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
Replace with:
```tsx
        <KeyValue label="Description" value={job.description ?? "—"} />
```

(b) Replace the **Notes** KeyValue. It is currently:
```tsx
        <KeyValue label="Notes" value={job.notes ?? "—"} />
```
Replace with:
```tsx
        <KeyValue
          label="Notes of the Work Completed"
          value={
            job.notes || report.workNotes.length > 0 ? (
              <div className="flex flex-col gap-1">
                {job.notes && <span>{job.notes}</span>}
                {report.workNotes.map((n, i) => (
                  <span key={i} className="text-faint">
                    {n.dateLabel} · {n.tech} — {n.body}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            )
          }
        />
```

### 2. Export writer — `src/lib/export/billing-ticket.ts` (`buildBillingWorkbook`)

(a) Drop the worker-notes loop from the Description section. It is currently:
```ts
  ws.addRow(["Description of work", rows.description ?? ""]);
  for (const n of rows.workNotes) {
    ws.addRow(["", `${n.dateLabel} — ${n.body}`]);
  }
  ws.addRow([]);
```
Replace with:
```ts
  ws.addRow(["Description of work", rows.description ?? ""]);
  ws.addRow([]);
```

(b) Rebuild the bottom **Notes** section as "Notes of the Work Completed" with the admin
notes + worker notes. It is currently (the last section):
```ts
  // Notes
  section("Notes");
  ws.addRow([rows.notes ?? ""]);
```
Replace with:
```ts
  // Notes of the Work Completed
  section("Notes of the Work Completed");
  if (rows.notes) ws.addRow([rows.notes]);
  for (const n of rows.workNotes) {
    ws.addRow([`${n.dateLabel} — ${n.body}`]);
  }
```

(`rows.notes` is the admin `job.notes`; `rows.workNotes` is the worker notes — both
already on `BillingRows`. No change to `jobBillingRows` or its tests.)

## Testing

- The existing `jobBillingRows` unit tests still hold (the transform is unchanged); the
  writer change is rendering-only and covered by the build + manual check.
- **Manual** (admin, on a job with an admin description, admin notes, and ≥1 worker note):
  1. Job page: **Description** shows only the admin description; **Notes of the Work
     Completed** shows the admin notes line then each worker note (`<date> · <tech> —
     <body>`).
  2. **Export billing ticket** → the `.xlsx`: "Description of work" = admin description
     only; "Notes of the Work Completed" = the admin notes row then a `<date> — <body>`
     row per worker note.
  3. A job with no admin notes and no worker notes shows "—" on the page (and an empty
     Notes section in the export).
- `npm test` + `npm run build` pass (test count unchanged at 75).

## Cutover (controller/operator)

**No migration.** `vercel --prod`, then the manual check.

## Out of scope

- Any change to `getJobReport`, `jobBillingRows`, the `job_work_notes` table, or the
  worker Notes tab. Worker-note attribution/formatting is unchanged — only its location
  (Notes section, not Description) and the section label change.
