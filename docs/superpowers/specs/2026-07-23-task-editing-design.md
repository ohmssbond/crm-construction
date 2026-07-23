# Task Editing (admin app) — Design

_Date: 2026-07-23_

Backlog item #4 (editable tasks), scoped down during brainstorming. Backlog item #5
(sort tasks by due date) turned out to be **already implemented** — no work.

## Goal

Let tenant staff edit a task's **body** and **due date** in the artisan project
**Tasks** tab. Today tasks can be toggled done / reassigned / shared, but the body
and due date are fixed after creation.

## Scope decisions (from brainstorming)

- **Admin app only.** Editing lives in the artisan Tasks tab. The customer **portal
  stays read-only** (portal-owner editing is a deferred follow-up — it needs a
  portal write path + an RLS UPDATE policy).
- **Any tenant staff can edit** — no per-owner gating among staff, consistent with
  how staff already toggle/reassign/share any task (RLS `is_org_member`). (The
  "owner vs admin" distinction was really the portal-customer-vs-staff split, now
  out of scope.)
- **Editable fields = `body` + `due_date` only.** Owner and "shared" already have
  their own controls (`setTodoOwner` / `setTodoShared`); those stay as-is.
- **Sort (#5) is already done.** All three task lists — artisan project Tasks tab
  (`src/lib/data/projects.ts:84-85`), artisan dashboard "Tasks across projects"
  (`src/app/(artisan)/dashboard/page.tsx:42-43`), and the portal
  (`src/lib/data/portal.ts:141-142`) — already order `done` asc → `due_date` asc
  (nulls last) = incomplete soonest-first, no-due-date last, completed at the bottom.
  No change.
- **The dashboard "Tasks across projects" table stays read-only** — it's a
  cross-project summary; editing belongs on the project Tasks tab.

## Non-goals

- Portal-side task editing (deferred; needs RLS + a portal write path).
- Editing owner/shared via the new form (already separately editable).
- Any sort change.

---

## Current state

- `TaskRow` (`src/app/(artisan)/projects/[id]/TaskRow.tsx`) is a `"use client"`
  component: a done checkbox, the body as a static `<span>{text}</span>`, an owner
  `<select>`, a `ShareToggle`, and a right-aligned due/completed display string. No
  edit path for body/due.
- Todo write actions in `src/app/(artisan)/projects/[id]/actions.ts`:
  `toggleTodo(projectId, todoId, done)` (`:206`), `setTodoOwner` (`:216`),
  `setTodoShared` (`:227`), `addTodo` (`:321`). Each does a scoped
  `supabase.from("todos").update(...).eq("id", todoId)` (RLS gates to the org) then
  `revalidatePath(\`/projects/${projectId}\`)`. There is **no `updateTodo`**.
- The Tasks tab in `src/app/(artisan)/projects/[id]/page.tsx` maps `todos` to
  `TaskRow`, binding `toggleAction`/`ownerAction`/`shareAction` to
  `(project.id, t.id)`. The body comes from `t.body`; the due display from
  `fmtDate(t.due_date)`. The raw `t.due_date` (a `YYYY-MM-DD` string) is available.

---

## Design

### 1. New server action — `updateTodo`

Add to `src/app/(artisan)/projects/[id]/actions.ts`, mirroring the existing todo
actions:

```ts
export async function updateTodo(
  projectId: string,
  todoId: string,
  body: string,
  dueDate: string | null
) {
  const trimmed = body.trim();
  if (!trimmed) return; // guard: body is required (empty save is a no-op)
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ body: trimmed, due_date: dueDate || null })
    .eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}
```

- RLS (`is_org_member` on `todos`) already restricts the write to the tenant's
  staff, matching the other todo actions — so "any staff can edit" needs no extra
  gating.
- `dueDate || null` normalizes an empty date input to a cleared due date.

### 2. `TaskRow` — inline edit

Add two props and an inline-edit mode:

- **New props:** `dueDate: string | null` (the raw `YYYY-MM-DD` for the date input;
  the existing `due` prop stays for the read display) and
  `editAction: (body: string, dueDate: string | null) => Promise<void>`.
- **State:** `editing` (bool), plus controlled `body` and `dueDate` seeded from
  props.
- **Affordance:** an **Edit** button (e.g. a pencil / "Edit") in the row that sets
  `editing = true`.
- **Edit mode:** the body `<span>` becomes a text `<input>` (seeded with `body`),
  and the due display becomes an `<input type="date">` (seeded with `dueDate`), with
  **Save** and **Cancel**. Save is disabled when the trimmed body is empty. Save →
  `editAction(body, dueDate || null)` inside the existing `useTransition`, then
  `editing = false`. Cancel → reset `body`/`dueDate` to props, `editing = false`.
- The done checkbox, owner select, and share toggle remain available (unchanged)
  when not editing; in edit mode the row shows the body/due inputs + Save/Cancel.

### 3. Wire it in the Tasks tab

In `src/app/(artisan)/projects/[id]/page.tsx`, import `updateTodo` and pass to each
`TaskRow`:

```tsx
editAction={updateTodo.bind(null, project.id, t.id)}
dueDate={t.due_date}
```

---

## Testing

- No new pure logic → no new unit tests (consistent with the codebase; the write is
  a thin RLS-gated Supabase update). Existing suite must stay green.
- **Live verification (Chrome MCP):** in the artisan project Tasks tab, click Edit on
  a task → change the body and the due date → Save → confirm the row updates and the
  change persists across reload; Cancel discards; an empty body can't be saved. Sort
  still reads soonest-first (unchanged).

## Rollout

- **No DB migration, no cutover.** Pure app code — normal PR → merge → deploy.
- Gates: `npm test` + `npm run build`.

## Resolved decisions

| Decision | Choice |
|---|---|
| Surface | Admin app only (portal deferred) |
| Who can edit | Any tenant staff (RLS `is_org_member`) |
| Editable fields | `body` + `due_date` |
| Owner / shared | Unchanged (existing controls) |
| Edit UI | Inline in `TaskRow` (Edit → inputs → Save/Cancel) |
| Dashboard task table | Stays read-only |
| Sort (#5) | Already implemented — no change |
