# T&B Retrospective clock in/out (slice 5a-2)

_Design spec · 2026-06-17_

> Time & Billing build, follow-up to slice 5a (time tracking). Lets a worker
> **back-date** a clock-in or clock-out on a job's Time tab instead of only
> stamping "now" — the worker-side answer to "I forgot to tap." Sibling of the
> "End my day" same-day clock-out. Builds on the worker `/log` job-detail Time
> tab. PRD §6/§8.2 lineage; full manual segment edit/delete stays an admin-CRUD
> slice later.

## Goal

On a job's **Time** tab, keep the existing one-tap **Clock in** / **Clock out**
(stamps "now") and add an opt-in **"pick a time"** path that reveals an inline
time field so the worker can record an earlier in/out. No new tables — the
existing time-of-day columns hold the chosen value.

## Decisions

| Topic | Decision |
|---|---|
| Interaction | Fast path stays one tap ("now"); back-dating is opt-in behind a small **"pick a time"** link that expands an inline `type="time"` field + confirm/cancel (mirrors `StartDayForm`). |
| Scope | **Back-date at capture time only.** Pick-a-time clock-in sets `time_in`; pick-a-time clock-out sets `time_out` on the *currently open* segment. It does **not** create a full in+out pair in one step, and does **not** edit/delete past segments (that's the admin-CRUD slice). |
| Validation — future | Picked time may not be later than `nowTimeInZone(tz)` ("That time is in the future"). |
| Validation — order | A picked clock-out must be **after** the open segment's `time_in` ("Clock-out must be after clock-in"). |
| Validation — overlap | **Not enforced** this slice. A back-dated time may fall inside another of today's segments; admin CRUD cleans up. Documented, not silently dropped. |
| Open-segment rule | Pick-a-time clock-out requires an already-open segment (you must have clocked in first). Pick-a-time clock-in still refuses if a segment is already open. |
| Storage / timezone | Unchanged — time-of-day on the entry's date; no cross-midnight. Comparisons use `timeToMinutes`. |

## Schema

**No migration.** Reuses `job_time_segments.time_in` / `time_out` (both `time`)
from `20260617000003_time_tracking.sql`.

## Pure helper — `src/lib/data/worktime.ts`

Add a deterministic, unit-tested validator so the rules are testable without a DB:

```ts
/** Validate a picked clock time. Returns null if OK, else a user-facing message.
 *  - `kind` "in" | "out" picks the wording.
 *  - `now` and (for "out") `openIn` are "HH:MM[:SS]" in the worker's zone. */
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

`timeToMinutes` already exists. (Overlap is intentionally not checked.)

## Actions — `src/app/(worker)/log/actions.ts`

Extend the two existing actions with an optional time; behavior is unchanged when
it's omitted (the one-tap path). Both call `requireTbWorker()` via `workerCtx()`
as today, validate, and **return a `string` error message** (or void on success)
so the client form can surface it — instead of throwing.

```ts
export async function clockIn(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();
  const t = atTime || nowTimeInZone(tz);
  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "in");
    if (err) return err;
  }
  // resolve/create today's entry (unchanged) …
  // if an open segment already exists, return without inserting (unchanged guard)
  // else insert segment { time_in: t, time_out: null }
  revalidatePath(`/log/${jobId}`);
}

export async function clockOut(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, tz } = await workerCtx();
  const supabase = await createClient();
  // find today's entry + its open segment (unchanged); if none, return
  const t = atTime || nowTimeInZone(tz);
  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "out", openSeg.time_in);
    if (err) return err;
  }
  // update open segment { time_out: t }
  revalidatePath(`/log/${jobId}`);
}
```

The existing call sites (`clockIn.bind(null, jobId)` / `clockOut.bind(null, jobId)`)
keep working — `atTime` is just `undefined`, so the fast path is identical.

## UI — `src/app/(worker)/log/ClockControl.tsx` (new client component)

Replaces the two inline `<form>` blocks currently in
`[jobId]/page.tsx`'s Time tab. Props: `{ jobId, openSegment }` where
`openSegment` is `{ time_in: string } | null`.

- **Default (closed segment):** the existing **Clock in** button + a small muted
  **"pick a time"** link beneath it.
- **Default (open segment):** "On the job since {time_in}" + a ghost **Clock out**
  button + **"pick a time"** link.
- **Pick-a-time expanded:** an inline `type="time"` field (`fieldInput`,
  pre-filled to the current local time) + a confirm button (**Clock in** /
  **Clock out**) + a **cancel** that collapses back.
- Submits via `useTransition`, calling `clockIn(jobId, time)` / `clockOut(jobId, time)`.
  If the action returns a string, render it as inline red meta text and keep the
  field open with the entered value; on success the server `revalidatePath`
  refreshes the segment list.

`[jobId]/page.tsx` swaps its two inline forms for `<ClockControl jobId={jobId}
openSegment={openSeg ? { time_in: openSeg.time_in } : null} />`. The segment list,
no-charge toggle, and rounded total are unchanged.

## Testing

- **Unit** (`src/lib/data/worktime.test.ts`): `validateSegmentTime` — future-time
  rejected (in and out); out ≤ in rejected; out > in passes; valid in passes;
  omitted-`openIn` "out" skips the order check.
- **Manual** (seed `timebilling:worker`, on a job's Time tab):
  1. One-tap Clock in still works (no time field).
  2. "pick a time" → enter an earlier time → Clock in → segment logs with that time.
  3. While on the job, "pick a time" Clock out before the in time → inline error,
     field stays.
  4. Pick a future time → inline error.
  5. Plain one-tap Clock out still works and the rounded total updates.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

No migration. `vercel --prod` (deploy), then the manual checks above. Done
directly on `main`, consistent with the "End my day" follow-up.

## Out of scope (later slices)

- Editing/deleting past segments; creating a full in+out pair in one action.
- Overlap detection/repair (admin CRUD).
- Cross-midnight, breaks/lunch, a formal Worker entity, QBO sync.
