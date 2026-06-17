# T&B Time tracking (slice 5a)

_Design spec · 2026-06-17_

> Time & Billing build, slice 5a — the worker time-capture app. First of three worker
> sub-slices (5a time → 5b materials-used → 5c photos). Builds on the worker `/log`
> shell (1b) and Jobs (3b). PRD §6, §8.2, §8.2a:
> [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md). Worker UX reference: the
> interactive prototype the operator provided.

## Goal

Turn the placeholder `/log` shell into the real worker app: a **start-of-day WorkDay
bookend**, **today's job list**, and **job-detail Time tab** with live clock in/out,
0.25h-rounded daily totals, and a per-entry "No charge / warranty" toggle. Materials
and Photos tabs are stubbed until 5b/5c.

## Decisions

| Topic | Decision |
|---|---|
| Worker identity | The logged-in `auth.users` id (`worker_user_id`); no formal Worker entity yet. |
| Job list | All of the org's **active** jobs (status `open`/`in_progress`); implicit assignment. |
| Job status | Stays admin-only; workers don't change job status in 5a. |
| Time storage | **Time-of-day** (`time`) on a `date`; no timezone math, no cross-midnight (excluded by PRD). Live clock uses "now" in the org timezone. |
| no_charge grain | Per **job_time_entry** (worker × job × day) — resolves the PRD's open question. |
| Entry mode | **Live clock in/out only**; corrections are an admin CRUD function later. |
| Rounding | 0.25h, **derived** from segments (not stored); applied once to the day's total per job. |
| Worker shell branding | The `/log` shell **inherits the org's design** (accent color + brand name/tile) like every other surface — revising the 1b generic shell, which skipped branding. |

## Schema — migration `supabase/migrations/20260617000003_time_tracking.sql`

Three org-scoped tables with RLS:

```sql
-- Pay track: one row per worker per worked day.
create table work_days (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  work_date       date not null,
  start_time      time not null,
  end_time        time,
  status          text not null default 'open' check (status in ('open', 'closed')),
  created_at      timestamptz not null default now(),
  unique (organization_id, worker_user_id, work_date)
);

-- Job track: one row per worker per job per day (maps to QBO TimeActivity).
create table job_time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  entry_date      date not null,
  no_charge       boolean not null default false,
  qbo_id          text,
  qbo_sync_token  text,
  last_synced_at  timestamptz,
  sync_status     text not null default 'unsynced',
  source          text not null default 'local',
  created_at      timestamptz not null default now(),
  unique (organization_id, job_id, worker_user_id, entry_date)
);

-- Clock in/out pairs; org_id + worker_user_id denormalized for simple RLS.
create table job_time_segments (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references job_time_entries (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  time_in         time not null,
  time_out        time,
  created_at      timestamptz not null default now()
);
create index on work_days (organization_id, worker_user_id);
create index on job_time_entries (organization_id, job_id);
create index on job_time_segments (entry_id);
```

**RLS** (enable on all three). Each gets:
- a worker self-policy `for all to authenticated using (worker_user_id = auth.uid()
  and is_tb_member(organization_id)) with check (worker_user_id = auth.uid() and
  is_tb_member(organization_id))` — workers read/write only their own rows;
- an admin read policy `for select to authenticated using
  (is_tb_admin(organization_id))` — so the later completed-job report / payroll can read.

(`is_tb_member`/`is_tb_admin` exist from the jobs migration.)

## Pure helpers — `src/lib/data/worktime.ts`

- `timeToMinutes(t: string): number` — "HH:MM[:SS]" → minutes.
- `sumSegmentHours(segments: { time_in: string; time_out: string | null }[]): number`
  — sum of `(out − in)/60` over **closed** segments (open ones excluded from the total).
- `roundQuarterHours(hours: number): number` — nearest 0.25.
- `nowTimeInZone(tz: string): string` — current time-of-day "HH:MM" in `tz`
  (for clock in/out timestamps).
- `todayInZone(tz: string): string` — current date "YYYY-MM-DD" in `tz` (the worker's
  "today").

The first three are deterministic and unit-tested; the zone helpers are format-checked.

## Auth gate

`src/lib/auth-tb.ts`: add `requireTbWorker()` (mirrors `requireTbAdmin`) — returns the
user if `productRole(claims,'timebilling') === 'worker'`, else redirects to their home.
Worker actions call it (and get `user.id` for `worker_user_id`); org id + timezone come
from `getWorkspaceContext()`.

## Data — `src/lib/data/worker.ts`

- `getWorkerDay()` — for the signed-in worker (in their org timezone "today"): today's
  `work_day` (or null) plus any **open prior** `work_day` (status `open`, `work_date <
  today`) → drives the bookend.
- `listActiveJobs()` — the org's `open`/`in_progress` jobs (name, customer, status) for
  the Today list.
- `getJobTimeForWorker(jobId)` — the worker's `job_time_entry` for today (+ its segments
  + `no_charge`), or null.

## Actions — `src/app/(worker)/log/actions.ts` (each `requireTbWorker()` first)

- `startDay(prevEndTime, todayStart)` — if an open prior `work_day` exists, set its
  `end_time` + `status='closed'`; upsert today's `work_day` (`start_time`, open).
- `clockIn(jobId)` — resolve/create today's `job_time_entry`; if no open segment, insert
  a segment (`time_in = nowTimeInZone(tz)`, `time_out null`).
- `clockOut(jobId)` — set the open segment's `time_out = nowTimeInZone(tz)`.
- `setNoCharge(entryId, value)` — update the entry's `no_charge`.

All write own rows; RLS enforces it.

## UI — under `src/app/(worker)/log/`

**Shell branding (revise the 1b `/log` layout):** the worker layout loads
`getWorkspaceContext()` and **themes the shell with the org's accent** — the same
CSS-variable override `AppShell` uses (`--accent` / `--accent-soft` / `--color-accent`
/ `--color-accent-soft`, with `soft = color-mix(in srgb, <accent> 14%, #fff)`) applied
on the shell root — so the worker's primary actions (Start my day, Clock in/out) carry
the org's brand color. The header shows the org **brand tile + name** (from
`org.initials`/`org.name`) instead of the generic "Time logging", keeping the layout
otherwise minimal (no sidebar). Falls back gracefully (no accent / generic label) if
`getWorkspaceContext()` is null.

- **`log/page.tsx` (home):** if no `work_day` today and an open prior exists → the
  **bookend** (close-out the prior with an editable end time; start today, defaulting to
  `nowTimeInZone`); `Start my day` runs `startDay`. Once today's WorkDay exists → the
  **Today job list** (`listActiveJobs`) + an "On the clock · [start]" pill. (A small
  `StartDayForm` client component.)
- **`log/jobs/[id]/page.tsx` (job detail):** tabs Time / Materials / Photos. **Time**
  tab: a `ClockControl` client component (live elapsed for the open segment + Clock
  in/out via `clockIn`/`clockOut`), the segment list, the **No charge / warranty**
  toggle (`setNoCharge`), and the **0.25h-rounded daily total** (`roundQuarterHours
  (sumSegmentHours(...))`). **Materials**/**Photos** tabs render a "coming soon"
  placeholder.

## Testing

- Unit: `timeToMinutes`, `sumSegmentHours` (closed-only; partial), `roundQuarterHours`
  (e.g. 1.58→1.50, 1.63→1.75); `nowTimeInZone`/`todayInZone` format checks.
- Manual (as the seed `timebilling:worker`): the bookend appears with an open prior day
  and closes it; `Start my day` shows today's jobs; on a job, Clock in → live elapsed →
  Clock out adds a segment and the rounded total updates; the no-charge toggle persists.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (3 tables + RLS), deploy, then the manual checks. (To exercise the
**bookend**, seed/leave an open prior `work_day` for the worker, or just verify the
"start today → jobs" path on a fresh day.)

## Out of scope (later slices)

- Materials tab (5b), Photos tab + offline queue (5c).
- Manual time edits/corrections (admin CRUD); worker "tap completed"; breaks/lunch
  subtraction; cross-midnight; a formal Worker entity; QBO sync of TimeActivity.
