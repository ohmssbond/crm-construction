// Seed historical worker time for the Owl Electric demo. Both workers (Jake Sullivan,
// Maria Lopez) log 9h/day (08:00–17:00, one segment) for 5 days, Jan 5–9 2026, all on
// the "75 Bridge St" (K&P Construction) job. The worker UI only logs "today", so this
// backfill of past dates is necessarily seeded.
//
// Idempotent: resolves worker uids by email + the job by name, upserts work_days /
// job_time_entries on their natural keys, and replaces each entry's segments (delete +
// insert) so re-runs don't duplicate. Service role (bypasses RLS).
//   node scripts/seed-owl-time.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SR) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const ORG = "33333333-3333-3333-3333-333333333333"; // Owl Electric
const JOB_NAME = "75 Bridge St";
const WORKER_EMAILS = ["doug+owlworker1@myotherbrain.com", "doug+owlworker2@myotherbrain.com"];
const DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
const TIME_IN = "08:00";
const TIME_OUT = "17:00"; // 9.00 h

const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

// Resolve worker uids by email.
const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
const uidByEmail = {};
for (const email of WORKER_EMAILS) {
  const u = list?.users.find((x) => x.email === email);
  if (!u) {
    console.error(`Worker not found: ${email} — run scripts/seed-owl-electric.mjs first.`);
    process.exit(1);
  }
  uidByEmail[email] = u.id;
}

// Resolve the job by name within the Owl org.
const { data: jobs } = await admin
  .from("jobs")
  .select("id, name")
  .eq("organization_id", ORG)
  .eq("name", JOB_NAME)
  .is("archived_at", null);
if (!jobs || jobs.length !== 1) {
  console.error(`Expected exactly one Owl job named "${JOB_NAME}", found ${jobs?.length ?? 0}.`);
  process.exit(1);
}
const jobId = jobs[0].id;
console.log(`✓ job "${JOB_NAME}": ${jobId}`);

for (const email of WORKER_EMAILS) {
  const worker = uidByEmail[email];
  for (const date of DATES) {
    // 1. work_day bookend (closed).
    const { error: wde } = await admin
      .from("work_days")
      .upsert(
        { organization_id: ORG, worker_user_id: worker, work_date: date, start_time: TIME_IN, end_time: TIME_OUT, status: "closed" },
        { onConflict: "organization_id,worker_user_id,work_date" }
      );
    if (wde) { console.error(`work_day ${email} ${date}:`, wde.message); process.exit(1); }

    // 2. job_time_entry (upsert on natural key; get its id).
    const { data: entry, error: ee } = await admin
      .from("job_time_entries")
      .upsert(
        { organization_id: ORG, job_id: jobId, worker_user_id: worker, entry_date: date, no_charge: false },
        { onConflict: "organization_id,job_id,worker_user_id,entry_date" }
      )
      .select("id")
      .single();
    if (ee || !entry) { console.error(`entry ${email} ${date}:`, ee?.message); process.exit(1); }

    // 3. segments: replace (clean re-runs).
    await admin.from("job_time_segments").delete().eq("entry_id", entry.id);
    const { error: se } = await admin
      .from("job_time_segments")
      .insert({ entry_id: entry.id, organization_id: ORG, worker_user_id: worker, time_in: TIME_IN, time_out: TIME_OUT });
    if (se) { console.error(`segment ${email} ${date}:`, se.message); process.exit(1); }
  }
  console.log(`✓ ${email}: ${DATES.length} days × 9.00 h on "${JOB_NAME}"`);
}

console.log(`\nDONE. ${WORKER_EMAILS.length} workers × ${DATES.length} days × 9h seeded on "${JOB_NAME}". Total = ${WORKER_EMAILS.length * DATES.length * 9} h.`);
