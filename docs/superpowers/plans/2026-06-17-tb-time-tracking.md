# T&B Time Tracking (slice 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the placeholder `/log` shell into the worker time-capture app — org-branded shell, start-of-day WorkDay bookend, today's job list, and a job-detail Time tab with live clock in/out, 0.25h-rounded totals, and a per-entry no-charge toggle.

**Architecture:** A migration adds `work_days` / `job_time_entries` / `job_time_segments` (time-of-day) with worker-self/admin-read RLS (reusing `is_tb_member`/`is_tb_admin`). Pure helpers compute totals/rounding; a `requireTbWorker` gate + worker data layer + server actions back the UI. The `/log` layout is rebranded with the org accent; the home and job-detail pages render the flow (clock in/out are server-action forms; only the no-charge toggle + tabs are client).

**Tech Stack:** Supabase (Postgres, RLS), Next.js 16 (App Router, RSC, Server Actions), TypeScript, Vitest.

---

## File Structure

- **Create** `src/lib/data/worktime.ts` + `worktime.test.ts` — pure time helpers.
- **Create** `supabase/migrations/20260617000003_time_tracking.sql` — 3 tables + RLS.
- **Modify** `src/lib/supabase/database.types.ts` — 3 table types.
- **Modify** `src/lib/auth-tb.ts` — `requireTbWorker`.
- **Create** `src/lib/data/worker.ts` — `getWorkerDay`/`listActiveJobs`/`getJobTimeForWorker`.
- **Create** `src/app/(worker)/log/actions.ts` — `startDay`/`clockIn`/`clockOut`/`setNoCharge`.
- **Modify** `src/app/(worker)/log/layout.tsx` — org branding/accent.
- **Create** `src/app/(worker)/log/StartDayForm.tsx`, `NoChargeToggle.tsx`, `[jobId]/...`; **modify** `src/app/(worker)/log/page.tsx`.

**Sequencing:** additive; the app only runs against remote after the migration is applied in the cutover (Task 10).

---

## Task 1: Worktime helpers (TDD)

**Files:**
- Create: `src/lib/data/worktime.test.ts`
- Create: `src/lib/data/worktime.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/worktime.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  timeToMinutes,
  sumSegmentHours,
  roundQuarterHours,
  fmtTimeOfDay,
  nowTimeInZone,
  todayInZone,
} from "./worktime";

describe("timeToMinutes", () => {
  test("parses HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("08:05")).toBe(485);
    expect(timeToMinutes("16:30:00")).toBe(990);
  });
});

describe("sumSegmentHours", () => {
  test("sums closed segments only", () => {
    expect(
      sumSegmentHours([
        { time_in: "08:05", time_out: "09:40" },
        { time_in: "10:00", time_out: null },
      ])
    ).toBeCloseTo(1.5833, 3);
  });
  test("empty → 0", () => {
    expect(sumSegmentHours([])).toBe(0);
  });
});

describe("roundQuarterHours", () => {
  test("rounds to nearest 0.25", () => {
    expect(roundQuarterHours(1.5833)).toBe(1.5);
    expect(roundQuarterHours(1.63)).toBe(1.75);
    expect(roundQuarterHours(0)).toBe(0);
  });
});

describe("fmtTimeOfDay", () => {
  test("formats 12-hour", () => {
    expect(fmtTimeOfDay("08:05:00")).toBe("8:05 AM");
    expect(fmtTimeOfDay("16:30")).toBe("4:30 PM");
    expect(fmtTimeOfDay("00:00")).toBe("12:00 AM");
    expect(fmtTimeOfDay(null)).toBe("");
  });
});

describe("zone helpers", () => {
  test("nowTimeInZone is HH:MM", () => {
    expect(nowTimeInZone("America/New_York")).toMatch(/^\d{2}:\d{2}$/);
  });
  test("todayInZone is YYYY-MM-DD", () => {
    expect(todayInZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- worktime`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement**

Create `src/lib/data/worktime.ts`:

```ts
/** "HH:MM[:SS]" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Sum of (out − in)/60 over CLOSED segments only (open ones excluded). */
export function sumSegmentHours(
  segments: { time_in: string; time_out: string | null }[]
): number {
  return segments.reduce((acc, s) => {
    if (!s.time_out) return acc;
    return acc + (timeToMinutes(s.time_out) - timeToMinutes(s.time_in)) / 60;
  }, 0);
}

/** Round to the nearest 0.25 h. */
export function roundQuarterHours(hours: number): number {
  return Math.round(hours / 0.25) * 0.25;
}

/** "HH:MM[:SS]" → "h:MM AM/PM" (empty string for null). */
export function fmtTimeOfDay(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Current time-of-day "HH:MM" in an IANA zone (24h, no midnight quirk). */
export function nowTimeInZone(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Current date "YYYY-MM-DD" in an IANA zone. */
export function todayInZone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- worktime`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "$(cat <<'EOF'
Add worktime helpers (time math, 0.25h rounding, zone time/date)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Author the time-tracking migration

**Files:**
- Create: `supabase/migrations/20260617000003_time_tracking.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260617000003_time_tracking.sql`:

```sql
-- T&B time tracking: pay track (work_days) + job track (job_time_entries /
-- job_time_segments). Times are time-of-day. Workers read/write their own rows;
-- admins read (for the later report/payroll). Reuses is_tb_member/is_tb_admin.

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
create index on work_days (organization_id, worker_user_id);

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
create index on job_time_entries (organization_id, job_id);

create table job_time_segments (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references job_time_entries (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  time_in         time not null,
  time_out        time,
  created_at      timestamptz not null default now()
);
create index on job_time_segments (entry_id);

alter table work_days enable row level security;
alter table job_time_entries enable row level security;
alter table job_time_segments enable row level security;

-- Worker self read/write + admin read, on each table.
create policy worker_rw on work_days for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on work_days for select to authenticated
  using (is_tb_admin(organization_id));

create policy worker_rw on job_time_entries for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_time_entries for select to authenticated
  using (is_tb_admin(organization_id));

create policy worker_rw on job_time_segments for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_time_segments for select to authenticated
  using (is_tb_admin(organization_id));
```

- [ ] **Step 2: Sanity check (do NOT apply)**

Run: `grep -c "create table\|create policy" supabase/migrations/20260617000003_time_tracking.sql`
Expected: `9` (3 tables + 6 policies). Do NOT run `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000003_time_tracking.sql
git commit -m "$(cat <<'EOF'
Migration: time-tracking tables (work_days/job_time_entries/segments) + RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Time-tracking types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Add the three table types**

In `src/lib/supabase/database.types.ts`, inside `Tables`, add these three entries
(TS key order doesn't matter). Relationships list only the public-schema FKs (matching
how `memberships` omits its `auth.users` FK):

```ts
      work_days: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          organization_id: string
          start_time: string
          status: string
          work_date: string
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          organization_id: string
          start_time: string
          status?: string
          work_date: string
          worker_user_id: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          organization_id?: string
          start_time?: string
          status?: string
          work_date?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_days_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_time_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          job_id: string
          last_synced_at: string | null
          no_charge: boolean
          organization_id: string
          qbo_id: string | null
          qbo_sync_token: string | null
          source: string
          sync_status: string
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          job_id: string
          last_synced_at?: string | null
          no_charge?: boolean
          organization_id: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
          worker_user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          job_id?: string
          last_synced_at?: string | null
          no_charge?: boolean
          organization_id?: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_time_segments: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          organization_id: string
          time_in: string
          time_out: string | null
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          organization_id: string
          time_in: string
          time_out?: string | null
          worker_user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          organization_id?: string
          time_in?: string
          time_out?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_segments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "job_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
Add time-tracking DB types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `requireTbWorker` gate

**Files:**
- Modify: `src/lib/auth-tb.ts`

- [ ] **Step 1: Add the worker gate**

In `src/lib/auth-tb.ts`, append (mirrors `requireTbAdmin`):

```ts
/**
 * Gate for the worker surface: returns the user if they're a `timebilling` worker,
 * else redirects to their role-home. Used by the worker time-tracking actions.
 */
export async function requireTbWorker(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { redirect } = await import("next/navigation");
  const { productRole, resolveHome } = await import("@/lib/auth");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (!user || productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));
  return user as User;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-tb.ts
git commit -m "$(cat <<'EOF'
Add requireTbWorker gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Worker data layer

**Files:**
- Create: `src/lib/data/worker.ts`

- [ ] **Step 1: Create `src/lib/data/worker.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "./org";
import { todayInZone } from "./worktime";
import { one } from "./rel";

/** Today's work_day for the signed-in worker (+ any open prior day) in org tz. */
export async function getWorkerDay() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = todayInZone(ctx.org.timezone);
  const { data } = await supabase
    .from("work_days")
    .select("id, work_date, start_time, end_time, status")
    .eq("worker_user_id", user.id)
    .order("work_date", { ascending: false })
    .limit(20);
  const list = data ?? [];
  return {
    tz: ctx.org.timezone,
    today,
    todayDay: list.find((d) => d.work_date === today) ?? null,
    openPrior: list.find((d) => d.status === "open" && d.work_date < today) ?? null,
  };
}

/** The org's active (open/in_progress) jobs for the worker's Today list. */
export async function listActiveJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, name, status, customer:customers(name)")
    .in("status", ["open", "in_progress"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    customerName: one(j.customer)?.name ?? "—",
  }));
}

/** A job + the worker's time entry (+ segments) for today, in org tz. */
export async function getJobTimeForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, name, job_line1, job_line2, job_city, job_state, job_postal_code, job_country")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const today = todayInZone(ctx.org.timezone);
  const { data: entry } = await supabase
    .from("job_time_entries")
    .select("id, no_charge, segments:job_time_segments(id, time_in, time_out)")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .eq("entry_date", today)
    .maybeSingle();

  return { job, entry: entry ?? null };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/worker.ts
git commit -m "$(cat <<'EOF'
Add worker data layer (day/active jobs/job time)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Worker server actions

**Files:**
- Create: `src/app/(worker)/log/actions.ts`

- [ ] **Step 1: Create the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbWorker } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { nowTimeInZone, todayInZone } from "@/lib/data/worktime";

async function workerCtx() {
  const user = await requireTbWorker();
  const wc = await getWorkspaceContext();
  if (!wc) throw new Error("No workspace.");
  return { userId: user.id, orgId: wc.org.id, tz: wc.org.timezone };
}

export async function startDay(
  priorId: string | null,
  priorEnd: string,
  todayStart: string
): Promise<void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();
  if (priorId && priorEnd) {
    await supabase.from("work_days").update({ end_time: priorEnd, status: "closed" }).eq("id", priorId);
  }
  await supabase.from("work_days").upsert(
    {
      organization_id: orgId,
      worker_user_id: userId,
      work_date: todayInZone(tz),
      start_time: todayStart || nowTimeInZone(tz),
      status: "open",
    },
    { onConflict: "organization_id,worker_user_id,work_date" }
  );
  revalidatePath("/log");
}

export async function clockIn(jobId: string): Promise<void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();
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
      time_in: nowTimeInZone(tz),
    });
  }
  revalidatePath(`/log/${jobId}`);
}

export async function clockOut(jobId: string): Promise<void> {
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
    .select("id")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return;
  await supabase.from("job_time_segments").update({ time_out: nowTimeInZone(tz) }).eq("id", open.id);
  revalidatePath(`/log/${jobId}`);
}

export async function setNoCharge(entryId: string, jobId: string, value: boolean): Promise<void> {
  await requireTbWorker();
  const supabase = await createClient();
  await supabase.from("job_time_entries").update({ no_charge: value }).eq("id", entryId);
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(worker)/log/actions.ts"
git commit -m "$(cat <<'EOF'
Add worker time actions (startDay/clockIn/clockOut/setNoCharge)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Branded shell + home (bookend + job list)

**Files:**
- Modify: `src/app/(worker)/log/layout.tsx`
- Create: `src/app/(worker)/log/StartDayForm.tsx`
- Modify: `src/app/(worker)/log/page.tsx`

- [ ] **Step 1: Rebrand the worker layout**

Replace `src/app/(worker)/log/layout.tsx` entirely with:

```tsx
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productRole, resolveHome } from "@/lib/auth";
import { orgHasProduct } from "@/lib/data/entitlements";
import { getWorkspaceContext } from "@/lib/data/org";
import { NotEnabled } from "@/components/NotEnabled";
import { signOut } from "@/lib/auth-actions";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));

  const ctx = await getWorkspaceContext();
  if (!(await orgHasProduct(ctx?.org.id, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  const accent = ctx?.org.primary_color;
  const soft = accent ? `color-mix(in srgb, ${accent} 14%, #fff)` : undefined;
  const style = accent
    ? ({ "--accent": accent, "--accent-soft": soft, "--color-accent": accent, "--color-accent-soft": soft } as CSSProperties)
    : undefined;
  const hasCrm = !!productRole(claims, "crm");

  return (
    <div style={style} className="min-h-dvh flex flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          {ctx && (
            <div className="size-7 rounded-control bg-accent text-white grid place-items-center text-meta font-bold shrink-0">
              {ctx.org.initials}
            </div>
          )}
          <span className="text-body font-semibold truncate">{ctx?.org.name ?? "Time logging"}</span>
        </div>
        <div className="flex items-center gap-3 text-meta shrink-0">
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">Back to CRM</Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-body font-semibold hover:text-accent">Sign out</button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the bookend form (client)**

Create `src/app/(worker)/log/StartDayForm.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput } from "@/components/ui/Field";
import { startDay } from "./actions";

export function StartDayForm({
  prior,
  defaultStart,
}: {
  prior: { id: string; label: string } | null;
  defaultStart: string;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      action={(fd) => {
        const priorEnd = String(fd.get("prior_end") ?? "");
        const todayStart = String(fd.get("today_start") ?? "");
        start(() => startDay(prior?.id ?? null, priorEnd, todayStart));
      }}
    >
      <div>
        <h1 className="text-title font-semibold">Good morning</h1>
        <p className="text-meta text-muted">Set your hours to get started.</p>
      </div>
      <Card className="p-4 flex flex-col gap-3">
        {prior && (
          <Field label={`Close out ${prior.label}`}>
            <input name="prior_end" type="time" className={fieldInput} />
          </Field>
        )}
        <Field label="Started today" required>
          <input name="today_start" type="time" required defaultValue={defaultStart} className={fieldInput} />
        </Field>
      </Card>
      <Button type="submit" disabled={pending} className="disabled:opacity-60">
        {pending ? "Starting…" : "Start my day"}
      </Button>
      <p className="text-meta text-faint text-center">Jobs unlock after this.</p>
    </form>
  );
}
```

- [ ] **Step 3: Replace the home page**

Replace `src/app/(worker)/log/page.tsx` entirely with:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getWorkerDay, listActiveJobs } from "@/lib/data/worker";
import { fmtTimeOfDay, nowTimeInZone } from "@/lib/data/worktime";
import { fmtDate } from "@/lib/data/format";
import { StartDayForm } from "./StartDayForm";

export default async function WorkerHome() {
  const day = await getWorkerDay();
  if (!day) return <p className="text-meta text-muted">No workspace.</p>;

  if (!day.todayDay) {
    const prior = day.openPrior
      ? { id: day.openPrior.id, label: fmtDate(day.openPrior.work_date) ?? "last workday" }
      : null;
    return <StartDayForm prior={prior} defaultStart={nowTimeInZone(day.tz)} />;
  }

  const jobs = await listActiveJobs();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-title font-semibold">Today</h1>
        <span className="text-meta text-accent font-semibold">
          On the clock · {fmtTimeOfDay(day.todayDay.start_time)}
        </span>
      </div>
      {jobs.length === 0 ? (
        <EmptyState glyph="🧰" title="No active jobs." />
      ) : (
        <Card className="flex flex-col">
          {jobs.map((j) => (
            <Link key={j.id} href={`/log/${j.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0 hover:bg-line-2">
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold truncate">{j.name}</div>
                <div className="text-meta text-faint">{j.customerName}</div>
              </div>
              <span className="text-meta text-faint">{j.status === "in_progress" ? "In progress" : "Open"}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/layout.tsx" "src/app/(worker)/log/StartDayForm.tsx" "src/app/(worker)/log/page.tsx"
git commit -m "$(cat <<'EOF'
Brand the worker shell; add start-of-day bookend + Today job list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Job detail (Time tab + clock + no-charge; stub Materials/Photos)

**Files:**
- Create: `src/app/(worker)/log/NoChargeToggle.tsx`
- Create: `src/app/(worker)/log/[jobId]/page.tsx`

- [ ] **Step 1: No-charge toggle (client)**

Create `src/app/(worker)/log/NoChargeToggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { setNoCharge } from "./actions";

export function NoChargeToggle({
  entryId,
  jobId,
  initial,
}: {
  entryId: string;
  jobId: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => setNoCharge(entryId, jobId, next));
      }}
      className={`text-meta font-semibold px-3 py-1 rounded-control border ${
        on ? "bg-accent-soft text-accent border-accent" : "border-line text-muted"
      }`}
    >
      No charge / warranty{on ? " ✓" : ""}
    </button>
  );
}
```

- [ ] **Step 2: Job detail page**

Create `src/app/(worker)/log/[jobId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { getJobTimeForWorker } from "@/lib/data/worker";
import { fmtJobLocation } from "@/lib/data/format";
import { fmtTimeOfDay, sumSegmentHours, roundQuarterHours } from "@/lib/data/worktime";
import { clockIn, clockOut } from "../actions";
import { NoChargeToggle } from "../NoChargeToggle";

export default async function WorkerJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const data = await getJobTimeForWorker(jobId);
  if (!data) notFound();
  const { job, entry } = data;

  const segments = entry?.segments ?? [];
  const openSeg = segments.find((s) => !s.time_out) ?? null;
  const closed = segments.filter((s) => s.time_out);
  const total = roundQuarterHours(sumSegmentHours(segments));

  const timeTab = (
    <div className="flex flex-col gap-3">
      {openSeg ? (
        <Card className="p-3 flex items-center justify-between" >
          <span className="text-meta text-accent font-semibold">On the job since {fmtTimeOfDay(openSeg.time_in)}</span>
          <form action={clockOut.bind(null, jobId)}>
            <Button size="sm" variant="ghost" type="submit">Clock out</Button>
          </form>
        </Card>
      ) : (
        <Card className="p-3 flex items-center justify-between">
          <span className="text-meta text-muted">Not on the job right now</span>
          <form action={clockIn.bind(null, jobId)}>
            <Button size="sm" type="submit">Clock in</Button>
          </form>
        </Card>
      )}

      <div className="flex flex-col">
        {closed.length === 0 ? (
          <p className="text-meta text-faint py-2">No time logged yet.</p>
        ) : (
          closed.map((s) => (
            <div key={s.id} className="flex justify-between px-1 py-2 border-b border-line-2 last:border-b-0 text-meta">
              <span>{fmtTimeOfDay(s.time_in)} – {fmtTimeOfDay(s.time_out)}</span>
              <span className="text-faint">{sumSegmentHours([s]).toFixed(2)} h</span>
            </div>
          ))
        )}
      </div>

      {entry && <NoChargeToggle entryId={entry.id} jobId={jobId} initial={entry.no_charge} />}

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-meta text-muted">Total on the job today <span className="text-faint">(0.25 h)</span></span>
        <span className="text-title font-semibold">{total.toFixed(2)} h</span>
      </div>
    </div>
  );

  const stub = <p className="text-meta text-faint py-4">Coming soon.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/log" className="text-muted text-xl leading-none">‹</Link>
        <div>
          <div className="text-body font-semibold">{job.name}</div>
          <div className="text-meta text-faint">{fmtJobLocation(job) || "—"}</div>
        </div>
      </div>
      <Tabs
        tabs={[
          { label: "Time", content: timeTab },
          { label: "Materials", content: stub },
          { label: "Photos", content: stub },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success; `/log/[jobId]` in the route list. Confirm `Tabs` is imported from
`@/components/ui/Tabs` and `Button` supports `size`/`variant` (it does).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(worker)/log/NoChargeToggle.tsx" "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "$(cat <<'EOF'
Add worker job detail Time tab (clock in/out, segments, no-charge, total)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Verify gate (pre-cutover)

- [ ] **Step 1: Tests + build**

Run: `npm test` (incl. the `worktime` suite) and `npm run build` (succeeds; `/log` + `/log/[jobId]` listed).

---

## Task 10: Cutover & verification _(controller/operator — NOT a subagent)_

- [ ] **Step 1: Apply the migration**

Run: `supabase db push` → applies `20260617000003`. Confirm via `supabase migration list`.

- [ ] **Step 2: Merge + deploy**

Merge to `main`, push, `vercel --prod`.

- [ ] **Step 3: Verify (as the seeded `timebilling:worker`, `doug+worker@`)**

- `/log` shows the **org-branded** header (org name + accent). On a fresh day, "Start
  my day" (with the bookend if an open prior day exists) → today's job list.
- Open a job → Time tab: **Clock in** → "On the job since …" → **Clock out** adds a
  segment with its hours, and the **0.25h-rounded total** updates. The **No charge**
  toggle persists. Materials/Photos tabs show "Coming soon".
- CRM/admin surfaces unaffected.

---

## Notes for the implementer

- Clock in/out are **server-action forms** (`clockIn`/`clockOut` bound with `jobId`) — no
  client component needed; only `NoChargeToggle` and the `Tabs` switcher are client.
- Times are time-of-day strings; the worker's "today" and live clock use the org
  timezone via `getWorkspaceContext().org.timezone`.
- Tasks 1–9 are subagent-safe. Task 10 (remote migration + deploy) is operator-run.
