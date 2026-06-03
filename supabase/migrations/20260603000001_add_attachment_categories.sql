-- Reconcile attachments.category with mvp-spec.md: add 'plans' and 'permits'.
-- The original CHECK was created inline, so Postgres named it attachments_category_check.

alter table attachments drop constraint attachments_category_check;

alter table attachments add constraint attachments_category_check
  check (category in ('before_photo', 'after_photo', 'plans', 'permits',
                      'proposal', 'contract', 'invoice', 'other'));
