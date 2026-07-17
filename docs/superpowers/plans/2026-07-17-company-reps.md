# Company Reps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contractor assign their own staff to a project as "Company Reps" — making them task-assignable and visible to the customer as a point of contact — by representing each staff member as a bridge `contacts` row (`type='rep'`).

**Architecture:** Reuse the existing `contacts` + `project_contacts` + `owner_contact_id` machinery (Approach A). A staff member (a `memberships` row) gets a lazily-created bridge `contacts` row (`type='rep'`) the first time they're assigned to any project; a normal `project_contacts` link attaches them per-project. Two `SECURITY DEFINER` helpers bridge the parts RLS can't reach: `org_crm_staff()` (staff roster + names from `auth.users`) and `portal_project_reps(uuid)` (rep name/email for a customer, without opening the `contacts` table to portal reads). No `todos` schema change; no auth-hook change.

**Tech Stack:** Next.js (App Router, Server Components + Server Actions — this repo's Next is modified; read `node_modules/next/dist/docs/` before writing app code), Supabase (Postgres + RLS), Tailwind v4 token theming, Vitest.

## Global Constraints

- **Next.js:** this is NOT stock Next — read the relevant guide in `node_modules/next/dist/docs/` before writing/altering any app code (per `AGENTS.md`).
- **Single discriminator:** a rep is exactly `contacts.type = 'rep'`. Reps are excluded from the customer contact picker (`availableContacts`), invite flows, and customer counts. They get their own panel and their own portal block.
- **Portal isolation (crown-jewel invariant):** the portal exposes **only** `name + email` of `type='rep'` rows, and **only** via `portal_project_reps(p_project)`, guarded by the existing `contact_can_see_project(...)`. **Do NOT add any RLS `SELECT` policy to the `contacts` table** — it must stay unreadable to portal contacts. Never expose phone. `todos.owner_contact_id` semantics are unchanged.
- **Login safety (verified — no change):** the current `custom_access_token_hook` (`supabase/migrations/20260615000002_drop_user_role_claim.sql:2-35`) reads `contacts` only in an `else` branch reached when the user has no membership. A staff member with a bridge contact still logs in with `org_id`+`roles` and **never** a `contact_id`. Do not modify the hook.
- **Bridge contact shape:** `type='rep'`, `user_id =` staff auth id, `first_name =` the staff `full_name` (store whole; `last_name` null — no name-splitting), `email =` staff email, `organization_id =` the org, `customer_id` null. Exactly one per staff member per org — `contacts.user_id` is already `UNIQUE`, which guards double-creation.
- **Name/email source:** staff display name/email come only from `org_crm_staff()` (which reads `auth.users` inside a `SECURITY DEFINER` function). Never read `auth.users` from a normal client.
- **Roster:** all CRM staff (`memberships` where `product='crm'`, roles `owner`/`artisan`) in the caller's org are eligible reps.
- **Migrations authored-not-applied until cutover (Task 6):** `supabase db push` writes prod. Hand-edit `database.types.ts` in Task 1 so `npm run build` stays green pre-push; the canonical `supabase gen types --linked` regen happens only in Task 6, after the push.
- **Removal reuses `detachContact`** (deletes the `project_contacts` link; the bridge row persists). Only one new server action is introduced: `assignRep`.
- **Testing:** pure helpers get Vitest coverage mirroring `src/lib/data/format.ts` test style. The repo has **no DB/RLS test harness** (suite is pure) — the SQL functions' correctness and isolation are verified by the live smoke check in Task 6. Gates: `npm test` + `npm run build` green before every commit/merge.

---

### Task 1: Migration + type wiring

Adds the `'rep'` contact type and the two `SECURITY DEFINER` helpers, and keeps the TypeScript build green by hand-editing generated types and the `ContactType` union. No unit test (schema/types only); the deliverable is verified by `npm run build`.

**Files:**
- Create: `supabase/migrations/20260717000001_company_reps.sql`
- Modify: `src/lib/supabase/database.types.ts:1202` (add two `Functions` entries)
- Modify: `src/components/ui/Chip.tsx:18-22` (`ContactType` union + `TypeChip` style map)

**Interfaces:**
- Produces (SQL): `org_crm_staff() → setof (user_id uuid, full_name text, email text)`; `portal_project_reps(p_project uuid) → setof (name text, email text)`.
- Produces (TS): `ContactType` now includes `"rep"`; `Database["public"]["Functions"]` includes both functions.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260717000001_company_reps.sql`:

```sql
-- Company Reps: represent staff as bridge contacts (type='rep') so they can be
-- assigned to projects/tasks and shown to customers as their point of contact.

-- 1. Allow the new contact type. The init.sql inline check auto-named the
--    constraint contacts_type_check; drop and recreate it with 'rep' added.
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep'));

-- 2. Staff roster for the CALLER's CRM org. Names/emails live in auth.users,
--    which RLS-scoped clients can't read; this SECURITY DEFINER function reads
--    them and returns rows only for the caller's own org (empty for non-CRM
--    callers, so it doubles as the staff-only guard).
create or replace function public.org_crm_staff()
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select distinct u.id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(u.email, '@', 1)),
         u.email::text
  from memberships me
  join memberships staff
    on staff.organization_id = me.organization_id
   and staff.product = 'crm'
  join auth.users u on u.id = staff.user_id
  where me.user_id = auth.uid()
    and me.product = 'crm';
$$;

grant execute on function public.org_crm_staff() to authenticated;

-- 3. Reps a portal customer may see on a project they can already see. Projects
--    ONLY name+email of type='rep' rows — the contacts table itself stays
--    unreadable to portal contacts (no new RLS policy). Guarded by the existing
--    project-visibility helper.
create or replace function public.portal_project_reps(p_project uuid)
returns table (name text, email text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                  c.email, 'Company Rep'),
         c.email::text
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  where pc.project_id = p_project
    and c.type = 'rep'
    and public.contact_can_see_project(p_project);
$$;

grant execute on function public.portal_project_reps(uuid) to authenticated;
```

- [ ] **Step 2: Hand-edit the generated types**

In `src/lib/supabase/database.types.ts`, inside the `public` schema `Functions:` block (ends at line 1203), add these two entries after the `is_tb_member` line (line 1202), keeping alphabetical order:

```ts
      org_crm_staff: { Args: never; Returns: { user_id: string; full_name: string; email: string }[] }
      portal_project_reps: { Args: { p_project: string }; Returns: { name: string; email: string | null }[] }
```

- [ ] **Step 3: Extend `ContactType` + `TypeChip`**

In `src/components/ui/Chip.tsx`, replace lines 18-22:

```tsx
export type ContactType = "partner" | "prospect" | "customer" | "rep";

const TYPE_STYLE: Record<ContactType, string> = {
  partner: "bg-proposal-soft text-proposal",
  prospect: "bg-proposal-soft text-proposal",
  customer: "bg-proposal-soft text-proposal",
  rep: "bg-signed-soft text-signed",
};

export function TypeChip({ type }: { type: ContactType }) {
  return (
    <span className={`${chipBase} ${TYPE_STYLE[type] ?? "bg-proposal-soft text-proposal"}`}>
      {type}
    </span>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: PASS (types compile; no consumers of the new columns/functions yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717000001_company_reps.sql src/lib/supabase/database.types.ts src/components/ui/Chip.tsx
git commit -m "feat(reps): add 'rep' contact type + org_crm_staff/portal_project_reps fns"
```

---

### Task 2: Pure rep helpers + tests

Two pure functions the loader will use, with full Vitest coverage. TDD.

**Files:**
- Create: `src/lib/data/reps.ts`
- Test: `src/lib/data/reps.test.ts`

**Interfaces:**
- Produces: `partitionContacts<T extends { type: string }>(contacts: T[]): { customers: T[]; reps: T[] }`; `availableStaff<S extends { user_id: string }, R extends { user_id: string | null }>(staff: S[], reps: R[]): S[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/reps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { partitionContacts, availableStaff } from "./reps";

describe("partitionContacts", () => {
  it("splits reps from everyone else by type", () => {
    const input = [
      { id: "a", type: "customer" },
      { id: "b", type: "rep" },
      { id: "c", type: "partner" },
      { id: "d", type: "rep" },
    ];
    const { customers, reps } = partitionContacts(input);
    expect(customers.map((c) => c.id)).toEqual(["a", "c"]);
    expect(reps.map((c) => c.id)).toEqual(["b", "d"]);
  });

  it("handles an empty list", () => {
    expect(partitionContacts([])).toEqual({ customers: [], reps: [] });
  });
});

describe("availableStaff", () => {
  const staff = [
    { user_id: "u1", full_name: "Doug", email: "doug@x.com" },
    { user_id: "u2", full_name: "Jesse", email: "jesse@x.com" },
  ];

  it("drops staff already assigned as a rep (matched by user_id)", () => {
    const reps = [{ id: "c1", user_id: "u2" }];
    expect(availableStaff(staff, reps).map((s) => s.user_id)).toEqual(["u1"]);
  });

  it("keeps all staff when none are reps yet", () => {
    expect(availableStaff(staff, []).map((s) => s.user_id)).toEqual(["u1", "u2"]);
  });

  it("ignores rep rows with a null user_id", () => {
    const reps = [{ id: "c1", user_id: null }];
    expect(availableStaff(staff, reps)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/reps.test.ts`
Expected: FAIL ("Failed to resolve import ./reps" / functions not defined).

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/reps.ts`:

```ts
/**
 * A Company Rep is a staff member surfaced as a bridge contact
 * (contacts.type = 'rep'). These helpers keep the rep/customer split pure and
 * testable; the loaders and UI consume them.
 */

/** Split a project's attached contacts into customers (everything else) vs reps. */
export function partitionContacts<T extends { type: string }>(
  contacts: T[]
): { customers: T[]; reps: T[] } {
  const customers: T[] = [];
  const reps: T[] = [];
  for (const c of contacts) {
    if (c.type === "rep") reps.push(c);
    else customers.push(c);
  }
  return { customers, reps };
}

/** Staff not yet assigned as a rep on this project (matched by user_id). */
export function availableStaff<
  S extends { user_id: string },
  R extends { user_id: string | null }
>(staff: S[], reps: R[]): S[] {
  const taken = new Set(reps.map((r) => r.user_id).filter(Boolean));
  return staff.filter((s) => !taken.has(s.user_id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/reps.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/reps.ts src/lib/data/reps.test.ts
git commit -m "feat(reps): pure partitionContacts + availableStaff helpers"
```

---

### Task 3: `RepPanel` client component

The contractor-side "Company Reps" panel, cloned from `ContactManager`. Not wired into a page yet (that's Task 4), so the build stays green with it as an unused export.

**Files:**
- Create: `src/app/(artisan)/projects/[id]/RepPanel.tsx`

**Interfaces:**
- Consumes: `Avatar`, `Card`, `ListRow`, `Note`, `EmptyState`, `Button`, `fieldInput`, `contactName`/`contactInitials` (existing).
- Produces: `RepPanel({ reps, availableStaff, assignAction, removeAction })` — `assignAction(userId)`, `removeAction(contactId)`.

- [ ] **Step 1: Write the component**

Create `src/app/(artisan)/projects/[id]/RepPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { Note } from "@/components/ui/Note";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { contactName, contactInitials } from "@/lib/data/format";

type Rep = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};
type Staff = { user_id: string; full_name: string; email: string };

export function RepPanel({
  reps,
  availableStaff,
  assignAction,
  removeAction,
}: {
  reps: Rep[];
  availableStaff: Staff[];
  assignAction: (userId: string) => Promise<void>;
  removeAction: (contactId: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState("");

  const assign = () => {
    if (!selected) return;
    start(async () => {
      await assignAction(selected);
      setSelected("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Note>
        Company Reps are your <strong>staff</strong> assigned to this project. They can be
        given tasks and are shown to the customer as their point of contact.
      </Note>

      {reps.length === 0 ? (
        <EmptyState glyph="👷" title="No reps assigned." />
      ) : (
        <Card>
          {reps.map((r) => {
            const name = contactName(r);
            return (
              <ListRow
                key={r.id}
                leading={<Avatar initials={contactInitials(name)} />}
                title={name}
                sub={r.email ?? undefined}
                meta={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => start(() => removeAction(r.id))}
                  >
                    Remove
                  </Button>
                }
              />
            );
          })}
        </Card>
      )}

      {availableStaff.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`${fieldInput} max-w-[280px]`}
          >
            <option value="">Assign a staff member…</option>
            {availableStaff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <Button variant="ghost" disabled={pending || !selected} onClick={assign}>
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: PASS (unused component compiles).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/RepPanel.tsx"
git commit -m "feat(reps): RepPanel contractor component"
```

---

### Task 4: Artisan integration (action + loader + page)

Wires the whole contractor side together in one green step: the `assignRep` server action, the `getProjectDetail` split, and the project page (RepPanel in the Contacts tab + reps included in the task-assignee picker). These are coupled — the page imports the new action, the new loader fields, and `RepPanel` — so they land together.

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts` (add `assignRep`)
- Modify: `src/lib/data/projects.ts:54-120` (`getProjectDetail`)
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `assignRep`, `detachContact`, `RepPanel`, `partitionContacts`/`availableStaff`, `org_crm_staff` RPC.
- Produces: `getProjectDetail` now returns `contacts` (customers only), `reps`, `availableContacts` (rep-excluded), `availableStaff`.

- [ ] **Step 1: Add the `assignRep` action**

In `src/app/(artisan)/projects/[id]/actions.ts`, add after `detachContact` (after line 254):

```ts
/**
 * Assign a staff member to this project as a Company Rep. Lazily creates one
 * bridge contact (type='rep') for the staff member — reused across projects —
 * then links it via project_contacts. Removal reuses detachContact.
 */
export async function assignRep(projectId: string, userId: string) {
  if (!userId) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // The roster is the source of truth for who is staff in this org.
  const { data: staff } = await supabase.rpc("org_crm_staff");
  const member = (staff ?? []).find((s) => s.user_id === userId);
  if (!member) return;

  // One bridge contact per staff member per org (contacts.user_id is UNIQUE).
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("user_id", userId)
    .maybeSingle();

  let contactId = existing?.id ?? null;
  if (!contactId) {
    const { data: created } = await supabase
      .from("contacts")
      .insert({
        organization_id: ctx.org.id,
        user_id: userId,
        type: "rep",
        first_name: member.full_name,
        email: member.email,
      })
      .select("id")
      .single();
    contactId = created?.id ?? null;
  }
  if (!contactId) return;

  // Idempotent on unique(project_id, contact_id).
  await supabase
    .from("project_contacts")
    .insert({ organization_id: ctx.org.id, project_id: projectId, contact_id: contactId });

  revalidatePath(`/projects/${projectId}`);
}
```

- [ ] **Step 2: Update `getProjectDetail`**

In `src/lib/data/projects.ts`:

(a) Add the import at the top (after line 3):

```ts
import { partitionContacts, availableStaff as computeAvailableStaff } from "./reps";
```

(b) Add `type` to the `allContacts` select (line 99): change

```ts
        .select("id, first_name, last_name, email")
```

to

```ts
        .select("id, first_name, last_name, email, type")
```

(c) Add the roster RPC to the `Promise.all` destructure (line 67) and array. Change the opening:

```ts
  const [updates, todos, projectContacts, attachments, fileCategories, allContacts, staff] =
    await Promise.all([
```

and add as the final array element (after the `allContacts` query, before the closing `]);` at line 102):

```ts
      supabase.rpc("org_crm_staff"),
```

(d) Replace the tail of the function (lines 104-119) with:

```ts
  const allAttached = (projectContacts.data ?? [])
    .map((pc) => one(pc.contact))
    .filter((c): c is NonNullable<typeof c> => c != null);
  const { customers: contacts, reps } = partitionContacts(allAttached);

  const attachedIds = new Set(allAttached.map((c) => c.id));
  const availableContacts = (allContacts.data ?? []).filter(
    (c) => c.type !== "rep" && !attachedIds.has(c.id)
  );
  const availableStaff = computeAvailableStaff(staff.data ?? [], reps);

  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    todos: todos.data ?? [],
    contacts,
    reps,
    availableContacts,
    availableStaff,
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    fileCategories: fileCategories.data ?? [],
  };
```

- [ ] **Step 3: Wire the page**

In `src/app/(artisan)/projects/[id]/page.tsx`:

(a) Import `RepPanel` (after line 24) and `assignRep` (in the actions import block, lines 29-43):

```tsx
import { RepPanel } from "./RepPanel";
```
and add `assignRep,` to the `from "./actions"` import list.

(b) Destructure the new loader fields (line 66):

```tsx
  const { project, updates, todos, contacts, reps, availableContacts, availableStaff, attachments, fileCategories } =
    detail;
```

(c) Include reps in the task-assignee picker (line 69):

```tsx
  const taskContacts = [...contacts, ...reps].map((c) => ({ id: c.id, name: contactName(c) }));
```

(d) Replace the `Contacts` tab content (lines 226-234) so both panels show:

```tsx
          {
            label: "Contacts",
            content: (
              <div className="flex flex-col gap-5">
                <ContactManager
                  attached={contacts}
                  available={availableContacts}
                  attachAction={attachContact.bind(null, project.id)}
                  detachAction={detachContact.bind(null, project.id)}
                />
                <RepPanel
                  reps={reps}
                  availableStaff={availableStaff}
                  assignAction={assignRep.bind(null, project.id)}
                  removeAction={detachContact.bind(null, project.id)}
                />
              </div>
            ),
          },
```

- [ ] **Step 4: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS. Manually confirm no type errors on the `reps`/`availableStaff` fields.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts" src/lib/data/projects.ts "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(reps): assign staff as reps + include reps in task assignee picker"
```

---

### Task 5: Portal display (customer-facing)

Surfaces assigned reps to the customer via `portal_project_reps`, rendered as a "Your point of contact" card.

**Files:**
- Modify: `src/lib/data/portal.ts:105-183` (`getPortalProject`)
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `portal_project_reps` RPC, `Avatar`, `monogram`.
- Produces: `getPortalProject` now returns `reps: { name: string; email: string | null }[]`.

- [ ] **Step 1: Load reps in `getPortalProject`**

In `src/lib/data/portal.ts`, add the RPC to the existing `Promise.all` (lines 117-145). Change the destructure line 117:

```ts
  const [updates, attachments, tasks, org, repRows] = await Promise.all([
```

and add as the final array element (after the `organizations` query, before the closing `]);` at line 145):

```ts
    supabase.rpc("portal_project_reps", { p_project: id }),
```

Then add `reps` to the returned object (inside the `return {` block, e.g. after `updates: shapedUpdates,`):

```ts
    reps: repRows.data ?? [],
```

- [ ] **Step 2: Render the rep card**

In `src/app/(portal)/my-projects/[id]/page.tsx`:

(a) Add imports (after line 10):

```tsx
import { Avatar } from "@/components/ui/Avatar";
import { monogram } from "@/lib/data/format";
```

Also merge `monogram` into the existing `format` import if preferred — either is fine as long as it resolves.

(b) Add `reps` to the destructure (line 21):

```tsx
  const { project, status, hero, before, after, beforeAfter, gallery, files, updates, tasks, timezone, reps } =
    detail;
```

(c) Render the block right after `<ProjectHero … />` (after line 26):

```tsx
      {reps.length > 0 && (
        <Card>
          <div className="p-4 flex flex-col gap-3">
            <span className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
              Your point of contact
            </span>
            {reps.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <Avatar initials={monogram(r.name)} />
                <div className="flex flex-col">
                  <span className="text-body font-semibold">{r.name}</span>
                  {r.email && <span className="text-meta text-faint">{r.email}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
```

(`Card` is already imported at line 3.)

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/portal.ts "src/app/(portal)/my-projects/[id]/page.tsx"
git commit -m "feat(reps): show assigned reps as 'Your point of contact' in the portal"
```

---

### Task 6: Cutover & live verification

Applies the migration to prod, regenerates canonical types, and verifies end-to-end in the live browser. **This task writes the production DB — treat `supabase db push` as a deliberate, confirmed action.**

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (replaced by canonical regen)

- [ ] **Step 1: Final gates**

Run: `npm test && npm run build`
Expected: PASS (full suite green).

- [ ] **Step 2: Apply the migration to prod**

Run: `supabase db push`
Expected: applies `20260717000001_company_reps.sql`. Confirm with `supabase migration list` (local ↔ remote in sync).

- [ ] **Step 3: Regenerate canonical types**

Run: `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Then `npm run build` — expected PASS. This replaces the Task 1 hand-edit with the real generated definitions (the two functions should now be present identically). Commit if the file changed:

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(reps): regenerate database types after db push"
```

- [ ] **Step 4: Live smoke (needs /chrome)**

As a **contractor** (e.g. J Huber, `doug@jhuberrestorations.com`):
- Open a project → Contacts tab → **Company Reps** panel → assign Jesse (and/or Doug). Confirm the assigned list shows name + email and the staff dropdown no longer offers them.
- Tasks tab → the task-assignee picker now offers the rep(s); assign a task to Jesse and confirm it persists.

As the **customer** (a portal contact on that project):
- Open the project in the portal → confirm the **"Your point of contact"** card shows the assigned rep(s) (name + email), and that a project with **no** reps assigned shows **no** card.

**Isolation checks:**
- Confirm the customer's portal never lists staff who aren't assigned to *their* project (a rep on project A must not appear on project B's portal page).
- Confirm the assigned staff member still signs in as **staff** (full org access), not as a portal customer.

- [ ] **Step 5: Update the ledger and finish**

Record the ship in `.superpowers/sdd/progress.md` and proceed to `superpowers:finishing-a-development-branch`.

---

## Self-review notes

- **Spec coverage:** contact-type change (T1), both SECURITY DEFINER helpers (T1), pure split logic + tests (T2), reps panel (T3), assignRep + loader split + task-picker inclusion (T4), portal display (T5), migration/regen/live-verify incl. isolation (T6). All spec sections mapped.
- **Type consistency:** loader returns `contacts` (customers), `reps`, `availableContacts`, `availableStaff`; `RepPanel` consumes `reps`/`availableStaff`; `assignRep(projectId, userId)` and `detachContact(projectId, contactId)` match the panel's `assignAction`/`removeAction` after `.bind`.
- **Known deviation from spec:** the spec's authz assertions (`portal_project_reps` returns only reps; `assignRep` rejects non-staff) are covered by the **Task 6 live smoke**, not Vitest, because the repo has no DB/RLS test harness. Pure logic is unit-tested in Task 2.
- **Edge behavior:** removing a rep unlinks only (bridge persists; any already-assigned tasks keep pointing at the bridge contact). A `user_id` that already owns a non-rep contact row is reused, not duplicated (the `assignRep` existing-lookup is by `(org, user_id)`; `contacts.user_id` is UNIQUE).
```
