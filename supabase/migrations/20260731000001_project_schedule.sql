-- Project Schedule: a two-level plan (Phase → Task) per project.
--
-- Naming: the schedule_ prefix is deliberate. `attachments.phase` already means the
-- before/during/after PHOTO tag, and `todos` is the day-to-day To-Do list. Neither is
-- related to this.
--
-- Visibility: unlike status_updates and attachments there is NO is_shared column.
-- The ENTIRE schedule is visible to any contact attached to the project — that is the
-- product decision, and it is enforced here in RLS rather than only in the UI.

create table schedule_phases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  projected_date  date,
  projected_note  text,
  start_date      date,
  complete_date   date,
  created_at      timestamptz not null default now()
);

-- project_id is denormalized (derivable via phase_id) so the contact_read policy is
-- identical on both tables and portal reads need no join.
create table schedule_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  phase_id        uuid not null references schedule_phases (id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  projected_date  date,
  projected_note  text,
  start_date      date,
  complete_date   date,
  created_at      timestamptz not null default now()
);

create index schedule_phases_project_idx on schedule_phases (project_id, position);
create index schedule_tasks_phase_idx    on schedule_tasks (phase_id, position);
create index schedule_tasks_project_idx  on schedule_tasks (project_id);

alter table schedule_phases enable row level security;
alter table schedule_tasks  enable row level security;

-- Tenant staff (memberships product='crm', role owner|artisan): full read/write on
-- their own org's rows. Same shape as every other tenant table.
create policy artisan_all on schedule_phases for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on schedule_tasks for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- Portal contacts (customers + partners): read-only, EVERY row on a project they can
-- see. NOTE the deliberate absence of an is_shared condition — compare the
-- status_updates and attachments contact_read policies, which do filter on it.
create policy contact_read on schedule_phases for select to authenticated
  using (contact_can_see_project(project_id));

create policy contact_read on schedule_tasks for select to authenticated
  using (contact_can_see_project(project_id));
