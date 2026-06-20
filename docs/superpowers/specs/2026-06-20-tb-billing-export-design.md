# T&B Per-job billing-ticket `.xlsx` export (slice 8)

_Design spec · 2026-06-20_

> Time & Billing build, slice 8 — export one job's captured data as an `.xlsx`
> **billing ticket** that mirrors the customer's existing handwritten form, so their
> billing person can read it and key it into QuickBooks. PRD §8.6 (spreadsheet
> fallback), scoped down per the operator: **billing only** (payroll/reported-hours is
> a separate report, out of scope). Reuses the completed-job report's assembly
> (`getJobReport`, slice 6) + worker names (7a).

## Goal

A **"Export billing ticket (.xlsx)"** button on `/tb/jobs/[id]` downloads a single
job's billing ticket: customer contact + site address, description of work, a **Time
On Site** table (Tech · Date · In · Out · In · Out · Total Hours + Total Labor), a
**Materials** table (Item · Quantity · Unit Cost · Cost + Total Material Cost), and
**Notes**. **No migration; no new DB queries** — it reads `getJobReport(id)`.

## Decisions

| Topic | Decision |
|---|---|
| Scope | **Per job**, triggered from the job page, **any status**. One job → one `.xlsx` ticket (mirrors the one-ticket-per-job paper flow). Billing only. |
| Delivery | A Next.js **Route Handler** `GET /tb/jobs/[id]/export` (not a page — route handlers stream binary downloads). Admin-gated via `requireTbAdmin()`; 404s if the job isn't in the admin's org (`getJobReport` returns null). Responds with the xlsx buffer + `Content-Disposition: attachment`. |
| Library | **`exceljs`** (new dependency) — maintained, pure-JS, multi-row + styling, runs in Vercel's Node runtime. |
| Layout | **One sheet, stacked vertically** (header → Time On Site → Total Labor → Materials → Total Material Cost → Notes). Same fields as the side-by-side paper form, cleaner for a biller reading top-to-bottom. |
| Time rows | Mirror the form: per tech/day, **two In/Out pairs**; a day with **>2 segments overflows** onto continuation rows (same tech/date, blank on the continuation), with the day's rounded **Total Hours on the first row**. |
| Total Labor | **Total hours** (`time.grandTotalHours`) — no labor $ (no rate in MVP). |
| Address | The **job site address** (`job.siteAddress`). |
| Materials cost | "Your cost" (admin view): columns **Item · Quantity · Unit Cost · Cost** where `Cost = extended (qty × unit)`; **Total Material Cost = subtotal**. (The paper form had one "Cost" column — split for QBO-entry clarity.) |
| Photos | **Not** included in the billing ticket (the report still shows them on screen). |

## Architecture

Two units, split so the tricky logic is testable:

### 1. Pure layout transform — `src/lib/export/billing-ticket.ts` → `jobBillingRows(report)`

Takes the `getJobReport` return and produces plain row structures (no `exceljs`,
no I/O). Formats times via `fmtTimeOfDay` and dates via `fmtDate` (both existing).

```ts
type BillingRows = {
  customer: { name: string; phone: string | null; email: string | null };
  siteAddress: string;
  description: string | null;
  timeRows: {
    tech: string;   // "" on a continuation row
    date: string;   // "" on a continuation row
    in1: string; out1: string; in2: string; out2: string;
    totalHours: string; // formatted on the day's first row only, else ""
  }[];
  totalLaborHours: number;        // time.grandTotalHours
  materialRows: { item: string; qty: string; unitCost: number | null; cost: number }[];
  totalMaterialCost: number;      // materials.subtotal
  currency: string;               // materials.currency
  notes: string | null;
};

export function jobBillingRows(report: JobReport): BillingRows;
```

**Time pivot (the logic worth testing):** for each `time.workers[]` (tech = `label`),
for each `days[]`: split `segments` into consecutive pairs of two. Row 0 →
`{ tech, date: fmtDate(d.date), in1/out1 = pair0 (fmtTimeOfDay), in2/out2 = pair1 or
"", totalHours: d.total.toFixed(2) }`. Each further pair → a continuation row with
`tech: "", date: "", totalHours: ""`. A day with 1 segment → `in2/out2 = ""`. A day
with 0 closed segments contributes no rows. (`getJobReport` already excludes open
segments and rounds the daily total.)

### 2. Thin workbook writer — `src/lib/export/billing-ticket.ts` → `buildBillingWorkbook(rows)`

Builds an `exceljs.Workbook` from `BillingRows` (one worksheet "Billing"):
section header rows (bold/shaded) for **Customer**, **Time On Site** (with the
column header row), **Materials**, **Notes**; the data rows; bold **Total Labor** and
**Total Material Cost** rows; currency formatting on cost cells. No business logic —
pure rendering from the prepared rows. Returns the workbook (the route awaits
`workbook.xlsx.writeBuffer()`).

### 3. Route handler — `src/app/(timebilling)/tb/jobs/[id]/export/route.ts`

```
GET:
  await requireTbAdmin()                        // admin only
  const report = await getJobReport(id)         // RLS-scoped; null → 404
  if (!report) return 404
  const wb = buildBillingWorkbook(jobBillingRows(report))
  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe(report.job.name)}-billing.xlsx"`,
    },
  })
```

`safe()` strips the filename to `[A-Za-z0-9._-]`. (Route handlers are not wrapped by
the `/tb` layout's gate, so the explicit `requireTbAdmin()` is required here. Read
`node_modules/next/dist/docs/` for the Next 16 route-handler `params` shape + `Response`
conventions before implementing.)

### 4. UI — button on `/tb/jobs/[id]`

In the rebuilt job detail header (slice 7b), add an **"Export billing ticket"** link
styled with `buttonClasses("ghost","sm")`, `href={`/tb/jobs/${id}/export`}` — a plain
anchor so the browser handles the download. Beside Edit/Archive.

## Testing

- **Unit** (`src/lib/export/billing-ticket.test.ts`): `jobBillingRows` —
  - a tech/day with **2 segments** → one row, `in1/out1/in2/out2` filled, `totalHours`
    set;
  - **1 segment** → `in2/out2 = ""`;
  - **3 segments** → two rows (row 0 total set + pair0/1; row 1 continuation with
    `tech/date/totalHours = ""` + pair2, `in2/out2 = ""`);
  - **two techs** → grouped, each starting a fresh row;
  - `totalLaborHours`, `materialRows` (item/qty/unitCost/cost), `totalMaterialCost`,
    `currency`, empty time + empty materials.
- **Manual** (admin, on a job the worker logged time + materials against): click
  **Export billing ticket** → an `.xlsx` downloads; opening it shows the customer
  header + site address + description, the Time On Site rows (In/Out pairs + per-day
  totals + Total Labor), the Materials rows (Unit Cost + Cost + Total Material Cost),
  and Notes. A job with no logged data exports with empty section bodies (no crash).
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

Adds the `exceljs` dependency (package.json + lockfile). **No migration.** `vercel
--prod`, then the manual check.

## Out of scope (later)

- Payroll / reported-hours export (separate report); pay rates; labor $ totals.
- Batch / multi-job export; date-range filtering; the side-by-side print arrangement.
- The full PRD §8.6 multi-entity company dump (workers/customers/jobs/materials
  sheets) — this slice is the **billing ticket** only.
- QBO import (next slice).
