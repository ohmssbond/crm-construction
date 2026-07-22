-- #3: revise file categories. The table-wide CHECK gains the new document
-- categories plus the 'photo' placeholder for uncategorized photo uploads
-- (Cycle B #2). Per-org dropdown changes are scoped to CONSTRUCTION-vertical orgs
-- (identified by having a 'plans' category); the software vertical keeps its own
-- set. Legacy attachments retain any before_photo/after_photo category value
-- (still constraint-valid) — no data migration.

-- 1. Widen the attachments.category CHECK, preserving all existing values.
alter table attachments drop constraint attachments_category_check;
alter table attachments add constraint attachments_category_check
  check (category in ('before_photo', 'after_photo', 'plans', 'permits', 'proposal',
                      'contract', 'invoice', 'other', 'surveys', 'designs', 'photo'));

-- 2. Revise the dropdown categories for construction orgs only.
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

    delete from file_categories
      where organization_id = c_org and key in ('before_photo', 'after_photo');
  end loop;
end $$;
