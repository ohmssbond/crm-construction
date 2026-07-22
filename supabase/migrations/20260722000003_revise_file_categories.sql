-- Cycle B #3 — revise file categories.
--
-- Category validity is a PER-ORG FOREIGN KEY, not a table-wide CHECK:
-- 20260603000002 dropped attachments_category_check and added
-- attachments_category_fk: attachments(organization_id, category) ->
-- file_categories(organization_id, key). So category changes are file_categories
-- ROW operations; a category value is usable by an org only if that org has the row.

-- 1. Give EVERY org a 'photo' category so category-less photo uploads (recorded as
--    category='photo') satisfy the FK. Inserted archived so it never appears in the
--    Files dropdown (the dropdown query filters archived rows); the FK is satisfied
--    regardless of archived_at. Photo upload is a global feature, not construction-only.
insert into file_categories (organization_id, key, label, sort, archived_at)
select o.id,
       'photo',
       'Photo',
       coalesce((select max(fc.sort) from file_categories fc where fc.organization_id = o.id), 0) + 1,
       now()
from organizations o
on conflict (organization_id, key) do nothing;

-- 2. Construction orgs only (identified by having a 'plans' category): add
--    Surveys/Designs, relabel Contract -> Contracts, and retire Before/After photo
--    from the dropdown. Retire = soft-delete via archived_at: legacy attachments
--    still reference those rows through the FK, so they cannot be hard-deleted.
do $$
declare
  c_org uuid;
  v_sort int;
begin
  for c_org in
    select distinct organization_id from file_categories where key = 'plans'
  loop
    select coalesce(max(sort), 0) into v_sort
      from file_categories where organization_id = c_org;

    insert into file_categories (organization_id, key, label, sort) values
      (c_org, 'surveys', 'Surveys', v_sort + 1),
      (c_org, 'designs', 'Designs', v_sort + 2)
    on conflict (organization_id, key) do nothing;

    update file_categories set label = 'Contracts'
      where organization_id = c_org and key = 'contract';

    update file_categories set archived_at = now()
      where organization_id = c_org and key in ('before_photo', 'after_photo');
  end loop;
end $$;
