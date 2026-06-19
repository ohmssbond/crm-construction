-- Per-org worker profile (name, for now). The eventual Worker entity (maps to a QBO
-- Employee/Vendor); admin-managed, worker reads own.
create table tb_workers (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table tb_workers enable row level security;

-- Admin manages every worker in the org.
create policy admin_rw on tb_workers for all to authenticated
  using (is_tb_admin(organization_id))
  with check (is_tb_admin(organization_id));

-- A worker may read only their own profile (drives the /log shell greeting).
create policy worker_read_own on tb_workers for select to authenticated
  using (user_id = auth.uid() and is_tb_member(organization_id));
