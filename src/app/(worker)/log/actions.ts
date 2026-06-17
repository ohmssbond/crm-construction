"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbWorker } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { nowTimeInZone, todayInZone } from "@/lib/data/worktime";

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
    await supabase.from("work_days").update({ end_time: priorEnd, status: "closed" }).eq("id", priorId);
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

export async function clockIn(jobId: string): Promise<void> {
  const { userId, orgId, tz } = await workerCtx();
  const supabase = await createClient();
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
      time_in: nowTimeInZone(tz),
    });
  }
  revalidatePath(`/log/${jobId}`);
}

export async function clockOut(jobId: string): Promise<void> {
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
    .select("id")
    .eq("entry_id", entry.id)
    .is("time_out", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return;
  await supabase.from("job_time_segments").update({ time_out: nowTimeInZone(tz) }).eq("id", open.id);
  revalidatePath(`/log/${jobId}`);
}

export async function setNoCharge(entryId: string, jobId: string, value: boolean): Promise<void> {
  await requireTbWorker();
  const supabase = await createClient();
  await supabase.from("job_time_entries").update({ no_charge: value }).eq("id", entryId);
  revalidatePath(`/log/${jobId}`);
}
