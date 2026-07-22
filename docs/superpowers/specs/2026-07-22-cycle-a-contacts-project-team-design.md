# Cycle A — Contacts & Project Team (Design)

_Date: 2026-07-22_

This cycle bundles two enhancements from `docs/enhancements-backlog.md` that share
the contacts model and the portal, built in dependency order:

1. **#4 — Company field on contacts** (foundational; built first)
2. **#1 — Portal "Your Project Team"** (consumes the company field)

They ship as **one cycle** but with a natural internal order: the company column
lands first so the new portal RPC can return `company` from day one, and partners
render under their firm without a retrofit.

## Goals

- Record which firm a **partner** contact belongs to.
- Replace the portal's rep-only "Your point of contact" card with a grouped
  **"Your Project Team"** roster covering everyone linked to the project.

## Non-goals

- No partner-org / company _entity_ — `company` is a plain text field on the
  contact, not a foreign key to a new table.
- No change to how reps are created/assigned (that shipped with Company Reps).
- No company field on the artisan **contact list** view (form + contact detail
  only). Deferred as YAGNI.

---

## Part 1 · #4 — Company field on contacts (partners-only)

### Data

- New migration: `alter table contacts add column company text;` (nullable, no
  constraint). Contacts live in `supabase/migrations/20260602000001_init.sql:42`.
- Regenerate `src/lib/supabase/database.types.ts` afterward.

### Form (`src/app/(artisan)/contacts/ContactForm.tsx`)

- The form is a `"use client"` component using `useActionState`; the `type` select
  is currently uncontrolled (`defaultValue`).
- Make `type` **controlled** via `useState` (seeded from `defaults?.type ?? "customer"`).
- Render a **Company** field (`<input name="company">`, `defaultValue` from
  `defaults?.company`) **only when the selected type is `partner`**.
- Add `company?: string | null` to the `Defaults` type.

### Write path (`src/app/(artisan)/actions.ts`)

- `createContact` (~L115) and `updateContact` (~L86): parse `company` from the form.
- **Persist rule:** write `company` only when `type === 'partner'`; otherwise write
  `null`. This prevents orphaned company data when a contact is switched away from
  partner. Concretely: `company: type === 'partner' ? orNull(str(fd, "company")) : null`.

### Reads

- Add `company` to the contact selects in `src/lib/data/contacts.ts` so the edit
  form round-trips it (the edit loader feeds `ContactForm` defaults).
- Show `company` on the artisan **contact detail** page (`contacts/[id]`) for
  partner contacts, so staff can see the firm.

---

## Part 2 · #1 — Portal "Your Project Team"

### New RPC — `portal_project_team(p_project uuid)`

Replaces `portal_project_reps`
(`supabase/migrations/20260717000001_company_reps.sql:36`; the only caller is
`src/lib/data/portal.ts:151`, so the old function is **dropped**).

- Returns `(name text, email text, type text, company text)`.
- Source: `project_contacts` joined to `contacts`, for `p_project`.
- Filter: `c.type in ('rep', 'partner', 'customer')` — `prospect` excluded.
- `SECURITY DEFINER`, `set search_path = public`, gated by the existing
  `public.contact_can_see_project(p_project)` guard, so the `contacts` table itself
  stays unreadable to portal users (same privacy posture as `portal_project_reps`).
- Name fallback mirrors the current RPC: coalesce trimmed
  `first_name + last_name` → `email` → a type-appropriate default.
- Includes the signed-in contact themselves (it is a team roster).
- `company` is only meaningful for `partner` rows; null elsewhere.

### Data layer (`src/lib/data/portal.ts`)

- `getPortalProject` calls `portal_project_team` instead of `portal_project_reps`
  and returns a grouped `team` shape in place of the flat `reps` array:

  ```ts
  type TeamPerson = { name: string; email: string | null };
  type PartnerGroup = { company: string | null; people: TeamPerson[] };
  type ProjectTeam = {
    tenant: TeamPerson[];       // type = 'rep'
    partners: PartnerGroup[];   // grouped by company, alpha-sorted
    customer: TeamPerson[];     // type = 'customer'
  };
  ```

- **Grouping is a pure function** (`groupProjectTeam(rows): ProjectTeam`) — the
  isolated, unit-tested unit. Rules:
  - Split rows by `type` into tenant / partners / customer.
  - Partners: group by `company`; sort companies alphabetically (case-insensitive).
  - Partners with no company (null/blank) collect into a single **trailing group
    with `company: null`** (rendered without a sub-header).
  - People within each group sorted by name.
- The customer-section label needs the org's `client_noun`. `getPortalContext`
  already computes `clientNoun` but does not return it — **add `clientNoun` to the
  `PortalContext` type and its return** (reusable, avoids a second org read), and
  the portal page passes it into `ProjectTeamCard`.

### UI (`src/app/(portal)/my-projects/[id]/page.tsx`)

- Replace the `{reps.length > 0 && (…)}` card block (lines 41–58) with a new
  `ProjectTeamCard` component under `src/components/portal/`.
- Heading: **"Your Project Team"**.
- Three sections, in order **Tenant → Partners → Customer**:
  - **Tenant** — header is the org name (e.g. "J Huber Restorations"); lists rep
    people as name + email (current rep-card row layout).
  - **Partners** — header "Partners"; nested by company sub-header, people under
    each as name + email; the no-company group renders its people directly with no
    sub-header.
  - **Customer** — header is the org's `client_noun` (e.g. "Customer"); lists
    customer people as name + email.
- **Privacy display:** name + email for everyone (matches the current rep card).
- Hide any section with no members; hide the whole card if the project has no
  linked contacts (same spirit as today's `reps.length > 0` guard).

---

## Testing

- **Unit** (Vitest): `groupProjectTeam` — tenant/partner-by-company/customer split;
  empty sections; partners with and without company; alphabetical company sort;
  name sort within groups.
- **Live verification** (Chrome MCP, mirrors the Company Reps adversarial pass):
  - A portal contact on a project sees the grouped team (tenant/partners/customer).
  - The same contact **cannot** read the `contacts` table directly (RPC is the only
    exposure; `contacts` has no portal RLS policy).
  - **Cross-org isolation:** a contact in org A cannot see any team member from a
    project in org B.

## Error handling

- `portal_project_team` returns empty for a project the contact can't see (the
  `contact_can_see_project` guard) → card hidden. No new error paths.

## Rollout

- Two migrations: (1) `contacts.company` column, (2) `portal_project_team` RPC +
  drop `portal_project_reps`. Regenerate `database.types.ts`.
- `npm test` and `npm run build` are the gates before merge.
- `supabase db push` only when the cycle is meant to ship.

## Resolved decisions

| Decision | Choice |
|---|---|
| Company field scope | **Partners only** (conditional in the form) |
| Company persisted for non-partners | **No** — nulled when type ≠ partner |
| Partner display in portal | **Sub-grouped by company** |
| No-company partners | Trailing group, no sub-header |
| Section order | **Tenant → Partners → Customer** |
| Customer section label | Org's `client_noun` |
| Include signed-in user | **Yes** (team roster) |
| Membership filter | All `project_contacts`, no login filter |
| Privacy | Name + email for everyone |
| Company on contact list view | Deferred (form + detail only) |
