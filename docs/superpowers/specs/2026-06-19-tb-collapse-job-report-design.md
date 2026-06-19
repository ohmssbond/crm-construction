# T&B Collapse job detail + report (slice 7b)

_Design spec · 2026-06-19_

> Time & Billing build, slice 7b — fold the completed-job report into the admin job
> detail so an admin sees a job's metadata, controls, and captured work on **one**
> screen. Surfaced from dogfooding slice 6 ("why hit a separate report button?").
> Pure UI restructure on top of `getJobReport` (slice 6) + worker names (7a).

## Goal

Merge `/tb/jobs/[id]/report` into `/tb/jobs/[id]`: the job detail page now renders the
job's info + admin controls **and** the assembled Time / Materials / Photos sections.
The separate report route and its "View report" button are removed. **No migration.**

## Decisions

| Topic | Decision |
|---|---|
| Data source | Rebuild `/tb/jobs/[id]/page.tsx` on **`getJobReport(id)`** (slice 6) — it already returns the full job (name, status, billing, contract, currency, description, notes, dates, siteAddress), the customer (name/email/phone), and the time/materials/photos. `notFound()` when null. |
| Admin controls | Keep the existing **Edit** link, **Archive** button, and **JobStatusControl** at the top; drop only the "View report" link. |
| Info Card | Adopt the report's richer KeyValue set — adds **Email** + **Phone**; uses `fmtMoney(Number(contractPrice), currency)` for the fixed-price amount (cleaner than the detail page's raw `${currency} ${contract_price}` concat). |
| Sections | The Time / Materials / Photos rendering moves **verbatim** out of the old report page into a presentational component **`ReportSections.tsx`**, so `page.tsx` stays focused (controls + info + `<ReportSections>`). |
| Old route | **Delete** `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx` outright (404 after — it shipped today, unlikely bookmarked). No redirect. |
| `getJobDetail` | **Unchanged** — the edit page (`/tb/jobs/[id]/edit`) still uses it. Only this page swaps to `getJobReport`. |

## Components

### `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx` (new, presentational)

A server component (no client interactivity) taking the report's section data and
rendering the three sections **exactly as the current report page does** (Time grouped
per worker `label` → date with daily/grand totals + "No charge" tag; Materials table
with extended cost + your-cost subtotal; Photos thumbnail grid with the 📄/filename
fallback). Props mirror the `getJobReport` return shape:

```ts
type ReportSectionsProps = {
  time: { workers: { label: string; totalHours: number;
                     days: { date: string; total: number; noCharge: boolean;
                             segments: { in: string; out: string }[] }[] }[];
          grandTotalHours: number };
  materials: { lines: { item: string; qty: string; unitCost: string | null;
                        extended: number; currency: string }[];
               subtotal: number; currency: string };
  photos: { label: string; filename: string | null; addedLabel: string;
            href: string | null; isImage: boolean }[];
};
```

It imports `fmtDate` (`@/lib/data/format`) and `fmtTimeOfDay` + `fmtMoney`
(`@/lib/data/worktime`), as the report page does.

### `src/app/(timebilling)/tb/jobs/[id]/page.tsx` (rebuilt)

Server component. `const report = await getJobReport(id); if (!report) notFound();`
Then renders, in order:

1. **Header row** — `{report.job.name}` (flex-1) + **Edit** link (`/tb/jobs/${id}/edit`,
   `buttonClasses("ghost","sm")`, `hidden lg:inline-flex`) + `<ArchiveButton
   action={archiveJob.bind(null, id)} noun="job" />`. (No "View report" link.)
2. **Status row** — `Status` label + `<JobStatusControl jobId={id} status={report.job.status} />`.
3. **Info Card** — KeyValues: Customer (`report.customer.name`), Email
   (`report.customer.email ?? "—"`), Phone (`report.customer.phone ?? "—"`), Site
   address (`report.job.siteAddress || "—"`), Billing (`report.job.billingType ===
   "fixed_price" ? "Fixed price — " + fmtMoney(Number(report.job.contractPrice ?? 0),
   report.job.currency) : "Time & materials"`), Dates (`[fmtDate(startDate),
   fmtDate(endDate)].filter(Boolean).join(" – ") || "—"`), Description, Notes.
4. **`<ReportSections time={report.time} materials={report.materials} photos={report.photos} />`**.

Imports: `notFound`, `Link`, `Card`, `KeyValue`, `buttonClasses`, `ArchiveButton`,
`JobStatusControl`, `archiveJob`, `getJobReport` (replacing `getJobDetail`), `fmtDate`
(`fmtJobLocation` is no longer needed here — `siteAddress` is precomputed by
`getJobReport`), and `fmtMoney` (`@/lib/data/worktime`), plus the new `ReportSections`.

## Testing

- No unit changes (`getJobReport`, `fmtMoney`, `workerLabel`, time/money helpers are
  already unit-tested; this slice only moves/merges presentation).
- **Manual** (admin, on a job the worker has logged against):
  1. `/tb/jobs/[id]` shows the info Card (incl. email/phone) + Status/Edit/Archive **and**
     the Time / Materials / Photos sections inline — no "View report" button.
  2. Time labels each tech by **name** (7a), correct 0.25h totals; Materials subtotal;
     Photos thumbnails.
  3. Visiting `/tb/jobs/[id]/report` now **404s**.
  4. Status change, Edit, and Archive still work.
  5. A job with no logged data shows the section empty states without erroring.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

**No migration.** `vercel --prod`, then the manual checks.

## Out of scope (later)

- `.xlsx` export; QBO import; the customer-clean work-order variant + print/PDF.
- Any change to `getJobReport` itself, `getJobDetail`, or the edit page.
