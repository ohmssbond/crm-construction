-- Worker-authored work-performed notes on a job; appended, surfaced in the
-- Description of Work (report + export). Per-worker ownership.
create table job_work_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on job_work_notes (organization_id, job_id);

alter table job_work_notes enable row level security;

create policy worker_rw on job_work_notes for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_work_notes for select to authenticated
  using (is_tb_admin(organization_id));
