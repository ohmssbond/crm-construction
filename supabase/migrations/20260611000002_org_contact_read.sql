-- Phase 1 prod-grade auth: let a portal contact read their own organization's
-- branding row (name, color, member/client nouns), so the portal reads live
-- config from the DB instead of a stale app_metadata copy.
--
-- Artisans already read their org via is_org_member. This adds the contact path
-- through a SECURITY DEFINER helper (bypasses the contacts RLS for the lookup and
-- is independent of the access-token hook, so it works even if the hook is rolled
-- back). Matches the existing per-table `contact_read` policy convention.

create or replace function public.current_contact_org()
returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from contacts where user_id = auth.uid() limit 1;
$$;

create policy contact_read on organizations for select to authenticated
  using (id = public.current_contact_org());
