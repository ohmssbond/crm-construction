-- Artisan Project Hub — schema (entities from docs/mvp-spec.md)
-- Postgres 15+ (Supabase). gen_random_uuid() is in core; no extension needed.
--
-- Multi-tenant model: every tenant-owned row carries organization_id (denormalized)
-- so RLS policies can authorize against org membership without walking the FK chain.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────────────────────────────────────

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Artisan logins. Both artisans and portal contacts are auth.users; this table is
-- what makes a user an *artisan* of an org. (Contacts get access via contacts.user_id.)
create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'artisan' check (role in ('artisan', 'owner')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Core entities
-- ─────────────────────────────────────────────────────────────────────────────

create table customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  address         text,
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- People. type drives semantics; user_id (nullable) is set only once they have a login.
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id     uuid references customers (id) on delete set null,
  user_id         uuid unique references auth.users (id) on delete set null,
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  type            text not null check (type in ('partner', 'prospect', 'customer')),
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table projects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id     uuid not null references customers (id) on delete restrict,
  name            text not null,                       -- may be the site address
  stage           text not null default 'proposal'
                    check (stage in ('proposal', 'signed', 'in_progress', 'completed')),
  start_date      date,
  end_date        date,
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Access grant: a contact sees a project iff a row links them here.
create table project_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  contact_id      uuid not null references contacts (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (project_id, contact_id)
);

create table status_updates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  body            text not null,
  is_shared       boolean not null default false,      -- gates portal visibility
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Internal only — never exposed to the portal (no contact SELECT policy below).
create table todos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  body            text not null,
  due_date        date,
  done            boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Unified file entity (replaces before/after photos + documents).
create table attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id      uuid not null references projects (id) on delete cascade,
  storage_path    text not null,                       -- key in the project-files bucket
  category        text not null
                    check (category in ('before_photo', 'after_photo',
                                        'proposal', 'contract', 'invoice', 'other')),
  filename        text,
  size_bytes      bigint,
  mime_type       text,
  is_shared       boolean not null default false,      -- gates portal visibility
  uploaded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  contact_id      uuid not null references contacts (id) on delete cascade,
  email           text not null,
  token           text not null unique,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'expired')),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes (FKs + common filters)
-- ─────────────────────────────────────────────────────────────────────────────

create index on organization_members (user_id);
create index on customers (organization_id);
create index on contacts (organization_id);
create index on contacts (customer_id);
create index on contacts (user_id);
create index on projects (organization_id);
create index on projects (customer_id);
create index on project_contacts (organization_id);
create index on project_contacts (project_id);
create index on project_contacts (contact_id);
create index on status_updates (project_id);
create index on todos (project_id);
create index on attachments (project_id);
create index on attachments (storage_path);
create index on invitations (organization_id);
create index on invitations (contact_id);
