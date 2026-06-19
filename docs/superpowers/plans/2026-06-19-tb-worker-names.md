# Worker names (slice 7a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin name each T&B worker on a new `/tb/workers` screen; the name then labels the tech in the completed-job report (email fallback) and greets the worker in their `/log` app.

**Architecture:** A new per-org `tb_workers(org, user_id, name)` table (admin-rw + worker-read-own RLS). An admin page enumerates workers via the service-role client (scoped to the admin's org) and edits names through a server action. A pure `workerLabel` helper holds the name→email→id precedence used by `getJobReport`; the worker layout reads its own name for a greeting.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), TypeScript, Supabase (Postgres/RLS + service-role admin client), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-19-tb-worker-names-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-action / client-component code.
- Do NOT run `git push`, `supabase db push`, or `vercel` — operator-run at cutover.
- Each task builds green on its own (data/actions/page are additive; the report rename in Task 5 updates both producer and consumer together). `npm run build` is a valid per-task gate.

---

## File Structure

- `supabase/migrations/20260619000001_tb_workers.sql` — **create**: table + RLS.
- `src/lib/data/worktime.ts` — **modify**: add pure `workerLabel`.
- `src/lib/data/worktime.test.ts` — **modify**: add a `workerLabel` describe block.
- `src/lib/data/tb-workers.ts` — **create**: `listTbWorkers()` (admin) + `getWorkerName()` (worker).
- `src/app/(timebilling)/tb/workers/actions.ts` — **create**: `setWorkerName(userId, name)`.
- `src/app/(timebilling)/tb/workers/page.tsx` — **create**: the admin Workers list.
- `src/app/(timebilling)/tb/workers/WorkerNameForm.tsx` — **create**: inline name editor (client).
- `src/components/shell/nav.ts` — **modify**: add the Workers nav item + tab.
- `src/lib/data/tb-report.ts` — **modify**: label techs via `workerLabel` + a `tb_workers` read (field `email` → `label`).
- `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx` — **modify**: render `w.label`.
- `src/app/(worker)/log/layout.tsx` — **modify**: greet the worker by name.

---

## Task 1: Migration — `tb_workers` table + RLS

**Files:**
- Create: `supabase/migrations/20260619000001_tb_workers.sql`

No automated test (DDL applied at cutover). Verify by reading against the spec.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260619000001_tb_workers.sql` with exactly:

```sql
-- Per-org worker profile (name, for now). The eventual Worker entity (maps to a QBO
-- Employee/Vendor); admin-managed, worker reads own.
create table tb_workers (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table tb_workers enable row level security;

-- Admin manages every worker in the org.
create policy admin_rw on tb_workers for all to authenticated
  using (is_tb_admin(organization_id))
  with check (is_tb_admin(organization_id));

-- A worker may read only their own profile (drives the /log shell greeting).
create policy worker_read_own on tb_workers for select to authenticated
  using (user_id = auth.uid() and is_tb_member(organization_id));
```

- [ ] **Step 2: Sanity-check the RLS helpers exist**

Run: `grep -n "is_tb_member\|is_tb_admin" supabase/migrations/20260616000003_jobs.sql`
Expected: shows both helpers are defined there. (Do NOT run `supabase db push`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260619000001_tb_workers.sql
git commit -m "Add tb_workers table + RLS (T&B worker names)"
```

---

## Task 2: `workerLabel` pure helper (TDD)

**Files:**
- Modify: `src/lib/data/worktime.ts`
- Test: `src/lib/data/worktime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `workerLabel` to the existing import at the top of `src/lib/data/worktime.test.ts` (the import list currently ends with `fmtMoney,` after the Task-1-of-slice-6 additions — add `workerLabel` to it), then append:

```ts
describe("workerLabel", () => {
  test("uses the name when set", () => {
    expect(workerLabel("Jose Ramirez", "jose@acme.com", "abcd1234")).toBe("Jose Ramirez");
  });

  test("falls back to email when name is null", () => {
    expect(workerLabel(null, "jose@acme.com", "abcd1234")).toBe("jose@acme.com");
  });

  test("falls back to email when name is blank", () => {
    expect(workerLabel("   ", "jose@acme.com", "abcd1234")).toBe("jose@acme.com");
  });

  test("falls back to a short id when name and email are null", () => {
    expect(workerLabel(null, null, "abcd1234ef")).toBe("abcd1234");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worktime`
Expected: FAIL — `workerLabel is not a function`.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/data/worktime.ts`, after the `fmtMoney` function:

```ts
/** Display label for a worker: their set name, else their login email, else a short
 *  id fallback. Used by the report and anywhere a worker is named. */
export function workerLabel(
  name: string | null,
  email: string | null,
  id: string
): string {
  return name?.trim() || email || id.slice(0, 8);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worktime`
Expected: PASS (4 new cases + all existing worktime tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add workerLabel helper (name > email > id precedence)"
```

---

## Task 3: Data + action — `tb-workers.ts` + `setWorkerName`

**Files:**
- Create: `src/lib/data/tb-workers.ts`
- Create: `src/app/(timebilling)/tb/workers/actions.ts`

No unit test (Supabase + service-role); covered by build + manual checks. (`workerLabel` is unit-tested in Task 2.)

- [ ] **Step 1: Create `src/lib/data/tb-workers.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "./org";
import { workerLabel } from "./worktime";

/** Admin: the org's T&B workers, each with login email + current name (or null),
 *  sorted by display label. Memberships aren't admin-readable under RLS, so the
 *  enumeration uses the service-role client scoped to the admin's own org. */
export async function listTbWorkers() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const orgId = ctx.org.id;

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("product", "timebilling")
    .eq("role", "worker");
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data: nameRows } = await supabase
    .from("tb_workers")
    .select("user_id, name")
    .eq("organization_id", orgId);
  const names: Record<string, string> = {};
  (nameRows ?? []).forEach((r) => {
    names[r.user_id as string] = r.name as string;
  });

  const out = await Promise.all(
    ids.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      return { userId: uid, email: data.user?.email ?? null, name: names[uid] ?? null };
    })
  );
  return out.sort((a, b) =>
    workerLabel(a.name, a.email, a.userId).localeCompare(workerLabel(b.name, b.email, b.userId))
  );
}

/** Worker: the signed-in worker's own name (or null), for the /log greeting. */
export async function getWorkerName(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("tb_workers")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}
```

- [ ] **Step 2: Create `src/app/(timebilling)/tb/workers/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { validateLabel } from "@/lib/data/worktime";

/** Set (or change) a worker's display name. Admin-only; upserts tb_workers. */
export async function setWorkerName(userId: string, name: string): Promise<string | void> {
  await requireTbAdmin();
  const trimmed = validateLabel(name);
  if (trimmed === null) return "Enter a name.";
  const ctx = await getWorkspaceContext();
  if (!ctx) return "No workspace.";

  const supabase = await createClient();
  const { error } = await supabase.from("tb_workers").upsert(
    { organization_id: ctx.org.id, user_id: userId, name: trimmed, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,user_id" }
  );
  if (error) return "Could not save the name.";
  revalidatePath("/tb/workers");
}
```

(`validateLabel` already exists in `worktime.ts` from slice 5c.)

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (Both are new and not yet called.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/tb-workers.ts "src/app/(timebilling)/tb/workers/actions.ts"
git commit -m "Add tb-workers data (list/getName) + setWorkerName action"
```

---

## Task 4: Admin Workers page + inline editor + nav

**Files:**
- Create: `src/app/(timebilling)/tb/workers/page.tsx`
- Create: `src/app/(timebilling)/tb/workers/WorkerNameForm.tsx`
- Modify: `src/components/shell/nav.ts`

- [ ] **Step 1: Create the inline editor `WorkerNameForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { setWorkerName } from "./actions";

export function WorkerNameForm({ userId, initial }: { userId: string; initial: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${fieldInput} max-w-[180px]`}
        />
        <Button
          size="sm"
          type="button"
          disabled={pending || name.trim() === initial.trim()}
          onClick={() => {
            setError(null);
            start(async () => {
              const msg = await setWorkerName(userId, name);
              if (typeof msg === "string") setError(msg);
            });
          }}
        >
          Save
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}
```

- [ ] **Step 2: Create the page `page.tsx`**

```tsx
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTbWorkers } from "@/lib/data/tb-workers";
import { WorkerNameForm } from "./WorkerNameForm";

export default async function WorkersPage() {
  const workers = await listTbWorkers();

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Workers</h2>
      {workers.length === 0 ? (
        <EmptyState glyph="🧑‍🔧" title="No workers yet." />
      ) : (
        <Card className="flex flex-col">
          {workers.map((w) => (
            <div key={w.userId} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0">
              <div className="flex-1 min-w-0 text-meta text-faint truncate">
                {w.email ?? w.userId.slice(0, 8)}
              </div>
              <WorkerNameForm userId={w.userId} initial={w.name ?? ""} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the nav item + tab**

In `src/components/shell/nav.ts`, change the `timebillingNav` array and `timebillingTabs` from:

```ts
export const timebillingNav: NavItem[] = [
  { href: "/tb/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/tb/materials", label: "Materials", icon: Package },
];
```
```ts
export const timebillingTabs = ["/tb/jobs", "/tb/materials"];
```

to:

```ts
export const timebillingNav: NavItem[] = [
  { href: "/tb/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/tb/materials", label: "Materials", icon: Package },
  { href: "/tb/workers", label: "Workers", icon: Users },
];
```
```ts
export const timebillingTabs = ["/tb/jobs", "/tb/materials", "/tb/workers"];
```

(`Users` is already imported at the top of `nav.ts`.)

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds; the route `/tb/workers` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(timebilling)/tb/workers/page.tsx" "src/app/(timebilling)/tb/workers/WorkerNameForm.tsx" src/components/shell/nav.ts
git commit -m "Add /tb/workers admin page + Workers nav item"
```

---

## Task 5: Wire names into the report + worker shell

**Files:**
- Modify: `src/lib/data/tb-report.ts`
- Modify: `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`
- Modify: `src/app/(worker)/log/layout.tsx`

- [ ] **Step 1: Label techs by name in `getJobReport`**

In `src/lib/data/tb-report.ts`:

(a) Add `workerLabel` to the worktime import. Change:
```ts
import { sumSegmentHours, roundQuarterHours, materialExtended } from "./worktime";
```
to:
```ts
import { sumSegmentHours, roundQuarterHours, materialExtended, workerLabel } from "./worktime";
```

(b) After the block that builds the `emails` record (the `if (workerIds.length) { … getUserById … }` block), add a `tb_workers` name read:
```ts
  // Worker names (override the email label when set)
  const names: Record<string, string> = {};
  if (workerIds.length) {
    const { data: nameRows } = await supabase
      .from("tb_workers")
      .select("user_id, name")
      .eq("organization_id", ctx.org.id)
      .in("user_id", workerIds);
    (nameRows ?? []).forEach((r) => {
      names[r.user_id as string] = r.name as string;
    });
  }
```

(c) Change the `workers` mapping so the field is `label` (was `email`), computed via `workerLabel`. Change:
```ts
  const workers = [...byWorker.entries()].map(([wid, days]) => ({
    email: emails[wid] ?? wid.slice(0, 8),
    totalHours: days.reduce((sum, d) => sum + d.total, 0),
    days,
  }));
```
to:
```ts
  const workers = [...byWorker.entries()].map(([wid, days]) => ({
    label: workerLabel(names[wid] ?? null, emails[wid] ?? null, wid),
    totalHours: days.reduce((sum, d) => sum + d.total, 0),
    days,
  }));
```

- [ ] **Step 2: Render `w.label` on the report page**

In `src/app/(timebilling)/tb/jobs/[id]/report/page.tsx`, the time section maps `time.workers`. Change the two `w.email` references:
```tsx
              <div key={w.email} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold truncate">{w.email}</span>
```
to:
```tsx
              <div key={w.label} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold truncate">{w.label}</span>
```

- [ ] **Step 3: Greet the worker in the `/log` layout**

In `src/app/(worker)/log/layout.tsx`:

(a) Add the import (top of file, with the other `@/lib/data` imports):
```tsx
import { getWorkerName } from "@/lib/data/tb-workers";
```

(b) After the `const ctx = await getWorkspaceContext();` line, add:
```tsx
  const workerName = await getWorkerName();
```

(c) In the header's brand block, add the greeting after the org-name span. Change:
```tsx
          <span className="text-body font-semibold truncate">{ctx?.org.name ?? "Time logging"}</span>
```
to:
```tsx
          <span className="text-body font-semibold truncate">{ctx?.org.name ?? "Time logging"}</span>
          {workerName && <span className="text-meta text-muted truncate">· Hi, {workerName}</span>}
```

- [ ] **Step 4: Verify it builds + full test suite**

Run: `npm run build`
Expected: build succeeds; no unused/missing-identifier errors (the `email`→`label` rename is consistent across producer + consumer).

Run: `npm test`
Expected: all pass (67 total — the prior 63 plus 4 `workerLabel` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/tb-report.ts "src/app/(timebilling)/tb/jobs/[id]/report/page.tsx" "src/app/(worker)/log/layout.tsx"
git commit -m "Label report techs by name + greet the worker in /log"
```

---

## Manual verification (controller/operator, after cutover)

Cutover applies the migration: `supabase db push` (1 table + RLS) then `vercel --prod`. Then:

1. As `timebilling:admin`, the `/tb` nav shows **Workers** → `/tb/workers` lists the seed worker (`doug+worker@…`) by email with an empty name field.
2. Type a name → **Save** → it persists (reload shows it).
3. Open the completed-job report for a job that worker logged → the time section labels the tech by the **name** (not email).
4. Sign in as that `timebilling:worker` → the `/log` header shows **"· Hi, {name}"** beside the org tile.
5. A second worker with no name still shows their **email** in the report (fallback holds).
6. A blank name on Save shows the inline "Enter a name." error.

---

## Self-Review

**Spec coverage:**
- `tb_workers` table + admin_rw/worker_read_own RLS → Task 1. ✓
- `workerLabel` precedence helper, unit-tested → Task 2. ✓
- `/tb/workers` admin list via service-role (scoped to admin's org) + name editor + `setWorkerName` upsert → Tasks 3 + 4. ✓
- "Workers" nav item + tab → Task 4. ✓
- Report labels techs by name (email fallback), field renamed `email`→`label` with the page updated → Task 5 (steps 1–2). ✓
- `/log` shell greeting via worker-reads-own → Task 5 (step 3) + `getWorkerName`. ✓
- Scope: naming existing workers only; no create/invite → nothing builds onboarding. ✓
- No change to existing tables; new table only → Task 1. ✓

**Type consistency:** `workerLabel(name, email, id): string` is identical across Task 2 (def + tests), Task 3 (`listTbWorkers` sort), and Task 5 (`getJobReport`). `listTbWorkers()` returns `{ userId, email: string|null, name: string|null }[]`, matching the Task 4 page (`w.userId`, `w.email`, `w.name`) and `WorkerNameForm({ userId, initial })`. `setWorkerName(userId, name): Promise<string|void>` matches the form's call. The report `workers[].label` field is produced (Task 5 step 1) and consumed (step 2) together — no dangling `email`.

**Placeholder scan:** none — every code step shows complete code.
