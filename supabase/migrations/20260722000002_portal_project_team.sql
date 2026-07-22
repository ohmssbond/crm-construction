-- Broaden the portal's people RPC from reps-only to the full project team:
-- reps + partners + customers a portal contact may see on a project they can
-- already see. Names/emails/company only — the contacts table stays unreadable
-- to portal contacts (no new RLS policy). Guarded by the existing
-- project-visibility helper, exactly like the reps RPC it replaces.

drop function if exists public.portal_project_reps(uuid);

create or replace function public.portal_project_team(p_project uuid)
returns table (name text, email text, type text, company text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
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
