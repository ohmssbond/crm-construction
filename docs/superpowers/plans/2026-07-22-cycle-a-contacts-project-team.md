# Cycle A — Contacts & Project Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a partners-only company field to contacts, then replace the portal's rep-only "point of contact" card with a grouped "Your Project Team" roster (Tenant / Partners-by-company / Customer).

**Architecture:** Two backlog items built in dependency order. #4 (company column) lands first so #1's new `portal_project_team` RPC can return `company` from the start. The portal grouping logic is a pure, unit-tested function (`groupProjectTeam`); DB and UI changes are verified by typecheck/build plus a live cross-org isolation pass mirroring the Company Reps feature.

**Tech Stack:** Next.js 16 (App Router, "use client" where noted), Supabase (Postgres + RLS + SECURITY DEFINER RPCs), Vitest for pure logic, Chrome MCP for live verification.

## Global Constraints

- **Not the Next.js you know** — read `node_modules/next/dist/docs/` before writing framework code; heed deprecation notices (per `AGENTS.md`).
- **Migrations** live in `supabase/migrations/`, named `YYYYMMDD00000N_<slug>.sql`. Apply to remote with `supabase db push` — a deliberate, prompted action (remote == production). Regenerate types after every push.
- **Type regeneration:** `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts` (matches commit `ecae128`).
- **Gates before merge:** `npm test` (Vitest) and `npm run build` must pass.
- **Contact types:** `contacts.type in ('partner','prospect','customer','rep')`. The `rep` type is a staff bridge (Company Reps); it is never selectable in `ContactForm`.
- **Privacy posture:** the `contacts` table has no portal RLS policy. Portal users only ever see contact data through a `SECURITY DEFINER` RPC gated by `public.contact_can_see_project(p_project)`. Preserve this — never add a portal-readable path to `contacts`.
- **Portal display:** name + email for every team member.

---

## File Structure

**Part 1 — #4 Company field**
- Create: `supabase/migrations/20260722000001_contact_company.sql` — adds `contacts.company`.
- Modify: `src/lib/supabase/database.types.ts` — regenerated.
- Modify: `src/app/(artisan)/contacts/ContactForm.tsx` — controlled type + conditional Company field.
- Modify: `src/app/(artisan)/actions.ts` — persist `company` (partners only) in create/update.
- Modify: `src/lib/data/contacts.ts` — select `company` in `getContactDetail`.
- Modify: `src/app/(artisan)/contacts/[id]/page.tsx` — show Company row for partners.
- Modify: `src/app/(artisan)/contacts/[id]/edit/page.tsx` — pass `company` into form defaults.

**Part 2 — #1 Portal Project Team**
- Create: `src/lib/data/projectTeam.ts` — types + `groupProjectTeam` pure function.
- Create: `src/lib/data/projectTeam.test.ts` — Vitest unit tests.
- Create: `supabase/migrations/20260722000002_portal_project_team.sql` — new RPC, drops `portal_project_reps`.
- Create: `src/components/portal/ProjectTeamCard.tsx` — grouped roster UI.
- Modify: `src/lib/data/portal.ts` — call the new RPC, return `team`/`orgName`/`clientNoun`.
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx` — render `ProjectTeamCard`, drop the reps card.

---

## Part 1 · #4 — Company field on contacts

### Task 1: Add `contacts.company` column

**Files:**
- Create: `supabase/migrations/20260722000001_contact_company.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces: a nullable `company text` column on `public.contacts`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722000001_contact_company.sql`:

```sql
-- Company/firm a partner contact belongs to. Nullable; only populated for
-- type='partner' rows (the write path nulls it for other types). Plain text —
-- no partner-org entity.
alter table contacts add column company text;
```

- [ ] **Step 2: Apply to remote (deliberate — will prompt)**

Run: `supabase db push`
Expected: the new migration `20260722000001_contact_company` is listed as applied. Confirm with:
Run: `supabase migration list`
Expected: `20260722000001 | 20260722000001 | …` (Local and Remote both present).

- [ ] **Step 3: Regenerate canonical types**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: `git diff src/lib/supabase/database.types.ts` shows `company: string | null` added to the `contacts` Row/Insert/Update shapes.

- [ ] **Step 4: Verify build still compiles**

Run: `npm run build`
Expected: build succeeds (no type usages broken by the regenerated file).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260722000001_contact_company.sql src/lib/supabase/database.types.ts
git commit -m "feat(contacts): add nullable company column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Persist `company` in create/update actions (partners only)

**Files:**
- Modify: `src/app/(artisan)/actions.ts:95-105` (updateContact), `:126-136` (createContact)

**Interfaces:**
- Consumes: `contacts.company` column (Task 1); existing `str()` and `orNull()` helpers in this file.
- Produces: contact writes persist `company` only when `type === 'partner'`, else `null`.

- [ ] **Step 1: Update `updateContact`'s write**

In `src/app/(artisan)/actions.ts`, in the `updateContact` `.update({...})` object (currently lines 97-104), add a `company` line after `phone`:

```ts
    .update({
      first_name: orNull(first),
      last_name: orNull(last),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      company: type === "partner" ? orNull(str(fd, "company")) : null,
      type,
      customer_id: orNull(str(fd, "customer_id")),
    })
```

- [ ] **Step 2: Update `createContact`'s insert**

In the `createContact` `.insert({...})` object (currently lines 128-136), add the same `company` line after `phone`:

```ts
    .insert({
      organization_id: ctx.org.id,
      first_name: orNull(first),
      last_name: orNull(last),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      company: type === "partner" ? orNull(str(fd, "company")) : null,
      type,
      customer_id: orNull(str(fd, "customer_id")),
    })
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: build succeeds. (The regenerated types from Task 1 now accept `company` on insert/update.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(artisan)/actions.ts"
git commit -m "feat(contacts): persist company on create/update (partners only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Conditional Company field in `ContactForm`

**Files:**
- Modify: `src/app/(artisan)/contacts/ContactForm.tsx`

**Interfaces:**
- Consumes: `defaults.company` passed by the edit page (wired in Task 4).
- Produces: a `company` form field (`name="company"`) rendered only when the selected type is `partner`.

- [ ] **Step 1: Import `useState` and add `company` to `Defaults`**

Change the React import (line 3) and the `Defaults` type (lines 11-18):

```tsx
import { useActionState, useState } from "react";
```

```tsx
type Defaults = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  type?: string;
  customer_id?: string | null;
};
```

- [ ] **Step 2: Track the selected type in state**

Immediately after the `useActionState` line (line 33), add:

```tsx
  const [type, setType] = useState(defaults?.type ?? "customer");
```

- [ ] **Step 3: Make the Type select controlled**

Replace the existing Type `<select>` (lines 51-55) with a controlled version:

```tsx
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldInput}
          >
            <option value="customer">Customer</option>
            <option value="partner">Partner</option>
            <option value="prospect">Prospect</option>
          </select>
```

- [ ] **Step 4: Render the Company field for partners**

Immediately after the Phone `<Field>` block (currently lines 47-49), add:

```tsx
        {type === "partner" && (
          <Field label="Company">
            <input name="company" defaultValue={defaults?.company ?? ""} className={fieldInput} />
          </Field>
        )}
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(artisan)/contacts/ContactForm.tsx"
git commit -m "feat(contacts): show Company field only for partner contacts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Round-trip `company` through detail + edit pages

**Files:**
- Modify: `src/lib/data/contacts.ts:37-39` (getContactDetail select)
- Modify: `src/app/(artisan)/contacts/[id]/edit/page.tsx:31-38` (form defaults)
- Modify: `src/app/(artisan)/contacts/[id]/page.tsx:57-61` (detail display)

**Interfaces:**
- Consumes: `contacts.company` column (Task 1); the `company` form field (Task 3).
- Produces: the edit form pre-fills `company`; the detail page shows Company for partners.

- [ ] **Step 1: Select `company` in `getContactDetail`**

In `src/lib/data/contacts.ts`, extend the `getContactDetail` select (lines 37-39) to include `company`:

```ts
    .select(
      "id, first_name, last_name, email, phone, company, type, user_id, customer:customers(id, name)"
    )
```

- [ ] **Step 2: Pass `company` into the edit form defaults**

In `src/app/(artisan)/contacts/[id]/edit/page.tsx`, add `company` to the `defaults` object (after `phone`, currently line 35):

```tsx
        defaults={{
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          type: contact.type,
          customer_id: contact.customer?.id ?? "",
        }}
```

- [ ] **Step 3: Show Company on the detail page for partners**

In `src/app/(artisan)/contacts/[id]/page.tsx`, inside the details `<Card>` (lines 57-61), add a Company row after Phone, shown only for partners:

```tsx
      <Card className="px-4 py-1">
        <KeyValue label="Email" value={contact.email ?? "—"} />
        <KeyValue label="Phone" value={contact.phone ?? "—"} />
        {contact.type === "partner" && (
          <KeyValue label="Company" value={contact.company ?? "—"} />
        )}
        <KeyValue label={clientNoun} value={contact.customer?.name ?? "—"} />
      </Card>
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/contacts.ts "src/app/(artisan)/contacts/[id]/edit/page.tsx" "src/app/(artisan)/contacts/[id]/page.tsx"
git commit -m "feat(contacts): round-trip company through detail and edit pages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Part 2 · #1 — Portal "Your Project Team"

### Task 5: `groupProjectTeam` pure function (TDD)

**Files:**
- Create: `src/lib/data/projectTeam.ts`
- Test: `src/lib/data/projectTeam.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TeamPerson = { name: string; email: string | null };
  export type PartnerGroup = { company: string | null; people: TeamPerson[] };
  export type ProjectTeam = { tenant: TeamPerson[]; partners: PartnerGroup[]; customer: TeamPerson[] };
  export type TeamRow = { name: string; email: string | null; type: string; company: string | null };
  export function groupProjectTeam(rows: TeamRow[]): ProjectTeam;
  ```
  Grouping rules: split by `type` (`rep`→tenant, `customer`→customer, `partner`→partners); partners grouped by trimmed `company` (blank→null), companies sorted case-insensitively with the null group trailing; people sorted by name within every group.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/projectTeam.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { groupProjectTeam, type TeamRow } from "./projectTeam";

const rep = (name: string): TeamRow => ({ name, email: `${name}@t.co`, type: "rep", company: null });
const cust = (name: string): TeamRow => ({ name, email: `${name}@c.co`, type: "customer", company: null });
const partner = (name: string, company: string | null): TeamRow => ({
  name, email: `${name}@p.co`, type: "partner", company,
});

describe("groupProjectTeam", () => {
  test("splits rows into tenant / partners / customer by type", () => {
    const team = groupProjectTeam([rep("Rae"), cust("Cam"), partner("Pat", "ABC")]);
    expect(team.tenant.map((p) => p.name)).toEqual(["Rae"]);
    expect(team.customer.map((p) => p.name)).toEqual(["Cam"]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC"]);
    expect(team.partners[0].people.map((p) => p.name)).toEqual(["Pat"]);
  });

  test("groups partners by company, sorted case-insensitively", () => {
    const team = groupProjectTeam([
      partner("Sam", "zeta"),
      partner("Mike", "ABC"),
      partner("Sara", "ABC"),
    ]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC", "zeta"]);
    expect(team.partners[0].people.map((p) => p.name)).toEqual(["Mike", "Sara"]);
  });

  test("partners with blank/null company collect into a trailing null group", () => {
    const team = groupProjectTeam([
      partner("NoCo", "   "),
      partner("Mike", "ABC"),
      partner("Nullish", null),
    ]);
    expect(team.partners.map((g) => g.company)).toEqual(["ABC", null]);
    expect(team.partners[1].people.map((p) => p.name)).toEqual(["NoCo", "Nullish"]);
  });

  test("sorts people by name within each group", () => {
    const team = groupProjectTeam([rep("Zed"), rep("Ana")]);
    expect(team.tenant.map((p) => p.name)).toEqual(["Ana", "Zed"]);
  });

  test("returns empty groups for empty input", () => {
    expect(groupProjectTeam([])).toEqual({ tenant: [], partners: [], customer: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/projectTeam.test.ts`
Expected: FAIL — `groupProjectTeam` / module not found.

- [ ] **Step 3: Implement `groupProjectTeam`**

Create `src/lib/data/projectTeam.ts`:

```ts
export type TeamPerson = { name: string; email: string | null };
export type PartnerGroup = { company: string | null; people: TeamPerson[] };
export type ProjectTeam = {
  tenant: TeamPerson[];
  partners: PartnerGroup[];
  customer: TeamPerson[];
};

/** Raw row shape returned by the `portal_project_team` RPC. */
export type TeamRow = {
  name: string;
  email: string | null;
  type: string;
  company: string | null;
};

const byName = (a: TeamPerson, b: TeamPerson) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const person = (r: TeamRow): TeamPerson => ({ name: r.name, email: r.email });

/**
 * Shape flat project-team rows into the three portal sections:
 *   - tenant   (type='rep'), sorted by name
 *   - partners (type='partner'), grouped by company then sorted by name;
 *     companies sorted case-insensitively with the no-company group last
 *   - customer (type='customer'), sorted by name
 * Rows of any other type (e.g. 'prospect') are ignored.
 */
export function groupProjectTeam(rows: TeamRow[]): ProjectTeam {
  const tenant = rows.filter((r) => r.type === "rep").map(person).sort(byName);
  const customer = rows.filter((r) => r.type === "customer").map(person).sort(byName);

  const byCompany = new Map<string | null, TeamPerson[]>();
  for (const r of rows.filter((r) => r.type === "partner")) {
    const company = r.company?.trim() ? r.company.trim() : null;
    const bucket = byCompany.get(company) ?? [];
    bucket.push(person(r));
    byCompany.set(company, bucket);
  }

  const named = [...byCompany.keys()]
    .filter((c): c is string => c !== null)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const order: (string | null)[] = byCompany.has(null) ? [...named, null] : named;

  const partners: PartnerGroup[] = order.map((company) => ({
    company,
    people: (byCompany.get(company) ?? []).sort(byName),
  }));

  return { tenant, partners, customer };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/projectTeam.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/projectTeam.ts src/lib/data/projectTeam.test.ts
git commit -m "feat(portal): add groupProjectTeam pure function with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `portal_project_team` RPC (drop `portal_project_reps`)

**Files:**
- Create: `supabase/migrations/20260722000002_portal_project_team.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `contacts.company` (Task 1); existing `public.contact_can_see_project(uuid)` guard.
- Produces: `portal_project_team(p_project uuid)` returning `(name text, email text, type text, company text)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722000002_portal_project_team.sql`:

```sql
-- Broaden the portal's people RPC from reps-only to the full project team:
-- reps + partners + customers a portal contact may see on a project they can
-- already see. Names/emails/company only — the contacts table stays unreadable
-- to portal contacts (no new RLS policy). Guarded by the existing
-- project-visibility helper, exactly like the reps RPC it replaces.

drop function if exists public.portal_project_reps(uuid);

create or replace function public.portal_project_team(p_project uuid)
returns table (name text, email text, type text, company text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                  c.email,
                  case c.type
                    when 'rep' then 'Company Rep'
                    when 'partner' then 'Partner'
                    else 'Customer'
                  end),
         c.email::text,
         c.type,
         c.company
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  where pc.project_id = p_project
    and c.type in ('rep', 'partner', 'customer')
    and public.contact_can_see_project(p_project);
$$;

grant execute on function public.portal_project_team(uuid) to authenticated;
```

- [ ] **Step 2: Apply to remote (deliberate — will prompt)**

Run: `supabase db push`
Then: `supabase migration list`
Expected: `20260722000002` shows as applied (Local and Remote).

- [ ] **Step 3: Regenerate types**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: `git diff` shows `portal_project_team` added and `portal_project_reps` removed from the `Functions` block.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722000002_portal_project_team.sql src/lib/supabase/database.types.ts
git commit -m "feat(portal): add portal_project_team RPC, drop portal_project_reps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Note: after this task the app will not build until Task 8 rewires `getPortalProject` (which still calls `portal_project_reps`). Tasks 6→7→8 are a unit; run them together before the next build gate.

---

### Task 7: `ProjectTeamCard` component

**Files:**
- Create: `src/components/portal/ProjectTeamCard.tsx`

**Interfaces:**
- Consumes: `ProjectTeam` and `TeamPerson` types from `src/lib/data/projectTeam.ts` (Task 5).
- Produces: `export function ProjectTeamCard({ team, orgName, clientNoun }: { team: ProjectTeam; orgName: string; clientNoun: string })` — renders the grouped roster, or `null` when there are no members.

- [ ] **Step 1: Create the component**

Create `src/components/portal/ProjectTeamCard.tsx`:

```tsx
import { type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { monogram } from "@/lib/data/format";
import type { ProjectTeam, TeamPerson } from "@/lib/data/projectTeam";

function PersonRow({ person }: { person: TeamPerson }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar initials={monogram(person.name)} />
      <div className="flex flex-col">
        <span className="text-body font-semibold">{person.name}</span>
        {person.email && <span className="text-meta text-faint">{person.email}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        {title}
      </span>
      {children}
    </div>
  );
}

export function ProjectTeamCard({
  team,
  orgName,
  clientNoun,
}: {
  team: ProjectTeam;
  orgName: string;
  clientNoun: string;
}) {
  const hasPartners = team.partners.some((g) => g.people.length > 0);
  const hasAny = team.tenant.length > 0 || hasPartners || team.customer.length > 0;
  if (!hasAny) return null;

  return (
    <Card>
      <div className="p-4 flex flex-col gap-5">
        <span className="text-body font-semibold">Your Project Team</span>

        {team.tenant.length > 0 && (
          <Section title={orgName}>
            {team.tenant.map((p) => (
              <PersonRow key={p.email ?? p.name} person={p} />
            ))}
          </Section>
        )}

        {hasPartners && (
          <Section title="Partners">
            {team.partners.map((g) => (
              <div key={g.company ?? "__none__"} className="flex flex-col gap-2">
                {g.company && (
                  <span className="text-meta font-semibold text-[#344054]">{g.company}</span>
                )}
                {g.people.map((p) => (
                  <PersonRow key={p.email ?? p.name} person={p} />
                ))}
              </div>
            ))}
          </Section>
        )}

        {team.customer.length > 0 && (
          <Section title={clientNoun}>
            {team.customer.map((p) => (
              <PersonRow key={p.email ?? p.name} person={p} />
            ))}
          </Section>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it typechecks in isolation**

Run: `npx tsc --noEmit`
Expected: no errors from `ProjectTeamCard.tsx` (it may still report the not-yet-rewired `portal.ts`/page — that's fixed in Task 8; confirm no errors originate in this new file).

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/ProjectTeamCard.tsx
git commit -m "feat(portal): add ProjectTeamCard grouped roster component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire `getPortalProject` + portal page to the team roster

**Files:**
- Modify: `src/lib/data/portal.ts:105-191` (types, org select, RPC call, return)
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx:1-58` (imports, destructure, card)

**Interfaces:**
- Consumes: `groupProjectTeam` + `TeamRow` (Task 5); `portal_project_team` RPC (Task 6); `ProjectTeamCard` (Task 7).
- Produces: `getPortalProject` returns `team: ProjectTeam`, `orgName: string`, `clientNoun: string` (replacing `reps`).

- [ ] **Step 1: Update imports and the RPC type in `portal.ts`**

At the top of `src/lib/data/portal.ts`, add the grouping import (after the `portfolio` import block, around line 12):

```ts
import { groupProjectTeam, type TeamRow } from "./projectTeam";
```

Replace the `PortalRep` type declaration (lines 105-109, the comment + `type PortalRep = …`) with nothing — it is no longer used. (The RPC now returns `TeamRow[]`, typed at the call site below.)

- [ ] **Step 2: Extend the org select to include name + client_noun**

In `getPortalProject`, change the organizations query (currently lines 146-150) from selecting only `timezone`:

```ts
    supabase
      .from("organizations")
      .select("timezone, name, client_noun")
      .eq("id", project.organization_id)
      .maybeSingle(),
```

- [ ] **Step 3: Swap the RPC call**

In the same `Promise.all` array, replace the reps RPC (line 151):

```ts
    supabase.rpc("portal_project_team", { p_project: id }),
```

Rename the destructured result variable (line 123) from `repRows` to `teamRows`:

```ts
  const [updates, attachments, tasks, org, teamRows] = await Promise.all([
```

- [ ] **Step 4: Return the grouped team + org labels**

In the returned object (lines 176-190), replace the `reps:` line with three fields:

```ts
    team: groupProjectTeam((teamRows.data ?? []) as TeamRow[]),
    orgName: org.data?.name ?? "",
    clientNoun: org.data?.client_noun ?? "Customer",
```

- [ ] **Step 5: Rewire the portal project page**

In `src/app/(portal)/my-projects/[id]/page.tsx`:

Replace the `Avatar` + `monogram` imports (lines 10-11) with the card import — remove:

```tsx
import { fmtDate, fmtDateTime, fmtZonedDate, monogram } from "@/lib/data/format";
import { Avatar } from "@/components/ui/Avatar";
```

with:

```tsx
import { fmtDate, fmtDateTime, fmtZonedDate } from "@/lib/data/format";
import { ProjectTeamCard } from "@/components/portal/ProjectTeamCard";
```

Update the destructure (lines 22-35) — replace `reps,` with `team,`, `orgName,`, `clientNoun,`:

```tsx
  const {
    project,
    status,
    hero,
    before,
    after,
    beforeAfter,
    gallery,
    files,
    updates,
    tasks,
    timezone,
    team,
    orgName,
    clientNoun,
  } = detail;
```

Replace the entire reps card block (lines 41-58, the `{reps.length > 0 && ( … )}` expression) with:

```tsx
      <ProjectTeamCard team={team} orgName={orgName} clientNoun={clientNoun} />
```

- [ ] **Step 6: Run unit tests and build**

Run: `npm test`
Expected: PASS (including `projectTeam.test.ts`).
Run: `npm run build`
Expected: build succeeds — no dangling `reps`/`PortalRep`/`Avatar`/`monogram` references.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/portal.ts "src/app/(portal)/my-projects/[id]/page.tsx"
git commit -m "feat(portal): render grouped Your Project Team card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Live verification (Chrome MCP)

**Files:** none (verification only).

**Interfaces:**
- Consumes: the deployed dev server + the seeded tenants (see `memory/tenants.md`: J Huber `04654563` has crm+portal; Gargoyle `1111`).

Prerequisite test data: on one project, attach at least one rep, two partners sharing a company + one partner with a different company + one with no company, and a customer contact with a portal login. Use the artisan **Contacts** tab to attach, and the contact **edit** form to set partner companies.

- [ ] **Step 1: Connect the browser**

Connect Chrome MCP via `/chrome` (per `CLAUDE.md`). Start the dev server (`npm run dev`) if not already running.

- [ ] **Step 2: Verify the artisan side**

As a CRM staff user, create/edit a partner contact. Confirm:
- The **Company** field appears only when Type = Partner (switch the Type select back and forth).
- Saving persists the company; the contact **detail** page shows a Company row for partners and hides it for non-partners.

- [ ] **Step 3: Verify the portal roster**

Sign in to the portal as the customer contact for that project. On the project page confirm:
- The card reads **"Your Project Team"**.
- Three sections in order: the tenant org name, **Partners** (partners nested under their company sub-headers, alpha-sorted; the no-company partner listed without a sub-header), then the customer/`client_noun` section.
- Every person shows name + email.

- [ ] **Step 4: Verify isolation (adversarial, mirrors Company Reps)**

- Confirm a portal contact **cannot** read the `contacts` table directly (only the RPC exposes names/emails) — e.g. via the network tab / a direct PostgREST call to `/rest/v1/contacts` returns no rows.
- Confirm **cross-org**: a contact in org A sees no team members from a project in org B (attempt to load a foreign project id → not found / empty).

- [ ] **Step 5: Final gates**

Run: `npm test` → PASS
Run: `npm run build` → succeeds
Report results. Do not claim success without the command output.

---

## Notes for the executor

- **Migrations touch production** (remote == prod). `supabase db push` in Tasks 1 and 6 is a deliberate, prompted action — pause for confirmation, don't auto-approve.
- Tasks 6→7→8 leave the build red in between (the RPC rename). Treat them as one landing sequence; the build gate is at the end of Task 8.
- The spec refines the customer-label plumbing: rather than adding `clientNoun` to `PortalContext`, `getPortalProject` already reads the org row, so we extend that existing select (Task 8, Step 2) — one read, no context change.
