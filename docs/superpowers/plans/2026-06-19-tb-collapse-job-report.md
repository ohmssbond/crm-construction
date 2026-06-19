# Collapse job detail + report (slice 7b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the completed-job report into the admin job detail at `/tb/jobs/[id]`, and delete the separate `/report` route.

**Architecture:** Extract the report's three sections (Time/Materials/Photos) verbatim into a focused presentational `ReportSections` component. Rebuild the job detail page on `getJobReport(id)` (which already returns job + customer + those sections), rendering the admin controls + a unified info Card + `<ReportSections>`. Delete the old report page.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-19-tb-collapse-job-report-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-component code.
- Do NOT run `git push` or `vercel` — operator-run at cutover. **No migration in this slice.**
- Pure UI restructure. `getJobReport` (in `src/lib/data/tb-report.ts`), `getJobDetail`, and the edit page are all UNCHANGED — only this page's data source swaps and the report route is removed.
- Each task builds green on its own.

---

## File Structure

- `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx` — **create**: the Time/Materials/Photos sections, moved verbatim from the report page into a presentational component.
- `src/app/(timebilling)/tb/jobs/[id]/page.tsx` — **rebuild**: on `getJobReport`, render controls + info Card + `<ReportSections>`.
- `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx` — **delete** (and its now-empty `report/` directory).

---

## Task 1: Extract `ReportSections` presentational component

**Files:**
- Create: `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx` with exactly (the three sections are lifted verbatim from the current report page; `key={w.label}` reflects the slice-7a name labeling):

```tsx
import { Card } from "@/components/ui/Card";
import { fmtDate } from "@/lib/data/format";
import { fmtTimeOfDay, fmtMoney } from "@/lib/data/worktime";

type ReportSectionsProps = {
  time: {
    workers: {
      label: string;
      totalHours: number;
      days: { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] }[];
    }[];
    grandTotalHours: number;
  };
  materials: {
    lines: { item: string; qty: string; unitCost: string | null; extended: number; currency: string }[];
    subtotal: number;
    currency: string;
  };
  photos: { label: string; filename: string | null; addedLabel: string; href: string | null; isImage: boolean }[];
};

/** The completed-job report's captured-work sections (Time / Materials / Photos),
 *  rendered inline on the job detail page. Read-only presentational component. */
export function ReportSections({ time, materials, photos }: ReportSectionsProps) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Time on the job</h3>
        {time.workers.length === 0 ? (
          <p className="text-meta text-faint">No time logged.</p>
        ) : (
          <Card className="flex flex-col">
            {time.workers.map((w) => (
              <div key={w.label} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold truncate">{w.label}</span>
                  <span className="text-meta text-faint shrink-0">{w.totalHours.toFixed(2)} h</span>
                </div>
                {w.days.map((d, i) => (
                  <div key={i} className="flex flex-col gap-0.5 pl-2">
                    <div className="flex items-center justify-between text-meta">
                      <span className="text-muted">
                        {fmtDate(d.date)}
                        {d.noCharge && <span className="ml-2 text-faint">· No charge</span>}
                      </span>
                      <span className="text-faint">{d.total.toFixed(2)} h</span>
                    </div>
                    {d.segments.map((s, j) => (
                      <div key={j} className="text-meta text-faint pl-2">
                        {fmtTimeOfDay(s.in)} – {fmtTimeOfDay(s.out)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Total hours</span>
              <span className="text-body font-semibold">{time.grandTotalHours.toFixed(2)} h</span>
            </div>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Materials</h3>
        {materials.lines.length === 0 ? (
          <p className="text-meta text-faint">No materials logged.</p>
        ) : (
          <Card className="flex flex-col">
            {materials.lines.map((l, i) => (
              <div key={i} className="px-4 py-2 border-b border-line-2 last:border-b-0 flex items-center justify-between gap-2 text-meta">
                <span className="flex-1 min-w-0 truncate">{l.item}</span>
                <span className="text-faint w-12 text-right">{l.qty}</span>
                <span className="text-faint w-24 text-right">
                  {l.unitCost != null ? fmtMoney(Number(l.unitCost), l.currency) : "—"}
                </span>
                <span className="w-24 text-right font-semibold">{fmtMoney(l.extended, l.currency)}</span>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Materials subtotal (your cost)</span>
              <span className="text-body font-semibold">{fmtMoney(materials.subtotal, materials.currency)}</span>
            </div>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Photos</h3>
        {photos.length === 0 ? (
          <p className="text-meta text-faint">No photos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <a
                key={i}
                href={p.href ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="border border-line rounded-card overflow-hidden flex flex-col"
              >
                <div className="bg-line-2 aspect-square grid place-items-center">
                  {p.isImage && p.href ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.href} alt={p.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 p-2 text-center">
                      <span className="text-2xl">📄</span>
                      {p.filename && (
                        <span className="text-[11px] text-faint break-all line-clamp-2">{p.filename}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-2 flex flex-col">
                  <span className="text-meta font-semibold truncate">{p.label}</span>
                  <span className="text-[11px] text-faint">{p.addedLabel}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (The component is new and not yet imported. The `<img>` is a suppressed lint warning, not an error.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx"
git commit -m "Extract ReportSections (Time/Materials/Photos) presentational component"
```

---

## Task 2: Rebuild the job detail page + delete the report route

**Files:**
- Modify (rebuild): `src/app/(timebilling)/tb/jobs/[id]/page.tsx`
- Delete: `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`

- [ ] **Step 1: Rebuild `page.tsx`**

Replace the ENTIRE contents of `src/app/(timebilling)/tb/jobs/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { buttonClasses } from "@/components/ui/Button";
import { ArchiveButton } from "@/app/(artisan)/ArchiveButton";
import { getJobReport } from "@/lib/data/tb-report";
import { fmtDate } from "@/lib/data/format";
import { fmtMoney } from "@/lib/data/worktime";
import { JobStatusControl } from "../JobStatusControl";
import { archiveJob } from "../actions";
import { ReportSections } from "./ReportSections";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getJobReport(id);
  if (!report) notFound();
  const { job, customer } = report;

  const billing =
    job.billingType === "fixed_price"
      ? `Fixed price — ${fmtMoney(Number(job.contractPrice ?? 0), job.currency)}`
      : "Time & materials";
  const dates = [fmtDate(job.startDate), fmtDate(job.endDate)].filter(Boolean).join(" – ") || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <Link href={`/tb/jobs/${id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>Edit</Link>
        <ArchiveButton action={archiveJob.bind(null, id)} noun="job" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-meta text-faint">Status</span>
        <JobStatusControl jobId={id} status={job.status} />
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Customer" value={customer.name} />
        <KeyValue label="Email" value={customer.email ?? "—"} />
        <KeyValue label="Phone" value={customer.phone ?? "—"} />
        <KeyValue label="Site address" value={job.siteAddress || "—"} />
        <KeyValue label="Billing" value={billing} />
        <KeyValue label="Dates" value={dates} />
        <KeyValue label="Description" value={job.description ?? "—"} />
        <KeyValue label="Notes" value={job.notes ?? "—"} />
      </Card>

      <ReportSections time={report.time} materials={report.materials} photos={report.photos} />
    </div>
  );
}
```

Notes:
- This swaps the data source from `getJobDetail` to `getJobReport` (which carries the customer email/phone + the section data). `getJobDetail` and `fmtJobLocation` are no longer imported here (`siteAddress` is precomputed by `getJobReport`).
- The "View report" `<Link>` is gone.
- Status is shown via `JobStatusControl` (the control row), so there is no separate "Status" KeyValue (it was in the old report Card; here it would be redundant).

- [ ] **Step 2: Delete the report route**

Run:
```bash
git rm "src/app/(timebilling)/tb/jobs/[id]/report/page.tsx"
```
(That leaves the `report/` directory empty; `git rm` removes the tracked file, and an empty untracked dir is harmless — but if it lingers, `rmdir "src/app/(timebilling)/tb/jobs/[id]/report"` to clean it.)

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds. The route list no longer contains `/tb/jobs/[id]/report`; `/tb/jobs/[id]` remains. No "unused import / cannot find module" errors (nothing imports the deleted report page; `getJobDetail` is still exported from `jobs.ts` and used by the edit page).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all pass (67 — unchanged; this slice adds no tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/page.tsx"
git commit -m "Collapse the completed-job report into the job detail; drop /report route"
```

---

## Manual verification (controller/operator, after deploy)

**No migration** — cutover is `vercel --prod` only. Then, as `timebilling:admin` on a job the worker has logged against:

1. `/tb/jobs/[id]` shows the info Card (incl. **Email/Phone**) + **Status / Edit / Archive**, then the **Time / Materials / Photos** sections inline — and **no** "View report" button.
2. Time labels each tech by **name** (7a), with correct 0.25h daily/grand totals; Materials shows the subtotal; Photos show thumbnails.
3. Visiting `/tb/jobs/[id]/report` now **404s**.
4. Changing **Status**, opening **Edit**, and **Archive** all still work.
5. A brand-new job with nothing logged shows the three empty states ("No time logged." etc.) without erroring.

---

## Self-Review

**Spec coverage:**
- Job detail rebuilt on `getJobReport`; `notFound()` when null → Task 2. ✓
- Admin controls kept (Edit/Archive/JobStatusControl), "View report" dropped → Task 2. ✓
- Info Card adopts the richer set (Email/Phone; `fmtMoney` for fixed price) → Task 2. ✓
- Time/Materials/Photos extracted verbatim into `ReportSections` and rendered inline → Tasks 1 + 2. ✓
- Old `/report` route deleted outright (no redirect) → Task 2 step 2. ✓
- `getJobDetail`/edit page unchanged; no migration → confirmed (only `page.tsx` swaps its import). ✓

**Type consistency:** `ReportSections`'s `ReportSectionsProps` (`time`, `materials`, `photos`) exactly mirrors the `getJobReport` return shape, and Task 2 passes `report.time` / `report.materials` / `report.photos` into it. `report.job` fields used in Task 2 (`name`, `status`, `billingType`, `contractPrice`, `currency`, `description`, `notes`, `startDate`, `endDate`, `siteAddress`) and `report.customer` (`name`, `email`, `phone`) all exist on the `getJobReport` return. `JobStatusControl` receives `jobId={id}` + `status={job.status}` as before.

**Placeholder scan:** none — both code steps show complete file contents.
