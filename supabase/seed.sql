-- Seed: the two MVP tenants (admin console is deferred; onboard manually).
-- Fixed UUIDs so they're stable to reference from app code / later seeds.

insert into organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Gargoyle Systems'),
  ('22222222-2222-2222-2222-222222222222', 'J Huber Restorations')
on conflict (id) do nothing;

-- Artisan logins can't be seeded here: auth.users rows are created through Supabase
-- Auth (signup / invite), not SQL. After an artisan signs up, link them to a tenant:
--
--   insert into organization_members (organization_id, user_id, role)
--   values ('11111111-1111-1111-1111-111111111111', '<auth-user-uuid>', 'owner');
--
-- Find the user's uuid in the Supabase dashboard (Authentication → Users) or via
-- `select id, email from auth.users;`.
