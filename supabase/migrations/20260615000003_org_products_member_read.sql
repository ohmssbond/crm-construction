-- Fix (1b): workers have no CRM membership, so the crm-only is_org_member blocks
-- them from reading their org's product entitlements. Add a product-agnostic
-- membership check and repoint the organization_products read policy at it.
-- is_org_member stays crm-only (CRM RLS unchanged).
create or replace function public.is_org_member_any(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

drop policy member_read on organization_products;
create policy member_read on organization_products for select to authenticated
  using (is_org_member_any(organization_id));
