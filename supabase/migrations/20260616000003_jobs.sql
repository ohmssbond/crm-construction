-- T&B jobs: customer-scoped work with structured site address, billing type,
-- status lifecycle, and nullable QBO mapping. Readable by any T&B member,
-- writable by T&B admins.
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

-- Role helpers (security definer, like is_org_member).
create or replace function public.is_tb_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.product = 'timebilling'
  );
$$;

create or replace function public.is_tb_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org and m.user_id = auth.uid()
      and m.product = 'timebilling' and m.role = 'admin'
  );
$$;

create policy member_read on jobs for select to authenticated
  using (is_tb_member(organization_id));
create policy admin_write on jobs for all to authenticated
  using (is_tb_admin(organization_id)) with check (is_tb_admin(organization_id));
