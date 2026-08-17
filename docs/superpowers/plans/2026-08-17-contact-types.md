# Government and Other Contact Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Government** and **Other** as contact types — selectable, filterable, Company-bearing, and never visible in the customer portal.

**Architecture:** A migration widens the `contacts_type_check` constraint. A new pure module becomes the single source of truth for the type list and the Company rule, replacing five hand-written type lists and three copies of `type === "partner"`. Everything else is wiring.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), Supabase Postgres, TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-08-17-contact-types-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **The new types are INTERNAL ONLY and must never reach the customer portal.** This requires no work — `portal_project_team`'s `c.type in ('rep','partner','customer')` filter and `groupProjectTeam`'s three buckets already exclude them. Do **not** "fix" either to include the new types. The only change there is a docstring making the exclusion read as intent.
- **`rep` is never user-selectable.** It exists only as a bridge row created by `assignRep`. It must not appear in the type dropdown, the filter chips, or the set either server action accepts — exactly as today.
- **Company applies to Partner, Government, and Other**; not Customer, Prospect, or Rep.
- **`src/lib/data/contacts.ts` imports the server Supabase client**, so it cannot hold anything a client component imports. The new module must be separate and pure — no imports of `@/lib/supabase/server`.
- **`Chip.tsx` must keep EXPORTING `ContactType`.** Three files import it from there (`ContactManager.tsx`, `contacts/[id]/page.tsx`, `ContactList.tsx`) and each does `c.type as ContactType`. Widening the union at its source is transparent to them; removing the export from `Chip.tsx` would break all three.
- **Never run `supabase db push`** — the migration ships in a separate, deliberate step. `--dry-run` is read-only and fine.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (168 passing today). `npm run build` before the final task is called done.

---

### Task 1: Widen the type constraint

**Files:**
- Create: `supabase/migrations/20260817000001_contact_types_government_other.sql`

**Interfaces:**
- Consumes: the existing `contacts_type_check` constraint.
- Produces: `contacts.type` additionally accepts `'government'` and `'other'`.

- [ ] **Step 1: Read the precedent**

Run: `cat supabase/migrations/20260717000001_company_reps.sql | head -12`

Expected: the drop/recreate of `contacts_type_check` that added `'rep'`, with a comment explaining that the inline check from `init.sql` auto-named the constraint. Your migration mirrors it.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260817000001_contact_types_government_other.sql`:

```sql
-- Two more contact types: Government (building departments, permit offices,
-- inspectors, utilities) and Other (the catch-all).
--
-- INTERNAL ONLY BY DESIGN: neither reaches the customer portal. portal_project_team
-- filters `c.type in ('rep','partner','customer')` and groupProjectTeam has three
-- buckets, so both already exclude these — deliberately, so a building inspector's
-- details are never published to a homeowner. Do not widen either to match this list.
--
-- The constraint only widens, so every existing row stays valid; no data migration.
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep', 'government', 'other'));
```

- [ ] **Step 3: Verify it parses and is pending — WITHOUT applying it**

Run: `supabase db push --dry-run`

Expected: the output lists `20260817000001_contact_types_government_other.sql` as a migration that *would* be applied. Nothing is written. **Do not run `supabase db push` without `--dry-run`** — applying to production is a separate, explicitly confirmed step at ship time.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260817000001_contact_types_government_other.sql
git commit -m "feat(contacts): allow government and other contact types"
```

---

### Task 2: `contactTypes.ts` — the single source of truth

**Files:**
- Create: `src/lib/data/contactTypes.ts`
- Create: `src/lib/data/contactTypes.test.ts`

**Interfaces:**
- Consumes: nothing. This module must stay pure — no imports at all.
- Produces — Task 3 depends on these exact names:
  - `type SelectableContactType = "customer" | "partner" | "prospect" | "government" | "other"`
  - `CONTACT_TYPES: { value: SelectableContactType; label: string }[]`
  - `typeHasCompany(type: string): boolean`
  - `isSelectableContactType(type: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/contactTypes.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  CONTACT_TYPES,
  typeHasCompany,
  isSelectableContactType,
} from "./contactTypes";

describe("CONTACT_TYPES", () => {
  test("lists the five selectable types in presentation order", () => {
    expect(CONTACT_TYPES.map((t) => t.value)).toEqual([
      "customer",
      "partner",
      "prospect",
      "government",
      "other",
    ]);
  });

  test("never offers rep — it is a bridge row created only by assignRep", () => {
    expect(CONTACT_TYPES.some((t) => t.value === "rep")).toBe(false);
  });

  test("gives every type a human label", () => {
    expect(CONTACT_TYPES.map((t) => t.label)).toEqual([
      "Customer",
      "Partner",
      "Prospect",
      "Government",
      "Other",
    ]);
  });
});

describe("typeHasCompany", () => {
  test("is true for the organizational types", () => {
    expect(typeHasCompany("partner")).toBe(true);
    expect(typeHasCompany("government")).toBe(true);
    expect(typeHasCompany("other")).toBe(true);
  });

  test("is false for people and for the tenant's own staff", () => {
    expect(typeHasCompany("customer")).toBe(false);
    expect(typeHasCompany("prospect")).toBe(false);
    expect(typeHasCompany("rep")).toBe(false);
  });

  test("is false for an unknown string", () => {
    expect(typeHasCompany("")).toBe(false);
    expect(typeHasCompany("nonsense")).toBe(false);
  });
});

describe("isSelectableContactType", () => {
  test("accepts every type the form offers", () => {
    for (const t of CONTACT_TYPES) {
      expect(isSelectableContactType(t.value)).toBe(true);
    }
  });

  test("rejects rep, so the contact form can never set one", () => {
    expect(isSelectableContactType("rep")).toBe(false);
  });

  test("rejects unknown strings", () => {
    expect(isSelectableContactType("")).toBe(false);
    expect(isSelectableContactType("admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/contactTypes.test.ts`

Expected: FAIL — cannot resolve `./contactTypes` (the module does not exist yet).

- [ ] **Step 3: Implement**

Create `src/lib/data/contactTypes.ts`:

```ts
// The one place contact types are enumerated. Before this module the list was spelled
// out in five places (the form's options, the list's filter chips, and two validation
// allowlists) and the Company rule in three — so adding a type meant editing eight
// sites, and a missed allowlist would let the form offer a type the server rejects.
//
// `rep` is deliberately absent: it is a bridge row created only by assignRep, and must
// never be selectable in the contact form. Chip.tsx widens its own type to include it
// for display.

export type SelectableContactType =
  | "customer"
  | "partner"
  | "prospect"
  | "government"
  | "other";

/** Selectable types, in the order the form and the filter chips present them. */
export const CONTACT_TYPES: { value: SelectableContactType; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "partner", label: "Partner" },
  { value: "prospect", label: "Prospect" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

/**
 * Types that carry a Company. An agency name needs somewhere to live that isn't the
 * last-name field. A customer is a person and a rep is the tenant's own staff, so
 * neither gets one.
 */
const WITH_COMPANY = new Set<string>(["partner", "government", "other"]);

export function typeHasCompany(type: string): boolean {
  return WITH_COMPANY.has(type);
}

/** Whether a submitted string is a type a user may choose. Excludes `rep`. */
export function isSelectableContactType(type: string): boolean {
  return CONTACT_TYPES.some((t) => t.value === type);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/contactTypes.test.ts`

Expected: PASS — 9 new tests.

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 177 tests pass (168 + 9).

```bash
git add src/lib/data/contactTypes.ts src/lib/data/contactTypes.test.ts
git commit -m "feat(contacts): contactTypes module as the single source of truth"
```

---

### Task 3: Wire it everywhere

**Files:**
- Modify: `src/app/(artisan)/actions.ts` (`updateContact` and `createContact`)
- Modify: `src/app/(artisan)/contacts/ContactForm.tsx`
- Modify: `src/app/(artisan)/contacts/ContactList.tsx`
- Modify: `src/components/ui/Chip.tsx`
- Modify: `src/lib/data/projectTeam.ts` (docstring only)

**Interfaces:**
- Consumes: `CONTACT_TYPES`, `typeHasCompany`, `isSelectableContactType`, `SelectableContactType` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Replace both allowlists and both company gates in `actions.ts`**

`updateContact` and `createContact` each contain these two lines:

```ts
  if (!["partner", "prospect", "customer"].includes(type)) {
    return { error: "Pick a contact type." };
  }
```
```ts
      company: type === "partner" ? orNull(str(fd, "company")) : null,
```

In **both** functions, replace them with:

```ts
  if (!isSelectableContactType(type)) {
    return { error: "Pick a contact type." };
  }
```
```ts
      company: typeHasCompany(type) ? orNull(str(fd, "company")) : null,
```

Add to the file's imports:

```ts
import { isSelectableContactType, typeHasCompany } from "@/lib/data/contactTypes";
```

This widens what both actions accept to include the new types — the point of the change — while still rejecting `rep`, exactly as before.

- [ ] **Step 2: Drive the form's options and Company gate from the module**

In `src/app/(artisan)/contacts/ContactForm.tsx`, add the import:

```ts
import { CONTACT_TYPES, typeHasCompany } from "@/lib/data/contactTypes";
```

Replace the three hard-coded options:

```tsx
            <option value="customer">Customer</option>
            <option value="partner">Partner</option>
            <option value="prospect">Prospect</option>
```

with:

```tsx
            {CONTACT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
```

and change the Company field's gate from `{type === "partner" && (` to `{typeHasCompany(type) && (`.

- [ ] **Step 3: Drive the filter chips from the module**

In `src/app/(artisan)/contacts/ContactList.tsx`, `TYPE_FILTERS` is currently:

```ts
const TYPE_FILTERS: Record<string, string | null> = {
  All: null,
  Partner: "partner",
  Prospect: "prospect",
  Customer: "customer",
};
```

Replace it with a derived map so the chips and the form can never disagree:

```ts
const TYPE_FILTERS: Record<string, string | null> = {
  All: null,
  ...Object.fromEntries(CONTACT_TYPES.map((t) => [t.label, t.value])),
};
```

Add `import { CONTACT_TYPES } from "@/lib/data/contactTypes";`.

Note this also **reorders** the existing chips to match the form's order (Customer, Partner, Prospect rather than Partner, Prospect, Customer) — intended, since one order for both surfaces is the point.

- [ ] **Step 4: Widen `ContactType` in `Chip.tsx`**

`Chip.tsx` currently declares:

```ts
export type ContactType = "partner" | "prospect" | "customer" | "rep";
```

Replace it with a re-export widened by `rep`, and add the two new style entries:

```ts
import type { SelectableContactType } from "@/lib/data/contactTypes";

/** Every type a chip may render — the selectable ones plus `rep`, which is display-only. */
export type ContactType = SelectableContactType | "rep";

const TYPE_STYLE: Record<ContactType, string> = {
  partner: "bg-proposal-soft text-proposal",
  prospect: "bg-proposal-soft text-proposal",
  customer: "bg-proposal-soft text-proposal",
  government: "bg-proposal-soft text-proposal",
  other: "bg-proposal-soft text-proposal",
  rep: "bg-signed-soft text-signed",
};
```

**`Chip.tsx` must keep exporting `ContactType`** — `ContactManager.tsx`, `contacts/[id]/page.tsx`, and `ContactList.tsx` all import it from here and cast with `as ContactType`. Widening it at the source is transparent to all three; removing the export breaks them.

- [ ] **Step 5: Make the portal exclusion read as intent**

In `src/lib/data/projectTeam.ts`, the `groupProjectTeam` docstring says:

```
 * Rows of any other type (e.g. 'prospect') are ignored.
```

Replace that line with:

```
 * Rows of any other type are ignored — 'prospect', and deliberately 'government' and
 * 'other', which are internal-only records (inspectors, permit offices, utilities) that
 * must never be published to a customer. portal_project_team's type filter excludes them
 * too; both are intentional, not an oversight.
```

Change no logic in this file.

- [ ] **Step 6: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green, 177 tests. A type error naming `ContactType` at one of the three cast sites means Step 4's export was dropped — restore it rather than editing the call sites.

- [ ] **Step 7: Confirm no hand-written type list survives**

Run:

```bash
grep -rn '"partner", "prospect", "customer"\|type === "partner"' src --include='*.ts' --include='*.tsx' | grep -v contactTypes
```

Expected: no output. Any hit is a site still carrying its own copy of the list or the company rule.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(artisan)/actions.ts" "src/app/(artisan)/contacts/ContactForm.tsx" \
        "src/app/(artisan)/contacts/ContactList.tsx" src/components/ui/Chip.tsx \
        src/lib/data/projectTeam.ts
git commit -m "feat(contacts): offer Government and Other everywhere types are listed"
```

---

## Manual verification (after `supabase db push`, before merge)

**The migration must be applied first** — until it is, picking either new type fails the CHECK and the form surfaces the raw Postgres error.

- [ ] Create a **Government** contact with a Company → saves; the chip reads "government".
- [ ] Create an **Other** contact → saves.
- [ ] Edit a Government contact and switch it to **Customer** → the Company field disappears and the stored value is cleared.
- [ ] The contacts list filters by **Government** and by **Other**, and the chips read Customer, Partner, Prospect, Government, Other in that order.
- [ ] Attach a Government contact to a project → it appears in the artisan attached-contacts list with the right chip, and can own a to-do.
- [ ] Open that same project in the **customer portal** → the Government contact does **not** appear in "Your Project Team". Same for `/preview/[id]`.
- [ ] A **rep** contact still renders its chip correctly on the artisan project page.
