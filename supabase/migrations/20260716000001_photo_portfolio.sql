-- Customer Portal Photo Portfolio: per-photo phase, four headline slots, update photo+title.
-- Purely additive & nullable. No new RLS — new columns inherit each table's existing policies.

-- 1. Per-photo phase for the portal gallery grouping. Null = untagged/general.
alter table attachments
  add column phase text
    check (phase is null or phase in ('before', 'during', 'after'));

-- 2. Four headline slots on the project. on delete set null → a deleted photo
--    clears the slot (no dangling ref; slot falls back to the branded placeholder).
alter table projects
  add column cover_attachment_id  uuid references attachments (id) on delete set null,
  add column hero_attachment_id   uuid references attachments (id) on delete set null,
  add column before_attachment_id uuid references attachments (id) on delete set null,
  add column after_attachment_id  uuid references attachments (id) on delete set null;

-- 3. Optional title + lead photo on a status update.
alter table status_updates
  add column title text,
  add column photo_attachment_id uuid references attachments (id) on delete set null;
