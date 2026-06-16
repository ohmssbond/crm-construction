# Shared Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `customers` a shared, QuickBooks-ready entity — structured billing address + contact fields + nullable QBO mapping + a unique display name — readable by Time & Billing members, with the CRM still the editor.

**Architecture:** One migration evolves the table (structured address replacing `address`, QBO fields, partial-unique index) and adds a `member_read` RLS policy via `is_org_member_any`. App code swaps the `address` text for structured fields across the CRM customer data layer, form, actions, and detail view; a pure `fmtAddress` helper renders the parts. A controller cutover applies it + deploys.

**Tech Stack:** Supabase (Postgres, RLS), Next.js 16, TypeScript, Vitest.

---

## File Structure

- **Modify** `src/lib/data/format.ts` + **create** `src/lib/data/format` test coverage in `src/lib/data/format.test.ts` — `fmtAddress`.
- **Create** `supabase/migrations/20260616000001_customers_shared_qbo.sql` — schema + RLS.
- **Modify** `src/lib/supabase/database.types.ts` — `customers` types.
- **Modify** `src/lib/data/customers.ts` — structured selects; list returns formatted `address`.
- **Modify** `src/app/(artisan)/customers/CustomerForm.tsx` — structured inputs + email/phone.
- **Modify** `src/app/(artisan)/actions.ts` — `createCustomer`/`updateCustomer` write new fields + dup-name error.
- **Modify** `src/app/(artisan)/customers/[id]/page.tsx` — render `fmtAddress` + email/phone.

**Sequencing:** Task 1 (helper) is additive. Task 2 authors the migration (not applied). Task 3 swaps `address`→structured across types + all readers together (dropping `address` from the types breaks every reader, so they change in one commit) — local build green; the app only *runs* against remote after the cutover (Task 5). `format.test.ts` already exists (from the timezone slice) — add to it.

---

## Task 1: `fmtAddress` helper (TDD)

**Files:**
- Modify: `src/lib/data/format.ts`
- Modify: `src/lib/data/format.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/data/format.test.ts`:

```ts
import { fmtAddress } from "./format";

describe("fmtAddress", () => {
  test("joins all structured parts in order", () => {
    expect(
      fmtAddress({
        bill_line1: "123 Main St",
        bill_line2: "Unit 4",
        bill_city: "Boston",
        bill_state: "MA",
        bill_postal_code: "02118",
        bill_country: "USA",
      })
    ).toBe("123 Main St, Unit 4, Boston, MA 02118, USA");
  });

  test("skips blank/missing parts", () => {
    expect(fmtAddress({ bill_line1: "123 Main St", bill_city: "Boston" })).toBe(
      "123 Main St, Boston"
    );
  });

  test("all empty → empty string", () => {
    expect(fmtAddress({})).toBe("");
    expect(fmtAddress({ bill_line1: "  ", bill_city: null })).toBe("");
  });
});
```

(`describe`/`test`/`expect` are already imported at the top of `format.test.ts` from the
timezone slice; do not add a duplicate import — if the file imports them, reuse it.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- format`
Expected: FAIL — `fmtAddress` is not exported.

- [ ] **Step 3: Implement `fmtAddress`**

Append to `src/lib/data/format.ts`:

```ts
/** Joins a customer's structured billing-address parts into a one-line string. */
export function fmtAddress(c: {
  bill_line1?: string | null;
  bill_line2?: string | null;
  bill_city?: string | null;
  bill_state?: string | null;
  bill_postal_code?: string | null;
  bill_country?: string | null;
}): string {
  const cityLine = [c.bill_city, c.bill_state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  const cityZip = [cityLine, (c.bill_postal_code ?? "").trim()].filter(Boolean).join(" ");
  return [c.bill_line1, c.bill_line2, cityZip, c.bill_country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/format.ts src/lib/data/format.test.ts
git commit -m "$(cat <<'EOF'
Add fmtAddress helper for structured billing addresses

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Author the migration

**Files:**
- Create: `supabase/migrations/20260616000001_customers_shared_qbo.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260616000001_customers_shared_qbo.sql`:

```sql
-- Shared customers: structured billing address + contact + nullable QBO mapping
-- fields, migrate the freeform address into bill_line1, drop address, add a
-- unique display name (among non-archived), and let T&B members read customers.
alter table customers
  add column bill_line1       text,
  add column bill_line2       text,
  add column bill_city        text,
  add column bill_state       text,
  add column bill_postal_code text,
  add column bill_country     text,
  add column email            text,
  add column phone            text,
  add column qbo_id           text,
  add column qbo_sync_token   text,
  add column last_synced_at   timestamptz,
  add column sync_status      text not null default 'unsynced',
  add column source           text not null default 'local';

update customers set bill_line1 = address where address is not null;
alter table customers drop column address;

create unique index customers_org_name_active_uq
  on customers (organization_id, name) where archived_at is null;

-- Shared read: any org staff member (CRM or T&B) can read customers. Writes stay
-- CRM-only via the existing artisan_all policy.
create policy member_read on customers for select to authenticated
  using (is_org_member_any(organization_id));
```

- [ ] **Step 2: Sanity check (do NOT apply)**

Run: `grep -c "add column\|drop column\|create unique index\|create policy" supabase/migrations/20260616000001_customers_shared_qbo.sql`
Expected: `16` (13 add column + 1 drop column + 1 index + 1 policy). Do NOT run `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260616000001_customers_shared_qbo.sql
git commit -m "$(cat <<'EOF'
Migration: structured + QBO-ready customers, shared read RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Swap `address` → structured across the CRM

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/data/customers.ts`
- Modify: `src/app/(artisan)/customers/CustomerForm.tsx`
- Modify: `src/app/(artisan)/actions.ts`
- Modify: `src/app/(artisan)/customers/[id]/page.tsx`

- [ ] **Step 1: Update the `customers` types**

In `src/lib/supabase/database.types.ts`, in the `customers` entry, replace the `Row` block:

```ts
        Row: {
          address: string | null
          archived_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
        }
```

with:

```ts
        Row: {
          archived_at: string | null
          bill_city: string | null
          bill_country: string | null
          bill_line1: string | null
          bill_line2: string | null
          bill_postal_code: string | null
          bill_state: string | null
          created_at: string
          email: string | null
          id: string
          last_synced_at: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          qbo_id: string | null
          qbo_sync_token: string | null
          source: string
          sync_status: string
        }
```

Replace the `Insert` block:

```ts
        Insert: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
        }
```

with:

```ts
        Insert: {
          archived_at?: string | null
          bill_city?: string | null
          bill_country?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_postal_code?: string | null
          bill_state?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
        }
```

Replace the `Update` block:

```ts
        Update: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
        }
```

with:

```ts
        Update: {
          archived_at?: string | null
          bill_city?: string | null
          bill_country?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_postal_code?: string | null
          bill_state?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
        }
```

- [ ] **Step 2: Update the customer data layer**

In `src/lib/data/customers.ts`, add the import at the top:

```ts
import { fmtAddress } from "./format";
```

Replace the `listCustomers` query + mapping. Find:

```ts
  const { data } = await supabase
    .from("customers")
    .select("id, name, address, projects(count)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    projectCount: c.projects?.[0]?.count ?? 0,
  }));
```

with:

```ts
  const { data } = await supabase
    .from("customers")
    .select(
      "id, name, bill_line1, bill_line2, bill_city, bill_state, bill_postal_code, bill_country, projects(count)"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: fmtAddress(c) || null,
    projectCount: c.projects?.[0]?.count ?? 0,
  }));
```

Replace the `getCustomerDetail` customer query. Find:

```ts
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, address, notes")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
```

with:

```ts
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, name, bill_line1, bill_line2, bill_city, bill_state, bill_postal_code, bill_country, email, phone, notes"
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
```

- [ ] **Step 3: Update the customer form**

In `src/app/(artisan)/customers/CustomerForm.tsx`, replace the `defaults` prop type:

```ts
  defaults?: { name?: string; address?: string | null; notes?: string | null };
```

with:

```ts
  defaults?: {
    name?: string;
    bill_line1?: string | null;
    bill_line2?: string | null;
    bill_city?: string | null;
    bill_state?: string | null;
    bill_postal_code?: string | null;
    bill_country?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  };
```

Replace the Address field:

```tsx
        <Field label="Address">
          <input name="address" defaultValue={defaults?.address ?? ""} className={fieldInput} />
        </Field>
```

with:

```tsx
        <Field label="Address">
          <input name="bill_line1" placeholder="Street address" defaultValue={defaults?.bill_line1 ?? ""} className={fieldInput} />
        </Field>
        <Field label="Address line 2">
          <input name="bill_line2" defaultValue={defaults?.bill_line2 ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="City">
            <input name="bill_city" defaultValue={defaults?.bill_city ?? ""} className={fieldInput} />
          </Field>
          <Field label="State">
            <input name="bill_state" defaultValue={defaults?.bill_state ?? ""} className={fieldInput} />
          </Field>
          <Field label="Postal code">
            <input name="bill_postal_code" defaultValue={defaults?.bill_postal_code ?? ""} className={fieldInput} />
          </Field>
        </div>
        <Field label="Country">
          <input name="bill_country" defaultValue={defaults?.bill_country ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="Email">
            <input name="email" type="email" defaultValue={defaults?.email ?? ""} className={fieldInput} />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={defaults?.phone ?? ""} className={fieldInput} />
          </Field>
        </div>
```

- [ ] **Step 4: Update the create/update actions**

In `src/app/(artisan)/actions.ts`, in `createCustomer`, replace the insert:

```ts
    .from("customers")
    .insert({
      organization_id: ctx.org.id,
      name,
      address: orNull(str(fd, "address")),
      notes: orNull(str(fd, "notes")),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create." };
```

with:

```ts
    .from("customers")
    .insert({
      organization_id: ctx.org.id,
      name,
      bill_line1: orNull(str(fd, "bill_line1")),
      bill_line2: orNull(str(fd, "bill_line2")),
      bill_city: orNull(str(fd, "bill_city")),
      bill_state: orNull(str(fd, "bill_state")),
      bill_postal_code: orNull(str(fd, "bill_postal_code")),
      bill_country: orNull(str(fd, "bill_country")),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      notes: orNull(str(fd, "notes")),
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "A customer with that name already exists." };
  if (error || !data) return { error: error?.message ?? "Could not create." };
```

In `updateCustomer`, replace the update:

```ts
    .from("customers")
    .update({
      name,
      address: orNull(str(fd, "address")),
      notes: orNull(str(fd, "notes")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
```

with:

```ts
    .from("customers")
    .update({
      name,
      bill_line1: orNull(str(fd, "bill_line1")),
      bill_line2: orNull(str(fd, "bill_line2")),
      bill_city: orNull(str(fd, "bill_city")),
      bill_state: orNull(str(fd, "bill_state")),
      bill_postal_code: orNull(str(fd, "bill_postal_code")),
      bill_country: orNull(str(fd, "bill_country")),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      notes: orNull(str(fd, "notes")),
    })
    .eq("id", id);
  if (error?.code === "23505") return { error: "A customer with that name already exists." };
  if (error) return { error: error.message };
```

- [ ] **Step 5: Update the customer detail page**

In `src/app/(artisan)/customers/[id]/page.tsx`, add the import (with the other imports):

```ts
import { fmtAddress } from "@/lib/data/format";
```

Find:

```tsx
      <Card className="px-4 py-1">
        <KeyValue label="Address" value={customer.address ?? "—"} />
        <KeyValue label="Notes" value={customer.notes ?? "—"} />
      </Card>
```

Replace with:

```tsx
      <Card className="px-4 py-1">
        <KeyValue label="Address" value={fmtAddress(customer) || "—"} />
        <KeyValue label="Email" value={customer.email ?? "—"} />
        <KeyValue label="Phone" value={customer.phone ?? "—"} />
        <KeyValue label="Notes" value={customer.notes ?? "—"} />
      </Card>
```

- [ ] **Step 6: Verify build + no stale `address` refs**

Run: `grep -rn "\.address\b\|\"address\"\|name=\"address\"" src/` — expect ZERO hits referencing the customer `address` field (the column is gone). 
Run: `npm run build` — expect success.
Run: `npm test` — expect all pass.
If the build fails, show the error and report BLOCKED.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/data/customers.ts "src/app/(artisan)/customers/CustomerForm.tsx" "src/app/(artisan)/actions.ts" "src/app/(artisan)/customers/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Use structured billing address + email/phone on customers (CRM)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify gate (pre-cutover)

- [ ] **Step 1: Tests + build**

Run: `npm test` (all pass) and `npm run build` (succeeds). This is the gate before the controller cutover.

---

## Task 5: Cutover & verification _(controller/operator — NOT a subagent)_

- [ ] **Step 1: Pre-check for active duplicate names** (the unique index will fail if any exist)

Run (via Supabase SQL editor or `supabase db` query):
`select organization_id, name, count(*) from customers where archived_at is null group by 1, 2 having count(*) > 1;`
Expected: zero rows. If any, rename or archive a duplicate before proceeding.

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` → applies `20260616000001`. Confirm via `supabase migration list`.

- [ ] **Step 3: Merge + deploy**

Merge to `main`, push, `vercel --prod`.

- [ ] **Step 4: Verify (production)**

- Create a CRM customer with a structured address + email/phone → it persists and shows in the list (formatted address) and detail (address/email/phone).
- Edit it; re-saving works.
- Try creating a second active customer with the same name → friendly "already exists" error.
- Spot-check shared read: the seed T&B worker's org (Gargoyle) customers are now readable by a `timebilling` member (query as that role, or confirm once the Jobs slice adds a picker).

---

## Notes for the implementer

- **`address` is fully removed** — Task 3 Step 6's grep guards against any missed reader. `CustomerList.tsx` is intentionally unchanged: `listCustomers` returns a pre-formatted `address` string so the list's existing `address` prop still works.
- The **edit page** passes `defaults={detail.customer}`, and `getCustomerDetail` now returns the structured fields, so the form's new `defaults` shape lines up with no edit-page change. The **new page** is unchanged.
- `member_read` relies on `is_org_member_any` (Foundation 1b). Writes stay CRM-only (`artisan_all`).
- Tasks 1–4 are subagent-safe. Task 5 (remote migration + deploy) is operator-run.
