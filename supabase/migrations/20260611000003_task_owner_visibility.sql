-- Tasks (formerly to-dos) Step 1: owner/assignee, customer visibility, completion.
--
-- owner_contact_id: who the task is assigned to (any project contact); null = the
--   artisan's side / unassigned. In Step 2 the same column accepts Partner/Team
--   people with no schema change.
-- is_shared: team-controlled customer visibility (mirrors status_updates/attachments).
-- completed_at: stamped when marked done, cleared when reopened.
alter table todos
  add column owner_contact_id uuid references contacts (id) on delete set null,
  add column is_shared        boolean not null default false,
  add column completed_at      timestamptz;

-- Portal visibility: a contact sees a task if they OWN it, or it's SHARED on a
-- project they can see. (todos previously had no contact policy → fully internal.)
create policy contact_read on todos for select to authenticated
  using (
    owner_contact_id = current_contact_id()
    or (is_shared and contact_can_see_project(project_id))
  );
