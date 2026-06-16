# T&B Jobs CRUD (slice 3b)

_Design spec · 2026-06-16_

> Time & Billing build, slice **3b** — Jobs, built on the 3a admin shell.
> Architecture: [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md).
> PRD §6/§8.2: [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Add **Jobs** to the T&B admin surface: full CRUD under a read-only customer picker,
with a structured site address, billing type, a status lifecycle, and QBO mapping
fields. Jobs belong to a customer (a customer has many jobs).

## Decisions

| Topic | Decision |
|---|---|
| Job scheduling | Calendar `start_date` / `end_date`. |
| Status changes | **Free direct-set** dropdown (admin picks any status). The PRD's "tech taps completed / only admin re-opens" is worker-side (time-tracking slice). |
| Site address | Structured `job_*` fields; on the create form, **prefilled from the picked customer's billing address, editable**. |
| Read scope | Jobs readable by any **T&B member** (`is_tb_member`); writable by **T&B admins** (`is_tb_admin`). |
| QBO mapping | Nullable QBO fields on `jobs` now (QBO-ready). |
| Customer management | Out of scope — the picker **reads** shared customers; CRM remains the customer editor. |

## Schema — migration `supabase/migrations/20260616000003_jobs.sql`

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

**RLS helpers (security definer, like `is_org_member`):**

```sql
create function public.is_tb_member(org uuid) returns boolean ... -- any timebilling membership
create function public.is_tb_admin(org uuid)  returns boolean ... -- timebilling role = 'admin'
```

**Policies:** `member_read` SELECT `using (is_tb_member(organization_id))`;
`admin_write` `for all` `using (is_tb_admin(organization_id)) with check (is_tb_admin(organization_id))`.

## Address helper reuse

Refactor `src/lib/data/format.ts`: extract `formatAddressParts({ line1, line2, city,
state, postalCode, country })`; keep `fmtAddress(customer)` (maps `bill_*`) and add
`fmtJobLocation(job)` (maps `job_*`). No customer call-site change.

## Data — `src/lib/data/jobs.ts`

- `listJobs()` — org's non-archived jobs (RLS-scoped), newest first, each with
  `customer.name`, `status`, `billing_type`.
- `getJobDetail(id)` — job + `customer.name` + all structured fields (null if
  archived/not visible).
- `listCustomerOptions()` — active shared customers as
  `{ id, name, bill_line1, bill_line2, bill_city, bill_state, bill_postal_code, bill_country }`
  (the `bill_*` feed the form's location prefill). Reads via the customers `member_read`
  RLS added in the shared-customers slice.

## Actions — `src/app/(timebilling)/tb/jobs/actions.ts`

`createJob`, `updateJob`, `setJobStatus`, `archiveJob` — each calls `requireTbAdmin()`
first (writes are also enforced by `is_tb_admin` RLS). `createJob`/`updateJob`
validate a non-empty name and that a `fixed_price` job has a `contract_price`
(friendly error otherwise). `currency` defaults to `USD` (not surfaced in the form
this slice).

## UI — under `src/app/(timebilling)/tb/`

- **Nav/redirect:** repoint the `timebillingNav` "Jobs" item to `/tb/jobs`; `/tb`
  (the 3a placeholder `page.tsx`) becomes a redirect to `/tb/jobs`.
- `tb/jobs/page.tsx` — jobs list (name, customer, status chip via the existing `Chip`,
  billing type); empty state; "New job".
- `tb/jobs/new/page.tsx` + `tb/jobs/[id]/edit/page.tsx` — render `JobForm`.
- `tb/jobs/[id]/page.tsx` — detail (fields + `fmtJobLocation`) + `JobStatusControl` +
  Edit link + `ArchiveButton` (reuse the existing component).
- `JobForm.tsx` (client) — a customer `<select>` (from `listCustomerOptions`) whose
  `onChange` **prefills the controlled `job_*` address fields from the chosen
  customer's billing address (still editable)**; `name`; structured location;
  `description`; `notes`; `start_date`/`end_date` date inputs; a `billing_type`
  `<select>` that reveals a `contract_price` input when `fixed_price`.
- `JobStatusControl.tsx` (client) — a status `<select>` (open/in_progress/completed)
  that calls `setJobStatus` in a transition.

## Testing

- **Unit (Vitest):** `fmtJobLocation` — joins `job_*` parts; partial; empty.
- **Regression (manual, as the T&B admin):** create a job under a picked customer —
  the location prefills from that customer and remains editable; the job persists and
  lists; edit it; change status via the dropdown; archive it; a `fixed_price` job with
  no contract price is rejected; detail renders the formatted location.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (jobs table + RLS), deploy, then the regression checks above as the
seeded `timebilling:admin`.

## Out of scope (later slices)

- Materials catalog (next slice).
- Worker-side job access + "tap completed" / admin re-open rules (time-tracking slice;
  `is_tb_member` already permits worker reads at the DB level).
- Full T&B customer create/edit UI; QBO sync logic.
