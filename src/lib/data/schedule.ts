// Pure transforms + the loader for the project Schedule (Phase → Task).
//
// Convention (see attachments.ts): the Supabase client is PASSED IN, never imported,
// so this module stays unit-testable and usable from any surface. RLS decides what
// comes back — staff read via is_org_member, portal contacts via
// contact_can_see_project — so one loader serves the artisan page, the portal, and
// the preview.
import type { SupabaseClient } from "@supabase/supabase-js";

/** A schedule row as it comes out of Postgres. */
export type DbScheduleRow = {
  id: string;
  name: string;
  position: number;
  projected_date: string | null;
  projected_note: string | null;
  start_date: string | null;
  complete_date: string | null;
  created_at: string;
};

export type DbScheduleTaskRow = DbScheduleRow & { phase_id: string };

/** A schedule row as the UI consumes it. */
export type ScheduleRow = {
  id: string;
  name: string;
  position: number;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
};

export type SchedulePhase = ScheduleRow & { tasks: ScheduleRow[] };

/** The editable field set, shared by the edit form and the update actions. */
export type ScheduleFields = {
  name: string;
  projectedDate: string | null;
  projectedNote: string | null;
  startDate: string | null;
  completeDate: string | null;
};

/** The DB column shape an update writes. */
export type DbSchedulePatch = {
  name: string;
  projected_date: string | null;
  projected_note: string | null;
  start_date: string | null;
  complete_date: string | null;
};

const SELECT =
  "id, name, position, projected_date, projected_note, start_date, complete_date, created_at";

function toRow(r: DbScheduleRow): ScheduleRow {
  return {
    id: r.id,
    name: r.name,
    position: r.position,
    projectedDate: r.projected_date,
    projectedNote: r.projected_note,
    startDate: r.start_date,
    completeDate: r.complete_date,
  };
}

/** Manual ordering, with created_at as the tiebreak so ties never render randomly. */
function byPosition(a: DbScheduleRow, b: DbScheduleRow): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

/**
 * Nest tasks under their phases and apply the display ordering. Tasks whose phase is
 * absent are dropped — RLS returns both tables consistently, so this only guards
 * against a torn read.
 */
export function nestSchedule(
  phases: DbScheduleRow[],
  tasks: DbScheduleTaskRow[]
): SchedulePhase[] {
  const byPhase = new Map<string, DbScheduleTaskRow[]>();
  for (const t of tasks) {
    const list = byPhase.get(t.phase_id);
    if (list) list.push(t);
    else byPhase.set(t.phase_id, [t]);
  }
  return [...phases].sort(byPosition).map((p) => ({
    ...toRow(p),
    tasks: (byPhase.get(p.id) ?? []).sort(byPosition).map(toRow),
  }));
}

/**
 * Form input → DB columns. Blank strings become null (an empty `<input type="date">`
 * submits ""). Returns null when the name is blank so callers can no-op, matching
 * updateTodo's "an empty save is a no-op" rule.
 */
export function normalizeScheduleFields(input: ScheduleFields): DbSchedulePatch | null {
  const name = input.name.trim();
  if (!name) return null;
  const blankToNull = (v: string | null) => v?.trim() || null;
  return {
    name,
    projected_date: blankToNull(input.projectedDate),
    projected_note: blankToNull(input.projectedNote),
    start_date: blankToNull(input.startDate),
    complete_date: blankToNull(input.completeDate),
  };
}

/** Load a project's full schedule, nested and ordered. Empty when there is none. */
export async function getProjectSchedule(
  supabase: SupabaseClient,
  projectId: string
): Promise<SchedulePhase[]> {
  const [phases, tasks] = await Promise.all([
    supabase.from("schedule_phases").select(SELECT).eq("project_id", projectId),
    supabase.from("schedule_tasks").select(`${SELECT}, phase_id`).eq("project_id", projectId),
  ]);
  return nestSchedule(
    (phases.data ?? []) as DbScheduleRow[],
    (tasks.data ?? []) as DbScheduleTaskRow[]
  );
}
