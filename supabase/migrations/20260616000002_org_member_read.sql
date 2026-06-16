-- T&B admin shell: any org member (incl. timebilling-only) can read their org's
-- branding for the shell. CRM artisan_all (write) + contact_read stay unchanged.
create policy member_read on organizations for select to authenticated
  using (is_org_member_any(id));
