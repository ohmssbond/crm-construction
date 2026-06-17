-- Materials used on a job, catalog-sourced, one row per worker-added line.
-- Cost is snapshotted ("your cost") and never exposed to the worker. Maps toward
-- the pre-invoice material lines; material_id keeps catalog/QBO traceability.
create table job_material_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  material_id     uuid references materials (id) on delete restrict,
  item            text not null,
  qty             numeric(12, 3) not null check (qty > 0),
  unit_cost       numeric(12, 2),
  currency        text not null default 'USD',
  created_at      timestamptz not null default now()
);
create index on job_material_lines (organization_id, job_id);

alter table job_material_lines enable row level security;

-- Worker manages only their own lines; admin can read all (for the pre-invoice).
create policy worker_rw on job_material_lines for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_material_lines for select to authenticated
  using (is_tb_admin(organization_id));
