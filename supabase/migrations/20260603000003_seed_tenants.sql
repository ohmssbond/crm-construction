-- Tenant baseline as reference data in a migration. Seeds the two starter orgs on a
-- FRESH environment only. Already applied to the live project (where these now exist:
-- Gargoyle Systems is a real tenant; the 2222… org was renamed to "Test Tenant").
--
-- `on conflict do nothing` (NOT `do update`): once an org exists, this must NEVER
-- overwrite its name/color/nouns — those belong to the tenant. Editing this file does
-- not re-run on the live project (the migration is already applied); it only governs
-- new/reset environments.
insert into organizations (id, name, primary_color, member_noun, client_noun) values
  ('11111111-1111-1111-1111-111111111111', 'Gargoyle Systems', '#5a4fcf', 'Consultant', 'Client'),
  ('22222222-2222-2222-2222-222222222222', 'Test Tenant',      '#2f6f5e', 'Contractor', 'Customer')
on conflict (id) do nothing;

-- Default file categories per vertical. `do nothing` to preserve any tenant edits.
insert into file_categories (organization_id, key, label, sort) values
  -- J Huber Restorations (construction)
  ('22222222-2222-2222-2222-222222222222', 'before_photo', 'Before photo', 1),
  ('22222222-2222-2222-2222-222222222222', 'after_photo',  'After photo',  2),
  ('22222222-2222-2222-2222-222222222222', 'plans',        'Plans',        3),
  ('22222222-2222-2222-2222-222222222222', 'permits',      'Permits',      4),
  ('22222222-2222-2222-2222-222222222222', 'proposal',     'Proposal',     5),
  ('22222222-2222-2222-2222-222222222222', 'contract',     'Contract',     6),
  ('22222222-2222-2222-2222-222222222222', 'invoice',      'Invoice',      7),
  ('22222222-2222-2222-2222-222222222222', 'other',        'Other',        8),
  -- Gargoyle Systems (software consultancy)
  ('11111111-1111-1111-1111-111111111111', 'prd',               'PRD',               1),
  ('11111111-1111-1111-1111-111111111111', 'tech_architecture', 'Tech architecture', 2),
  ('11111111-1111-1111-1111-111111111111', 'design',            'Design',            3),
  ('11111111-1111-1111-1111-111111111111', 'proposal',          'Proposal',          4),
  ('11111111-1111-1111-1111-111111111111', 'contract',          'Contract',          5),
  ('11111111-1111-1111-1111-111111111111', 'invoice',           'Invoice',           6),
  ('11111111-1111-1111-1111-111111111111', 'other',             'Other',             7)
on conflict (organization_id, key) do nothing;
