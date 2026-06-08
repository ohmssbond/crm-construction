// Demo data for J Huber Restorations so the artisan screens have something real
// to render. Idempotent: fixed UUIDs + upsert, so re-running just refreshes.
// Service role (bypasses RLS). Run from the project root:
//   node scripts/seed-demo-data.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
//
// NOTE: demo/sample data only — kept as a script (not a migration) so it never
// ships to a real tenant. Scoped entirely to the J Huber org id below.
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

const supabase = createClient(URL, SR, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG = "22222222-2222-2222-2222-222222222222"; // J Huber Restorations

// Stable UUIDs (prefix encodes the table) so upserts are idempotent.
const cust = (n) => `22220001-0000-0000-0000-00000000000${n}`;
const con = (n) => `22220002-0000-0000-0000-00000000000${n}`;
const proj = (n) => `22220003-0000-0000-0000-00000000000${n}`;
const pc = (n) => `22220004-0000-0000-0000-00000000000${n}`;
const todo = (n) => `22220005-0000-0000-0000-00000000000${n}`;
const upd = (n) => `22220006-0000-0000-0000-00000000000${n}`;
const att = (n) => `22220007-0000-0000-0000-00000000000${n}`;

const customers = [
  { id: cust(1), organization_id: ORG, name: "Marsh Residence", address: "14 Brenton Rd, Lewes" },
  { id: cust(2), organization_id: ORG, name: "Castle Holdings", address: "Old Mill, Ditchling" },
  { id: cust(3), organization_id: ORG, name: "Riverside Cafe", address: "2 Cliffe High St, Lewes" },
];

const contacts = [
  { id: con(1), organization_id: ORG, customer_id: cust(1), first_name: "Sarah", last_name: "Marsh", email: "sarah@marsh.example", phone: "07700 900111", type: "customer" },
  { id: con(2), organization_id: ORG, customer_id: cust(1), first_name: "Tom", last_name: "Marsh", email: "tom@marsh.example", phone: "07700 900112", type: "customer" },
  { id: con(3), organization_id: ORG, customer_id: cust(2), first_name: "Diane", last_name: "Castle", email: "diane@castleholdings.example", phone: "07700 900113", type: "customer" },
  { id: con(4), organization_id: ORG, customer_id: cust(3), first_name: "Raj", last_name: "Patel", email: "raj@riverside.example", phone: "07700 900114", type: "prospect" },
];

const projects = [
  { id: proj(1), organization_id: ORG, customer_id: cust(1), name: "14 Brenton Rd", stage: "in_progress", start_date: "2026-05-02", end_date: "2026-06-20" },
  { id: proj(2), organization_id: ORG, customer_id: cust(2), name: "Old Mill loft", stage: "signed", start_date: "2026-06-09", end_date: null },
  { id: proj(3), organization_id: ORG, customer_id: cust(1), name: "Rear deck rebuild", stage: "proposal", start_date: null, end_date: null },
  { id: proj(4), organization_id: ORG, customer_id: cust(3), name: "Cafe fit-out", stage: "in_progress", start_date: "2026-05-20", end_date: "2026-07-10" },
  { id: proj(5), organization_id: ORG, customer_id: cust(2), name: "Garage conversion", stage: "completed", start_date: "2026-02-01", end_date: "2026-04-15" },
];

const projectContacts = [
  { id: pc(1), organization_id: ORG, project_id: proj(1), contact_id: con(1) },
  { id: pc(2), organization_id: ORG, project_id: proj(1), contact_id: con(2) },
  { id: pc(3), organization_id: ORG, project_id: proj(2), contact_id: con(3) },
  { id: pc(4), organization_id: ORG, project_id: proj(3), contact_id: con(1) },
  { id: pc(5), organization_id: ORG, project_id: proj(3), contact_id: con(2) },
  { id: pc(6), organization_id: ORG, project_id: proj(4), contact_id: con(4) },
];

const todos = [
  { id: todo(1), organization_id: ORG, project_id: proj(1), body: "Order cedar decking", due_date: "2026-06-06", done: false },
  { id: todo(2), organization_id: ORG, project_id: proj(1), body: "Schedule building inspection", due_date: "2026-06-15", done: false },
  { id: todo(3), organization_id: ORG, project_id: proj(2), body: "Confirm permit pickup", due_date: "2026-06-08", done: false },
  { id: todo(4), organization_id: ORG, project_id: proj(3), body: "Pour footings", due_date: null, done: true },
];

// Link attachments only (kind=link) — no Storage object needed, so they render
// on the Photos & Files tab without a bucket upload. Real file uploads land in
// a later step (Storage wiring).
const attachments = [
  { id: att(1), organization_id: ORG, project_id: proj(1), kind: "link", category: "plans", filename: "Deck plans (Drive)", url: "https://drive.example.com/14brenton-plans", is_shared: true },
  { id: att(2), organization_id: ORG, project_id: proj(1), kind: "link", category: "permits", filename: "Building permit", url: "https://council.example.com/permit/14brenton", is_shared: false },
  { id: att(3), organization_id: ORG, project_id: proj(1), kind: "link", category: "proposal", filename: "Signed proposal", url: "https://docs.example.com/14brenton-proposal", is_shared: true },
];

const updates = [
  { id: upd(1), organization_id: ORG, project_id: proj(1), body: "Framing complete — starting the cedar decking this week.", is_shared: true },
  { id: upd(2), organization_id: ORG, project_id: proj(1), body: "Cedar delivery slipped to Thursday; absorbing the day in the schedule.", is_shared: false },
  { id: upd(3), organization_id: ORG, project_id: proj(2), body: "Contract signed — crew mobilises Jun 9.", is_shared: true },
  { id: upd(4), organization_id: ORG, project_id: proj(4), body: "Demolition done, services capped off.", is_shared: true },
];

async function up(table, rows) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  console.log(`  ${table.padEnd(18)} ${error ? "ERROR " + error.message : `${rows.length} rows ok`}`);
}

console.log("Seeding demo data for J Huber Restorations…");
// Order respects FKs: customers → contacts/projects → project_contacts/todos/updates.
await up("customers", customers);
await up("contacts", contacts);
await up("projects", projects);
await up("project_contacts", projectContacts);
await up("todos", todos);
await up("attachments", attachments);
await up("status_updates", updates);
console.log("Done.");
