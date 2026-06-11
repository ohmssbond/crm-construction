-- Phase 1 prod-grade auth: custom access-token hook.
--
-- Stamps fresh role/org/contact claims into every JWT (mint + refresh), derived
-- live from organization_members / contacts — instead of being copied once into
-- app_metadata at provisioning time (which goes stale and needs re-stamping).
-- The app reads `user_role` / `org_id` / `contact_id` from the token, falling
-- back to app_metadata during rollout.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims    jsonb := event -> 'claims';
  uid       uuid  := (event ->> 'user_id')::uuid;
  v_role    text;
  v_org     uuid;
  v_contact uuid;
begin
  -- Artisan: a member of an org.
  select 'artisan', om.organization_id
    into v_role, v_org
  from public.organization_members om
  where om.user_id = uid
  limit 1;

  -- Otherwise: a portal contact.
  if v_role is null then
    select 'contact', c.organization_id, c.id
      into v_role, v_org, v_contact
    from public.contacts c
    where c.user_id = uid
    limit 1;
  end if;

  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{org_id}',    to_jsonb(v_org::text));
    if v_contact is not null then
      claims := jsonb_set(claims, '{contact_id}', to_jsonb(v_contact::text));
    end if;
    event := jsonb_set(event, '{claims}', claims);
  end if;

  return event;
end;
$$;

-- The Auth server invokes the hook as supabase_auth_admin: grant execute, deny
-- everyone else, and let it read the two lookup tables (RLS is on for both).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on public.organization_members to supabase_auth_admin;
grant select on public.contacts to supabase_auth_admin;

create policy auth_admin_read on public.organization_members
  for select to supabase_auth_admin using (true);
create policy auth_admin_read on public.contacts
  for select to supabase_auth_admin using (true);
