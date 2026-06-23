import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "./org";
import { todayInZone, groupTimeByDay, type TimeHistoryDay } from "./worktime";
import { one } from "./rel";
import { fmtDateTime, fmtZonedDate } from "./format";

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
  const { data: todayDay } = await supabase
    .from("work_days")
    .select("id, work_date, start_time, end_time, status")
    .eq("worker_user_id", user.id)
    .eq("work_date", today)
    .maybeSingle();
  const { data: openPrior } = await supabase
    .from("work_days")
    .select("id, work_date, start_time, end_time, status")
    .eq("worker_user_id", user.id)
    .eq("status", "open")
    .lt("work_date", today)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { tz: ctx.org.timezone, today, todayDay: todayDay ?? null, openPrior: openPrior ?? null };
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

/** The signed-in worker's own material lines for a job (no cost fields). */
export async function getJobMaterialsForWorker(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("job_material_lines")
    .select("id, item, qty, material_id")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("created_at", { ascending: true });
  return data ?? [];
}

/** The signed-in worker's own photos for a job, newest first, each resolved to a
 *  short-lived signed URL + a display timestamp (org tz). No storage_path leaks. */
export async function getJobPhotosForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("job_attachments")
    .select("id, label, filename, mime_type, status, added_at, storage_path")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("added_at", { ascending: false });
  const rows = data ?? [];

  const signed: Record<string, string> = {};
  const paths = rows.map((r) => r.storage_path as string);
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("job-files").createSignedUrls(paths, 3600);
    urls?.forEach((u) => {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    });
  }

  return rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    status: r.status as string,
    filename: (r.filename as string | null) ?? null,
    addedLabel: fmtDateTime(r.added_at as string, ctx.org.timezone),
    href: signed[r.storage_path as string] ?? null,
    isImage: ((r.mime_type as string | null) ?? "").startsWith("image/"),
  }));
}

/** The signed-in worker's own work notes for a job (chronological), each with a
 *  display date in the org tz. */
export async function getJobWorkNotesForWorker(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("job_work_notes")
    .select("id, body, created_at")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((n) => ({
    id: n.id as string,
    body: n.body as string,
    dateLabel: fmtZonedDate(n.created_at as string, ctx.org.timezone),
  }));
}

/** The signed-in worker's full time history for a job, grouped by day across all
 *  dates. Self-scoped via worker_rw RLS — no service-role, no cost. */
export async function getJobTimeHistoryForWorker(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { days: [], grandTotalHours: 0 };

  const { data } = await supabase
    .from("job_time_entries")
    .select("entry_date, no_charge, segments:job_time_segments(time_in, time_out)")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("entry_date", { ascending: true });

  return groupTimeByDay(
    (data ?? []).map((e) => ({
      entry_date: e.entry_date as string,
      no_charge: !!e.no_charge,
      segments: (e.segments ?? []) as { time_in: string; time_out: string | null }[],
    }))
  );
}
