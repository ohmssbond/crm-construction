-- Company/firm a partner contact belongs to. Nullable; only populated for
-- type='partner' rows (the write path nulls it for other types). Plain text —
-- no partner-org entity.
alter table contacts add column company text;
