"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbWorker } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { nowTimeInZone, todayInZone, validateSegmentTime, validateQty, validateLabel } from "@/lib/data/worktime";

async function workerCtx() {
  const user = await requireTbWorker();
  const wc = await getWorkspaceContext();
  if (!wc) throw new Error("No workspace.");
  return { userId: user.id, orgId: wc.org.id, tz: wc.org.timezone };
}

export async function startDay(
  priorId: string | null,
  priorEnd: string,
  todayStart: string
): Promise<void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();
  if (priorId && priorEnd) {
    await supabase.from("work_days").update({ end_time: priorEnd, status: "closed" }).eq("id", priorId).eq("worker_user_id", userId);
  }
  await supabase.from("work_days").upsert(
    {
      organization_id: orgId,
      worker_user_id: userId,
      work_date: todayInZone(tz),
      start_time: todayStart || nowTimeInZone(tz),
      status: "open",
    },
    { onConflict: "organization_id,worker_user_id,work_date" }
  );
  revalidatePath("/log");
}

/** End the workday now (same-day clock-out). The next-morning bookend is the
 *  fallback for when a worker forgets. */
export async function endDay(workDayId: string): Promise<void> {
  const { userId, tz } = await workerCtx();
  const supabase = await createClient();
  await supabase
    .from("work_days")
    .update({ end_time: nowTimeInZone(tz), status: "closed" })
    .eq("id", workDayId)
    .eq("worker_user_id", userId);
  revalidatePath("/log");
}

/** Reopen today's workday (undo an accidental "End my day"). */
export async function resumeDay(workDayId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  await supabase
    .from("work_days")
    .update({ end_time: null, status: "open" })
    .eq("id", workDayId)
    .eq("worker_user_id", userId);
  revalidatePath("/log");
}

export async function clockIn(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();

  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "in");
    if (err) return err;
  }

  const { data: entry } = await supabase
    .from("job_time_entries")
    .upsert(
      { organization_id: orgId, job_id: jobId, worker_user_id: userId, entry_date: todayInZone(tz) },
      { onConflict: "organization_id,job_id,worker_user_id,entry_date" }
    )
    .select("id")
    .single();
  if (!entry) throw new Error("Could not start the entry.");

  const { data: open } = await supabase
    .from("job_time_segments")
    .select("id")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .maybeSingle();
  if (!open) {
    await supabase.from("job_time_segments").insert({
      entry_id: entry.id,
      organization_id: orgId,
      worker_user_id: userId,
      time_in: atTime || nowTimeInZone(tz),
    });
  }
  revalidatePath(`/log/${jobId}`);
}

export async function clockOut(jobId: string, atTime?: string): Promise<string | void> {
  const { userId, tz } = await workerCtx();
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("job_time_entries")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_user_id", userId)
    .eq("entry_date", todayInZone(tz))
    .maybeSingle();
  if (!entry) return;
  const { data: open } = await supabase
    .from("job_time_segments")
    .select("id, time_in")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return;

  if (atTime) {
    const err = validateSegmentTime(atTime, nowTimeInZone(tz), "out", open.time_in);
    if (err) return err;
  }

  await supabase
    .from("job_time_segments")
    .update({ time_out: atTime || nowTimeInZone(tz) })
    .eq("id", open.id);
  revalidatePath(`/log/${jobId}`);
}

export async function setNoCharge(entryId: string, jobId: string, value: boolean): Promise<void> {
  await requireTbWorker();
  const supabase = await createClient();
  await supabase.from("job_time_entries").update({ no_charge: value }).eq("id", entryId);
  revalidatePath(`/log/${jobId}`);
}

export async function addJobMaterial(
  jobId: string,
  materialId: string,
  qtyInput: string
): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const qty = validateQty(qtyInput);
  if (qty === null) return "Enter a quantity greater than zero.";

  const supabase = await createClient();
  // Snapshot the catalog name + cost at add time (cost never returned to client).
  const { data: material } = await supabase
    .from("materials")
    .select("name, unit_price, currency")
    .eq("id", materialId)
    .is("archived_at", null)
    .maybeSingle();
  if (!material) return "That material is no longer available.";

  await supabase.from("job_material_lines").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    material_id: materialId,
    item: material.name,
    unit_cost: material.unit_price,
    currency: material.currency,
    qty,
  });
  revalidatePath(`/log/${jobId}`);
}

export async function updateJobMaterialQty(
  lineId: string,
  jobId: string,
  qtyInput: string
): Promise<string | void> {
  const { userId } = await workerCtx();
  const qty = validateQty(qtyInput);
  if (qty === null) return "Enter a quantity greater than zero.";

  const supabase = await createClient();
  await supabase
    .from("job_material_lines")
    .update({ qty })
    .eq("id", lineId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobMaterial(lineId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  await supabase
    .from("job_material_lines")
    .delete()
    .eq("id", lineId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}

export async function recordJobPhoto(
  jobId: string,
  meta: { path: string; label: string; filename: string | null; mime: string | null; size: number }
): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const label = validateLabel(meta.label);
  if (label === null) return "Add a label for the photo.";
  if (!meta.path.startsWith(`${orgId}/${jobId}/`)) return "Invalid upload path.";

  const supabase = await createClient();
  await supabase.from("job_attachments").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    storage_path: meta.path,
    label,
    filename: meta.filename,
    mime_type: meta.mime,
    size_bytes: meta.size,
    status: "uploaded",
    uploaded_at: new Date().toISOString(),
  });
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobPhoto(photoId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("job_attachments")
    .select("storage_path")
    .eq("id", photoId)
    .eq("worker_user_id", userId)
    .maybeSingle();
  if (!row) return;
  await supabase.from("job_attachments").delete().eq("id", photoId).eq("worker_user_id", userId);
  await supabase.storage.from("job-files").remove([row.storage_path as string]);
  revalidatePath(`/log/${jobId}`);
}

export async function addJobWorkNote(jobId: string, body: string): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const text = validateLabel(body);
  if (text === null) return "Enter a note.";
  const supabase = await createClient();
  await supabase.from("job_work_notes").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    body: text,
  });
  revalidatePath(`/log/${jobId}`);
}

export async function updateJobWorkNote(noteId: string, jobId: string, body: string): Promise<string | void> {
  const { userId } = await workerCtx();
  const text = validateLabel(body);
  if (text === null) return "Enter a note.";
  const supabase = await createClient();
  await supabase
    .from("job_work_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobWorkNote(noteId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  await supabase.from("job_work_notes").delete().eq("id", noteId).eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}
