-- Rep names in portal_project_team were coming from contacts.first_name, which is
-- a SNAPSHOT copied onto the rep bridge contact at assignment time (assignRep) and
-- never updated when the staff member renames. Live-derive the name for type='rep'
-- rows from the staff's CURRENT auth.users full_name instead (the SECURITY DEFINER
-- function can read auth.users, same as org_crm_staff). Falls back to the stored
-- name/email if the user is gone.
--
-- create-or-replace only (same signature) — backward compatible, no tight window.
create or replace function public.portal_project_team(p_project uuid)
returns table (id uuid, name text, email text, type text, company text)
language sql stable security definer set search_path = public as $$
  select c.id,
         case
           when c.type = 'rep' then
             coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
                      nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                      c.email, 'Company Rep')
           else
             coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                      c.email,
                      case c.type when 'partner' then 'Partner' else 'Customer' end)
         end,
         c.email::text,
         c.type,
         c.company
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  left join auth.users u on u.id = c.user_id
  where pc.project_id = p_project
    and c.type in ('rep', 'partner', 'customer')
    and public.contact_can_see_project(p_project);
$$;

grant execute on function public.portal_project_team(uuid) to authenticated;
