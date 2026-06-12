-- Per-tenant display timezone. Stored timestamps stay UTC (timestamptz); this only
-- controls how timestamps are rendered in the artisan app and the customer portal.
alter table organizations
  add column timezone text not null default 'America/New_York';
