-- Shared customers: structured billing address + contact + nullable QBO mapping
-- fields, migrate the freeform address into bill_line1, drop address, add a
-- unique display name (among non-archived), and let T&B members read customers.
alter table customers
  add column bill_line1       text,
  add column bill_line2       text,
  add column bill_city        text,
  add column bill_state       text,
  add column bill_postal_code text,
  add column bill_country     text,
  add column email            text,
  add column phone            text,
  add column qbo_id           text,
  add column qbo_sync_token   text,
  add column last_synced_at   timestamptz,
  add column sync_status      text not null default 'unsynced',
  add column source           text not null default 'local';

update customers set bill_line1 = address where address is not null;
alter table customers drop column address;

create unique index customers_org_name_active_uq
  on customers (organization_id, name) where archived_at is null;

-- Shared read: any org staff member (CRM or T&B) can read customers. Writes stay
-- CRM-only via the existing artisan_all policy.
create policy member_read on customers for select to authenticated
  using (is_org_member_any(organization_id));
