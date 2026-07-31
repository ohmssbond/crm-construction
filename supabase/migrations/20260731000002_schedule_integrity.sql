-- Schedule integrity hardening: two gaps flagged in the final review of
-- 20260731000001_project_schedule.sql. Both tables are still empty in
-- production at the time of this migration, so neither change can be
-- rejected by existing rows and no backfill is needed — this is the
-- cheapest moment to add them.

-- 1. Cross-org write guard on schedule_phases / schedule_tasks.
--
--    artisan_all's `with check (is_org_member(organization_id))` only proves
--    the caller belongs to the org named in the row. It does NOT prove the
--    row's project_id actually belongs to that org. Without this, a member
--    of org A can write a schedule_phases/schedule_tasks row with
--    organization_id = A and project_id = <some project in org B>, planting
--    a row that org B's own portal contacts (via contact_read, which trusts
--    project_id) can then read. Same failure mode already fixed for
--    project_contacts in 20260717000001_company_reps.sql; mirror it here
--    rather than inventing a new helper. public.project_in_org is
--    SECURITY DEFINER and already granted to authenticated, so it is reused
--    as-is — do not redefine it.
--
--    `alter policy ... with check (...)` only replaces the with-check
--    clause; the existing `using (is_org_member(organization_id))` clause
--    is left untouched, which is what we want (reads are unaffected).

alter policy artisan_all on schedule_phases
  with check (
    is_org_member(organization_id)
    and public.project_in_org(project_id, organization_id)
  );

alter policy artisan_all on schedule_tasks
  with check (
    is_org_member(organization_id)
    and public.project_in_org(project_id, organization_id)
  );

-- 2. Make schedule_tasks.project_id provably agree with its phase's project.
--
--    schedule_tasks.project_id is denormalized (also reachable via
--    phase_id -> schedule_phases.project_id) purely so contact_read can
--    filter without a join. Nothing today forces the two to agree. A row
--    written with a phase_id from project X but project_id = Y is silently
--    dropped by the app's orphan guard when rendering project X's staff
--    schedule — so it vanishes from the UI that would let anyone notice or
--    fix it — while remaining a live row, still readable by project Y's
--    portal contacts via contact_read (which trusts project_id, not
--    phase_id). That is a real information leak, not just a cosmetic bug.
--
--    Enforce agreement declaratively with a composite FK instead of relying
--    on application code:
--      - add a composite unique key on schedule_phases(id, project_id) —
--        safe/cheap since id is already unique per row, this just lets a
--        second table reference the pair;
--      - drop the existing single-column phase_id FK (verified live via
--        `supabase db query --linked` against pg_constraint: the
--        auto-generated name is schedule_tasks_phase_id_fkey, matching
--        Postgres's <table>_<column>_fkey convention — not assumed);
--      - replace it with a composite FK on (phase_id, project_id) that
--        references the new (id, project_id) key. Postgres will now reject
--        any insert/update where the task's project_id doesn't match its
--        phase's project_id.
--    ON DELETE CASCADE is preserved on the replacement FK: deleting a phase
--    must still remove its tasks, exactly as before.

alter table schedule_phases
  add constraint schedule_phases_id_project_key unique (id, project_id);

alter table schedule_tasks
  drop constraint schedule_tasks_phase_id_fkey;

alter table schedule_tasks
  add constraint schedule_tasks_phase_fk
  foreign key (phase_id, project_id) references schedule_phases (id, project_id)
  on delete cascade;
