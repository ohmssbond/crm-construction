# T&B admin shell + Jobs

_Design spec · 2026-06-16_

> Time & Billing build, slice 3 (after Foundation + shared customers). Architecture:
> [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md).
> PRD §6/§8.2: [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Stand up the **Time & Billing admin surface** (a third AppShell "world" at `/tb`,
gated to `timebilling:admin`) and its first entity: **Jobs** — full CRUD under a
read-only picker over the shared customers, with billing type, a status lifecycle,
and a structured site address. This is the foundation the rest of the T&B admin
features build on.

## Decisions

| Topic | Decision |
|---|---|
| Admin surface | Reuse `AppShell` as a third world `timebilling`; routes under **`/tb`**. |
| Job scheduling | Calendar **`start_date`/`end_date`** (date granularity). |
| Admin nav | **Jobs only** this slice. |
| QBO mapping on jobs | **Add now** (nullable), per the QBO-ready principle. |
| Customer management in T&B | Out of scope — the job form's customer picker **reads** the shared customers; CRM remains the customer editor. |

## Context

- Only the worker `/log` shell exists for T&B; there is **no admin surface**. The
  `(admin)` group is the super-admin console (unrelated).
- Foundation 1b gives per-product roles (`roles` claim), `proxy.ts` world-separation,
  `is_org_member_any`, the entitlement gate (`orgHasProduct` + `NotEnabled`), and
  `resolveHome`. Shared customers gave customers a `member_read` RLS policy.
- `getOrgContext` (`org.ts`) is **CRM-scoped** (memberships `product='crm'`), so it
  returns null for a `timebilling`-only admin — the new shell needs a product-agnostic
  org context, and the `organizations` row needs a member-readable RLS policy.

## Changes

### 1. AppShell third world `timebilling`

- `src/components/shell/nav.ts`: `World` → `"artisan" | "portal" | "timebilling"`;
  add `timebillingNav = [{ href: "/tb/jobs", label: "Jobs", icon: ... }]` and
  `timebillingTabs = ["/tb/jobs"]`; extend `navFor`/`tabsFor`.
- `Sidebar`/`TopBar`/`BottomTabBar`/`Fab` handle the new world: nav from `navFor`;
  the `Fab` points to `/tb/jobs/new`; the Sidebar footer shows **Sign out** (via the
  existing `signOut` action) for `timebilling` (no settings page yet).
- `AppShell` themes from `org.primary_color` as today (`data-world="timebilling"`).

### 2. Org context + RLS for the shell

- Migration adds an `organizations` **`member_read`** SELECT policy
  (`using (is_org_member_any(organization_id))`) so any member (incl. T&B-only) can
  read their org's branding. (CRM's `artisan_all` write policy + `contact_read` stay.)
- `src/lib/data/org.ts`: add `getWorkspaceContext()` — same shape as `OrgContext`
  (org branding + user identity) but resolves the user's org from `memberships`
  **without the `product='crm'` filter** (single org per account). `getOrgContext`
  is unchanged.

### 3. Routing

- `src/lib/auth.ts` `resolveHome`: insert the admin branch — precedence becomes
  `crm → /dashboard`; `timebilling:admin → /tb`; `timebilling:worker → /log`;
  `contact → /my-projects`; else `/login`. (Unit tests updated.)
- `src/proxy.ts`: add `TB_ADMIN_PREFIXES = ["/tb"]`; a non-`timebilling:admin` hitting
  `/tb` is redirected to `home`. (Existing artisan/portal/worker separation unchanged.)

### 4. Jobs schema — migration `supabase/migrations/20260616000002_jobs.sql`

```sql
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id     uuid not null references customers (id) on delete restrict,
  name            text not null,
  job_line1       text,
  job_line2       text,
  job_city        text,
  job_state       text,
  job_postal_code text,
  job_country     text,
  description     text,
  notes           text,
  start_date      date,
  end_date        date,
  status          text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  billing_type    text not null check (billing_type in ('time_and_materials', 'fixed_price')),
  contract_price  numeric(12, 2),
  currency        text not null default 'USD',
  qbo_id          text,
  qbo_sync_token  text,
  last_synced_at  timestamptz,
  sync_status     text not null default 'unsynced',
  source          text not null default 'local',
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  check (billing_type <> 'fixed_price' or contract_price is not null)
);
create index on jobs (organization_id);
create index on jobs (customer_id);
alter table jobs enable row level security;
```

**RLS helpers + policies:** add `is_tb_member(org)` (any `timebilling` membership) and
`is_tb_admin(org)` (`timebilling` role `admin`), both `security definer` like
`is_org_member`. Jobs: `member_read` SELECT via `is_tb_member`; `admin_write`
`for all` via `is_tb_admin`.

### 5. Address helper reuse

Refactor `src/lib/data/format.ts`: extract `formatAddressParts({ line1, line2, city,
state, postalCode, country })`; keep `fmtAddress(customer)` (maps `bill_*`) and add
`fmtJobLocation(job)` (maps `job_*`). No customer call-site change.

### 6. Data, actions, UI

- `src/lib/data/jobs.ts`: `listJobs()` (org's jobs + customer name + status/billing,
  newest first, non-archived), `getJobDetail(id)` (job + customer name + structured
  fields), `listCustomerOptions()` (active shared customers `{id, name}` for the picker).
- `src/lib/auth-tb.ts` (new): `requireTbAdmin()` — returns the user if
  `productRole(claims,'timebilling') === 'admin'`, else `notFound()` (mirrors
  `requireSuperAdmin`).
- `src/app/(timebilling)/tb/jobs/actions.ts`: `createJob`, `updateJob`,
  `setJobStatus`, `archiveJob` — each calls `requireTbAdmin()` first; writes are also
  enforced by `is_tb_admin` RLS. `createJob`/`updateJob` validate name + that
  `fixed_price` has a `contract_price`.
- Pages under `src/app/(timebilling)/tb/`:
  - `layout.tsx` — gate (`requireTbAdmin` redirect + `orgHasProduct('timebilling')` →
    `NotEnabled`), render `AppShell world="timebilling"` with `getWorkspaceContext()`.
  - `tb/page.tsx` → redirect to `/tb/jobs`.
  - `tb/jobs/page.tsx` — jobs list (name, customer, status chip, billing type).
  - `tb/jobs/new/page.tsx` + `tb/jobs/[id]/edit/page.tsx` — `JobForm`.
  - `tb/jobs/[id]/page.tsx` — detail (fields + `fmtJobLocation`) + `JobStatusControl` +
    edit/archive.
  - `JobForm.tsx` (client) — customer `<select>` (from `listCustomerOptions`), name,
    structured job address, description, notes, start/end date, billing-type select
    with a contract-price input shown when `fixed_price`.
  - `JobStatusControl.tsx` (client) — set `open`/`in_progress`/`completed` via `setJobStatus`.

## Testing

- **Unit (Vitest):** `resolveHome` (new `timebilling:admin → /tb` branch + full
  precedence); `fmtJobLocation` (joins job_* parts; partial; empty).
- **Regression (manual):** CRM/portal/worker routing unchanged; a `timebilling:admin`
  (give the seed account an admin membership, or add one) lands on `/tb/jobs`; create a
  job under a picked customer, edit it, change status, archive; a `fixed_price` job
  without a contract price is rejected; a non-admin hitting `/tb` is redirected.
- `npm test` + `npm run build` pass.

## Out of scope (later slices)

- Materials catalog (next slice).
- Worker-side job access + "tap completed" (time-tracking slice; needs a worker-scoped
  job write path).
- Full T&B customer create/edit UI; QBO sync logic (mapping fields just staged here).
