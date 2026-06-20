# Description vs. Notes of the Work Completed (slice 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Description admin-only; move worker work-notes into a relabeled "Notes of the Work Completed" area (merged with the admin job notes), on the admin job page and the `.xlsx` export.

**Architecture:** Presentation-only. Both the job page and the export already have the data (`job.description`, `job.notes`, `workNotes`); this just relocates the worker-note lines from the Description section to the Notes section and relabels it. No schema, no data, no migration; `getJobReport` and `jobBillingRows` are untouched.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, exceljs.

**Spec:** `docs/superpowers/specs/2026-06-20-tb-notes-vs-description-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` if a render detail is unfamiliar.
- Do NOT run `git push` or `vercel` — operator-run at cutover. No migration.

---

## File Structure

- `src/app/(timebilling)/tb/jobs/[id]/page.tsx` — **modify**: Description KeyValue → admin-only; Notes KeyValue → "Notes of the Work Completed" (admin notes + worker notes).
- `src/lib/export/billing-ticket.ts` — **modify** (`buildBillingWorkbook`): drop worker notes from the Description section; rebuild the bottom Notes section as "Notes of the Work Completed".

(One cohesive presentation change — done as a single task.)

---

## Task 1: Relocate worker notes from Description to "Notes of the Work Completed"

**Files:**
- Modify: `src/app/(timebilling)/tb/jobs/[id]/page.tsx`
- Modify: `src/lib/export/billing-ticket.ts`

- [ ] **Step 1: Job page — Description back to admin-only**

In `src/app/(timebilling)/tb/jobs/[id]/page.tsx`, the Description KeyValue currently is:
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
Replace it with:
```tsx
        <KeyValue label="Description" value={job.description ?? "—"} />
```

- [ ] **Step 2: Job page — Notes → "Notes of the Work Completed"**

In the same file, the Notes KeyValue currently is:
```tsx
        <KeyValue label="Notes" value={job.notes ?? "—"} />
```
Replace it with:
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

- [ ] **Step 3: Export writer — drop worker notes from the Description section**

In `src/lib/export/billing-ticket.ts` (`buildBillingWorkbook`), the Description rows currently are:
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

- [ ] **Step 4: Export writer — rebuild the bottom Notes section**

In the same function, the final Notes section currently is:
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
(`rows.notes` = admin `job.notes`; `rows.workNotes` = worker notes — both already on `BillingRows`. No change to `jobBillingRows`.)

- [ ] **Step 5: Verify build + tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all pass (75 total — unchanged; the `jobBillingRows` transform is not modified, so its tests still hold).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/page.tsx" src/lib/export/billing-ticket.ts
git commit -m "Move worker notes to 'Notes of the Work Completed'; Description stays admin-only"
```

---

## Manual verification (controller/operator, after deploy)

**No migration** — cutover is `vercel --prod` only. Then, as `timebilling:admin` on a job with an admin description, admin notes, and ≥1 worker note:

1. Job page: **Description** shows only the admin description; **Notes of the Work Completed** shows the admin notes line then each worker note (`<date> · <tech> — <body>`).
2. **Export billing ticket** → the `.xlsx`: "Description of work" = admin description only; "Notes of the Work Completed" = the admin notes row (if any) then a `<date> — <body>` row per worker note.
3. A job with no admin notes and no worker notes shows "—" in the page's Notes value (and an empty Notes section in the export).

---

## Self-Review

**Spec coverage:**
- Description = admin only (job page + export) → Steps 1 + 3. ✓
- Notes area relabeled "Notes of the Work Completed" = admin notes + worker notes (job page + export) → Steps 2 + 4. ✓
- Empty state "—" on the page → Step 2. ✓
- No change to `getJobReport`/`jobBillingRows`/table/worker tab → confirmed (only the two presentation spots). ✓

**Type consistency:** `report.workNotes` (`{ tech, dateLabel, body }[]`) and `job.notes`/`job.description` are already on the page's `report`/`job`. `rows.notes` (`string | null`) and `rows.workNotes` (`{ dateLabel, body }[]`) are already on `BillingRows` — no signature changes.

**Placeholder scan:** none — every step shows complete before/after code.
