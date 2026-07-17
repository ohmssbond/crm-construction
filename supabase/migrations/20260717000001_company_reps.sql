-- Company Reps: represent staff as bridge contacts (type='rep') so they can be
-- assigned to projects/tasks and shown to customers as their point of contact.

-- 1. Allow the new contact type. The init.sql inline check auto-named the
--    constraint contacts_type_check; drop and recreate it with 'rep' added.
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep'));

-- 2. Staff roster for the CALLER's CRM org. Names/emails live in auth.users,
--    which RLS-scoped clients can't read; this SECURITY DEFINER function reads
--    them and returns rows only for the caller's own org (empty for non-CRM
--    callers, so it doubles as the staff-only guard).
create or replace function public.org_crm_staff()
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select distinct u.id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                  split_part(u.email, '@', 1)),
         u.email::text
  from memberships me
  join memberships staff
    on staff.organization_id = me.organization_id
   and staff.product = 'crm'
  join auth.users u on u.id = staff.user_id
  where me.user_id = auth.uid()
    and me.product = 'crm';
$$;

grant execute on function public.org_crm_staff() to authenticated;

-- 3. Reps a portal customer may see on a project they can already see. Projects
--    ONLY name+email of type='rep' rows — the contacts table itself stays
--    unreadable to portal contacts (no new RLS policy). Guarded by the existing
--    project-visibility helper.
create or replace function public.portal_project_reps(p_project uuid)
returns table (name text, email text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                  c.email, 'Company Rep'),
         c.email::text
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  where pc.project_id = p_project
    and c.type = 'rep'
    and public.contact_can_see_project(p_project);
$$;

grant execute on function public.portal_project_reps(uuid) to authenticated;
