# Retrospective clock in/out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a worker back-date a clock-in or clock-out on a job's Time tab, keeping the existing one-tap "now" path.

**Architecture:** A pure, unit-tested validator (`validateSegmentTime`) holds the rules. The two existing server actions (`clockIn`/`clockOut`) gain an optional `atTime` and return a user-facing error string instead of throwing on a bad pick. A new client component `ClockControl` replaces the inline clock forms, adding an opt-in "pick a time" inline field that surfaces those errors.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), TypeScript, Supabase, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-17-tb-retro-clock-design.md`

**Note for the engineer:** This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-action or client-component code. No DB migration in this plan; it reuses existing columns. Outward/irreversible commands (`git push`, `vercel --prod`) are operator-run at cutover — do not run them.

---

## File Structure

- `src/lib/data/worktime.ts` — **modify**: add the pure `validateSegmentTime` helper (sits beside `timeToMinutes`, which it uses).
- `src/lib/data/worktime.test.ts` — **modify**: add a `validateSegmentTime` describe block.
- `src/app/(worker)/log/actions.ts` — **modify**: extend `clockIn`/`clockOut` with optional `atTime`, validation, and a `string | void` return.
- `src/app/(worker)/log/ClockControl.tsx` — **create**: client component owning the clock in/out UI + pick-a-time field + inline error.
- `src/app/(worker)/log/[jobId]/page.tsx` — **modify**: replace the two inline clock `<form>`s with `<ClockControl>`; fix imports.

---

## Task 1: `validateSegmentTime` pure helper (TDD)

**Files:**
- Modify: `src/lib/data/worktime.ts`
- Test: `src/lib/data/worktime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to the end of `src/lib/data/worktime.test.ts`, and add `validateSegmentTime` to the existing import from `./worktime` at the top of the file:

```ts
describe("validateSegmentTime", () => {
  test("rejects a future clock-in", () => {
    expect(validateSegmentTime("10:00", "09:30", "in")).toBe("That time is in the future.");
  });

  test("rejects a future clock-out", () => {
    expect(validateSegmentTime("10:00", "09:30", "out", "08:00")).toBe("That time is in the future.");
  });

  test("rejects a clock-out at or before the clock-in", () => {
    expect(validateSegmentTime("08:00", "12:00", "out", "08:00")).toBe("Clock-out must be after clock-in.");
    expect(validateSegmentTime("07:30", "12:00", "out", "08:00")).toBe("Clock-out must be after clock-in.");
  });

  test("accepts a clock-out after the clock-in and not in the future", () => {
    expect(validateSegmentTime("09:15", "12:00", "out", "08:00")).toBeNull();
  });

  test("accepts a non-future clock-in", () => {
    expect(validateSegmentTime("08:00", "09:30", "in")).toBeNull();
  });

  test("skips the order check for 'out' when openIn is omitted", () => {
    expect(validateSegmentTime("09:15", "12:00", "out")).toBeNull();
  });
});
```

The top import becomes:

```ts
import {
  timeToMinutes,
  sumSegmentHours,
  roundQuarterHours,
  fmtTimeOfDay,
  nowTimeInZone,
  todayInZone,
  validateSegmentTime,
} from "./worktime";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worktime`
Expected: FAIL — `validateSegmentTime is not a function` (or an import/type error).

- [ ] **Step 3: Implement the helper**

Add to `src/lib/data/worktime.ts` (place it just after the `timeToMinutes` definition so the dependency reads top-down):

```ts
/** Validate a worker-picked clock time. Returns null if OK, else a user-facing
 *  message. `now` and (for "out") `openIn` are "HH:MM[:SS]" in the worker's zone.
 *  Overlap with other segments is intentionally not checked (admin CRUD later). */
export function validateSegmentTime(
  picked: string,
  now: string,
  kind: "in" | "out",
  openIn?: string
): string | null {
  if (timeToMinutes(picked) > timeToMinutes(now)) return "That time is in the future.";
  if (kind === "out" && openIn && timeToMinutes(picked) <= timeToMinutes(openIn))
    return "Clock-out must be after clock-in.";
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worktime`
Expected: PASS (all `validateSegmentTime` tests green, existing worktime tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add validateSegmentTime helper for retro clock picks"
```

---

## Task 2: Extend `clockIn`/`clockOut` actions with optional `atTime`

**Files:**
- Modify: `src/app/(worker)/log/actions.ts`

No unit test here — these touch Supabase and RLS; they're covered by the build (types) and the manual checks in Task 3. The validation logic itself is already unit-tested in Task 1.

- [ ] **Step 1: Import the validator**

In `src/app/(worker)/log/actions.ts`, update the worktime import to include `validateSegmentTime`:

```ts
import { nowTimeInZone, todayInZone, validateSegmentTime } from "@/lib/data/worktime";
```

- [ ] **Step 2: Replace `clockIn` with the time-aware version**

Replace the entire existing `clockIn` function with:

```ts
export async function clockIn(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();

  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "in");
    if (err) return err;
  }

  const { data: entry } = await supabase
    .from("job_time_entries")
    .upsert(
      { organization_id: orgId, job_id: jobId, worker_user_id: userId, entry_date: todayInZone(tz) },
      { onConflict: "organization_id,job_id,worker_user_id,entry_date" }
    )
    .select("id")
    .single();
  if (!entry) throw new Error("Could not start the entry.");

  const { data: open } = await supabase
    .from("job_time_segments")
    .select("id")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .maybeSingle();
  if (!open) {
    await supabase.from("job_time_segments").insert({
      entry_id: entry.id,
      organization_id: orgId,
      worker_user_id: userId,
      time_in: atTime || nowTimeInZone(tz),
    });
  }
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 3: Replace `clockOut` with the time-aware version**

Replace the entire existing `clockOut` function with (note the open-segment select now also fetches `time_in` for the validator):

```ts
export async function clockOut(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, tz } = await workerCtx();
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("job_time_entries")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_user_id", userId)
    .eq("entry_date", todayInZone(tz))
    .maybeSingle();
  if (!entry) return;
  const { data: open } = await supabase
    .from("job_time_segments")
    .select("id, time_in")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return;

  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "out", open.time_in);
    if (err) return err;
  }

  await supabase
    .from("job_time_segments")
    .update({ time_out: atTime || nowTimeInZone(tz) })
    .eq("id", open.id);
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 4: Verify it builds (types)**

Run: `npm run build`
Expected: build succeeds; no TypeScript error. (The existing `clockIn.bind(null, jobId)` / `clockOut.bind(null, jobId)` call site in `[jobId]/page.tsx` still type-checks because `atTime` is optional — it's replaced in Task 3 anyway.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/actions.ts"
git commit -m "Accept an optional back-dated time on clockIn/clockOut"
```

---

## Task 3: `ClockControl` client component + wire into the job page

**Files:**
- Create: `src/app/(worker)/log/ClockControl.tsx`
- Modify: `src/app/(worker)/log/[jobId]/page.tsx`

- [ ] **Step 1: Create the `ClockControl` component**

Create `src/app/(worker)/log/ClockControl.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { fmtTimeOfDay } from "@/lib/data/worktime";
import { clockIn, clockOut } from "./actions";

/** Browser-local "HH:MM" used only as a convenience default for the picker. */
function localNowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ClockControl({
  jobId,
  openSegment,
}: {
  jobId: string;
  openSegment: { time_in: string } | null;
}) {
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const out = !!openSegment;
  const label = out ? "Clock out" : "Clock in";
  const variant = out ? "ghost" : "primary";

  function run(atTime?: string) {
    setError(null);
    start(async () => {
      const msg = out ? await clockOut(jobId, atTime) : await clockIn(jobId, atTime);
      if (typeof msg === "string") {
        setError(msg);
      } else {
        setPicking(false);
        setTime("");
      }
    });
  }

  function openPicker() {
    setError(null);
    setTime(localNowHHMM());
    setPicking(true);
  }

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={out ? "text-meta text-accent font-semibold" : "text-meta text-muted"}>
          {out ? `On the job since ${fmtTimeOfDay(openSegment.time_in)}` : "Not on the job right now"}
        </span>
        {!picking && (
          <Button size="sm" variant={variant} type="button" disabled={pending} onClick={() => run()}>
            {label}
          </Button>
        )}
      </div>

      {!picking ? (
        <button
          type="button"
          className="text-meta text-faint hover:text-muted self-end"
          onClick={openPicker}
        >
          pick a time
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldInput}
            />
            <Button
              size="sm"
              variant={variant}
              type="button"
              disabled={pending || !time}
              onClick={() => run(time)}
            >
              {label}
            </Button>
            <button
              type="button"
              className="text-meta text-faint hover:text-muted"
              onClick={() => {
                setPicking(false);
                setError(null);
              }}
            >
              cancel
            </button>
          </div>
          <FormError message={error} />
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the job page**

In `src/app/(worker)/log/[jobId]/page.tsx`:

(a) Remove the now-unused imports `Card`, `Button`, and the `clockIn, clockOut` import line, and add the `ClockControl` import. The import block at the top should change from:

```tsx
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { getJobTimeForWorker } from "@/lib/data/worker";
import { fmtJobLocation } from "@/lib/data/format";
import { fmtTimeOfDay, sumSegmentHours, roundQuarterHours } from "@/lib/data/worktime";
import { clockIn, clockOut } from "../actions";
import { NoChargeToggle } from "../NoChargeToggle";
```

to:

```tsx
import { Tabs } from "@/components/ui/Tabs";
import { getJobTimeForWorker } from "@/lib/data/worker";
import { fmtJobLocation } from "@/lib/data/format";
import { fmtTimeOfDay, sumSegmentHours, roundQuarterHours } from "@/lib/data/worktime";
import { ClockControl } from "../ClockControl";
import { NoChargeToggle } from "../NoChargeToggle";
```

(`fmtTimeOfDay` stays — it's still used by the closed-segment list.)

(b) Replace the entire clock in/out block at the top of `timeTab` — the `{openSeg ? ( ... ) : ( ... )}` expression that renders the two `<Card>`/`<form>` pairs — with a single line:

```tsx
      <ClockControl jobId={jobId} openSegment={openSeg ? { time_in: openSeg.time_in } : null} />
```

Leave the rest of `timeTab` (the closed-segment list, `NoChargeToggle`, and the total row) untouched.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds; no "unused variable" or missing-import TypeScript error.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (41 with the new validator cases).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/ClockControl.tsx" "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "Add pick-a-time clock in/out control on the job Time tab"
```

---

## Manual verification (controller/operator, after deploy)

No migration — cutover is `vercel --prod` then, signed in as the seed `timebilling:worker` on a job's Time tab:

1. One-tap **Clock in** still works (no time field shown).
2. **pick a time** → enter an earlier time → **Clock in** → the open segment shows that earlier start.
3. While on the job, **pick a time** → enter a time **before** the clock-in → **Clock out** → inline error "Clock-out must be after clock-in"; the field stays open with the value.
4. **pick a time** → enter a **future** time → inline error "That time is in the future."
5. Plain one-tap **Clock out** still works and the 0.25 h total updates.
6. **cancel** collapses the picker without changing anything.

---

## Self-Review

**Spec coverage:**
- Fast tap + opt-in "pick a time" link → Task 3 `ClockControl`. ✓
- Back-date at capture only (no segment edit/delete) → actions only set `time_in`/`time_out`; no new edit path. ✓
- No future / clock-out-after-clock-in validation → Task 1 `validateSegmentTime`, applied in Task 2. ✓
- No overlap check → intentionally absent (noted in helper comment + spec). ✓
- Open-segment rule (pick-a-time out needs an open segment) → `clockOut` returns early when no open segment. ✓
- No migration → confirmed; only column reuse. ✓
- Inline error string instead of throw → `Promise<string | void>` return + `FormError`. ✓

**Type consistency:** `validateSegmentTime(picked, now, kind, openIn?)` signature is identical across Task 1 (def + tests) and Task 2 (call sites). `ClockControl` prop `openSegment: { time_in: string } | null` matches the page's `openSeg ? { time_in: openSeg.time_in } : null`. Actions return `Promise<string | void>`, consumed via `typeof msg === "string"`.

**Placeholder scan:** none — every code step shows complete code.
