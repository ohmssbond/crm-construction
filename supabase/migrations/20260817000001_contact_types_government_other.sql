-- Two more contact types: Government (building departments, permit offices,
-- inspectors, utilities) and Other (the catch-all).
--
-- EXCLUDED FROM THE PORTAL ROSTER AND FROM UPDATE-NOTIFICATION EMAILS, BY DESIGN.
-- portal_project_team filters `c.type in ('rep','partner','customer')`, groupProjectTeam
-- has three buckets, and project_notification_recipients filters the same three types —
-- all three already exclude 'government' and 'other', deliberately, so a building
-- inspector's details are never shown in "Your Project Team" and inspectors don't get
-- project-update emails. Do not widen any of the three to match this list.
--
-- This is NOT a portal access control. Whether a contact's linked user can sign in and
-- see a project at all is governed separately by project_contacts membership
-- (contact_can_see_project()), which does not check contact type — nothing here changes
-- or narrows that.
--
-- The constraint only widens, so every existing row stays valid; no data migration.
alter table contacts drop constraint contacts_type_check;
alter table contacts add constraint contacts_type_check
  check (type in ('partner', 'prospect', 'customer', 'rep', 'government', 'other'));
