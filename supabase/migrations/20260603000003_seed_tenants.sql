-- Tenant baseline as reference data in a migration (idempotent), so it ALWAYS applies on
-- the remote. seed.sql is unreliable here: the CLI runs it only once per linked project,
-- so later config/category changes via seed.sql silently don't execute.

-- Orgs + white-label config. `do update` so config lands even when the org already exists.
insert into organizations (id, name, primary_color, member_noun, client_noun) values
  ('11111111-1111-1111-1111-111111111111', 'Gargoyle Systems',     '#5a4fcf', 'Consultant', 'Client'),
  ('22222222-2222-2222-2222-222222222222', 'J Huber Restorations', '#2f6f5e', 'Contractor', 'Customer')
on conflict (id) do update set
  name          = excluded.name,
  primary_color = excluded.primary_color,
  member_noun   = excluded.member_noun,
  client_noun   = excluded.client_noun;

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
