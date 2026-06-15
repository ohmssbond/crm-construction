-- Foundation 1b: drop the back-compat user_role claim (app now routes by roles object + contact_id). Hook otherwise unchanged.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims    jsonb := event -> 'claims';
  uid       uuid  := (event ->> 'user_id')::uuid;
  v_org     uuid;
  v_contact uuid;
  v_roles   jsonb;
begin
  select m.organization_id, jsonb_object_agg(m.product, m.role)
    into v_org, v_roles
  from public.memberships m
  where m.user_id = uid
  group by m.organization_id
  limit 1;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{roles}',  v_roles);
  else
    select c.organization_id, c.id into v_org, v_contact
      from public.contacts c where c.user_id = uid limit 1;
    if v_org is not null then
      claims := jsonb_set(claims, '{org_id}',     to_jsonb(v_org::text));
      claims := jsonb_set(claims, '{contact_id}', to_jsonb(v_contact::text));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
