# Government and Other Contact Types — Design

_Date: 2026-08-17_

Contacts can be Partner, Prospect, Customer, or Rep. Construction work also involves
building departments, permit offices, inspectors, and utilities, plus the occasional
record that fits nothing else. This adds **Government** and **Other**.

## Goal

- Both new types are selectable when creating or editing a contact.
- Both can carry a Company, so an agency name has somewhere to live.
- Both filter in the contacts list like the existing types.
- Neither appears in the portal team roster or receives project-update notification
  emails.

## Decisions (settled)

- **Internal only — excluded from the portal roster and from notification emails.**
  These are staff-side records: inspectors, permit offices, utilities. Attaching one to
  a project must not publish a building inspector's contact details in the portal's
  "Your Project Team," and must not send them project-update emails. This requires **no
  work**: three existing filters already key off the same three-type list and so already
  exclude 'government' and 'other':
  - the `portal_project_team` RPC (`c.type in ('rep', 'partner', 'customer')`)
  - `groupProjectTeam`, which has exactly three buckets, ignoring everything else
  - `project_notification_recipients` (`supabase/migrations/20260723000003_notification_preferences.sql`),
    which filters `c.type in ('rep', 'partner', 'customer')` for the notifiable
    recipients of a project's update emails — previously undocumented and unverified as
    part of this exclusion, confirmed correct while writing this fix

  What changes is that the exclusion becomes **intentional** rather than incidental, so
  each site's comment/docstring should name the new types as deliberately excluded — it
  currently says "Rows of any other type (e.g. 'prospect') are ignored," which a future
  reader could easily mistake for an oversight once two more types exist. None of these
  three filters should be widened to include 'government' or 'other'.

  **This is not a portal access control.** Whether a contact's linked user can sign in
  and reach the portal for a project at all is governed separately by `project_contacts`
  membership (`contact_can_see_project()` in
  `supabase/migrations/20260602000002_rls.sql`), which does not check contact type — and
  `inviteContact` does not check type either. A Government or Other contact with a portal
  login (however that login came to exist) can still see everything the RLS `contact_read`
  policies expose; they are simply absent from the roster widget and the notification
  list. That exposure is pre-existing and identical for `prospect`; this change neither
  creates nor worsens it.
- **Company applies to Partner, Government, and Other.** A government contact without
  somewhere to put "City of Portland, Building Dept" forces the agency into the name
  field. Customer, Prospect, and Rep keep no Company — a customer is a person and a rep
  is the tenant's own staff. Because the new types never appear in the portal roster,
  `company` is a purely internal label for them, with none of the partner-grouping
  consequences.
- **One source of truth for the type list.** This is the substance of the change. The
  types are currently spelled out in five places and the company rule in three; adding
  two types by hand means editing eight sites and hoping none is missed. A missed
  allowlist would let the form offer a type the server silently rejects.

## Non-goals

- Showing these types in the portal, in any grouping.
- A per-type icon, colour, or sort order beyond what `TypeChip` already does.
- Migrating any existing contact to the new types.
- Changing who may attach a contact to a project or own a to-do.
- Any change to Customer, Prospect, Rep, or the partner-by-company portal grouping.

---

## Components

### 1. `src/lib/data/contactTypes.ts` — new, pure

`src/lib/data/contacts.ts` imports the server Supabase client, so it cannot be imported
by the client components that need this. Hence a separate pure module, matching the
repo's `portfolio.ts` / `projectTeam.ts` convention.

```ts
export type ContactType = "customer" | "partner" | "prospect" | "government" | "other";

/** Types a user can pick, in the order the form and filters present them. */
export const CONTACT_TYPES: { value: ContactType; label: string }[];

/** Types that carry a Company. `rep` is excluded — it is never user-selectable. */
export function typeHasCompany(type: string): boolean;

/** Whether a submitted string is a type a user may choose. Excludes `rep`. */
export function isSelectableContactType(type: string): boolean;
```

`rep` is deliberately **not** in `CONTACT_TYPES`: it is created only by `assignRep` as a
bridge row and must never appear in the type dropdown or be settable through the contact
form. `isSelectableContactType` is what both server actions validate against, so that
rule is enforced in one place rather than by two hand-written allowlists.

Order: Customer, Partner, Prospect, Government, Other — existing types keep their current
positions so nothing staff already know moves.

### 2. Migration — `supabase/migrations/20260817000001_contact_types_government_other.sql`

Drop and recreate `contacts_type_check` with the two new values, exactly as
`20260717000001_company_reps.sql` did when it added `rep`:

```sql
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep', 'government', 'other'));
```

No data migration — the constraint only widens, so every existing row stays valid.

### 3. `src/app/(artisan)/actions.ts` — both contact actions

`updateContact` and `createContact` each currently hard-code
`["partner", "prospect", "customer"].includes(type)` and
`company: type === "partner" ? … : null`. Both become `isSelectableContactType(type)` and
`typeHasCompany(type) ? … : null`.

Note this **widens what `updateContact` accepts** to include Government and Other — which
is the point — while still rejecting `rep`, as it does today.

### 4. `src/app/(artisan)/contacts/ContactForm.tsx`

The three hard-coded `<option>` elements become a map over `CONTACT_TYPES`. The company
field's `type === "partner"` gate becomes `typeHasCompany(type)`.

Switching a contact from Partner to Customer already clears the company server-side
(`typeHasCompany` returns false → `null`); the field simply stops rendering. That
behavior is unchanged, now covering the new types too.

### 5. `src/app/(artisan)/contacts/ContactList.tsx`

`TYPE_FILTERS` is currently a hand-written map of All / Partner / Prospect / Customer. It
becomes `All` plus a map over `CONTACT_TYPES`, so the filter chips and the form can never
disagree about which types exist.

### 6. `src/components/ui/Chip.tsx`

`ContactType` is currently declared here as `"partner" | "prospect" | "customer" | "rep"`.
It moves to `contactTypes.ts` — but `rep` must remain in the *chip's* accepted set, since
rep contacts do render a chip on the artisan project page. So `Chip.tsx` imports the type
and widens it locally to include `rep`, and `TYPE_STYLE` gains entries for the two new
values. `TypeChip` already falls back for an unknown style, so nothing breaks visually,
but the union must grow or `tsc` fails at the existing cast sites.

### 7. `src/lib/data/projectTeam.ts` — docstring only

Its comment says "Rows of any other type (e.g. 'prospect') are ignored." Extend it to name
`government` and `other` as **deliberately** excluded from the portal roster, citing this
decision, so the omission reads as intent rather than a gap.

---

## What already works, unchanged

- **Attaching to a project** — `project_contacts` does not filter by type.
- **Owning a to-do** — `owner_contact_id` accepts any project contact.
- **The dashboard contact count** — `.neq("type", "rep")`, so the new types count.
- **The attach dropdown** — `availableContacts` filters `c.type !== "rep"`.
- **The artisan attached-contacts list** — `partitionContacts` puts every non-rep in one
  bucket, and the row renders a `TypeChip` with the real type, so a Government contact
  shows there correctly labeled.

## Testing

Unit tests for `contactTypes.ts` in a new `src/lib/data/contactTypes.test.ts`:

- `CONTACT_TYPES` contains exactly the five selectable types, in the stated order, and
  does **not** contain `rep`
- `typeHasCompany` is true for partner, government, other; false for customer, prospect,
  rep, and an unknown string
- `isSelectableContactType` accepts all five, rejects `rep` and an unknown string

The actions and components are thin wiring over these and get no tests, per the repo's
convention.

Gates: `npx tsc --noEmit`, `npm test` (168 passing today), `npm run build`.

Manual verification:

- Create a Government contact with a Company; it saves and the chip reads "government".
- Create an Other contact; same.
- Switch a Government contact to Customer → the Company field disappears and the stored
  value is cleared.
- The contacts list filters by Government and by Other.
- Attach a Government contact to a project → it appears in the artisan attached list with
  the right chip, and is assignable as a to-do owner.
- Open that project in the customer portal → the Government contact does **not** appear in
  "Your Project Team".

## Risks

- **The migration must be applied before the deploy**, or picking either new type fails
  the CHECK and the form shows the raw Postgres error. Ship the migration first.
- **`ContactType` moving out of `Chip.tsx`** is the one place `tsc` will complain loudly
  if the `rep` widening is missed — deliberate, since a silent narrowing there would drop
  the rep chip on the project page.
