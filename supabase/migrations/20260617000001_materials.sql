-- T&B materials/items catalog: per-org, admin-managed. Readable by any T&B member,
-- writable by T&B admins. Reuses is_tb_member/is_tb_admin (jobs migration).
create table materials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  description     text,
  sku             text,
  unit_price      numeric(12, 2),
  currency        text not null default 'USD',
  type            text not null default 'non_inventory'
                    check (type in ('service', 'non_inventory', 'inventory')),
  qbo_id          text,
  qbo_sync_token  text,
  last_synced_at  timestamptz,
  sync_status     text not null default 'unsynced',
  source          text not null default 'local',
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on materials (organization_id);
create unique index materials_org_name_active_uq
  on materials (organization_id, name) where archived_at is null;
alter table materials enable row level security;

create policy member_read on materials for select to authenticated
  using (is_tb_member(organization_id));
create policy admin_write on materials for all to authenticated
  using (is_tb_admin(organization_id)) with check (is_tb_admin(organization_id));
