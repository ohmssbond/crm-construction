# Project Schedule — Design

_Date: 2026-07-31_

Contractors and artisans need a way to track the **overall schedule** of a project —
the long-arc plan (Feasibility → Design & Engineering → Permitting → Construction →
Close Out), not the day-to-day punch list. This adds a **Schedule** tab to the project,
editable by tenant staff and readable by customers and partners in the portal.

Source of truth for the intended shape: Doug's
[schedule mockup sheet](https://docs.google.com/spreadsheets/d/1iIXczSGpeocXjdBqI8JtlHuFp9JKK1HE5kigyWiGHk4/edit)
— a two-level table (Phase → Task) where both levels carry a Projected Completion
Date, a Start date, and a Complete date. The sheet's "Customer/Partner View" is the
"Admin View" minus the `+ Phase` / `+ Task` / `+ Date` affordances.

## Goal

A new **Schedule** tab on the project, alongside Updates / Photos / Files / To-Dos:

- **Tenant staff** add, edit, reorder, and delete phases and tasks.
- **Customers and partners** see the same content, read-only, in the portal.
- Each phase and each task carries a projected completion date (with an optional
  note), a start date, and a complete date.

## Decisions (settled)

- **Two levels only** — phases contain tasks; a task always belongs to exactly one
  phase. No deeper nesting.
- **Phase dates are entered independently**, not rolled up from their tasks. The
  sheet shows Construction projected at "July 2027" while its tasks are Nov/Dec 2026.
- **A row is complete when `complete_date` is set.** No separate done flag.
- **Projected completion = a real date plus an optional free-text note**, rendered
  as `Nov 15, 2026 · pending survey`. The date stays sortable; the note absorbs the
  fuzziness the sheet expresses as "July 2027" or "TBD". Start and Complete are plain
  dates with no note.
- **The whole schedule is visible to the portal.** No per-row `is_shared`, no
  publish switch. This is deliberately unlike `status_updates` and `attachments`,
  and is enforced in RLS — the portal policy simply omits an `is_shared` condition.
- **"Admin" means any tenant staff member** — `memberships` role `owner` or
  `artisan`, i.e. exactly the people who can already edit the project. Customers and
  partners are read-only, enforced at the RLS layer rather than only in the UI.
- **New schedules start empty.** No seeded phases, no starter-template button, no
  org-level templates. The admin adds every phase with `+ Phase`.
- **Editing reuses the shipped inline edit-in-place pattern** (`TaskRow` + `updateTodo`,
  `UpdateCard` + `updateStatusUpdate`): click Edit, the row becomes inputs, Save/Cancel,
  scoped server action, `revalidatePath`.
- **Manual ordering** via up/down controls that swap `position`. Not drag-and-drop.
- **The existing "Tasks" feature is relabeled "To-Dos"** — user-facing strings only.
  The `todos` table and existing filenames are untouched.
- **Project Hub only.** No Schedule in Time & Billing, and no interaction with `jobs`.
- **All CRM orgs.** No industry gating — unlike Cycle B's file categories, nothing
  here is construction-specific in the schema.

## Non-goals

- Gantt / timeline chart rendering.
- Notification emails on schedule changes.
- Per-row sharing or a whole-schedule publish toggle.
- Task dependencies, % complete, assignees, durations, critical path.
- Org-level phase templates or a settings screen.
- Linking schedule tasks to to-dos, attachments, or T&B jobs.
- Drag-and-drop reordering.
- Any Schedule surface in Time & Billing or the worker app.

---

## Components

### 1. Migration — `supabase/migrations/20260731000001_project_schedule.sql`

Two tables. Named `schedule_*` because `phase` already means the before/during/after
**photo** tag (`attachments.phase`, `PhaseControl.tsx`) — the two must not be confused.

```sql
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
```

`project_id` is denormalized onto `schedule_tasks` so the RLS policy is identical on
both tables and portal reads need no join. Deleting a phase cascades to its tasks.

Indexes: `(project_id, position)` on phases, `(phase_id, position)` on tasks.

**RLS** — four policies, reusing the helpers in `20260602000002_rls.sql`:

```sql
create policy artisan_all on schedule_phases for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy contact_read on schedule_phases for select to authenticated
  using (contact_can_see_project(project_id));
```

…and the same pair on `schedule_tasks`. The **absence** of an `is_shared` condition on
`contact_read` is the whole-schedule-is-visible decision, expressed in the database.
Both tables get `enable row level security`.

### 2. Data access — `src/lib/data/schedule.ts`

```ts
export type ScheduleTask = {
  id: string; name: string; position: number;
  projectedDate: string | null; projectedNote: string | null;
  startDate: string | null; completeDate: string | null;
};
export type SchedulePhase = ScheduleTask & { tasks: ScheduleTask[] };

export async function getProjectSchedule(projectId: string): Promise<SchedulePhase[]>
```

Two selects (phases, then tasks for those phases) nested in memory and sorted by
`position`, ascending, with `created_at` as the tiebreak. RLS decides what comes back,
so the same function serves all three surfaces — staff see it via `is_org_member`,
portal contacts via `contact_can_see_project`.

Called from:

- `getProjectDetail` (`src/lib/data/projects.ts`) — artisan
- `getPortalProject` (`src/lib/data/portal.ts`) — customer/partner portal
- `getProjectPreview` (`src/lib/data/preview.ts`) — staff preview

The `PortalProjectDetail` type gains a `schedule: SchedulePhase[]` field, so portal and
preview cannot drift.

### 3. Server actions — `src/app/(artisan)/projects/[id]/schedule-actions.ts`

Eight actions, each scoped to a project and each ending in `revalidatePath`:

| Action | Notes |
| --- | --- |
| `addPhase(projectId, name)` | appends at `max(position) + 1` |
| `updatePhase(projectId, phaseId, fields)` | name + the four date/note fields |
| `deletePhase(projectId, phaseId)` | cascades to its tasks |
| `movePhase(projectId, phaseId, dir)` | `dir: "up" \| "down"`; swaps `position` with the adjacent sibling |
| `addTask(projectId, phaseId, name)` | appends within the phase |
| `updateTask(projectId, taskId, fields)` | same field set |
| `deleteTask(projectId, taskId)` | |
| `moveTask(projectId, phaseId, taskId, dir)` | swaps within its phase only — hence `phaseId` |

Deleting a phase destroys its tasks, so both delete controls use the **inline confirm**
pattern already shipped in `ArchiveButton` (click Delete → Confirm / Cancel, no native
`confirm()` dialog).

Auth is RLS (`is_org_member`), with no explicit membership check — matching
`updateTodo` and `updateStatusUpdate`. Validation: `name` is required and trimmed;
empty date strings normalize to `null`; `projected_note` is trimmed to `null` when
blank.

### 4. UI — `src/components/schedule/`

One component family, used by all three surfaces — the same anti-drift move
`PortalProjectView` made for the preview feature.

```
ScheduleTable   (server)  → phases in position order, or an EmptyState
  ScheduleRow   (client)  → one phase OR one task (variant="phase"|"task");
                            name + 3 dates; Edit → inputs → Save/Cancel
  AddRow        (client)  → the inline "+ Phase" / "+ Task" name input
```

Phases and tasks carry an identical field set, so **one** row component renders both;
`variant` controls weight and indent.

Read-only is expressed by **omitting the actions prop** rather than by a separate
`editable` boolean — `ScheduleTable({ phases, actions? })`. With no `actions` the rows
receive no bound actions and render no Edit / Delete / move / `+ Task` controls, so the
flag and the behavior cannot disagree.

Layout: the row's **name** sits on the left; the three dates render as labeled chips
(Projected / Start / Complete) that wrap on narrow screens — not a four-column table,
which would overflow on a phone. A completed row (has `complete_date`) is visually
distinguished. The projected note renders beside its date: `Nov 15, 2026 · pending survey`.

Naming note: the schedule's row component is `ScheduleRow`, deliberately *not* a second
`TaskRow` — the existing to-do `TaskRow` in `src/app/(artisan)/projects/[id]/` keeps that
name to itself.

Wiring:

- `src/app/(artisan)/projects/[id]/page.tsx` — a **Schedule** tab with the bound actions
- `src/components/portal/PortalProjectView.tsx` — a **Schedule** tab, read-only
  (this covers both the portal and `/preview/[id]`)

The tab always renders, showing an empty state when there is no schedule — consistent
with the existing Updates / Photos / Files tabs.

### 5. Rename: "Tasks" → "To-Dos"

User-facing strings only, ~12 occurrences across 4 files:

- `src/app/(artisan)/projects/[id]/page.tsx` — tab label
- `src/components/portal/PortalProjectView.tsx` — tab label + doc comment
- `src/app/(artisan)/dashboard/page.tsx`
- `src/app/(artisan)/projects/[id]/TaskRow.tsx`

The `todos` table, the `updateTodo` action, and all filenames stay as they are —
renaming them is churn with real merge risk and no user-visible benefit.

---

## Testing

Vitest unit tests in the existing style (`projectTeam.test.ts`, `portfolio.test.ts`):

- `schedule.test.ts` — nesting (tasks land under the right phase), `position`
  ordering with a `created_at` tiebreak, and an empty schedule returning `[]`.
- The projected date + note formatter — date only, date + note, note only, neither.

Manual verification before merge:

- Staff can add / edit / reorder / delete phases and tasks.
- The portal shows the same schedule read-only, with no edit affordances.
- **Isolation check:** a customer on project A cannot read project B's schedule
  (the `contact_can_see_project` policy) — the same adversarial check the Company
  Reps and preview features used.

Gates: `tsc`, `npm test`, `npm run build` — all green before commit or merge.

## Risks

- **`is_shared` asymmetry.** Every other portal-visible entity gates per row; this one
  does not. Anything an admin types into the schedule is immediately customer-visible.
  That is the decision, but it must be obvious in the admin UI so nobody drafts a
  sensitive note there.
- **Two things named "phase".** Schedule phases vs. the before/during/after photo tag.
  Mitigated by the `schedule_` prefix in the schema and the `src/components/schedule/`
  namespace.
- **Two things called a "task".** The schedule's tasks and the to-do list's rows. In
  code the collision is avoided outright (`ScheduleRow` vs. `TaskRow`); in the product
  it is mitigated by the "To-Dos" rename, which makes the distinction visible to users.
