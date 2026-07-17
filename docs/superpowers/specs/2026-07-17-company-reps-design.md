# Design: Company Reps — assignable, customer-visible staff on a project

**Date:** 2026-07-17
**Status:** Design — pending user review
**Scope approach:** A (one cohesive spec, built bottom-up in dependency order)

---

## Problem

The app has **two disjoint populations of people**:

- **Staff** — rows in `memberships` (`supabase/migrations/20260615000001_unify_memberships.sql:8-21`), keyed by `auth.users` `user_id`, CRM roles `owner` / `artisan`. Org owners already see every project in the org via the `is_org_member` RLS policies.
- **Contacts** — rows in `contacts` (`supabase/migrations/20260602000001_init.sql:42-54`), `type ∈ (partner, prospect, customer)`, linked to a project through `project_contacts`. These are the portal-login population.

Task assignment (`todos.owner_contact_id`, added in `20260611000003_task_owner_visibility.sql:8-11`) is a **foreign key to `contacts(id)`**. A task can therefore only be pointed at a contact, plus an implicit "you = the acting artisan" represented by `owner_contact_id = null`.

**The gap:** a staff member (e.g. `jesse@jhuberrestorations.com`, an org `owner`) has **no `contacts` row**, so there is no value the system can store to mean "assigned to Jesse." `doug@jhuberrestorations.com` cannot assign him a task. The `null` = "you" option cannot even distinguish *which* staff member.

## Goal

Introduce **Company Reps**: a staff member can be assigned to a specific project as a rep. Once assigned, they (a) become selectable as a task assignee and (b) are shown to the customer in the portal as their point of contact. Staff keep logging in as staff — no portal-customer privileges.

## Decisions locked during brainstorming

1. **Customer-visible.** Reps show in the portal as the customer's point of contact (name + email).
2. **Manual, per-project.** An admin assigns reps to a project from a staff roster (like adding a customer contact today). No auto-attach. The customer sees only reps assigned to *their* project.
3. **Roster = all CRM staff.** Every `owner` / `artisan` in the org is eligible; the roster maintains itself. (A curated subset is a future option, out of scope.)
4. **Label.** Customer-facing label is **"Company Rep."** The stored DB value is the neutral `type = 'rep'` so the wording can change without a data migration.
5. **Approach A — reuse `contacts`.** A rep is represented by a bridge `contacts` row (`type = 'rep'`) linked via the existing `project_contacts` join, so the existing portal-display, task-picker, and `owner_contact_id` machinery all apply. Chosen over a first-class `project_reps` + `todos.owner_user_id` model because it adds the *least* net-new portal-facing RLS in an app whose core invariant is portal isolation, and reuses already-verified paths.

---

## Section 1 — Data model & the bridge mechanism

**One schema change:** add `'rep'` to the `contacts.type` CHECK constraint.

- Current constraint (`20260602000001_init.sql:51`): `type text not null check (type in ('partner', 'prospect', 'customer'))`. Never altered since. The migration must **drop and recreate** this CHECK to add `'rep'`.
- Mirror in TypeScript: `src/components/ui/Chip.tsx:18` — `export type ContactType = "partner" | "prospect" | "customer";` — add `"rep"`, and add a `TypeChip` style branch for it.

**The bridge contact (lazy creation).** A staff member normally exists only as a `memberships` row. The first time an admin assigns that staff member as a rep on **any** project, the system **upserts one bridge `contacts` row** for them in the org:

- `type = 'rep'`
- `user_id =` the staff member's `auth.users` id
- `organization_id =` the org
- `first_name =` the staff member's `full_name` (stored whole; `last_name` left null — no name-splitting)
- `email =` the staff member's `auth.users` email
- `customer_id = null`

One bridge row per staff member per org, reused across every project they rep. `contacts.user_id` is already `UNIQUE` (`init.sql:46`), which naturally enforces "at most one bridge per staff member" and guards against double-creation.

**Per-project link:** a normal `project_contacts` row (`init.sql:70-77`) joins the bridge contact to the project. Assigning = insert the link; un-assigning = delete the link (the bridge row persists for reuse).

**Task assignment falls out for free.** Because a rep is a `contacts` row linked via `project_contacts`, they automatically enter the existing task-assignee list, and `todos.owner_contact_id` already references `contacts`. **No change to the `todos` schema.**

---

## Section 2 — Login safety & read paths

### Login safety — verified, no auth change required

The authoritative `custom_access_token_hook` is in `supabase/migrations/20260615000002_drop_user_role_claim.sql:2-35` (it supersedes the `20260615000001` version). It resolves claims with an **if/else**:

```sql
select m.organization_id, jsonb_object_agg(m.product, m.role)
  into v_org, v_roles
from public.memberships m
where m.user_id = uid
group by m.organization_id
limit 1;

if v_org is not null then
  -- staff: set org_id + roles
else
  -- ONLY here: select from contacts by user_id, set org_id + contact_id
end if;
```

`contacts` is queried **only in the `else` branch**, reached only when the user has **no** membership. A staff member who also has a bridge contact takes the `if` branch and is issued `org_id` + `roles` but **never** a `contact_id`. Since portal access is gated on `current_contact_id()` (which reads the `contact_id` claim), a rep can never gain portal-customer access. **No hook change is needed**; this is verified against the current definition.

### Reading staff names — `org_crm_staff()` helper

There is **no `profiles` table**; a staff member's display name lives only in `auth.users.user_metadata.full_name` (see `src/lib/data/org.ts:61,99`), and email in `auth.users.email`. Normal RLS-scoped PostgREST clients cannot read `auth.users`.

Add a `SECURITY DEFINER` SQL function **`org_crm_staff()`** returning `(user_id uuid, full_name text, email text)` for the **caller's org** CRM staff (`memberships` where `product = 'crm'`), joined to `auth.users`. Guard: the function returns rows only for the caller's own org (derive the org from the caller's membership; return empty if the caller is not an org member). It powers:

- the rep-picker roster (contractor UI), and
- the name/email written into a bridge contact at assignment time (so `assignRep` needs no service-role client).

### Showing reps to customers — `portal_project_reps()` helper, not a broad policy

Today a portal contact **cannot read the `contacts` table at all** — there is no `contact_read` policy on `contacts` (the only policy is `artisan_all`, `20260602000002_rls.sql:69-70`; the file documents the intentional omission at lines 117-118). This is a deliberate isolation boundary and we keep it.

Rather than add a new RLS policy to `contacts` (which risks leaking other customers/partners on the project), add a second `SECURITY DEFINER` function **`portal_project_reps(p_project uuid)`** returning `(name text, email text)` for `type = 'rep'` contacts linked to that project, **only if** the caller can see the project (reuse the existing `contact_can_see_project(...)` guard used elsewhere in portal RLS). The function projects **only name + email** and filters strictly to `type = 'rep'`. The `contacts` table stays unreadable to customers — defense in depth.

### Keeping reps out of customer surfaces

`type = 'rep'` must be filtered **out** of:

- the customer contact list / `ContactManager` (`src/app/(artisan)/projects/[id]/ContactManager.tsx`),
- the "invite to portal" flow (reps are staff; never invited as customers),
- any customer counts/lists.

Concretely, `getProjectDetail` (`src/lib/data/projects.ts:54-120`) splits a project's attached contacts into **customers** (`type != 'rep'`) and **reps** (`type = 'rep'`), and `availableContacts` (the customer picker source) excludes `type = 'rep'`.

---

## Section 3 — Contractor-side UI

A new **"Company Reps" panel** on the artisan project page, cloned from `ContactManager.tsx`:

- **Roster picker** — a `<select>` of the org's CRM staff (from `org_crm_staff()`) not already assigned as a rep on this project, plus an **Assign** button → `assignRep(projectId, userId)`.
- **Assigned list** — each rep's name + email with a **Remove** button → `removeRep(projectId, repContactId)`.

**Server actions** (in `src/app/(artisan)/projects/[id]/actions.ts`, mirroring `attachContact`/`detachContact` at lines 233-254, all under the existing `artisan_all` RLS scope):

- `assignRep(projectId: string, userId: string)`:
  1. Verify `userId` is a CRM staff member of `ctx.org` (via `org_crm_staff()` / a membership check). Reject otherwise.
  2. Upsert the bridge contact: find `contacts` where `organization_id = ctx.org.id AND user_id = userId AND type = 'rep'`; if absent, insert it with the fields from Section 1 (name/email from `org_crm_staff()`).
  3. Insert the `project_contacts` link `{ organization_id, project_id, contact_id }` (idempotent on the existing `unique (project_id, contact_id)`).
- `removeRep(projectId: string, repContactId: string)`: delete the `project_contacts` row for `(project_id, repContactId)`. The bridge contact row persists.

**Data loader** (`getProjectDetail`): return `reps` (attached `type='rep'` contacts) and `availableStaff` (`org_crm_staff()` minus already-assigned reps) alongside the existing customer `contacts`/`availableContacts`. The **task-assignee list keeps receiving both** customers and reps (`page.tsx:69` `taskContacts` is built from all attached contacts), so a rep is selectable as a task owner immediately.

---

## Section 4 — Portal display (customer-facing)

A **"Your point of contact" block** on the portal project detail page (`src/app/(portal)/my-projects/[id]/page.tsx`).

- `getPortalProject` (`src/lib/data/portal.ts:105-183`) calls `portal_project_reps(project.id)` → `[{ name, email }]` and returns it as `reps`.
- The page renders a small card near the hero listing each rep's name + email, styled to the tenant accent like the rest of the portal (`getPortalContext`).
- **No reps assigned → block hidden**, consistent with the portal's other empty states.
- Exposes **name + email only** — not phone.

---

## Section 5 — Testing, migration, scope

### Testing (Vitest + RLS/authz)

Pure / unit:
- `getProjectDetail` splits attached contacts into customers (`type != 'rep'`) vs reps (`type = 'rep'`); `availableContacts` excludes reps.
- The task-assignee list includes reps.

Authz / isolation:
- `portal_project_reps` returns **only** `type = 'rep'` rows (never customers/partners) and **only** for a project the caller can see; a customer of project X gets no reps from project Y.
- `contacts` remains directly unreadable by a portal contact (no new policy widened it).
- `assignRep` rejects a `userId` that is not CRM staff of the caller's org (non-staff, cross-org).
- Regression: a staff user who is also a bridge contact still logs in with `org_id` + `roles` and **no** `contact_id` claim (documented invariant; assert the hook branch if a hook test harness exists, else cover via the `assignRep`/login note).

Gates: `npm test` + `npm run build` green before merge.

### Migration & rollout

- One migration under `supabase/migrations/` that: (a) drops/recreates the `contacts.type` CHECK to add `'rep'`; (b) creates `org_crm_staff()` and `portal_project_reps(uuid)` as `SECURITY DEFINER` with appropriate `grant execute`. Authored-not-applied until cutover.
- Regenerate `database.types.ts` after `supabase db push` (canonical `--linked` regen reads remote, so it must follow the push — same ordering lesson as the photo-portfolio plan).
- Purely additive — no backfill. Existing projects simply have zero reps until assigned.

### Out of scope (future)

- A staff cross-project "my tasks" view (would map `user_id → bridge contact_id`).
- Showing task-owner names in the customer's portal Tasks tab.
- A curated rep roster (brainstorm Q3 option B).
- Editing a rep's name/email (derives from their staff identity).

### Edge notes

- **Removing a rep** deletes the project link only; any tasks already assigned to them (`owner_contact_id`) remain intact — the customer just stops seeing them as a contact.
- **A user already a customer-contact** (a `user_id` that already owns a `contacts` row) won't be double-created — `contacts.user_id UNIQUE` guards it; `assignRep` reuses/does not duplicate. This is vanishingly rare (staff and customers are disjoint populations today).
- **Phone** is never exposed to customers; only name + email.
