# Assign Tasks To The Artisan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the logged-in artisan the first, default option in the task owner dropdown (replacing the "Unassigned" label), in both the new-task composer and the per-task row.

**Architecture:** Purely presentational. `todos.owner_contact_id = null` already means "the artisan's side," so the artisan owner maps onto the existing `null` value. The change adds an `artisanLabel` prop to two client components and relabels their blank (`value=""`) owner option; the parent page supplies the label from `getOrgContext()`. No migration, no server-action or data-layer change.

**Tech Stack:** Next.js 16 (App Router, React Server + Client Components), TypeScript.

---

## File Structure

All three files change together in a single commit (the new prop is required, so the build only stays green once the page passes it):

- **Modify** `src/app/(artisan)/projects/[id]/TodoComposer.tsx` — add `artisanLabel` prop; relabel the `value=""` owner option.
- **Modify** `src/app/(artisan)/projects/[id]/TaskRow.tsx` — add `artisanLabel` prop; relabel the `value=""` owner option.
- **Modify** `src/app/(artisan)/projects/[id]/page.tsx` — compute the label from `ctx.user.name` and pass it to both components.

No tests: the change introduces no new logic (label + prop only). Verification is via `npm run build`.

---

## Task 1: Artisan as the default task owner option

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/TodoComposer.tsx`
- Modify: `src/app/(artisan)/projects/[id]/TaskRow.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`

- [ ] **Step 1: Add `artisanLabel` to `TodoComposer` and relabel its option**

In `src/app/(artisan)/projects/[id]/TodoComposer.tsx`:

Change the component signature. Find:

```tsx
export function TodoComposer({
  action,
  contacts,
}: {
  action: (
    body: string,
    due: string | null,
    owner: string | null,
    shared: boolean
  ) => Promise<void>;
  contacts: { id: string; name: string }[];
}) {
```

Replace with:

```tsx
export function TodoComposer({
  action,
  contacts,
  artisanLabel,
}: {
  action: (
    body: string,
    due: string | null,
    owner: string | null,
    shared: boolean
  ) => Promise<void>;
  contacts: { id: string; name: string }[];
  artisanLabel: string;
}) {
```

Then find the owner option:

```tsx
        <option value="">Unassigned</option>
```

Replace with:

```tsx
        <option value="">{artisanLabel}</option>
```

(Leave the `owner` state default of `""` as-is — it already defaults to the artisan.)

- [ ] **Step 2: Add `artisanLabel` to `TaskRow` and relabel its option**

In `src/app/(artisan)/projects/[id]/TaskRow.tsx`:

Change the component signature. Find:

```tsx
export function TaskRow({
  text,
  due,
  done: doneDefault,
  completed,
  owner: ownerDefault,
  shared,
  contacts,
  toggleAction,
  ownerAction,
  shareAction,
}: {
  text: string;
  due?: string;
  done: boolean;
  completed?: string;
  owner: string | null;
  shared: boolean;
  contacts: { id: string; name: string }[];
  toggleAction: (done: boolean) => Promise<void>;
  ownerAction: (owner: string | null) => Promise<void>;
  shareAction: (shared: boolean) => Promise<void>;
}) {
```

Replace with:

```tsx
export function TaskRow({
  text,
  due,
  done: doneDefault,
  completed,
  owner: ownerDefault,
  shared,
  contacts,
  artisanLabel,
  toggleAction,
  ownerAction,
  shareAction,
}: {
  text: string;
  due?: string;
  done: boolean;
  completed?: string;
  owner: string | null;
  shared: boolean;
  contacts: { id: string; name: string }[];
  artisanLabel: string;
  toggleAction: (done: boolean) => Promise<void>;
  ownerAction: (owner: string | null) => Promise<void>;
  shareAction: (shared: boolean) => Promise<void>;
}) {
```

Then find the owner option:

```tsx
        <option value="">Unassigned</option>
```

Replace with:

```tsx
        <option value="">{artisanLabel}</option>
```

- [ ] **Step 3: Compute the label in `page.tsx` and pass it to both components**

In `src/app/(artisan)/projects/[id]/page.tsx`:

Find:

```tsx
  const taskContacts = contacts.map((c) => ({ id: c.id, name: contactName(c) }));
```

Add a line directly below it:

```tsx
  const artisanLabel = `${ctx?.user.name ?? "Artisan"} (you)`;
```

Find:

```tsx
                <TodoComposer action={addTodo.bind(null, project.id)} contacts={taskContacts} />
```

Replace with:

```tsx
                <TodoComposer
                  action={addTodo.bind(null, project.id)}
                  contacts={taskContacts}
                  artisanLabel={artisanLabel}
                />
```

Find (inside the `todos.map(...)` `<TaskRow ... />`):

```tsx
                        owner={t.owner_contact_id}
                        shared={t.is_shared}
                        contacts={taskContacts}
                        toggleAction={toggleTodo.bind(null, project.id, t.id)}
```

Replace with:

```tsx
                        owner={t.owner_contact_id}
                        shared={t.is_shared}
                        contacts={taskContacts}
                        artisanLabel={artisanLabel}
                        toggleAction={toggleTodo.bind(null, project.id, t.id)}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (all `<TodoComposer>`/`<TaskRow>` usages now supply the required `artisanLabel` prop).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/TodoComposer.tsx" "src/app/(artisan)/projects/[id]/TaskRow.tsx" "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Assign tasks to the artisan (relabel null owner option)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Final verification

- [ ] **Step 1: Run the test suite (unchanged, should still pass)**

Run: `npm test`
Expected: existing tests pass (5/5 from the files-grouping helper); no new tests.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds; all routes compile.

- [ ] **Step 3: Manual smoke check (recommended)**

Run `npm run dev`, open a project's Tasks tab as the artisan and confirm:
- The owner dropdown lists the artisan's name (`"<name> (you)"`) first, then each project contact.
- A new task defaults to the artisan and saves (it persists with a `null` `owner_contact_id`).
- Re-assigning an existing task to a contact and back to the artisan persists across reload.

---

## Notes for the implementer

- `ctx` is the result of `getOrgContext()`, already awaited near the top of `page.tsx` (`const [detail, ctx] = await Promise.all([...])`). `ctx?.user.name` falls back through display-name → email-prefix → "Account" inside `getOrgContext`, so the `?? "Artisan"` only guards the rare null-context case.
- The owner option keeps `value=""`, so selecting the artisan stores `null` via the existing `addTodo` / `setTodoOwner` actions — no action or schema change.
- Do not touch the customer portal task list; it does not display owners and is unaffected.
