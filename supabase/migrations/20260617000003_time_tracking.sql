-- T&B time tracking: pay track (work_days) + job track (job_time_entries /
-- job_time_segments). Times are time-of-day. Workers read/write their own rows;
-- admins read (for the later report/payroll). Reuses is_tb_member/is_tb_admin.

create table work_days (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  work_date       date not null,
  start_time      time not null,
  end_time        time,
  status          text not null default 'open' check (status in ('open', 'closed')),
  created_at      timestamptz not null default now(),
  unique (organization_id, worker_user_id, work_date)
);
create index on work_days (organization_id, worker_user_id);

create table job_time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  entry_date      date not null,
  no_charge       boolean not null default false,
  qbo_id          text,
  qbo_sync_token  text,
  last_synced_at  timestamptz,
  sync_status     text not null default 'unsynced',
  source          text not null default 'local',
  created_at      timestamptz not null default now(),
  unique (organization_id, job_id, worker_user_id, entry_date)
);
create index on job_time_entries (organization_id, job_id);

create table job_time_segments (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references job_time_entries (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  time_in         time not null,
  time_out        time,
  created_at      timestamptz not null default now()
);
create index on job_time_segments (entry_id);

alter table work_days enable row level security;
alter table job_time_entries enable row level security;
alter table job_time_segments enable row level security;

-- Worker self read/write + admin read, on each table.
create policy worker_rw on work_days for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on work_days for select to authenticated
  using (is_tb_admin(organization_id));

create policy worker_rw on job_time_entries for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_time_entries for select to authenticated
  using (is_tb_admin(organization_id));

create policy worker_rw on job_time_segments for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_time_segments for select to authenticated
  using (is_tb_admin(organization_id));
