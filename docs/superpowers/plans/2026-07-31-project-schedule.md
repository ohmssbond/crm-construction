# Project Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Schedule** tab to a project — a two-level plan (Phase → Task) that tenant staff edit and customers/partners read in the portal.

**Architecture:** Two new tables (`schedule_phases`, `schedule_tasks`) with RLS that grants staff full access via `is_org_member` and portal contacts read-only access via `contact_can_see_project` — with **no `is_shared` column**, because the whole schedule is customer-visible by design. A pure transform module (`src/lib/data/schedule.ts`) shapes rows; one component family (`src/components/schedule/`) renders both the editable artisan view and the read-only portal view, so the two cannot drift. Editing reuses the shipped inline edit-in-place pattern (`TaskRow` + `updateTodo`).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres + RLS, TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-07-31-project-schedule-design.md`

## Global Constraints

- **This is an MVP.** Build core functionality only. Everything in the spec's Non-goals section stays out: no Gantt chart, no notification emails, no per-row sharing, no dependencies/% complete/assignees/durations, no org-level templates, no drag-and-drop, no T&B or worker surfaces.
- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **Never run `supabase db push`.** The migration ships later, deliberately, as a separate confirmed step. `--dry-run` is fine (read-only).
- **Pure modules take a client, never import one.** `src/lib/data/schedule.ts` follows `attachments.ts`: `SupabaseClient` arrives as a parameter so the module stays unit-testable. Never import `@/lib/supabase/server` there.
- **`schedule_` prefix everywhere in the schema.** `phase` already means the before/during/after **photo** tag (`attachments.phase`, `PhaseControl.tsx`). The two must never be confused.
- **User-facing copy:** the new feature is "Schedule", its levels are "Phase" and "Task". The pre-existing `todos` feature is relabeled "To-Dos" (Task 7).
- **Date display keeps the year** — schedules span years. `fmtDate` ("Jun 2") is wrong here; use the new `fmtScheduleDate` ("Nov 15, 2026").
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` pass. `npm run build` passes before the final task is called done.

---

### Task 1: Schema — tables, indexes, RLS

**Files:**
- Create: `supabase/migrations/20260731000001_project_schedule.sql`

**Interfaces:**
- Consumes: existing RLS helpers `is_org_member(uuid)` and `contact_can_see_project(uuid)` from `supabase/migrations/20260602000002_rls.sql`.
- Produces: tables `schedule_phases` and `schedule_tasks` with columns `id, organization_id, project_id, name, position, projected_date, projected_note, start_date, complete_date, created_at` (plus `phase_id` on `schedule_tasks`). Every later task depends on these exact column names.

- [ ] **Step 1: Confirm the helper functions exist with these exact names**

Run: `grep -n "is_org_member\|contact_can_see_project" supabase/migrations/20260602000002_rls.sql | head -5`

Expected: both `create or replace function public.is_org_member(org uuid)` and `create or replace function public.contact_can_see_project(proj uuid)` appear. If either name differs, stop and report — the policies below depend on them.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260731000001_project_schedule.sql`:

```sql
-- Project Schedule: a two-level plan (Phase → Task) per project.
--
-- Naming: the schedule_ prefix is deliberate. `attachments.phase` already means the
-- before/during/after PHOTO tag, and `todos` is the day-to-day To-Do list. Neither is
-- related to this.
--
-- Visibility: unlike status_updates and attachments there is NO is_shared column.
-- The ENTIRE schedule is visible to any contact attached to the project — that is the
-- product decision, and it is enforced here in RLS rather than only in the UI.

create table schedule_phases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  projected_date  date,
  projected_note  text,
  start_date      date,
  complete_date   date,
  created_at      timestamptz not null default now()
);

-- project_id is denormalized (derivable via phase_id) so the contact_read policy is
-- identical on both tables and portal reads need no join.
create table schedule_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  phase_id        uuid not null references schedule_phases (id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  projected_date  date,
  projected_note  text,
  start_date      date,
  complete_date   date,
  created_at      timestamptz not null default now()
);

create index schedule_phases_project_idx on schedule_phases (project_id, position);
create index schedule_tasks_phase_idx    on schedule_tasks (phase_id, position);
create index schedule_tasks_project_idx  on schedule_tasks (project_id);

alter table schedule_phases enable row level security;
alter table schedule_tasks  enable row level security;

-- Tenant staff (memberships product='crm', role owner|artisan): full read/write on
-- their own org's rows. Same shape as every other tenant table.
create policy artisan_all on schedule_phases for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on schedule_tasks for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- Portal contacts (customers + partners): read-only, EVERY row on a project they can
-- see. NOTE the deliberate absence of an is_shared condition — compare the
-- status_updates and attachments contact_read policies, which do filter on it.
create policy contact_read on schedule_phases for select to authenticated
  using (contact_can_see_project(project_id));

create policy contact_read on schedule_tasks for select to authenticated
  using (contact_can_see_project(project_id));
```

- [ ] **Step 3: Verify the migration is well-formed and pending — WITHOUT applying it**

Run: `supabase db push --dry-run`

Expected: output lists `20260731000001_project_schedule.sql` as a migration that *would* be applied. Nothing is written to the database.

If the CLI reports a syntax error, fix the SQL and re-run. **Do not run `supabase db push` without `--dry-run`** — applying to production is a separate, explicitly confirmed step at ship time.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260731000001_project_schedule.sql
git commit -m "feat(schedule): schedule_phases + schedule_tasks tables and RLS"
```

---

### Task 2: Data layer — pure transforms, loader, formatters

**Files:**
- Create: `src/lib/data/schedule.ts`
- Create: `src/lib/data/schedule.test.ts`
- Modify: `src/lib/data/format.ts` (append two formatters)
- Modify: `src/lib/data/format.test.ts` (append tests)

**Interfaces:**
- Consumes: the table/column names from Task 1.
- Produces — every later task uses these exact names:
  - `type ScheduleRow = { id: string; name: string; position: number; projectedDate: string | null; projectedNote: string | null; startDate: string | null; completeDate: string | null }`
  - `type SchedulePhase = ScheduleRow & { tasks: ScheduleRow[] }`
  - `type ScheduleFields = { name: string; projectedDate: string | null; projectedNote: string | null; startDate: string | null; completeDate: string | null }`
  - `nestSchedule(phases: DbScheduleRow[], tasks: DbScheduleTaskRow[]): SchedulePhase[]`
  - `normalizeScheduleFields(input: ScheduleFields): DbSchedulePatch | null`
  - `getProjectSchedule(supabase: SupabaseClient, projectId: string): Promise<SchedulePhase[]>`
  - `fmtScheduleDate(iso: string | null): string | null` and `fmtProjected(iso: string | null, note: string | null): string | null` from `@/lib/data/format`

- [ ] **Step 1: Write the failing tests for the pure transforms**

Create `src/lib/data/schedule.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  nestSchedule,
  normalizeScheduleFields,
  type DbScheduleRow,
  type DbScheduleTaskRow,
} from "./schedule";

const phase = (id: string, position: number, created_at = "2026-07-01T00:00:00Z"): DbScheduleRow => ({
  id,
  name: id,
  position,
  projected_date: null,
  projected_note: null,
  start_date: null,
  complete_date: null,
  created_at,
});

const task = (
  id: string,
  phase_id: string,
  position: number,
  created_at = "2026-07-01T00:00:00Z"
): DbScheduleTaskRow => ({ ...phase(id, position, created_at), phase_id });

describe("nestSchedule", () => {
  test("nests each task under its own phase", () => {
    const result = nestSchedule(
      [phase("permitting", 0), phase("construction", 1)],
      [task("zoning", "permitting", 0), task("foundation", "construction", 0)]
    );
    expect(result.map((p) => p.name)).toEqual(["permitting", "construction"]);
    expect(result[0].tasks.map((t) => t.name)).toEqual(["zoning"]);
    expect(result[1].tasks.map((t) => t.name)).toEqual(["foundation"]);
  });

  test("orders phases and tasks by position, ascending", () => {
    const result = nestSchedule(
      [phase("second", 1), phase("first", 0)],
      [task("b", "first", 1), task("a", "first", 0)]
    );
    expect(result.map((p) => p.name)).toEqual(["first", "second"]);
    expect(result[0].tasks.map((t) => t.name)).toEqual(["a", "b"]);
  });

  test("breaks a position tie with created_at", () => {
    const result = nestSchedule(
      [phase("later", 0, "2026-07-02T00:00:00Z"), phase("earlier", 0, "2026-07-01T00:00:00Z")],
      []
    );
    expect(result.map((p) => p.name)).toEqual(["earlier", "later"]);
  });

  test("maps snake_case columns to camelCase fields", () => {
    const row: DbScheduleRow = {
      id: "p1",
      name: "Permitting",
      position: 0,
      projected_date: "2026-11-15",
      projected_note: "pending survey",
      start_date: "2026-09-01",
      complete_date: null,
      created_at: "2026-07-01T00:00:00Z",
    };
    expect(nestSchedule([row], [])[0]).toEqual({
      id: "p1",
      name: "Permitting",
      position: 0,
      projectedDate: "2026-11-15",
      projectedNote: "pending survey",
      startDate: "2026-09-01",
      completeDate: null,
      tasks: [],
    });
  });

  test("drops orphan tasks whose phase is not in the list", () => {
    const result = nestSchedule([phase("a", 0)], [task("orphan", "missing-phase", 0)]);
    expect(result[0].tasks).toEqual([]);
  });

  test("returns an empty array for an empty schedule", () => {
    expect(nestSchedule([], [])).toEqual([]);
  });
});

describe("normalizeScheduleFields", () => {
  test("trims the name and passes dates through as DB columns", () => {
    expect(
      normalizeScheduleFields({
        name: "  Framing  ",
        projectedDate: "2026-12-01",
        projectedNote: "after inspection",
        startDate: "2026-11-01",
        completeDate: null,
      })
    ).toEqual({
      name: "Framing",
      projected_date: "2026-12-01",
      projected_note: "after inspection",
      start_date: "2026-11-01",
      complete_date: null,
    });
  });

  test("converts empty strings to null", () => {
    expect(
      normalizeScheduleFields({
        name: "Framing",
        projectedDate: "",
        projectedNote: "   ",
        startDate: "",
        completeDate: "",
      })
    ).toEqual({
      name: "Framing",
      projected_date: null,
      projected_note: null,
      start_date: null,
      complete_date: null,
    });
  });

  test("returns null when the name is blank, so callers can no-op", () => {
    const blank = {
      name: "   ",
      projectedDate: null,
      projectedNote: null,
      startDate: null,
      completeDate: null,
    };
    expect(normalizeScheduleFields(blank)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/schedule.test.ts`

Expected: FAIL — cannot resolve `./schedule` (the module does not exist yet).

- [ ] **Step 3: Write the module**

Create `src/lib/data/schedule.ts`:

```ts
// Pure transforms + the loader for the project Schedule (Phase → Task).
//
// Convention (see attachments.ts): the Supabase client is PASSED IN, never imported,
// so this module stays unit-testable and usable from any surface. RLS decides what
// comes back — staff read via is_org_member, portal contacts via
// contact_can_see_project — so one loader serves the artisan page, the portal, and
// the preview.
import type { SupabaseClient } from "@supabase/supabase-js";

/** A schedule row as it comes out of Postgres. */
export type DbScheduleRow = {
  id: string;
  name: string;
  position: number;
  projected_date: string | null;
  projected_note: string | null;
  start_date: string | null;
  complete_date: string | null;
  created_at: string;
};

export type DbScheduleTaskRow = DbScheduleRow & { phase_id: string };

/** A schedule row as the UI consumes it. */
export type ScheduleRow = {
  id: string;
  name: string;
  position: number;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
};

export type SchedulePhase = ScheduleRow & { tasks: ScheduleRow[] };

/** The editable field set, shared by the edit form and the update actions. */
export type ScheduleFields = {
  name: string;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
};

/** The DB column shape an update writes. */
export type DbSchedulePatch = {
  name: string;
  projected_date: string | null;
  projected_note: string | null;
  start_date: string | null;
  complete_date: string | null;
};

const SELECT =
  "id, name, position, projected_date, projected_note, start_date, complete_date, created_at";

function toRow(r: DbScheduleRow): ScheduleRow {
  return {
    id: r.id,
    name: r.name,
    position: r.position,
    projectedDate: r.projected_date,
    projectedNote: r.projected_note,
    startDate: r.start_date,
    completeDate: r.complete_date,
  };
}

/** Manual ordering, with created_at as the tiebreak so ties never render randomly. */
function byPosition(a: DbScheduleRow, b: DbScheduleRow): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

/**
 * Nest tasks under their phases and apply the display ordering. Tasks whose phase is
 * absent are dropped — RLS returns both tables consistently, so this only guards
 * against a torn read.
 */
export function nestSchedule(
  phases: DbScheduleRow[],
  tasks: DbScheduleTaskRow[]
): SchedulePhase[] {
  const byPhase = new Map<string, DbScheduleTaskRow[]>();
  for (const t of tasks) {
    const list = byPhase.get(t.phase_id);
    if (list) list.push(t);
    else byPhase.set(t.phase_id, [t]);
  }
  return [...phases].sort(byPosition).map((p) => ({
    ...toRow(p),
    tasks: (byPhase.get(p.id) ?? []).sort(byPosition).map(toRow),
  }));
}

/**
 * Form input → DB columns. Blank strings become null (an empty `<input type="date">`
 * submits ""). Returns null when the name is blank so callers can no-op, matching
 * updateTodo's "an empty save is a no-op" rule.
 */
export function normalizeScheduleFields(input: ScheduleFields): DbSchedulePatch | null {
  const name = input.name.trim();
  if (!name) return null;
  const blankToNull = (v: string | null) => v?.trim() || null;
  return {
    name,
    projected_date: blankToNull(input.projectedDate),
    projected_note: blankToNull(input.projectedNote),
    start_date: blankToNull(input.startDate),
    complete_date: blankToNull(input.completeDate),
  };
}

/** Load a project's full schedule, nested and ordered. Empty when there is none. */
export async function getProjectSchedule(
  supabase: SupabaseClient,
  projectId: string
): Promise<SchedulePhase[]> {
  const [phases, tasks] = await Promise.all([
    supabase.from("schedule_phases").select(SELECT).eq("project_id", projectId),
    supabase.from("schedule_tasks").select(`${SELECT}, phase_id`).eq("project_id", projectId),
  ]);
  return nestSchedule(
    (phases.data ?? []) as DbScheduleRow[],
    (tasks.data ?? []) as DbScheduleTaskRow[]
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/schedule.test.ts`

Expected: PASS — 9 tests.

- [ ] **Step 5: Write the failing formatter tests**

Append to `src/lib/data/format.test.ts` (keep the file's existing imports working — add `fmtScheduleDate` and `fmtProjected` to the existing `import { … } from "./format"` statement):

```ts
describe("fmtScheduleDate", () => {
  test("renders an ISO date with its year", () => {
    expect(fmtScheduleDate("2026-11-15")).toBe("Nov 15, 2026");
  });

  test("does not shift the day across timezones", () => {
    expect(fmtScheduleDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  test("returns null for null", () => {
    expect(fmtScheduleDate(null)).toBeNull();
  });
});

describe("fmtProjected", () => {
  test("joins a date and a note with a separator", () => {
    expect(fmtProjected("2026-11-15", "pending survey")).toBe("Nov 15, 2026 · pending survey");
  });

  test("renders the date alone when there is no note", () => {
    expect(fmtProjected("2026-11-15", null)).toBe("Nov 15, 2026");
  });

  test("renders the note alone when there is no date", () => {
    expect(fmtProjected(null, "TBD pending permit")).toBe("TBD pending permit");
  });

  test("ignores a whitespace-only note", () => {
    expect(fmtProjected("2026-11-15", "   ")).toBe("Nov 15, 2026");
  });

  test("returns null when both are empty", () => {
    expect(fmtProjected(null, null)).toBeNull();
  });
});
```

- [ ] **Step 6: Run the formatter tests to verify they fail**

Run: `npx vitest run src/lib/data/format.test.ts`

Expected: FAIL — `fmtScheduleDate is not a function` (or an import error).

- [ ] **Step 7: Add the formatters**

Append to `src/lib/data/format.ts`:

```ts
/**
 * ISO date → "Nov 15, 2026". Unlike fmtDate this KEEPS the year: a construction
 * schedule spans years, so "Nov 15" would be ambiguous. Parsed as UTC so the day
 * never shifts.
 */
export function fmtScheduleDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The schedule's projected-completion cell: a date, a note, or both. The note absorbs
 * the fuzziness a date column can't hold ("pending survey", "TBD"). Null when empty.
 */
export function fmtProjected(iso: string | null, note: string | null): string | null {
  const date = fmtScheduleDate(iso);
  const trimmed = note?.trim() || null;
  if (date && trimmed) return `${date} · ${trimmed}`;
  return date ?? trimmed;
}
```

- [ ] **Step 8: Run the full gates**

Run: `npx vitest run && npx tsc --noEmit`

Expected: all tests PASS (the pre-existing suite plus 17 new), no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/data/schedule.ts src/lib/data/schedule.test.ts src/lib/data/format.ts src/lib/data/format.test.ts
git commit -m "feat(schedule): schedule data transforms, loader, and date formatters"
```

---

### Task 3: Server actions

**Files:**
- Create: `src/app/(artisan)/projects/[id]/schedule-actions.ts`

**Interfaces:**
- Consumes: `normalizeScheduleFields`, `ScheduleFields` from `@/lib/data/schedule` (Task 2); `getOrgContext` from `@/lib/data/org`; `createClient` from `@/lib/supabase/server`.
- Produces — Task 5 binds these exact signatures:
  - `addPhase(projectId: string, name: string): Promise<void>`
  - `updatePhase(projectId: string, phaseId: string, fields: ScheduleFields): Promise<void>`
  - `deletePhase(projectId: string, phaseId: string): Promise<void>`
  - `movePhase(projectId: string, phaseId: string, dir: "up" | "down"): Promise<void>`
  - `addTask(projectId: string, phaseId: string, name: string): Promise<void>`
  - `updateTask(projectId: string, taskId: string, fields: ScheduleFields): Promise<void>`
  - `deleteTask(projectId: string, taskId: string): Promise<void>`
  - `moveTask(projectId: string, phaseId: string, taskId: string, dir: "up" | "down"): Promise<void>`

Note `moveTask` takes `phaseId` as well — reordering is scoped to siblings within one phase.

- [ ] **Step 1: Write the actions file**

There is no test cycle here: these actions are thin RLS-scoped Supabase writes, and the repo tests pure functions only (all the logic worth testing — `normalizeScheduleFields` — was tested in Task 2). The gate for this task is `tsc` plus review.

Create `src/app/(artisan)/projects/[id]/schedule-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { normalizeScheduleFields, type ScheduleFields } from "@/lib/data/schedule";

// Schedule writes. All RLS-scoped (artisan_all → is_org_member), exactly like the
// live-edit writes in ./actions.ts: updates and deletes by id rely on the policy's
// USING clause to confine the change to the signed-in org, and inserts supply
// organization_id from the session. No explicit membership check — matching
// updateTodo and updateStatusUpdate.

/** Next position for a new row: append to the end of its sibling list. */
async function nextPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "schedule_phases" | "schedule_tasks",
  column: "project_id" | "phase_id",
  value: string
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("position")
    .eq(column, value)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/**
 * Swap a row with its neighbour, then renumber the whole sibling list 0..n-1. The
 * renumber (rather than a bare two-row swap) keeps ordering correct even if two rows
 * ever share a position.
 */
async function reorder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "schedule_phases" | "schedule_tasks",
  column: "project_id" | "phase_id",
  scopeId: string,
  rowId: string,
  dir: "up" | "down"
): Promise<void> {
  const { data: rows } = await supabase
    .from(table)
    .select("id, position, created_at")
    .eq(column, scopeId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!rows) return;

  const order = rows.map((r) => r.id as string);
  const i = order.indexOf(rowId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return; // already at the end — no-op

  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(
    order.map((id, idx) => supabase.from(table).update({ position: idx }).eq("id", id))
  );
}

// ── Phases ──────────────────────────────────────────────────────────────────

export async function addPhase(projectId: string, name: string) {
  const text = name.trim();
  if (!text) return; // name required; an empty add is a no-op
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("schedule_phases").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    name: text,
    position: await nextPosition(supabase, "schedule_phases", "project_id", projectId),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updatePhase(projectId: string, phaseId: string, fields: ScheduleFields) {
  const patch = normalizeScheduleFields(fields);
  if (!patch) return; // blank name → no-op
  const supabase = await createClient();
  await supabase.from("schedule_phases").update(patch).eq("id", phaseId);
  revalidatePath(`/projects/${projectId}`);
}

/** Deleting a phase cascades to its tasks (FK on delete cascade). */
export async function deletePhase(projectId: string, phaseId: string) {
  const supabase = await createClient();
  await supabase.from("schedule_phases").delete().eq("id", phaseId);
  revalidatePath(`/projects/${projectId}`);
}

export async function movePhase(projectId: string, phaseId: string, dir: "up" | "down") {
  const supabase = await createClient();
  await reorder(supabase, "schedule_phases", "project_id", projectId, phaseId, dir);
  revalidatePath(`/projects/${projectId}`);
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export async function addTask(projectId: string, phaseId: string, name: string) {
  const text = name.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("schedule_tasks").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    phase_id: phaseId,
    name: text,
    position: await nextPosition(supabase, "schedule_tasks", "phase_id", phaseId),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTask(projectId: string, taskId: string, fields: ScheduleFields) {
  const patch = normalizeScheduleFields(fields);
  if (!patch) return;
  const supabase = await createClient();
  await supabase.from("schedule_tasks").update(patch).eq("id", taskId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTask(projectId: string, taskId: string) {
  const supabase = await createClient();
  await supabase.from("schedule_tasks").delete().eq("id", taskId);
  revalidatePath(`/projects/${projectId}`);
}

/** Reordering is scoped to siblings within one phase, hence phaseId. */
export async function moveTask(
  projectId: string,
  phaseId: string,
  taskId: string,
  dir: "up" | "down"
) {
  const supabase = await createClient();
  await reorder(supabase, "schedule_tasks", "phase_id", phaseId, taskId, dir);
  revalidatePath(`/projects/${projectId}`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: no errors. If the `nextPosition`/`reorder` client parameter type is rejected, check how `createClient` is typed in `src/lib/supabase/server.ts` and use that type directly rather than loosening to `any`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/schedule-actions.ts"
git commit -m "feat(schedule): server actions for phases and tasks"
```

---

### Task 4: Schedule UI components

**Files:**
- Create: `src/components/schedule/ScheduleTable.tsx`
- Create: `src/components/schedule/ScheduleRow.tsx`
- Create: `src/components/schedule/AddRow.tsx`

**Interfaces:**
- Consumes: `SchedulePhase`, `ScheduleFields` from `@/lib/data/schedule` (Task 2); `fmtScheduleDate`, `fmtProjected` from `@/lib/data/format` (Task 2); `Card`, `EmptyState`, `fieldInput`, `Button` from `@/components/ui/*`.
- Produces:
  - `type ScheduleEditActions` — the eight bound actions, defined in `ScheduleTable.tsx`
  - `ScheduleTable({ phases, actions }: { phases: SchedulePhase[]; actions?: ScheduleEditActions })` — a Server Component. **`actions` omitted = read-only.** There is no separate `editable` boolean, so the two can never disagree.

- [ ] **Step 1: Write the row component**

Create `src/components/schedule/ScheduleRow.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";
import { fmtScheduleDate, fmtProjected } from "@/lib/data/format";
import type { ScheduleFields } from "@/lib/data/schedule";

/**
 * One schedule row — a phase or one of its tasks. Both levels carry the same fields,
 * so one component renders both; `variant` controls weight and indent.
 *
 * Editing reuses the shipped inline edit-in-place pattern (TaskRow + updateTodo):
 * click Edit, the row becomes inputs, Save/Cancel. Omitting the action props renders
 * a read-only row — that is how the portal uses it.
 */
export function ScheduleRow({
  variant,
  name,
  projectedDate,
  projectedNote,
  startDate,
  completeDate,
  updateAction,
  deleteAction,
  moveAction,
}: {
  variant: "phase" | "task";
  name: string;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
  updateAction?: (fields: ScheduleFields) => Promise<void>;
  deleteAction?: () => Promise<void>;
  moveAction?: (dir: "up" | "down") => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const [draftName, setDraftName] = useState(name);
  const [draftProjected, setDraftProjected] = useState(projectedDate ?? "");
  const [draftNote, setDraftNote] = useState(projectedNote ?? "");
  const [draftStart, setDraftStart] = useState(startDate ?? "");
  const [draftComplete, setDraftComplete] = useState(completeDate ?? "");

  const isPhase = variant === "phase";
  const done = completeDate !== null;

  const startEdit = () => {
    setDraftName(name);
    setDraftProjected(projectedDate ?? "");
    setDraftNote(projectedNote ?? "");
    setDraftStart(startDate ?? "");
    setDraftComplete(completeDate ?? "");
    setEditing(true);
  };

  const save = () => {
    if (!draftName.trim() || !updateAction) return;
    start(async () => {
      await updateAction({
        name: draftName,
        projectedDate: draftProjected || null,
        projectedNote: draftNote || null,
        startDate: draftStart || null,
        completeDate: draftComplete || null,
      });
      setEditing(false);
    });
  };

  const rowClass = `flex flex-wrap items-center gap-x-4 gap-y-2 px-[15px] py-[11px] border-b border-line-2 last:border-b-0 ${
    isPhase ? "bg-[#fafbfc]" : "pl-[34px]"
  }`;

  if (editing) {
    return (
      <div className={rowClass}>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          disabled={pending}
          aria-label={isPhase ? "Phase name" : "Task name"}
          className={`${fieldInput} flex-1 min-w-[150px]`}
        />
        <input
          type="date"
          value={draftProjected}
          onChange={(e) => setDraftProjected(e.target.value)}
          disabled={pending}
          aria-label="Projected completion date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <input
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          disabled={pending}
          placeholder="note"
          aria-label="Projected completion note"
          className={`${fieldInput} w-[150px] text-meta py-[5px]`}
        />
        <input
          type="date"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
          disabled={pending}
          aria-label="Start date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <input
          type="date"
          value={draftComplete}
          onChange={(e) => setDraftComplete(e.target.value)}
          disabled={pending}
          aria-label="Complete date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !draftName.trim()}
          className="text-meta font-semibold text-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-meta text-faint hover:text-body"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <span
        className={`flex-1 min-w-[140px] ${isPhase ? "text-body font-semibold" : "text-body"} ${
          done ? "text-faint" : ""
        }`}
      >
        {done && <span className="text-accent mr-1">✓</span>}
        {name}
      </span>

      <DateCell label="Projected" value={fmtProjected(projectedDate, projectedNote)} />
      <DateCell label="Start" value={fmtScheduleDate(startDate)} />
      <DateCell label="Complete" value={fmtScheduleDate(completeDate)} />

      {moveAction && (
        <span className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => start(() => moveAction("up"))}
            disabled={pending}
            aria-label={`Move ${variant} up`}
            className="text-meta text-faint hover:text-accent disabled:opacity-60"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => start(() => moveAction("down"))}
            disabled={pending}
            aria-label={`Move ${variant} down`}
            className="text-meta text-faint hover:text-accent disabled:opacity-60"
          >
            ↓
          </button>
        </span>
      )}

      {updateAction && (
        <button
          type="button"
          onClick={startEdit}
          disabled={pending}
          aria-label={`Edit ${variant}`}
          className="text-meta text-faint hover:text-accent disabled:opacity-60"
        >
          Edit
        </button>
      )}

      {deleteAction &&
        (confirming ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-meta text-muted">
              {isPhase ? "Delete this phase and its tasks?" : "Delete this task?"}
            </span>
            <button
              type="button"
              onClick={() => start(() => deleteAction())}
              disabled={pending}
              className="text-meta font-semibold text-[#b42318] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-meta text-faint hover:text-body"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            aria-label={`Delete ${variant}`}
            className="text-meta text-faint hover:text-[#b42318] disabled:opacity-60"
          >
            Delete
          </button>
        ))}
    </div>
  );
}

/** A labeled date cell. Wraps rather than forming a rigid column, so it survives a phone. */
function DateCell({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="text-meta text-faint whitespace-nowrap">
      <span className="text-muted font-semibold">{label}</span> {value ?? "—"}
    </span>
  );
}
```

Note the delete confirm is the same inline two-step as `ArchiveButton` (no native `confirm()` dialog — it blocks automation and keyboard users).

- [ ] **Step 2: Write the add-row component**

Create `src/components/schedule/AddRow.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "@/components/ui/Field";

/**
 * Inline "+ Phase" / "+ Task" control: a link-style button that reveals a name input.
 * Name is the only field at creation — dates are filled in afterwards via row Edit,
 * which keeps adding fast.
 */
export function AddRow({
  label,
  placeholder,
  action,
  indent = false,
}: {
  label: string;
  placeholder: string;
  action: (name: string) => Promise<void>;
  indent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      await action(name);
      setName("");
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div className={`px-[15px] py-[9px] ${indent ? "pl-[34px]" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-meta font-semibold text-accent"
        >
          + {label}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 px-[15px] py-[9px] ${indent ? "pl-[34px]" : ""}`}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        disabled={pending}
        placeholder={placeholder}
        aria-label={label}
        className={`${fieldInput} flex-1 min-w-[160px]`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="text-meta font-semibold text-accent disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="text-meta text-faint hover:text-body"
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the table component**

Create `src/components/schedule/ScheduleTable.tsx`:

```tsx
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleRow } from "./ScheduleRow";
import { AddRow } from "./AddRow";
import type { SchedulePhase, ScheduleFields } from "@/lib/data/schedule";

/**
 * The eight project-scoped Server Actions the editable view needs. Pass them and the
 * table renders editable; OMIT them and it renders read-only — that single switch is
 * how the artisan page and the portal share one component without drifting.
 */
export type ScheduleEditActions = {
  addPhase: (name: string) => Promise<void>;
  updatePhase: (phaseId: string, fields: ScheduleFields) => Promise<void>;
  deletePhase: (phaseId: string) => Promise<void>;
  movePhase: (phaseId: string, dir: "up" | "down") => Promise<void>;
  addTask: (phaseId: string, name: string) => Promise<void>;
  updateTask: (taskId: string, fields: ScheduleFields) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (phaseId: string, taskId: string, dir: "up" | "down") => Promise<void>;
};

/** The project schedule: ordered phases, each with its ordered tasks. */
export function ScheduleTable({
  phases,
  actions,
}: {
  phases: SchedulePhase[];
  actions?: ScheduleEditActions;
}) {
  if (phases.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState glyph="🗓" title="No schedule yet." />
        {actions && (
          <Card>
            <AddRow label="Phase" placeholder="Phase name (e.g. Permitting)" action={actions.addPhase} />
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      {phases.map((phase) => (
        <div key={phase.id}>
          <ScheduleRow
            variant="phase"
            name={phase.name}
            projectedDate={phase.projectedDate}
            projectedNote={phase.projectedNote}
            startDate={phase.startDate}
            completeDate={phase.completeDate}
            updateAction={actions && actions.updatePhase.bind(null, phase.id)}
            deleteAction={actions && actions.deletePhase.bind(null, phase.id)}
            moveAction={actions && actions.movePhase.bind(null, phase.id)}
          />
          {phase.tasks.map((task) => (
            <ScheduleRow
              key={task.id}
              variant="task"
              name={task.name}
              projectedDate={task.projectedDate}
              projectedNote={task.projectedNote}
              startDate={task.startDate}
              completeDate={task.completeDate}
              updateAction={actions && actions.updateTask.bind(null, task.id)}
              deleteAction={actions && actions.deleteTask.bind(null, task.id)}
              moveAction={actions && actions.moveTask.bind(null, phase.id, task.id)}
            />
          ))}
          {actions && (
            <AddRow
              label="Task"
              placeholder="Task name (e.g. Zoning)"
              action={actions.addTask.bind(null, phase.id)}
              indent
            />
          )}
        </div>
      ))}
      {actions && (
        <AddRow label="Phase" placeholder="Phase name (e.g. Close Out)" action={actions.addPhase} />
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: no errors. `ScheduleTable` is a Server Component that further binds already-bound Server Action references — this is allowed; the client rows receive plain action references, not closures.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/
git commit -m "feat(schedule): ScheduleTable, ScheduleRow, and AddRow components"
```

---

### Task 5: Wire the artisan Schedule tab

**Files:**
- Modify: `src/lib/data/projects.ts` (the `getProjectDetail` return, around line 134)
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (imports + a new tab after "Files")

**Interfaces:**
- Consumes: `getProjectSchedule` (Task 2), the eight actions (Task 3), `ScheduleTable` (Task 4).
- Produces: `getProjectDetail(...)` gains a `schedule: SchedulePhase[]` field.

- [ ] **Step 1: Return the schedule from getProjectDetail**

In `src/lib/data/projects.ts`, add the import at the top of the file:

```ts
import { getProjectSchedule } from "./schedule";
```

Then add one line to the `getProjectDetail` return object, directly after the `attachments:` line (it follows the same `await`-in-the-literal shape already used there):

```ts
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    schedule: await getProjectSchedule(supabase, id),
    fileCategories: fileCategories.data ?? [],
```

- [ ] **Step 2: Import the table and actions on the project page**

In `src/app/(artisan)/projects/[id]/page.tsx`, add to the imports:

```ts
import { ScheduleTable } from "@/components/schedule/ScheduleTable";
import {
  addPhase,
  updatePhase,
  deletePhase,
  movePhase,
  addTask,
  updateTask,
  deleteTask,
  moveTask,
} from "./schedule-actions";
```

- [ ] **Step 3: Destructure `schedule` from the loader result**

Line 72 of `src/app/(artisan)/projects/[id]/page.tsx` currently reads:

```ts
  const { project, updates, todos, contacts, reps, availableContacts, availableStaff, attachments, fileCategories } =
```

Add `schedule` to it:

```ts
  const { project, updates, todos, contacts, reps, availableContacts, availableStaff, attachments, schedule, fileCategories } =
```

- [ ] **Step 4: Add the Schedule tab**

In the `<Tabs tabs={[…]} />` array, insert a new entry **between the `"Files"` tab and the `"Tasks"` tab** (so the order reads Updates, Photos, Files, Schedule, To-Dos, Contacts):

```tsx
          {
            label: "Schedule",
            content: (
              <ScheduleTable
                phases={schedule}
                actions={{
                  addPhase: addPhase.bind(null, project.id),
                  updatePhase: updatePhase.bind(null, project.id),
                  deletePhase: deletePhase.bind(null, project.id),
                  movePhase: movePhase.bind(null, project.id),
                  addTask: addTask.bind(null, project.id),
                  updateTask: updateTask.bind(null, project.id),
                  deleteTask: deleteTask.bind(null, project.id),
                  moveTask: moveTask.bind(null, project.id),
                }}
              />
            ),
          },
```

- [ ] **Step 5: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/projects.ts "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(schedule): editable Schedule tab on the artisan project page"
```

---

### Task 6: Wire the read-only portal + preview Schedule tab

**Files:**
- Modify: `src/lib/data/portal.ts` (the `getPortalProject` return, around line 215)
- Modify: `src/lib/data/preview.ts` (the `getProjectPreview` return, around line 155)
- Modify: `src/components/portal/PortalProjectView.tsx` (destructure + a new tab)

**Interfaces:**
- Consumes: `getProjectSchedule` (Task 2), `ScheduleTable` (Task 4).
- Produces: `PortalProjectDetail` gains `schedule: SchedulePhase[]` (the type is inferred from `getPortalProject`'s return, so adding the field to both loaders is what makes it type-check).

`preview.ts` declares `Promise<PortalProjectDetail | null>`, so if only one of the two loaders is updated, `tsc` fails — that is the intended guard against drift.

- [ ] **Step 1: Return the schedule from the portal loader**

In `src/lib/data/portal.ts`, add the import:

```ts
import { getProjectSchedule } from "./schedule";
```

and add one field to `getPortalProject`'s return object, after `tasks: shapedTasks,`:

```ts
    tasks: shapedTasks,
    schedule: await getProjectSchedule(supabase, id),
```

- [ ] **Step 2: Return the schedule from the preview loader**

In `src/lib/data/preview.ts`, add the same import and the same field after `tasks: shapedTasks,`:

```ts
import { getProjectSchedule } from "./schedule";
```

```ts
    tasks: shapedTasks,
    schedule: await getProjectSchedule(supabase, id),
```

Both audiences see the identical schedule — there is no per-role divergence in the MVP, so the existing `role` seam is not consulted here.

- [ ] **Step 3: Render the read-only tab**

In `src/components/portal/PortalProjectView.tsx`:

Add the import:

```ts
import { ScheduleTable } from "@/components/schedule/ScheduleTable";
```

Add `schedule` to the destructuring of `detail`:

```ts
    updates,
    tasks,
    schedule,
    timezone,
```

Insert a new tab **between the `"Files"` tab and the `"Tasks"` tab**, matching the artisan order:

```tsx
          {
            label: "Schedule",
            content: <ScheduleTable phases={schedule} />,
          },
```

Omitting `actions` is what makes it read-only: no Edit, no Delete, no move arrows, no add controls. This one component serves the portal and `/preview/[id]` both.

- [ ] **Step 4: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green. A type error naming `PortalProjectDetail` means one of the two loaders is missing the `schedule` field — add it rather than widening the type.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/portal.ts src/lib/data/preview.ts src/components/portal/PortalProjectView.tsx
git commit -m "feat(schedule): read-only Schedule tab in the portal and preview"
```

---

### Task 7: Rename "Tasks" → "To-Dos"

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`
- Modify: `src/app/(artisan)/projects/[id]/TaskRow.tsx`
- Modify: `src/components/portal/PortalProjectView.tsx`
- Modify: `src/app/(artisan)/dashboard/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. **User-facing strings only.** The `todos` table, the `updateTodo`/`addTodo`/`toggleTodo` actions, the `TaskRow.tsx` filename, and every identifier stay exactly as they are — renaming them is churn with real merge risk and no user-visible benefit.

- [ ] **Step 1: Rename the strings on the artisan project page**

In `src/app/(artisan)/projects/[id]/page.tsx`, in the tab that currently reads `label: "Tasks"` (the one rendering `TodoComposer` and `TaskRow`):

- `label: "Tasks"` → `label: "To-Dos"`
- Banner copy `Tasks are <strong>private</strong> by default. Assign one to a{" "}` → `To-dos are <strong>private</strong> by default. Assign one to a{" "}`
- `<EmptyState glyph="✅" title="No tasks yet." />` → `title="No to-dos yet."`

Leave the newly added `label: "Schedule"` tab untouched.

- [ ] **Step 2: Rename the accessible labels on TaskRow**

In `src/app/(artisan)/projects/[id]/TaskRow.tsx`:

- `aria-label="Task"` → `aria-label="To-do"`
- `aria-label="Edit task"` → `aria-label="Edit to-do"`

- [ ] **Step 3: Rename the strings in the portal view**

In `src/components/portal/PortalProjectView.tsx`:

- the doc comment `before/after, and the Updates / Photos / Files / Tasks tabs.` → `before/after, and the Updates / Photos / Files / Schedule / To-Dos tabs.`
- `label: "Tasks"` → `label: "To-Dos"`
- `<EmptyState glyph="✅" title="No tasks yet." />` → `title="No to-dos yet."`

- [ ] **Step 4: Rename the strings on the dashboard**

In `src/app/(artisan)/dashboard/page.tsx`:

- `<SectionLabel>Tasks across projects</SectionLabel>` → `<SectionLabel>To-Dos across projects</SectionLabel>`
- Banner copy `Tasks are <strong>private</strong> by default — they appear in the{" "}` → `To-dos are <strong>private</strong> by default — they appear in the{" "}`
- the table header `<th className="font-semibold px-2 py-[10px]">Task</th>` → `>To-Do</th>`

- [ ] **Step 5: Verify no user-facing "Task" strings remain for the to-do feature**

Run: `grep -rn '"Tasks"\|>Task<\|No tasks yet\|Tasks are\|Tasks across' src --include='*.tsx'`

Expected: no output. Any hit is a missed rename. (Hits containing `Schedule` context would be a mistake — the Schedule feature's own level is legitimately called "Task", but it appears as `label: "Task"` on the `AddRow` and as `variant="task"`, neither of which this grep matches.)

- [ ] **Step 6: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/page.tsx" "src/app/(artisan)/projects/[id]/TaskRow.tsx" src/components/portal/PortalProjectView.tsx "src/app/(artisan)/dashboard/page.tsx"
git commit -m "refactor(todos): relabel Tasks as To-Dos to free the name for Schedule"
```

---

## Manual verification (before merge, after `supabase db push`)

The migration must be applied to the target database before any of this works end to end. Once it is:

- [ ] As tenant staff: add a phase, add two tasks under it, edit each row's name and all three dates plus a projected note, reorder with ↑/↓, delete a task, delete a phase and confirm its tasks went with it.
- [ ] A row with a Complete date renders as done (✓, muted).
- [ ] In the customer portal: the same schedule appears under **Schedule**, with **no** Edit, Delete, move, or add controls anywhere.
- [ ] `/preview/[id]` shows the same read-only schedule for both the Customer and Partner role.
- [ ] **Isolation check** (the adversarial test the Company Reps and preview features used): a customer attached to project A cannot read project B's schedule. Verify against the `contact_can_see_project` policy, not just the UI.
- [ ] The Schedule tab renders its empty state on a project with no schedule, on all three surfaces.
- [ ] The to-do feature reads "To-Dos" on the artisan project page, the portal, and the dashboard.
