# Pre-invoice / completed-job report (slice 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only admin report at `/tb/jobs/[id]/report` that assembles a job's captured time (per tech), materials, photos, and customer/job details into the PRD's §8.2b staging report.

**Architecture:** A new `getJobReport(jobId)` data function reads across the worker-captured tables (admin `is_tb_admin` RLS) plus job/customer, resolves worker labels to emails via the service-role admin client, and returns a structured object. Two pure helpers (`materialExtended`, `fmtMoney`) handle money. A server-component page renders it with the existing `Card`/`KeyValue` primitives; the job detail gets a "View report" link.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase (Postgres/RLS + service-role admin client + Storage signing), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-18-tb-pre-invoice-report-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-component code.
- Do NOT run `git push` or `vercel` — those are operator-run at cutover. **There is no migration in this slice.**
- The report route lives under `src/app/(timebilling)/tb/`, whose layout already gates to `timebilling:admin` — so the page is admin-gated by placement.
- Each task builds green on its own (data/helpers/page are additive). `npm run build` is a valid per-task gate.

---

## File Structure

- `src/lib/data/worktime.ts` — **modify**: add pure `materialExtended` + `fmtMoney` (beside the existing helpers).
- `src/lib/data/worktime.test.ts` — **modify**: add `materialExtended` + `fmtMoney` describe blocks.
- `src/lib/data/tb-report.ts` — **create**: `getJobReport(jobId)` assembly (the meat).
- `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx` — **create**: the report page.
- `src/app/(timebilling)/tb/jobs/[id]/page.tsx` — **modify**: add a "View report" link to the header.

---

## Task 1: Pure helpers `materialExtended` + `fmtMoney` (TDD)

**Files:**
- Modify: `src/lib/data/worktime.ts`
- Test: `src/lib/data/worktime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `materialExtended` and `fmtMoney` to the existing import at the top of `src/lib/data/worktime.test.ts` (it currently ends the import list with `validateLabel,` — add both names), then append:

```ts
describe("materialExtended", () => {
  test("multiplies qty by unit cost", () => {
    expect(materialExtended("3", "4.50")).toBe(13.5);
  });

  test("rounds to cents", () => {
    expect(materialExtended("3", "1.005")).toBe(3.02);
  });

  test("accepts numbers", () => {
    expect(materialExtended(2, 2.5)).toBe(5);
  });

  test("returns 0 for a null unit cost", () => {
    expect(materialExtended("3", null)).toBe(0);
  });

  test("returns 0 for non-numeric input", () => {
    expect(materialExtended("abc", "2")).toBe(0);
  });
});

describe("fmtMoney", () => {
  test("formats with two decimals and the currency", () => {
    expect(fmtMoney(42.5, "USD")).toBe("USD 42.50");
  });

  test("pads whole numbers", () => {
    expect(fmtMoney(7, "USD")).toBe("USD 7.00");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worktime`
Expected: FAIL — `materialExtended is not a function`.

- [ ] **Step 3: Implement the helpers**

Add to `src/lib/data/worktime.ts`, after the `validateLabel` function:

```ts
/** Extended cost of a material line = qty × unit_cost, rounded to cents. Non-numeric
 *  inputs (or a null unit cost) yield 0. qty/unitCost may arrive as strings (PostgREST
 *  serializes `numeric` as a string). */
export function materialExtended(
  qty: string | number,
  unitCost: string | number | null
): number {
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

(Note: `Number(null)` is 0, but the `unitCost` null case still yields 0 overall because a
line with no cost extends to 0 — `Number(null) = 0`, so `q * 0 = 0`. The test pins this.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worktime`
Expected: PASS (7 new cases + all existing worktime tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add materialExtended + fmtMoney helpers for the job report"
```

---

## Task 2: Data assembly — `getJobReport(jobId)`

**Files:**
- Create: `src/lib/data/tb-report.ts`

No unit test (multi-source Supabase reads + service-role lookup + Storage signing); covered by build + manual checks. The numeric logic it relies on (`materialExtended`, `sumSegmentHours`, `roundQuarterHours`) is unit-tested elsewhere.

- [ ] **Step 1: Create the file**

Create `src/lib/data/tb-report.ts` with:

```ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "./org";
import { one } from "./rel";
import { sumSegmentHours, roundQuarterHours, materialExtended } from "./worktime";
import { fmtDateTime, fmtJobLocation } from "./format";

/** Assemble the completed-job report for a job (admin-only surface). Reads time /
 *  materials / photos across all workers via the admin's is_tb_admin RLS, resolves
 *  worker labels to login emails via the service-role client, and signs photo URLs.
 *  Returns null if the job is missing. */
export async function getJobReport(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const tz = ctx.org.timezone;
  const supabase = await createClient();

  // 1. Job + customer
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, name, status, billing_type, contract_price, currency, description, notes, start_date, end_date, job_line1, job_line2, job_city, job_state, job_postal_code, job_country, customer:customers(name, email, phone)"
    )
    .eq("id", jobId)
    .is("archived_at", null)
    .maybeSingle();
  if (!job) return null;
  const customer = one(job.customer) as { name: string; email: string | null; phone: string | null } | null;

  // 2. Time entries (+ segments), across all workers
  const { data: entries } = await supabase
    .from("job_time_entries")
    .select("id, worker_user_id, entry_date, no_charge, segments:job_time_segments(time_in, time_out)")
    .eq("job_id", jobId)
    .order("entry_date", { ascending: true });
  const timeEntries = entries ?? [];

  // 3. Material lines
  const { data: mats } = await supabase
    .from("job_material_lines")
    .select("item, qty, unit_cost, currency")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const matRows = mats ?? [];

  // 4. Photos (+ signed URLs)
  const { data: atts } = await supabase
    .from("job_attachments")
    .select("label, filename, mime_type, added_at, storage_path")
    .eq("job_id", jobId)
    .order("added_at", { ascending: false });
  const attRows = atts ?? [];
  const signed: Record<string, string> = {};
  const paths = attRows.map((a) => a.storage_path as string);
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("job-files").createSignedUrls(paths, 3600);
    urls?.forEach((u) => {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    });
  }

  // 5. Worker emails (service-role; only ids that appear in time entries)
  const workerIds = [...new Set(timeEntries.map((e) => e.worker_user_id as string))];
  const emails: Record<string, string> = {};
  if (workerIds.length) {
    const admin = createAdminClient();
    await Promise.all(
      workerIds.map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid);
        emails[uid] = data.user?.email ?? uid.slice(0, 8);
      })
    );
  }

  // Group time by worker -> date
  type Day = { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] };
  const byWorker = new Map<string, Day[]>();
  for (const e of timeEntries) {
    const wid = e.worker_user_id as string;
    const segs = (e.segments ?? []) as { time_in: string; time_out: string | null }[];
    const closed = segs.filter((s) => s.time_out) as { time_in: string; time_out: string }[];
    const day: Day = {
      date: e.entry_date as string,
      total: roundQuarterHours(sumSegmentHours(segs)),
      noCharge: !!e.no_charge,
      segments: closed.map((s) => ({ in: s.time_in, out: s.time_out })),
    };
    if (!byWorker.has(wid)) byWorker.set(wid, []);
    byWorker.get(wid)!.push(day);
  }
  const workers = [...byWorker.entries()].map(([wid, days]) => ({
    email: emails[wid] ?? wid.slice(0, 8),
    totalHours: days.reduce((sum, d) => sum + d.total, 0),
    days,
  }));
  const grandTotalHours = workers.reduce((sum, w) => sum + w.totalHours, 0);

  // Materials
  const lines = matRows.map((m) => ({
    item: m.item as string,
    qty: m.qty as string,
    unitCost: m.unit_cost as string | null,
    extended: materialExtended(m.qty as string, m.unit_cost as string | null),
    currency: m.currency as string,
  }));
  const matCurrency = lines[0]?.currency ?? (job.currency as string);
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.extended, 0) * 100) / 100;

  // Photos
  const photos = attRows.map((a) => ({
    label: a.label as string,
    filename: (a.filename as string | null) ?? null,
    addedLabel: fmtDateTime(a.added_at as string, tz),
    href: signed[a.storage_path as string] ?? null,
    isImage: ((a.mime_type as string | null) ?? "").startsWith("image/"),
  }));

  return {
    job: {
      id: job.id as string,
      name: job.name as string,
      status: job.status as string,
      billingType: job.billing_type as string,
      contractPrice: (job.contract_price as string | null) ?? null,
      currency: job.currency as string,
      description: (job.description as string | null) ?? null,
      notes: (job.notes as string | null) ?? null,
      startDate: (job.start_date as string | null) ?? null,
      endDate: (job.end_date as string | null) ?? null,
      siteAddress: fmtJobLocation(job),
    },
    customer: {
      name: customer?.name ?? "—",
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
    },
    time: { workers, grandTotalHours },
    materials: { lines, subtotal, currency: matCurrency },
    photos,
  };
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (The function is new and not yet called.) If `fmtJobLocation(job)` complains about the extra `customer` key on `job`, that is fine at runtime — but if TypeScript errors, narrow by passing only the address fields: `fmtJobLocation({ job_line1: job.job_line1, job_line2: job.job_line2, job_city: job.job_city, job_state: job.job_state, job_postal_code: job.job_postal_code, job_country: job.job_country })`. (Try the direct call first; only narrow if the compiler objects.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/tb-report.ts
git commit -m "Add getJobReport assembly for the completed-job report"
```

---

## Task 3: The report page

**Files:**
- Create: `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { getJobReport } from "@/lib/data/tb-report";
import { fmtDate } from "@/lib/data/format";
import { fmtTimeOfDay, fmtMoney } from "@/lib/data/worktime";

export default async function JobReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getJobReport(id);
  if (!report) notFound();
  const { job, customer, time, materials, photos } = report;

  const billing =
    job.billingType === "fixed_price"
      ? `Fixed price — ${fmtMoney(Number(job.contractPrice ?? 0), job.currency)}`
      : "Time & materials";
  const dates = [fmtDate(job.startDate), fmtDate(job.endDate)].filter(Boolean).join(" – ") || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href={`/tb/jobs/${id}`} className="text-muted text-xl leading-none">‹</Link>
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <span className="text-meta text-faint">Completed-job report</span>
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Customer" value={customer.name} />
        <KeyValue label="Email" value={customer.email ?? "—"} />
        <KeyValue label="Phone" value={customer.phone ?? "—"} />
        <KeyValue label="Site address" value={job.siteAddress || "—"} />
        <KeyValue label="Billing" value={billing} />
        <KeyValue label="Status" value={job.status} />
        <KeyValue label="Dates" value={dates} />
        <KeyValue label="Description" value={job.description ?? "—"} />
        <KeyValue label="Notes" value={job.notes ?? "—"} />
      </Card>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Time on the job</h3>
        {time.workers.length === 0 ? (
          <p className="text-meta text-faint">No time logged.</p>
        ) : (
          <Card className="flex flex-col">
            {time.workers.map((w) => (
              <div key={w.email} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold truncate">{w.email}</span>
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
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds; the new route `/tb/jobs/[id]/report` appears in the route list. (The `<img>` triggers a suppressed `@next/next/no-img-element` lint *warning*, which does not fail the build.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/report/page.tsx"
git commit -m "Add the completed-job report page"
```

---

## Task 4: "View report" link on the job detail

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

Add a "View report" link between the `<h2>` and the Edit link:

```tsx
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <Link href={`/tb/jobs/${id}/report`} className={buttonClasses("ghost", "sm")}>View report</Link>
        <Link href={`/tb/jobs/${id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>Edit</Link>
        <ArchiveButton action={archiveJob.bind(null, id)} noun="job" />
      </div>
```

(`buttonClasses` and `Link` are already imported in this file.)

- [ ] **Step 2: Verify it builds + full test suite**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all pass (63 total — the prior 56 plus 7 new helper cases).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/jobs/[id]/page.tsx"
git commit -m "Link to the completed-job report from the job detail"
```

---

## Manual verification (controller/operator, after deploy)

**No migration** — cutover is `vercel --prod` only. Then, signed in as the seed `timebilling:admin`, on a job that the `timebilling:worker` has logged time/materials/photos against:

1. `/tb/jobs/[id]` shows a **View report** button → opens `/tb/jobs/[id]/report`.
2. **Time on the job** lists each tech by **email**, with dated segment lines, correct 0.25h daily totals, a per-worker subtotal, and a grand total; a `no_charge` day is flagged "No charge".
3. **Materials** lists item / qty / unit cost / extended with a correct **subtotal (your cost)**.
4. **Photos** show thumbnails (or 📄 + filename) that open via their signed URL.
5. Header shows the customer name + email + phone and the site address; a **fixed-price** job shows the contract price; a **T&M** job shows "Time & materials".
6. A job with no logged data shows the empty states without erroring.

---

## Self-Review

**Spec coverage:**
- Dedicated `/tb/jobs/[id]/report` route, any status, + "View report" link → Tasks 3 + 4. ✓
- `getJobReport` assembles job+customer, time (per worker→date, 0.25h daily totals, no_charge flagged), materials (extended + subtotal), photos (signed) → Task 2. ✓
- Tech labels via service-role `getUserById` email lookup → Task 2 step 5. ✓
- `materialExtended` + `fmtMoney` pure helpers, unit-tested → Task 1. ✓
- Captured quantities, not priced (hours + your-cost subtotal; contract price for fixed-price; no_charge shown not subtracted) → Tasks 2 + 3. ✓
- On-screen only, no migration, admin-gated by placement → confirmed. ✓

**Type consistency:** `materialExtended(qty, unitCost): number` and `fmtMoney(amount, currency): string` are identical across Task 1 (def + tests) and their callers (Task 2 `getJobReport`, Task 3 page). The object shape returned by `getJobReport` (`job{...}`, `customer{name,email,phone}`, `time{workers[{email,totalHours,days[{date,total,noCharge,segments[{in,out}]}]}],grandTotalHours}`, `materials{lines[{item,qty,unitCost,extended,currency}],subtotal,currency}`, `photos[{label,filename,addedLabel,href,isImage}]`) matches exactly what Task 3 destructures and renders. `getJobReport`/`fmtMoney`/`fmtTimeOfDay`/`fmtDate` import paths match their definitions.

**Placeholder scan:** none — every code step shows complete code. The one conditional ("if TypeScript objects to `fmtJobLocation(job)`, narrow the arg") gives the exact fallback code, not a vague instruction.
