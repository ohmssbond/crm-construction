# T&B Pre-invoice / completed-job report (slice 6)

_Design spec · 2026-06-18_

> Time & Billing build, slice 6 — the **pre-invoice / completed-job report**, the
> PRD's core MVP output (§8.2b). First admin-facing assembly slice: it reads across
> everything the worker app now captures (time 5a, materials 5b, photos 5c) plus the
> job/customer and presents it as a staging report. Builds on the admin job surface
> `/tb/jobs/[id]`. PRD §6 (item 7), §8.2b:
> [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

A read-only admin page at **`/tb/jobs/[id]/report`** that assembles a job's captured
data — customer + contact, site address, work description, **time on the job per
tech**, **materials used**, **photos/receipts**, and notes — into the completed-job
report. It is the single on-screen source that the later `.xlsx` export, the
customer-facing work order, and QBO push will all build on. Reachable from the job
detail at any status (labeled the completed-job report, not locked to `completed`).

**No migration** — pure read/assembly over existing tables. Admin reads ride the
`admin_read` RLS already present on `job_time_entries` / `job_time_segments` /
`job_material_lines` / `job_attachments`.

## Decisions

| Topic | Decision |
|---|---|
| Placement | New dedicated route `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`, with a **"View report"** link added to the existing job detail. Available at **any** job status. |
| Output | **On-screen admin report only.** No print/PDF, no separate customer-clean work order this slice (the `.xlsx` export is its own later roadmap slice). Admin view → material **cost ("your cost") is shown**. |
| Tech labels | Resolve each distinct `worker_user_id` → **login email** via the service-role admin client (`createAdminClient()` in `src/lib/supabase/admin.ts`), since worker names live in `auth.users` and aren't readable under RLS. No formal Worker entity yet (5a used the logged-in user id). |
| Pricing / totals | **Captured quantities, not a priced invoice.** Show total **hours** (per tech + grand) and a **materials cost subtotal** (your cost). No customer dollar total — there is no labor rate and no markup in MVP (PRD: payroll is hours-only; materials are *your cost*; sell price/markup are downstream). Fixed-price jobs show the **contract price**; T&M jobs show hours + materials as the billable basis. |
| `no_charge` time | **Shown and flagged**, not subtracted — it is advisory per the PRD. |
| Auth | The route sits under the `(timebilling)/tb` layout, which gates to `timebilling:admin`. Data reads use the admin's `is_tb_admin` RLS; the service-role call only resolves emails for worker ids already present on this org's job rows. |

## Data assembly — `src/lib/data/tb-report.ts`

`getJobReport(jobId)` returns a structured object (or `null` if the job is missing).
It performs these reads (all RLS-scoped to the admin's org except the email lookup):

1. **Job + customer** — the job (`name, status, billing_type, contract_price, currency,
   description, notes, start_date, end_date`, site-address parts, `customer_id`) joined
   to the customer's `name, email, phone`. (The **site** address comes from the job;
   the customer's billing address is not shown on this report.) Mirrors the
   `getJobDetail` select shape, extended with the customer contact fields — but lives
   in `tb-report.ts`; `getJobDetail` itself is unchanged.
2. **Time** — `job_time_entries` for the job (`id, worker_user_id, entry_date, no_charge`)
   with their `job_time_segments` (`time_in, time_out`), across all workers. Grouped in
   code **by worker, then by date**. Per entry: the segment list + a daily total
   `roundQuarterHours(sumSegmentHours(segments))`. Per-worker subtotal (sum of daily
   totals) + grand total hours.
3. **Materials** — `job_material_lines` for the job (`item, qty, unit_cost, currency`);
   per line `extended = materialExtended(qty, unit_cost)`; a materials cost subtotal.
4. **Photos** — `job_attachments` for the job (`label, filename, mime_type, added_at,
   storage_path`), each signed via `job-files` `createSignedUrls(paths, 3600)` →
   `{ label, filename, addedLabel: fmtDateTime(added_at, tz), href, isImage }`.
5. **Worker emails** — collect the distinct `worker_user_id`s seen in steps 2–4; for
   each, `createAdminClient().auth.admin.getUserById(id)` → `data.user.email`; build a
   `Record<userId, email>` used to label the time groups (fall back to a short id slice
   if a lookup fails).

The org timezone (for `fmtDateTime` / date display) comes from `getWorkspaceContext()`.

Returned shape (illustrative):

```ts
{
  job: { id, name, status, billingType, contractPrice, currency, description, notes,
         startDate, endDate, siteAddress },           // siteAddress = fmtJobLocation(job)
  customer: { name, email, phone },
  time: {
    workers: [{ email, totalHours,
                days: [{ date, total, noCharge,
                         segments: [{ in, out }] }] }],
    grandTotalHours,
  },
  materials: { lines: [{ item, qty, unitCost, extended, currency }], subtotal, currency },
  photos: [{ label, filename, addedLabel, href, isImage }],
}
```

## Pure helpers — `src/lib/data/worktime.ts` (unit-tested)

```ts
/** Extended cost of a material line = qty × unit_cost. Non-numeric inputs (or a
 *  null unit cost) yield 0. qty/unitCost may arrive as strings (PostgREST numeric). */
export function materialExtended(qty: string | number, unitCost: string | number | null): number {
  const q = Number(qty);
  const u = Number(unitCost);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return Math.round(q * u * 100) / 100;
}

/** Format money as "<CURRENCY> <amount>" with 2 decimals (e.g. "USD 42.50"). */
export function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}
```

(Placed in `worktime.ts` beside the other pure validators/formatters; covered by the
existing `worktime.test.ts`.)

## UI — `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`

A server component. Calls `getJobReport(id)`; `notFound()` if null. Renders stacked
sections with the existing `Card` / `KeyValue` primitives (matching `/tb/jobs/[id]`):

- **Header** — a back link to `/tb/jobs/[id]`, the job name, and a `Card` of KeyValues:
  Customer (+ email, phone), Site address, Billing (T&M, or "Fixed price — `fmtMoney
  (contractPrice, currency)`"), Status, Dates, Description, Notes.
- **Time on the job** — for each worker (by email): the worker subtotal, then each day
  (`fmtDate(date)`) with its segment lines (`fmtTimeOfDay(in) – fmtTimeOfDay(out)`) and
  the daily total (`total.toFixed(2)` h), plus a "No charge" tag on `noCharge` days. A
  grand-total-hours line. Empty state when no time logged.
- **Materials** — a simple table: item · qty · unit cost (`fmtMoney`) · extended
  (`fmtMoney`), then a **subtotal** row (`fmtMoney(subtotal, currency)`). Empty state
  when none.
- **Photos** — a thumbnail grid reusing the 5c tile look (image thumbnail via `href`, 📄
  + filename for non-images) with each label + added timestamp; links open the signed
  URL. Empty state when none.
- **Notes** — the job notes (already shown in the header KeyValues; not duplicated).

Add a **"View report"** link (`buttonClasses("ghost","sm")` → `/tb/jobs/${id}/report`)
to the existing `src/app/(timebilling)/tb/jobs/[id]/page.tsx` header, beside Edit.

## Testing

- **Unit** (`src/lib/data/worktime.test.ts`): `materialExtended` (integer, decimal,
  rounds to cents, non-numeric/null → 0) and `fmtMoney` ("USD 42.5" → "USD 42.50";
  whole numbers get 2 dp).
- **Manual** (admin, on a job with worker-logged time/materials/photos — use the seed
  `timebilling:admin` against a job the `timebilling:worker` has logged against):
  1. From `/tb/jobs/[id]`, **View report** opens `/tb/jobs/[id]/report`.
  2. Time section shows each tech by email, dated segments, correct 0.25h daily totals,
     a per-worker subtotal, and a grand total; a `no_charge` entry is flagged.
  3. Materials show item/qty/unit cost/extended and a correct subtotal.
  4. Photos show thumbnails (or 📄 + filename) that open via signed URL.
  5. Header shows customer name + email/phone, site address; a fixed-price job shows the
     contract price; a T&M job shows "Time & materials".
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

**No migration.** `vercel --prod`, then the manual checks. (The reads rely on the
`admin_read` RLS already shipped with 5a/5b/5c.)

## Out of scope (later slices)

- `.xlsx` export (its own roadmap slice); a customer-clean **work order** variant
  (hides your-cost); print/PDF.
- Priced invoice totals (labor rate × hours, material markup/sell price) — needs rates,
  out of MVP.
- A formal **Worker** entity / display names (email is the label for now).
- QBO push of the assembled invoice.
- Editing captured data from the report (it is read-only; corrections happen on the
  worker app or a later admin-CRUD slice).
