# Per-job billing-ticket `.xlsx` export (slice 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-job "Export billing ticket (.xlsx)" download on `/tb/jobs/[id]` that mirrors the customer's handwritten billing form.

**Architecture:** A pure `jobBillingRows(report)` transform (segment→In/Out-pairs pivot + >2-segment overflow + totals) feeds a thin `buildBillingWorkbook` exceljs writer. A GET route handler at `/tb/jobs/[id]/export` reuses `getJobReport(id)`, builds the workbook, and streams it as a download. A button on the job page links to it. No migration; no new DB queries.

**Tech Stack:** Next.js 16 (App Router route handler, RSC), TypeScript, `exceljs`, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-20-tb-billing-export-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` (route handlers: the `params` is a `Promise`; return a web `Response`) before writing the route handler.
- Do NOT run `git push` or `vercel` — operator-run at cutover. **No DB migration.** Task 1 adds the `exceljs` npm dependency (package.json + lockfile) — that IS expected.
- Each task builds green on its own.

---

## File Structure

- `package.json` / `package-lock.json` — **modify**: add `exceljs`.
- `src/lib/export/billing-ticket.ts` — **create**: `BillingReport`/`BillingRows` types, pure `jobBillingRows`, and the thin `buildBillingWorkbook` (exceljs).
- `src/lib/export/billing-ticket.test.ts` — **create**: unit tests for `jobBillingRows`.
- `src/app/(timebilling)/tb/jobs/[id]/export/route.ts` — **create**: the GET download handler.
- `src/app/(timebilling)/tb/jobs/[id]/page.tsx` — **modify**: add the "Export billing ticket" link.

---

## Task 1: Add the `exceljs` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install exceljs**

Run: `npm install exceljs`
Expected: `package.json` gains `"exceljs": "^4..."` under dependencies; `package-lock.json` updates; exit 0.

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds (the dependency is installed but not yet imported).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add exceljs dependency for the billing-ticket export"
```

---

## Task 2: Pure `jobBillingRows` transform (TDD)

**Files:**
- Create: `src/lib/export/billing-ticket.ts`
- Test: `src/lib/export/billing-ticket.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/export/billing-ticket.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { jobBillingRows, type BillingReport } from "./billing-ticket";

function baseReport(over: Partial<BillingReport> = {}): BillingReport {
  return {
    job: { name: "Job A", siteAddress: "1 Main St", description: "Fix it", notes: "be careful" },
    customer: { name: "Acme", email: "a@acme.com", phone: "555-1212" },
    time: { workers: [], grandTotalHours: 0 },
    materials: { lines: [], subtotal: 0, currency: "USD" },
    ...over,
  };
}

describe("jobBillingRows — time pivot", () => {
  test("a day with two segments → one row with both In/Out pairs", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 7,
          workers: [
            {
              label: "Jose",
              totalHours: 7,
              days: [
                {
                  date: "2026-06-20",
                  total: 7,
                  segments: [
                    { in: "08:00:00", out: "12:00:00" },
                    { in: "13:00:00", out: "16:00:00" },
                  ],
                },
              ],
            },
          ],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "12:00 PM", in2: "1:00 PM", out2: "4:00 PM", totalHours: "7.00" },
    ]);
  });

  test("a day with one segment → In/Out second pair blank", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 4,
          workers: [{ label: "Jose", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "08:00:00", out: "12:00:00" }] }] }],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "12:00 PM", in2: "", out2: "", totalHours: "4.00" },
    ]);
  });

  test("a day with three segments → overflow continuation row (tech/date/total blank)", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 8,
          workers: [
            {
              label: "Jose",
              totalHours: 8,
              days: [
                {
                  date: "2026-06-20",
                  total: 8,
                  segments: [
                    { in: "08:00:00", out: "10:00:00" },
                    { in: "10:30:00", out: "12:00:00" },
                    { in: "13:00:00", out: "17:30:00" },
                  ],
                },
              ],
            },
          ],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "10:00 AM", in2: "10:30 AM", out2: "12:00 PM", totalHours: "8.00" },
      { tech: "", date: "", in1: "1:00 PM", out1: "5:30 PM", in2: "", out2: "", totalHours: "" },
    ]);
  });

  test("a day with zero closed segments contributes no rows", () => {
    const r = jobBillingRows(
      baseReport({
        time: { grandTotalHours: 0, workers: [{ label: "Jose", totalHours: 0, days: [{ date: "2026-06-20", total: 0, segments: [] }] }] },
      })
    );
    expect(r.timeRows).toEqual([]);
  });

  test("two techs each start their own row", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 8,
          workers: [
            { label: "Jose", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "08:00:00", out: "12:00:00" }] }] },
            { label: "Mia", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "09:00:00", out: "13:00:00" }] }] },
          ],
        },
      })
    );
    expect(r.timeRows.map((t) => t.tech)).toEqual(["Jose", "Mia"]);
  });
});

describe("jobBillingRows — header, materials, totals", () => {
  test("maps customer/site/description/notes and totals", () => {
    const r = jobBillingRows(
      baseReport({
        time: { grandTotalHours: 7.5, workers: [] },
        materials: {
          subtotal: 42.5,
          currency: "USD",
          lines: [
            { item: "Pipe", qty: "3", unitCost: "4.50", extended: 13.5, currency: "USD" },
            { item: "Glue", qty: "1", unitCost: null, extended: 0, currency: "USD" },
          ],
        },
      })
    );
    expect(r.customer).toEqual({ name: "Acme", email: "a@acme.com", phone: "555-1212" });
    expect(r.siteAddress).toBe("1 Main St");
    expect(r.description).toBe("Fix it");
    expect(r.notes).toBe("be careful");
    expect(r.totalLaborHours).toBe(7.5);
    expect(r.totalMaterialCost).toBe(42.5);
    expect(r.currency).toBe("USD");
    expect(r.materialRows).toEqual([
      { item: "Pipe", qty: "3", unitCost: 4.5, cost: 13.5 },
      { item: "Glue", qty: "1", unitCost: null, cost: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- billing-ticket`
Expected: FAIL — cannot find module `./billing-ticket` / `jobBillingRows is not a function`.

- [ ] **Step 3: Implement `jobBillingRows` (+ the types)**

Create `src/lib/export/billing-ticket.ts` with (this step adds the types + the pure transform; the workbook writer is Task 3):

```ts
import { fmtTimeOfDay } from "@/lib/data/worktime";
import { fmtDate } from "@/lib/data/format";

/** The subset of the getJobReport return that the billing ticket needs. The full
 *  report (which has more fields) is structurally assignable to this. */
export type BillingReport = {
  job: { name: string; siteAddress: string; description: string | null; notes: string | null };
  customer: { name: string; email: string | null; phone: string | null };
  time: {
    workers: {
      label: string;
      totalHours: number;
      days: { date: string; total: number; segments: { in: string; out: string }[] }[];
    }[];
    grandTotalHours: number;
  };
  materials: {
    lines: { item: string; qty: string; unitCost: string | null; extended: number; currency: string }[];
    subtotal: number;
    currency: string;
  };
};

export type BillingRows = {
  customer: { name: string; phone: string | null; email: string | null };
  siteAddress: string;
  description: string | null;
  timeRows: {
    tech: string;
    date: string;
    in1: string;
    out1: string;
    in2: string;
    out2: string;
    totalHours: string;
  }[];
  totalLaborHours: number;
  materialRows: { item: string; qty: string; unitCost: number | null; cost: number }[];
  totalMaterialCost: number;
  currency: string;
  notes: string | null;
};

/** Transform a completed-job report into the billing-ticket row structures. Pivots
 *  each tech-day's clock segments into two In/Out pairs per row; >2 segments overflow
 *  onto continuation rows (tech/date/total blank), with the day total on the first. */
export function jobBillingRows(report: BillingReport): BillingRows {
  const timeRows: BillingRows["timeRows"] = [];
  for (const w of report.time.workers) {
    for (const d of w.days) {
      const segs = d.segments;
      if (segs.length === 0) continue;
      const rowCount = Math.ceil(segs.length / 2);
      for (let row = 0; row < rowCount; row++) {
        const a = segs[row * 2];
        const b = segs[row * 2 + 1];
        timeRows.push({
          tech: row === 0 ? w.label : "",
          date: row === 0 ? (fmtDate(d.date) ?? d.date) : "",
          in1: fmtTimeOfDay(a.in),
          out1: fmtTimeOfDay(a.out),
          in2: b ? fmtTimeOfDay(b.in) : "",
          out2: b ? fmtTimeOfDay(b.out) : "",
          totalHours: row === 0 ? d.total.toFixed(2) : "",
        });
      }
    }
  }

  const materialRows = report.materials.lines.map((l) => ({
    item: l.item,
    qty: l.qty,
    unitCost: l.unitCost != null ? Number(l.unitCost) : null,
    cost: l.extended,
  }));

  return {
    customer: { name: report.customer.name, phone: report.customer.phone, email: report.customer.email },
    siteAddress: report.job.siteAddress,
    description: report.job.description,
    timeRows,
    totalLaborHours: report.time.grandTotalHours,
    materialRows,
    totalMaterialCost: report.materials.subtotal,
    currency: report.materials.currency,
    notes: report.job.notes,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- billing-ticket`
Expected: PASS (all `jobBillingRows` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/billing-ticket.ts src/lib/export/billing-ticket.test.ts
git commit -m "Add jobBillingRows transform (segment pivot + overflow) for billing export"
```

---

## Task 3: `buildBillingWorkbook` writer + the export route handler

**Files:**
- Modify: `src/lib/export/billing-ticket.ts`
- Create: `src/app/(timebilling)/tb/jobs/[id]/export/route.ts`

No unit test (exceljs rendering + a route handler); covered by build + the manual check. The row logic it renders is already unit-tested in Task 2.

- [ ] **Step 1: Append `buildBillingWorkbook` to `src/lib/export/billing-ticket.ts`**

Add the import at the top (with the existing imports):
```ts
import ExcelJS from "exceljs";
```
Then append:
```ts
/** Render the prepared billing rows into an exceljs workbook (one "Billing" sheet).
 *  Pure formatting — no business logic. */
export function buildBillingWorkbook(rows: BillingRows): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Billing");
  ws.columns = [{ width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];

  const section = (title: string) => {
    const r = ws.addRow([title]);
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  };

  // Customer
  section("Customer");
  ws.addRow(["Name", rows.customer.name, "", "Phone", rows.customer.phone ?? ""]);
  ws.addRow(["Email", rows.customer.email ?? "", "", "Site address", rows.siteAddress || ""]);
  ws.addRow(["Description of work", rows.description ?? ""]);
  ws.addRow([]);

  // Time On Site
  section("Time On Site");
  const th = ws.addRow(["Tech", "Date", "In", "Out", "In", "Out", "Total Hours"]);
  th.font = { bold: true };
  for (const t of rows.timeRows) {
    ws.addRow([t.tech, t.date, t.in1, t.out1, t.in2, t.out2, t.totalHours]);
  }
  const tl = ws.addRow(["", "", "", "", "", "Total Labor", `${rows.totalLaborHours.toFixed(2)} h`]);
  tl.font = { bold: true };
  ws.addRow([]);

  // Materials
  section("Materials");
  const mh = ws.addRow(["Item", "Quantity", `Unit Cost (${rows.currency})`, `Cost (${rows.currency})`]);
  mh.font = { bold: true };
  for (const m of rows.materialRows) {
    const r = ws.addRow([m.item, m.qty, m.unitCost ?? "", m.cost]);
    r.getCell(3).numFmt = "#,##0.00";
    r.getCell(4).numFmt = "#,##0.00";
  }
  const mt = ws.addRow(["", "", "Total Material Cost", rows.totalMaterialCost]);
  mt.font = { bold: true };
  mt.getCell(4).numFmt = "#,##0.00";
  ws.addRow([]);

  // Notes
  section("Notes");
  ws.addRow([rows.notes ?? ""]);

  return wb;
}
```

(If TypeScript objects to the default import, use `import * as ExcelJS from "exceljs";` instead — try the default form first.)

- [ ] **Step 2: Create the route handler `src/app/(timebilling)/tb/jobs/[id]/export/route.ts`**

```ts
import type { NextRequest } from "next/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getJobReport } from "@/lib/data/tb-report";
import { jobBillingRows, buildBillingWorkbook } from "@/lib/export/billing-ticket";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireTbAdmin();
  const { id } = await params;

  const report = await getJobReport(id);
  if (!report) return new Response("Job not found", { status: 404 });

  const workbook = buildBillingWorkbook(jobBillingRows(report));
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = report.job.name.replace(/[^A-Za-z0-9._-]+/g, "_") || "job";

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${safeName}-billing.xlsx"`,
    },
  });
}
```

Notes:
- `requireTbAdmin()` (from `@/lib/auth-tb`) gates this — route handlers are NOT wrapped by the `/tb` layout, so the explicit check is required. It redirects non-admins.
- `getJobReport` is RLS-scoped to the admin's org, so a job in another org returns null → 404.
- `report.job.name` exists on the full `getJobReport` return (the route passes the full report into `jobBillingRows`, which accepts the structural `BillingReport` subset).
- If the build complains about `buffer as ArrayBuffer`, use `new Response(new Uint8Array(buffer as ArrayBuffer), …)`.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds; the route `/tb/jobs/[id]/export` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/billing-ticket.ts "src/app/(timebilling)/tb/jobs/[id]/export/route.ts"
git commit -m "Add billing-ticket workbook writer + export route handler"
```

---

## Task 4: "Export billing ticket" button on the job page

**Files:**
- Modify: `src/app/(timebilling)/tb/jobs/[id]/page.tsx`

- [ ] **Step 1: Add the link to the header**

In `src/app/(timebilling)/tb/jobs/[id]/page.tsx`, the header block currently reads:

```tsx
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <Link href={`/tb/jobs/${id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>Edit</Link>
        <ArchiveButton action={archiveJob.bind(null, id)} noun="job" />
      </div>
```

Add an Export link before the Edit link:

```tsx
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <a href={`/tb/jobs/${id}/export`} className={buttonClasses("ghost", "sm")}>Export billing ticket</a>
        <Link href={`/tb/jobs/${id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>Edit</Link>
        <ArchiveButton action={archiveJob.bind(null, id)} noun="job" />
      </div>
```

Use a plain `<a>` (not `next/link`) so the browser performs the file download rather than a client-side navigation. (`buttonClasses` is already imported in this file.)

- [ ] **Step 2: Verify it builds + full test suite**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all pass (73 total — the prior 67 plus the 6 new `jobBillingRows` cases).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/page.tsx"
git commit -m "Add Export billing ticket button to the job page"
```

---

## Manual verification (controller/operator, after deploy)

**No migration** — cutover is `vercel --prod` (which installs `exceljs` at build). Then, as `timebilling:admin` on a job the worker has logged time + materials against:

1. `/tb/jobs/[id]` shows an **Export billing ticket** button → clicking it downloads `<job>-billing.xlsx`.
2. Open the file: **Customer** header (Name/Phone/Email/Site address) + **Description of work**; **Time On Site** rows (Tech/Date/In/Out/In/Out/Total Hours) with correct pairs and per-day totals + a bold **Total Labor** (hours); **Materials** rows (Item/Quantity/Unit Cost/Cost) + bold **Total Material Cost**; **Notes**.
3. A day with two segments shows both In/Out pairs on one row; a 3-segment day overflows to a continuation row.
4. A job with no logged time/materials exports with empty section bodies (no error).
5. A non-admin hitting `/tb/jobs/[id]/export` directly is redirected (not served the file).

---

## Self-Review

**Spec coverage:**
- Per-job, any-status, button on the job page → Task 4. ✓
- GET route handler, admin-gated (`requireTbAdmin`), 404 when not in org, streams xlsx with `Content-Disposition` → Task 3. ✓
- `exceljs` dependency → Task 1. ✓
- Stacked one-sheet layout (Customer → Time On Site → Total Labor → Materials → Total Material Cost → Notes) → Task 3 `buildBillingWorkbook`. ✓
- Time rows: 2 In/Out pairs, >2-segment overflow, day total on first row → Task 2 `jobBillingRows` (+ tests). ✓
- Total Labor = hours; Address = site; Materials Cost = extended (+ Unit Cost col) → Tasks 2 + 3. ✓
- Reuses `getJobReport`; no migration; no new queries → Task 3 route. ✓
- Pure transform unit-tested; thin writer untested-by-design → Tasks 2 + 3. ✓

**Type consistency:** `jobBillingRows(report: BillingReport): BillingRows` is identical in Task 2 (def + tests) and Task 3 (`buildBillingWorkbook(rows: BillingRows)` + the route's `jobBillingRows(report)`). The route passes the full `getJobReport` return where a `BillingReport` is expected — structurally compatible (the full type has `job.name/siteAddress/description/notes`, `customer.name/email/phone`, `time.workers[].{label,totalHours,days[].{date,total,segments[].{in,out}}}`, `time.grandTotalHours`, `materials.lines[].{item,qty,unitCost,extended,currency}`, `materials.{subtotal,currency}` — all present, extra fields ignored). `BillingRows` produced by Task 2 is consumed field-for-field by Task 3's writer.

**Placeholder scan:** none — every code step shows complete code; the two "if the compiler objects" notes give the exact fallback, not a vague instruction.
