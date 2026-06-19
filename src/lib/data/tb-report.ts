import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "./org";
import { one } from "./rel";
import { sumSegmentHours, roundQuarterHours, materialExtended, workerLabel } from "./worktime";
import { fmtDateTime, fmtJobLocation } from "./format";

/** Assemble the completed-job report for a job (admin-only surface). Reads time /
 *  materials / photos across all workers via the admin's is_tb_admin RLS, resolves
 *  worker labels to login emails via the service-role client, and signs photo URLs.
 *  Returns null if the job is missing. */
export async function getJobReport(jobId: string) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const tz = ctx.org.timezone;
  const supabase = await createClient();

  // 1. Job + customer
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, name, status, billing_type, contract_price, currency, description, notes, start_date, end_date, job_line1, job_line2, job_city, job_state, job_postal_code, job_country, customer:customers(name, email, phone)"
    )
    .eq("id", jobId)
    .is("archived_at", null)
    .maybeSingle();
  if (!job) return null;
  const customer = one(job.customer) as { name: string; email: string | null; phone: string | null } | null;

  // 2. Time entries (+ segments), across all workers
  const { data: entries } = await supabase
    .from("job_time_entries")
    .select("id, worker_user_id, entry_date, no_charge, segments:job_time_segments(time_in, time_out)")
    .eq("job_id", jobId)
    .order("entry_date", { ascending: true });
  const timeEntries = entries ?? [];

  // 3. Material lines
  const { data: mats } = await supabase
    .from("job_material_lines")
    .select("item, qty, unit_cost, currency")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const matRows = mats ?? [];

  // 4. Photos (+ signed URLs)
  const { data: atts } = await supabase
    .from("job_attachments")
    .select("label, filename, mime_type, added_at, storage_path")
    .eq("job_id", jobId)
    .order("added_at", { ascending: false });
  const attRows = atts ?? [];
  const signed: Record<string, string> = {};
  const paths = attRows.map((a) => a.storage_path as string);
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("job-files").createSignedUrls(paths, 3600);
    urls?.forEach((u) => {
      if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    });
  }

  // 5. Worker emails (service-role; only ids that appear in time entries)
  const workerIds = [...new Set(timeEntries.map((e) => e.worker_user_id as string))];
  const emails: Record<string, string> = {};
  if (workerIds.length) {
    const admin = createAdminClient();
    await Promise.all(
      workerIds.map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid);
        emails[uid] = data.user?.email ?? uid.slice(0, 8);
      })
    );
  }

  // Worker names (override the email label when set)
  const names: Record<string, string> = {};
  if (workerIds.length) {
    const { data: nameRows } = await supabase
      .from("tb_workers")
      .select("user_id, name")
      .eq("organization_id", ctx.org.id)
      .in("user_id", workerIds);
    (nameRows ?? []).forEach((r) => {
      names[r.user_id as string] = r.name as string;
    });
  }

  // Group time by worker -> date
  type Day = { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] };
  const byWorker = new Map<string, Day[]>();
  for (const e of timeEntries) {
    const wid = e.worker_user_id as string;
    const segs = (e.segments ?? []) as { time_in: string; time_out: string | null }[];
    const closed = segs.filter((s) => s.time_out) as { time_in: string; time_out: string }[];
    const day: Day = {
      date: e.entry_date as string,
      total: roundQuarterHours(sumSegmentHours(segs)),
      noCharge: !!e.no_charge,
      segments: closed.map((s) => ({ in: s.time_in, out: s.time_out })),
    };
    if (!byWorker.has(wid)) byWorker.set(wid, []);
    byWorker.get(wid)!.push(day);
  }
  const workers = [...byWorker.entries()].map(([wid, days]) => ({
    label: workerLabel(names[wid] ?? null, emails[wid] ?? null, wid),
    totalHours: days.reduce((sum, d) => sum + d.total, 0),
    days,
  }));
  const grandTotalHours = workers.reduce((sum, w) => sum + w.totalHours, 0);

  // Materials
  const lines = matRows.map((m) => ({
    item: m.item as string,
    qty: m.qty as string,
    unitCost: m.unit_cost as string | null,
    extended: materialExtended(m.qty as string, m.unit_cost as string | null),
    currency: m.currency as string,
  }));
  const matCurrency = lines[0]?.currency ?? (job.currency as string);
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.extended, 0) * 100) / 100;

  // Photos
  const photos = attRows.map((a) => ({
    label: a.label as string,
    filename: (a.filename as string | null) ?? null,
    addedLabel: fmtDateTime(a.added_at as string, tz),
    href: signed[a.storage_path as string] ?? null,
    isImage: ((a.mime_type as string | null) ?? "").startsWith("image/"),
  }));

  return {
    job: {
      id: job.id as string,
      name: job.name as string,
      status: job.status as string,
      billingType: job.billing_type as string,
      contractPrice: (job.contract_price as string | null) ?? null,
      currency: job.currency as string,
      description: (job.description as string | null) ?? null,
      notes: (job.notes as string | null) ?? null,
      startDate: (job.start_date as string | null) ?? null,
      endDate: (job.end_date as string | null) ?? null,
      siteAddress: fmtJobLocation(job),
    },
    customer: {
      name: customer?.name ?? "—",
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
    },
    time: { workers, grandTotalHours },
    materials: { lines, subtotal, currency: matCurrency },
    photos,
  };
}
