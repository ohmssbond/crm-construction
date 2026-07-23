-- Add the contact id to portal_project_team so the portal can map a task's
-- owner_contact_id to the owner's display name (contacts stay unreadable to
-- portal users; this RPC is the only exposure, gated by contact_can_see_project).
--
-- Changing the RETURNS TABLE signature requires drop + recreate. Additive: the
-- new `id` column is ignored by the existing roster caller, so the currently
-- live code keeps working after this applies.
drop function if exists public.portal_project_team(uuid);

create or replace function public.portal_project_team(p_project uuid)
returns table (id uuid, name text, email text, type text, company text)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                  c.email,
                  case c.type
                    when 'rep' then 'Company Rep'
                    when 'partner' then 'Partner'
                    else 'Customer'
                  end),
         c.email::text,
         c.type,
         c.company
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  where pc.project_id = p_project
    and c.type in ('rep', 'partner', 'customer')
    and public.contact_can_see_project(p_project);
$$;

grant execute on function public.portal_project_team(uuid) to authenticated;
