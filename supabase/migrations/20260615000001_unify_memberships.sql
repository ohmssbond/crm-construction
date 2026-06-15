-- Foundation 1a: unify staff roles into per-product `memberships`, add per-org
-- `organization_products` entitlements, migrate the auth hook + is_org_member off
-- `organization_members`, then drop it. CRM behavior is preserved: the hook still
-- stamps user_role='artisan' for CRM staff, and is_org_member now means "has a crm
-- membership" — which every backfilled member satisfies.

-- 1. memberships ------------------------------------------------------------
create table memberships (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  product         text not null check (product in ('crm', 'timebilling')),
  role            text not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id, product),
  check (
    (product = 'crm' and role in ('owner', 'artisan')) or
    (product = 'timebilling' and role in ('admin', 'worker'))
  )
);
create index on memberships (user_id);
alter table memberships enable row level security;

-- 2. organization_products (per-org entitlements) ---------------------------
create table organization_products (
  organization_id uuid not null references organizations (id) on delete cascade,
  product         text not null check (product in ('crm', 'timebilling')),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, product)
);
alter table organization_products enable row level security;

-- 3. Backfill (all existing members are CRM staff) --------------------------
insert into memberships (organization_id, user_id, product, role, created_at)
  select organization_id, user_id, 'crm', role, created_at from organization_members;

insert into organization_products (organization_id, product, status)
  select distinct organization_id, 'crm', 'active' from organization_members
on conflict do nothing;

-- 4. is_org_member → "has a crm membership" (preserves all CRM RLS behavior) -
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.product = 'crm'
  );
$$;

-- 5. RLS on the new tables (reads for staff; writes are service-role only) ---
create policy self_or_member_read on memberships for select to authenticated
  using (user_id = auth.uid() or is_org_member(organization_id));
create policy member_read on organization_products for select to authenticated
  using (is_org_member(organization_id));

-- 6. Let the Auth server read memberships for the access-token hook ----------
grant select on memberships to supabase_auth_admin;
create policy auth_admin_read on memberships for select to supabase_auth_admin using (true);

-- 7. Rewrite the access-token hook off organization_members ------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims    jsonb := event -> 'claims';
  uid       uuid  := (event ->> 'user_id')::uuid;
  v_org     uuid;
  v_contact uuid;
  v_roles   jsonb;
begin
  -- Staff: this user's per-product roles within their (single) org.
  select m.organization_id, jsonb_object_agg(m.product, m.role)
    into v_org, v_roles
  from public.memberships m
  where m.user_id = uid
  group by m.organization_id
  limit 1;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{roles}',  v_roles);
    -- Back-compat: keep the legacy single-role claim for CRM staff (1b drops it).
    if v_roles ? 'crm' then
      claims := jsonb_set(claims, '{user_role}', to_jsonb('artisan'::text));
    end if;
  else
    -- Otherwise: a portal contact (unchanged behavior).
    select c.organization_id, c.id into v_org, v_contact
      from public.contacts c where c.user_id = uid limit 1;
    if v_org is not null then
      claims := jsonb_set(claims, '{user_role}',  to_jsonb('contact'::text));
      claims := jsonb_set(claims, '{org_id}',     to_jsonb(v_org::text));
      claims := jsonb_set(claims, '{contact_id}', to_jsonb(v_contact::text));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- 8. Drop the old table (data already backfilled in step 3) ------------------
drop table organization_members;
