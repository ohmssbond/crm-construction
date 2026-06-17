import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "./org";
import { todayInZone } from "./worktime";
import { one } from "./rel";

/** Today's work_day for the signed-in worker (+ any open prior day) in org tz. */
export async function getWorkerDay() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = todayInZone(ctx.org.timezone);
  const { data } = await supabase
    .from("work_days")
    .select("id, work_date, start_time, end_time, status")
    .eq("worker_user_id", user.id)
    .order("work_date", { ascending: false })
    .limit(20);
  const list = data ?? [];
  return {
    tz: ctx.org.timezone,
    today,
    todayDay: list.find((d) => d.work_date === today) ?? null,
    openPrior: list.find((d) => d.status === "open" && d.work_date < today) ?? null,
  };
}

/** The org's active (open/in_progress) jobs for the worker's Today list. */
export async function listActiveJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, name, status, customer:customers(name)")
    .in("status", ["open", "in_progress"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    customerName: one(j.customer)?.name ?? "—",
  }));
}

/** A job + the worker's time entry (+ segments) for today, in org tz. */
export async function getJobTimeForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, name, job_line1, job_line2, job_city, job_state, job_postal_code, job_country")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const today = todayInZone(ctx.org.timezone);
  const { data: entry } = await supabase
    .from("job_time_entries")
    .select("id, no_charge, segments:job_time_segments(id, time_in, time_out)")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .eq("entry_date", today)
    .maybeSingle();

  return { job, entry: entry ?? null };
}
