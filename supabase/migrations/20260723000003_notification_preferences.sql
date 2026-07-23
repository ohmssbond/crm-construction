-- Per-user notification preferences + the recipient resolver for project-update
-- emails. Absent row = notify (default on), so no backfill is needed.

create table notification_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  project_updates boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table notification_preferences enable row level security;

-- A user reads/writes only their own preferences.
create policy own_prefs on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Resolve the notifiable recipients for a project's team (customers, partners,
-- reps), skipping the author and anyone opted out. SECURITY DEFINER because
-- recipient filtering must read OTHER users' preference rows (normal RLS forbids).
-- Prefers each recipient's live auth login email, falling back to the contact's
-- CRM email. Guarded so only a CRM staff member of the project's org can list them.
create or replace function public.project_notification_recipients(
  p_project uuid,
  p_exclude_user uuid
)
returns table (email text, type text)
language sql stable security definer set search_path = public as $$
  select distinct coalesce(u.email, c.email)::text as email, c.type
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  left join auth.users u on u.id = c.user_id
  left join notification_preferences np on np.user_id = c.user_id
  where pc.project_id = p_project
    and c.type in ('rep', 'partner', 'customer')
    and coalesce(np.project_updates, true) = true
    and (c.user_id is distinct from p_exclude_user)
    and coalesce(u.email, c.email) is not null
    and exists (
      select 1 from projects p
      join memberships m on m.organization_id = p.organization_id
      where p.id = p_project and m.user_id = auth.uid() and m.product = 'crm'
    );
$$;
grant execute on function public.project_notification_recipients(uuid, uuid) to authenticated;
