# Shared customers — make `customers` a shared, QBO-ready entity

_Design spec · 2026-06-16_

> Time & Billing build, slice 2 (after the Foundation 1a/1b). Architecture:
> [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md).
> PRD §8.2: [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Turn the CRM's `customers` table into the **shared, QuickBooks-ready** customer
entity both products use: structured billing address + contact fields, nullable
QBO mapping fields, a unique display name, and RLS that lets **T&B members read**
it. The CRM remains the only editor for now; no new T&B UI in this slice (the T&B
customer screens ride with the Jobs slice). CRM behavior is otherwise unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Scope | Schema + RLS plumbing only; extend the existing CRM customer form for the new fields. No T&B customer UI yet. |
| Billing address | **Structured fields**, replacing the single `address` text (migrate `address` → `bill_line1`, drop `address`). |
| QBO mapping | **Add now** (nullable) so the QBO slice needs no migration. |
| Unique display name | **Enforce** a partial unique index on `(organization_id, name) WHERE archived_at IS NULL`. |
| Active/inactive | **Reuse `archived_at`** (active ⇔ `archived_at IS NULL`); no separate `active` column. |

## Schema — migration `supabase/migrations/20260616000001_customers_shared_qbo.sql`

```sql
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

-- Migrate the freeform address into the first structured line, then drop it.
update customers set bill_line1 = address where address is not null;
alter table customers drop column address;

-- Unique display name among non-archived customers (matches QBO DisplayName).
create unique index customers_org_name_active_uq
  on customers (organization_id, name) where archived_at is null;
```

(The cutover pre-checks for existing active duplicate names — see below — so the
index creation can't fail unexpectedly.)

## RLS — make it readable by T&B members

The existing `artisan_all` policy (full CRUD via `is_org_member`, CRM-only) stays —
the CRM remains the editor. Add a read policy so any org staff member (CRM or T&B)
can SELECT customers:

```sql
create policy member_read on customers for select to authenticated
  using (is_org_member_any(organization_id));
```

(`is_org_member_any` was added in Foundation 1b. The portal `contact_read` policy is
unchanged. T&B *write* access is deferred to the T&B-admin slice.)

## App — CRM stays the editor

- `src/lib/supabase/database.types.ts` — update the `customers` Row/Insert/Update
  (drop `address`; add the new columns).
- `src/lib/data/format.ts` — new `fmtAddress(parts)` that joins the structured
  billing fields into a one-line display string (skips empties; all-empty → `""`).
- `src/lib/data/customers.ts`:
  - `listCustomers`: select the structured fields + email; return a pre-formatted
    `address: fmtAddress(...)` string so `CustomerList` (which takes `address`)
    needs no change.
  - `getCustomerDetail`: return the structured fields + `email`/`phone` for the
    form and detail view.
- `src/app/(artisan)/customers/CustomerForm.tsx` — replace the single `address`
  input with structured inputs (`bill_line1`/`bill_line2`/`bill_city`/`bill_state`/
  `bill_postal_code`/`bill_country`) plus `email` and `phone`; `defaults` type updated.
- `src/app/(artisan)/actions.ts` — `createCustomer`/`updateCustomer` read the new
  fields from `FormData` (using the existing `str`/`orNull` helpers) and write them.
  A duplicate active name now returns a friendly "a customer with that name already
  exists" error (catch the unique-violation).
- `src/app/(artisan)/customers/[id]/page.tsx` — show `fmtAddress(customer)` plus
  `email`/`phone` KeyValues.
- `CustomerList.tsx` stays as-is (it receives the formatted `address` string).

## Testing

- **Unit (Vitest):** `fmtAddress` — full address joins in order; partial fields skip
  blanks; all-empty → `""`.
- **Regression (manual):** CRM customer create with structured address + email/phone
  persists and renders in list/detail; edit updates; a duplicate active name is
  rejected with the friendly error; the seed T&B worker (`doug+worker@…`) can now
  read customers (RLS broadened) — spot-check via a query or once the Jobs slice has
  a picker.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

1. Pre-check for active duplicate names:
   `select organization_id, name, count(*) from customers where archived_at is null group by 1,2 having count(*) > 1;`
   Resolve any dups before applying (rename/archive one).
2. `supabase db push`, then deploy, then verify the regression checks.

## Out of scope (later slices)

- T&B-side customer create/edit UI + T&B write RLS (rides with the T&B admin shell + Jobs slice).
- QBO sync logic (the mapping fields are just staged here).
- Parsing the migrated `address` text into more than `bill_line1`.
