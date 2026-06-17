-- SKU unique per org among active materials (only when a SKU is present, so the
-- many null-SKU rows don't collide).
create unique index materials_org_sku_active_uq
  on materials (organization_id, sku) where archived_at is null and sku is not null;
