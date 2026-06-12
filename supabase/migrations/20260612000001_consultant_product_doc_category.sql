-- Add a "Product Documentation" file category to the Consultant tenant.
-- File categories are per-org and there's no settings UI for them yet, so this
-- is applied via migration. Idempotent; errors if no Consultant org exists.
do $$
declare
  v_org  uuid;
  v_sort int;
begin
  select id into v_org from organizations where lower(member_noun) = 'consultant' limit 1;
  if v_org is null then
    raise exception 'No organization with member_noun = Consultant';
  end if;

  select coalesce(max(sort), 0) + 1 into v_sort
    from file_categories where organization_id = v_org;

  insert into file_categories (organization_id, key, label, sort)
  values (v_org, 'product_documentation', 'Product Documentation', v_sort)
  on conflict (organization_id, key) do nothing;
end $$;
