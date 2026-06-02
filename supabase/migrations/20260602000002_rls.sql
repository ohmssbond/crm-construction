-- Artisan Project Hub — Row-Level Security
--
-- Two access shapes:
--   • Artisan  → full CRUD on every row in orgs they are a member of.
--   • Contact  → read-only, and only: projects they're attached to, and within those
--                only is_shared status updates / attachments. Todos are never exposed.
--
-- Helper functions are SECURITY DEFINER so they read membership/contact tables with
-- RLS bypassed — this avoids infinite policy recursion and keeps policies fast.

-- ─────────────────────────────────────────────────────────────────────────────
-- Authorization helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.current_contact_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from contacts where user_id = auth.uid() limit 1;
$$;

create or replace function public.contact_can_see_project(proj uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_contacts pc
    where pc.project_id = proj
      and pc.contact_id = public.current_contact_id()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table organizations        enable row level security;
alter table organization_members enable row level security;
alter table customers             enable row level security;
alter table contacts              enable row level security;
alter table projects              enable row level security;
alter table project_contacts      enable row level security;
alter table status_updates        enable row level security;
alter table todos                 enable row level security;
alter table attachments           enable row level security;
alter table invitations           enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Artisan policies — full access within their org
-- (FOR ALL covers SELECT/INSERT/UPDATE/DELETE; contact SELECT policies OR in below.)
-- ─────────────────────────────────────────────────────────────────────────────

create policy artisan_all on organizations for all to authenticated
  using (is_org_member(id)) with check (is_org_member(id));

create policy artisan_all on organization_members for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on customers for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on contacts for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on projects for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on project_contacts for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on status_updates for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on todos for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on attachments for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy artisan_all on invitations for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Contact (portal) policies — read-only, attachment-scoped, shared-gated
-- ─────────────────────────────────────────────────────────────────────────────

-- See the customer behind any project they can see.
create policy contact_read on customers for select to authenticated
  using (
    exists (
      select 1 from projects p
      where p.customer_id = customers.id
        and p.archived_at is null
        and contact_can_see_project(p.id)
    )
  );

-- See attached, non-archived projects.
create policy contact_read on projects for select to authenticated
  using (archived_at is null and contact_can_see_project(id));

-- See only shared status updates on visible projects.
create policy contact_read on status_updates for select to authenticated
  using (is_shared and contact_can_see_project(project_id));

-- See only shared attachments on visible projects.
create policy contact_read on attachments for select to authenticated
  using (is_shared and contact_can_see_project(project_id));

-- NOTE: todos, project_contacts, contacts, invitations, organizations, members have
-- NO contact policy → portal users cannot read them. Todos stay internal by design.

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: private bucket for project files
-- Path convention: {organization_id}/{project_id}/{filename}
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- Artisans: full read/write within their org's top-level folder.
create policy "artisan rw project files" on storage.objects for all to authenticated
  using (
    bucket_id = 'project-files'
    and is_org_member(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'project-files'
    and is_org_member(nullif((storage.foldername(name))[1], '')::uuid)
  );

-- Contacts: download a file only if its attachment row is shared and the project is visible.
create policy "contact read shared files" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and exists (
      select 1 from public.attachments a
      where a.storage_path = storage.objects.name
        and a.is_shared
        and contact_can_see_project(a.project_id)
    )
  );
