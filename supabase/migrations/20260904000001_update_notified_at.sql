-- An update announces itself by email exactly once — the first time it becomes visible
-- to the customer, whether that is at post time or when the Shared toggle is flipped
-- later. notified_at is what makes "once" hold across repeated toggling.
--
-- THE BACKFILL IS THE POINT: every currently-shared update is marked as already
-- announced. Without it, un-sharing and re-sharing a months-old update would email
-- "New update on ..." about it today. This assumes anything already shared was already
-- announced — true for updates posted shared; false for any shared later under the
-- previous silent behavior, whose recipients never got an email and now never will.
-- Accepted deliberately: emailing about old updates now would be worse.
--
-- No index: the column is only ever read for a single row already fetched by id.
alter table status_updates add column notified_at timestamptz;

update status_updates set notified_at = created_at where is_shared;
