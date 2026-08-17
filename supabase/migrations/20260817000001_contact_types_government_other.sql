-- Two more contact types: Government (building departments, permit offices,
-- inspectors, utilities) and Other (the catch-all).
--
-- INTERNAL ONLY BY DESIGN: neither reaches the customer portal. portal_project_team
-- filters `c.type in ('rep','partner','customer')` and groupProjectTeam has three
-- buckets, so both already exclude these — deliberately, so a building inspector's
-- details are never published to a homeowner. Do not widen either to match this list.
--
-- The constraint only widens, so every existing row stays valid; no data migration.
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep', 'government', 'other'));
