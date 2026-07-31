"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { normalizeScheduleFields, type ScheduleFields } from "@/lib/data/schedule";

// Schedule writes. All RLS-scoped (artisan_all → is_org_member), exactly like the
// live-edit writes in ./actions.ts: updates and deletes by id rely on the policy's
// USING clause to confine the change to the signed-in org, and inserts supply
// organization_id from the session. No explicit membership check — matching
// updateTodo and updateStatusUpdate.

/** Next position for a new row: append to the end of its sibling list. */
async function nextPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "schedule_phases" | "schedule_tasks",
  column: "project_id" | "phase_id",
  value: string
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("position")
    .eq(column, value)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/**
 * Swap a row with its neighbour, then renumber the whole sibling list 0..n-1. The
 * renumber (rather than a bare two-row swap) keeps ordering correct even if two rows
 * ever share a position.
 */
async function reorder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "schedule_phases" | "schedule_tasks",
  column: "project_id" | "phase_id",
  scopeId: string,
  rowId: string,
  dir: "up" | "down"
): Promise<void> {
  const { data: rows } = await supabase
    .from(table)
    .select("id, position, created_at")
    .eq(column, scopeId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!rows) return;

  const order = rows.map((r) => r.id as string);
  const i = order.indexOf(rowId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return; // already at the end — no-op

  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(
    order.map((id, idx) => supabase.from(table).update({ position: idx }).eq("id", id))
  );
}

// ── Phases ──────────────────────────────────────────────────────────────────

export async function addPhase(projectId: string, name: string) {
  const text = name.trim();
  if (!text) return; // name required; an empty add is a no-op
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("schedule_phases").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    name: text,
    position: await nextPosition(supabase, "schedule_phases", "project_id", projectId),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updatePhase(projectId: string, phaseId: string, fields: ScheduleFields) {
  const patch = normalizeScheduleFields(fields);
  if (!patch) return; // blank name → no-op
  const supabase = await createClient();
  await supabase.from("schedule_phases").update(patch).eq("id", phaseId);
  revalidatePath(`/projects/${projectId}`);
}

/** Deleting a phase cascades to its tasks (FK on delete cascade). */
export async function deletePhase(projectId: string, phaseId: string) {
  const supabase = await createClient();
  await supabase.from("schedule_phases").delete().eq("id", phaseId);
  revalidatePath(`/projects/${projectId}`);
}

export async function movePhase(projectId: string, phaseId: string, dir: "up" | "down") {
  const supabase = await createClient();
  await reorder(supabase, "schedule_phases", "project_id", projectId, phaseId, dir);
  revalidatePath(`/projects/${projectId}`);
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export async function addTask(projectId: string, phaseId: string, name: string) {
  const text = name.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase.from("schedule_tasks").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    phase_id: phaseId,
    name: text,
    position: await nextPosition(supabase, "schedule_tasks", "phase_id", phaseId),
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTask(projectId: string, taskId: string, fields: ScheduleFields) {
  const patch = normalizeScheduleFields(fields);
  if (!patch) return;
  const supabase = await createClient();
  await supabase.from("schedule_tasks").update(patch).eq("id", taskId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTask(projectId: string, taskId: string) {
  const supabase = await createClient();
  await supabase.from("schedule_tasks").delete().eq("id", taskId);
  revalidatePath(`/projects/${projectId}`);
}

/** Reordering is scoped to siblings within one phase, hence phaseId. */
export async function moveTask(
  projectId: string,
  phaseId: string,
  taskId: string,
  dir: "up" | "down"
) {
  const supabase = await createClient();
  await reorder(supabase, "schedule_tasks", "phase_id", phaseId, taskId, dir);
  revalidatePath(`/projects/${projectId}`);
}
