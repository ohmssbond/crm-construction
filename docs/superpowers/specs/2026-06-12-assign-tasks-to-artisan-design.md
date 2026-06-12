# Assign tasks to the artisan

_Design spec · 2026-06-12_

## Goal

In the task owner dropdown (project Tasks tab), let a task be assigned to the
**artisan themselves**, not only to project contacts. The artisan appears as the
first option and is the default for new tasks.

## Decisions

| Question | Decision |
|----------|----------|
| Artisan vs "Unassigned" | The artisan **replaces** the "Unassigned" option. A task with no contact owner belongs to the artisan. |
| Which artisan | The **currently logged-in** artisan only (shown by name). Multiple team members are out of scope (depends on the planned team-member contact type). |
| New-task default owner | The artisan (the logged-in user). |

## Key insight — no schema change

`todos.owner_contact_id` is a nullable FK to `contacts`. The owner migration
(`20260611000003_task_owner_visibility.sql`) already defines
`owner_contact_id = null` as *"the artisan's side / unassigned."* So "the artisan
owns this task" maps directly onto the existing `null` owner.

This makes the enhancement purely presentational:

- "Assigned to the artisan" == `owner_contact_id` is `null` (unchanged storage).
- New tasks already initialise the owner to `null`, so "default to the artisan"
  needs no behavioural change — only the label changes.

No migration, no new column, no RLS change, no change to the `addTodo` /
`setTodoOwner` server actions, and no change to the data layer.

## Current state

- `src/app/(artisan)/projects/[id]/page.tsx` builds
  `taskContacts = contacts.map(...)` and passes it to `<TodoComposer>` and each
  `<TaskRow>`. It already has the logged-in artisan's identity via
  `ctx` (`getOrgContext()`), specifically `ctx.user.name`.
- `src/app/(artisan)/projects/[id]/TodoComposer.tsx` — owner `<select>` whose
  first entry is `<option value="">Unassigned</option>`, then one option per
  contact. Local `owner` state initialises to `""`.
- `src/app/(artisan)/projects/[id]/TaskRow.tsx` — owner `<select>` with the same
  `<option value="">Unassigned</option>` first entry, then contacts. Used per task
  row; a `null` owner renders as the blank/first option.
- The customer portal task list (`src/app/(portal)/my-projects/[id]/page.tsx`)
  does **not** display task owners.

## Changes

### 1. `TodoComposer.tsx`

- Add a prop `artisanLabel: string`.
- Change the first option's text from `Unassigned` to `{artisanLabel}`. Keep its
  `value=""` so submitting it stores `null` (i.e. the artisan).
- No change to the `owner` state default (`""`) — it already defaults to the
  artisan.

### 2. `TaskRow.tsx`

- Add a prop `artisanLabel: string`.
- Change the first option's text from `Unassigned` to `{artisanLabel}`. Keep its
  `value=""`. A task with `owner_contact_id === null` continues to render as this
  first option, now labelled as the artisan.

### 3. `page.tsx` (artisan project detail)

- Compute the artisan label from the org context, e.g.
  `const artisanLabel = `${ctx?.user.name ?? "Artisan"} (you)`;`
- Pass `artisanLabel={artisanLabel}` to `<TodoComposer>` and to each `<TaskRow>`.

The resulting dropdown order is: **{artisan name} (you)**, then each project
contact, with the artisan selected by default.

## What does not change

- Database schema, RLS policies, and the `addTodo` / `setTodoOwner` server actions.
- `src/lib/data/projects.ts` and the rest of the data layer.
- The customer portal: it shows no task owner, and artisan-owned (`null`, unshared)
  tasks remain internal exactly as today.

## Testing

No new logic is introduced (label + prop only), so there are no unit tests to add.
Verification:

- `npm run build` succeeds.
- Manual check on a project's Tasks tab:
  - The owner dropdown lists the artisan's name first, then contacts.
  - A new task defaults to the artisan and saves with a `null` `owner_contact_id`.
  - Assigning a task to a contact and back to the artisan persists correctly.

## Out of scope

- Multiple team members as assignable owners (needs the planned team-member
  contact type and a way to read other members' names).
- Any schema or migration work.
- Showing the task owner in the customer portal.
