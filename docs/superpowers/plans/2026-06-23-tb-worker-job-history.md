# Worker Per-Job History Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a worker a persistent, read-only history of their own time, materials, photos, and work notes for the job they're on, below the tabs on `/log/[jobId]`.

**Architecture:** A pure transform (`groupTimeByDay`) in `worktime.ts` shapes the worker's time entries into per-day history; a thin self-scoped data function (`getJobTimeHistoryForWorker`) in `worker.ts` fetches and feeds it. A new read-only presentational component (`WorkerHistory`) renders time/materials/photos/notes, reusing the already-cost-free worker data functions for the latter three. The component is wired below `<Tabs>` on the worker job page. No migration; decoupled from the admin report so cost never enters the worker path.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + RLS), Vitest, Tailwind v4.

## Global Constraints

- **Modified Next.js** — read `node_modules/next/dist/docs/` before writing app code; heed deprecation notices (per `AGENTS.md`).
- **Cost is never exposed to workers** — the worker path must not fetch or render material unit cost, extended cost, or subtotals. Reuse only the cost-free worker data functions.
- **No migration** — pure read + presentation over existing tables and RLS.
- **Self-scoped only** — every query filters to the signed-in `worker_user_id`; no service-role client on this path.
- **Gates:** `npm test` (Vitest) and `npm run build` must pass before commit/merge.

---

### Task 1: Pure time-history transform `groupTimeByDay`

**Files:**
- Modify: `src/lib/data/worktime.ts` (add after `roundQuarterHours`, ~line 82)
- Test: `src/lib/data/worktime.test.ts` (add a new `describe` block; import the new symbol)

**Interfaces:**
- Consumes: existing `sumSegmentHours(segments)` and `roundQuarterHours(hours)` from the same file.
- Produces:
  ```ts
  export type TimeHistoryDay = {
    date: string;
    total: number;
    noCharge: boolean;
    segments: { in: string; out: string }[];
  };
  export function groupTimeByDay(
    entries: {
      entry_date: string;
      no_charge: boolean;
      segments: { time_in: string; time_out: string | null }[];
    }[]
  ): { days: TimeHistoryDay[]; grandTotalHours: number };
  ```

- [ ] **Step 1: Write the failing tests**

In `src/lib/data/worktime.test.ts`, add `groupTimeByDay` to the import list from `"./worktime"`, then append:

```ts
describe("groupTimeByDay", () => {
  test("maps entries to days with rounded totals and closed segments", () => {
    const { days, grandTotalHours } = groupTimeByDay([
      {
        entry_date: "2026-06-20",
        no_charge: false,
        segments: [
          { time_in: "08:00", time_out: "10:00" },
          { time_in: "10:30", time_out: "12:00" },
        ],
      },
      {
        entry_date: "2026-06-21",
        no_charge: true,
        segments: [{ time_in: "09:00", time_out: "09:45" }],
      },
    ]);
    expect(days).toEqual([
      {
        date: "2026-06-20",
        total: 3.5,
        noCharge: false,
        segments: [
          { in: "08:00", out: "10:00" },
          { in: "10:30", out: "12:00" },
        ],
      },
      {
        date: "2026-06-21",
        total: 0.75,
        noCharge: true,
        segments: [{ in: "09:00", out: "09:45" }],
      },
    ]);
    expect(grandTotalHours).toBe(4.25);
  });

  test("omits a day whose only segment is still open", () => {
    const { days, grandTotalHours } = groupTimeByDay([
      {
        entry_date: "2026-06-22",
        no_charge: false,
        segments: [{ time_in: "08:00", time_out: null }],
      },
    ]);
    expect(days).toEqual([]);
    expect(grandTotalHours).toBe(0);
  });

  test("excludes open segments from a day that also has closed ones", () => {
    const { days } = groupTimeByDay([
      {
        entry_date: "2026-06-22",
        no_charge: false,
        segments: [
          { time_in: "08:00", time_out: "09:00" },
          { time_in: "09:30", time_out: null },
        ],
      },
    ]);
    expect(days[0].segments).toEqual([{ in: "08:00", out: "09:00" }]);
    expect(days[0].total).toBe(1);
  });

  test("empty input -> empty result", () => {
    expect(groupTimeByDay([])).toEqual({ days: [], grandTotalHours: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/data/worktime.test.ts`
Expected: FAIL — `groupTimeByDay is not a function` / import error.

- [ ] **Step 3: Implement the transform**

In `src/lib/data/worktime.ts`, immediately after the `roundQuarterHours` function (line ~82), add:

```ts
export type TimeHistoryDay = {
  date: string;
  total: number;
  noCharge: boolean;
  segments: { in: string; out: string }[];
};

/** Shape a worker's time entries into per-day history (mirrors the admin report's
 *  per-day shape). Closed segments only; a day with no closed segment is omitted so an
 *  in-progress clock doesn't yield an empty 0.00 h row. */
export function groupTimeByDay(
  entries: {
    entry_date: string;
    no_charge: boolean;
    segments: { time_in: string; time_out: string | null }[];
  }[]
): { days: TimeHistoryDay[]; grandTotalHours: number } {
  const days: TimeHistoryDay[] = [];
  for (const e of entries) {
    const closed = e.segments.filter(
      (s): s is { time_in: string; time_out: string } => !!s.time_out
    );
    if (closed.length === 0) continue;
    days.push({
      date: e.entry_date,
      total: roundQuarterHours(sumSegmentHours(e.segments)),
      noCharge: e.no_charge,
      segments: closed.map((s) => ({ in: s.time_in, out: s.time_out })),
    });
  }
  const grandTotalHours = days.reduce((sum, d) => sum + d.total, 0);
  return { days, grandTotalHours };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/data/worktime.test.ts`
Expected: PASS (all four new cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add groupTimeByDay transform for worker time history (T&B)"
```

---

### Task 2: Data function `getJobTimeHistoryForWorker`

**Files:**
- Modify: `src/lib/data/worker.ts` (extend the `worktime` import; add the function)

**Interfaces:**
- Consumes: `createClient` (already imported), `groupTimeByDay` + `TimeHistoryDay` from `./worktime` (Task 1).
- Produces:
  ```ts
  export async function getJobTimeHistoryForWorker(
    jobId: string
  ): Promise<{ days: TimeHistoryDay[]; grandTotalHours: number }>;
  ```

- [ ] **Step 1: Extend the worktime import**

In `src/lib/data/worker.ts`, line 3 currently reads:

```ts
import { todayInZone } from "./worktime";
```

Change it to:

```ts
import { todayInZone, groupTimeByDay } from "./worktime";
```

- [ ] **Step 2: Add the data function**

Append to `src/lib/data/worker.ts` (after `getJobWorkNotesForWorker`):

```ts
/** The signed-in worker's full time history for a job, grouped by day across all
 *  dates. Self-scoped via worker_rw RLS — no service-role, no cost. */
export async function getJobTimeHistoryForWorker(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { days: [], grandTotalHours: 0 };

  const { data } = await supabase
    .from("job_time_entries")
    .select("entry_date, no_charge, segments:job_time_segments(time_in, time_out)")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("entry_date", { ascending: true });

  return groupTimeByDay(
    (data ?? []).map((e) => ({
      entry_date: e.entry_date as string,
      no_charge: !!e.no_charge,
      segments: (e.segments ?? []) as { time_in: string; time_out: string | null }[],
    }))
  );
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run build`
Expected: build succeeds (no type errors). The function is exercised end-to-end once wired in Task 4; its grouping logic is already covered by Task 1's unit tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/worker.ts
git commit -m "Add getJobTimeHistoryForWorker (self-scoped, all dates) (T&B)"
```

---

### Task 3: `WorkerHistory` presentational component

**Files:**
- Create: `src/app/(worker)/log/WorkerHistory.tsx`

**Interfaces:**
- Consumes: `Card` from `@/components/ui/Card`; `fmtDate` from `@/lib/data/format`; `fmtTimeOfDay` from `@/lib/data/worktime`. Prop shapes match the outputs of `getJobTimeHistoryForWorker` (Task 2), `getJobMaterialsForWorker`, `getJobPhotosForWorker`, `getJobWorkNotesForWorker` (existing, in `worker.ts`).
- Produces:
  ```ts
  export function WorkerHistory(props: {
    time: { days: { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] }[]; grandTotalHours: number };
    materials: { id: string; item: string; qty: string }[];
    photos: { id: string; label: string; filename: string | null; addedLabel: string; href: string | null; isImage: boolean }[];
    notes: { id: string; body: string; dateLabel: string }[];
  }): JSX.Element;
  ```

- [ ] **Step 1: Create the component**

Create `src/app/(worker)/log/WorkerHistory.tsx` with exactly:

```tsx
import { Card } from "@/components/ui/Card";
import { fmtDate } from "@/lib/data/format";
import { fmtTimeOfDay } from "@/lib/data/worktime";

type WorkerHistoryProps = {
  time: {
    days: { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] }[];
    grandTotalHours: number;
  };
  materials: { id: string; item: string; qty: string }[];
  photos: { id: string; label: string; filename: string | null; addedLabel: string; href: string | null; isImage: boolean }[];
  notes: { id: string; body: string; dateLabel: string }[];
};

/** Read-only, self-scoped history of the signed-in worker's entries on a job —
 *  a worker version of the admin report. Cost is never shown. Empty sections are
 *  omitted so only what the worker has actually logged appears. */
export function WorkerHistory({ time, materials, photos, notes }: WorkerHistoryProps) {
  const hasTime = time.days.length > 0;
  const hasMaterials = materials.length > 0;
  const hasPhotos = photos.length > 0;
  const hasNotes = notes.length > 0;

  if (!hasTime && !hasMaterials && !hasPhotos && !hasNotes) {
    return <p className="text-meta text-faint">Nothing logged on this job yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasTime && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Time</h3>
          <Card className="flex flex-col">
            {time.days.map((d, i) => (
              <div key={i} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-0.5">
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
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Total hours</span>
              <span className="text-body font-semibold">{time.grandTotalHours.toFixed(2)} h</span>
            </div>
          </Card>
        </section>
      )}

      {hasMaterials && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Materials</h3>
          <Card className="flex flex-col">
            {materials.map((m) => (
              <div key={m.id} className="px-4 py-2 border-b border-line-2 last:border-b-0 flex items-center justify-between gap-2 text-meta">
                <span className="flex-1 min-w-0 truncate">{m.item}</span>
                <span className="text-faint w-12 text-right">{m.qty}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {hasPhotos && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p) => (
              <a
                key={p.id}
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
        </section>
      )}

      {hasNotes && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Notes</h3>
          <Card className="flex flex-col">
            {notes.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-0.5">
                <span className="text-meta text-faint">{n.dateLabel}</span>
                <span className="text-meta whitespace-pre-wrap break-words">{n.body}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: build succeeds. (Component isn't rendered yet; this confirms types/imports are valid.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(worker)/log/WorkerHistory.tsx"
git commit -m "Add WorkerHistory panel component (read-only, cost-free) (T&B)"
```

---

### Task 4: Wire the history panel into the worker job page

**Files:**
- Modify: `src/app/(worker)/log/[jobId]/page.tsx`

**Interfaces:**
- Consumes: `getJobTimeHistoryForWorker` (Task 2), `WorkerHistory` (Task 3), and the existing `materialLines` / `photos` / `workNotes` already loaded on the page.

- [ ] **Step 1: Add imports**

In `src/app/(worker)/log/[jobId]/page.tsx`:

Line 4 currently imports the worker data functions:

```ts
import { getJobTimeForWorker, getJobMaterialsForWorker, getJobPhotosForWorker, getJobWorkNotesForWorker } from "@/lib/data/worker";
```

Add `getJobTimeHistoryForWorker`:

```ts
import { getJobTimeForWorker, getJobMaterialsForWorker, getJobPhotosForWorker, getJobWorkNotesForWorker, getJobTimeHistoryForWorker } from "@/lib/data/worker";
```

After the `WorkNotesControl` import (line 9), add:

```ts
import { WorkerHistory } from "../WorkerHistory";
```

- [ ] **Step 2: Fetch the time history**

Extend the existing `Promise.all` (lines 21-27). Change:

```ts
  const [materialLines, catalog, photos, ctx, workNotes] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
    getJobPhotosForWorker(jobId),
    getWorkspaceContext(),
    getJobWorkNotesForWorker(jobId),
  ]);
```

to:

```ts
  const [materialLines, catalog, photos, ctx, workNotes, timeHistory] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
    getJobPhotosForWorker(jobId),
    getWorkspaceContext(),
    getJobWorkNotesForWorker(jobId),
    getJobTimeHistoryForWorker(jobId),
  ]);
```

- [ ] **Step 3: Render the panel below the tabs**

In the returned JSX, the `<Tabs ... />` block ends just before the closing `</div>` of the outer wrapper (around line 88-89). Insert the history panel immediately after the closing `/>` of `<Tabs`:

```tsx
      <Tabs
        tabs={[
          { label: "Time", content: timeTab },
          { label: "Materials", content: materialsTab },
          { label: "Photos", content: photosTab },
          { label: "Notes", content: notesTab },
        ]}
      />
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h2 className="text-body font-semibold">Your entries on this job</h2>
        <WorkerHistory
          time={timeHistory}
          materials={materialLines}
          photos={photos}
          notes={workNotes}
        />
      </div>
    </div>
  );
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (existing 79+ plus the new `groupTimeByDay` cases).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "Show worker per-job history panel below the tabs (T&B)"
```

---

## Manual verification (after Task 4)

Run the worker app as a worker who has logged time/materials/photos/notes on a job
(test account `doug+worker@myotherbrain.com`, → `/log`, open a job):

- The "Your entries on this job" panel appears **below the tabs on every tab**.
- Time section lists each day with closed in/out segments, a per-day total, and a grand total.
- A day with only an open (in-progress) clock does **not** appear as a row.
- Materials section shows item + qty and **no cost anywhere**.
- Photos and Notes sections match what the worker added.
- A job with nothing logged shows "Nothing logged on this job yet."

## Out of scope (do not implement)

- Cross-job personal timesheet.
- Editing from the panel (read-only).
- Any material cost/price for workers.
- Collapsible sections.
