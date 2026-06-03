-- Tenant configuration + flexible file model.
-- Onboarding two verticals at launch (J Huber = construction, Gargoyle = software
-- consultancy) promotes white-label config from "post-MVP" into MVP. See docs/mvp-spec.md.

-- 1. Per-tenant white-label config -------------------------------------------------
alter table organizations
  add column primary_color text not null default '#2f6f5e', -- brand accent, set on the shell root
  add column member_noun   text not null default 'Contractor', -- e.g. Contractor | Consultant
  add column client_noun   text not null default 'Customer';   -- e.g. Customer | Client

-- 2. Per-tenant file categories (replaces the fixed attachments.category enum) ------
create table file_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  key             text not null,        -- stable machine value stored on attachments.category
  label           text not null,        -- display name
  icon            text,                 -- optional glyph / icon name
  sort            int not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, key)
);
create index on file_categories (organization_id);

alter table file_categories enable row level security;

create policy artisan_all on file_categories for all to authenticated
  using (is_org_member(organization_id)) with check (is_org_member(organization_id));

-- Portal contacts read category labels for orgs where they can see a project.
create policy contact_read on file_categories for select to authenticated
  using (
    exists (
      select 1 from projects p
      where p.organization_id = file_categories.organization_id
        and contact_can_see_project(p.id)
    )
  );

-- 3. Point attachments.category at the per-tenant list (drop the fixed CHECK) -------
alter table attachments drop constraint attachments_category_check;
alter table attachments add constraint attachments_category_fk
  foreign key (organization_id, category)
  references file_categories (organization_id, key);

-- 4. Attachments can be an uploaded file OR an external link (Google Docs/Sheets) ---
alter table attachments
  add column kind text not null default 'file' check (kind in ('file', 'link')),
  add column url  text;
alter table attachments alter column storage_path drop not null;
alter table attachments add constraint attachments_kind_target_check check (
  (kind = 'file' and storage_path is not null) or
  (kind = 'link' and url is not null)
);
