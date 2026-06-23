// Provision the "Owl Electric" demo tenant (Time & Billing only) so the app can be
// dogfooded / demoed end-to-end. Creates the org + the timebilling entitlement + one
// admin login (/tb) and two named worker logins (/log). NO customers/jobs/materials/
// time — those get created live through the UI on purpose.
//
// Idempotent: fixed org UUID + upserts, and users are created-or-reused (password
// reset on reuse), so re-running just refreshes. Service role (bypasses RLS).
//   node scripts/seed-owl-electric.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync, appendFileSync } from "node:fs";
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SR) {
  console.error("Missing Supabase URL / anon / service-role key in .env.local");
  process.exit(1);
}

// Fixed, distinct org id (Gargoyle=1111…, J Huber=2222…, Owl Electric=3333…).
const ORG = "33333333-3333-3333-3333-333333333333";
const PASSWORD = "owldemo123"; // shared, intentionally simple for the demo
const ADMIN_EMAIL = "doug+owladmin@myotherbrain.com";
const WORKERS = [
  { email: "doug+owlworker1@myotherbrain.com", name: "Jake Sullivan" }, // lead
  { email: "doug+owlworker2@myotherbrain.com", name: "Maria Lopez" }, // apprentice
];

const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

// Create the user if new, otherwise find them and reset the password. Returns the uid.
async function ensureUser(email) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error && created?.user?.id) {
    console.log(`✓ auth user ${email}: ${created.user.id} (created)`);
    return created.user.id;
  }
  // Likely already exists — find and reset password.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((u) => u.email === email);
  if (!existing) {
    console.error(`createUser failed for ${email} and no existing user found:`, error?.message);
    process.exit(1);
  }
  await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD });
  console.log(`✓ auth user ${email}: ${existing.id} (existed — password reset)`);
  return existing.id;
}

async function verifyLogin(email) {
  const { error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  console.log(`  login ${email}:`, error ? "FAILED " + error.message : "ok");
}

// 1. Organization (electric-blue brand, T&B nouns; timezone defaults to America/New_York).
{
  const { error } = await admin
    .from("organizations")
    .upsert(
      {
        id: ORG,
        name: "Owl Electric",
        primary_color: "#1D4ED8",
        member_noun: "Technician",
        client_noun: "Customer",
      },
      { onConflict: "id" }
    );
  console.log("✓ organization (Owl Electric):", error ? "ERROR " + error.message : ORG);
  if (error) process.exit(1);
}

// 2. Time & Billing entitlement (no CRM).
{
  const { error } = await admin
    .from("organization_products")
    .upsert(
      { organization_id: ORG, product: "timebilling", status: "active" },
      { onConflict: "organization_id,product" }
    );
  console.log("✓ entitlement (timebilling/active):", error ? "ERROR " + error.message : "ok");
}

// 3. Admin login (timebilling:admin → /tb).
{
  const uid = await ensureUser(ADMIN_EMAIL);
  const { error } = await admin
    .from("memberships")
    .upsert(
      { organization_id: ORG, user_id: uid, product: "timebilling", role: "admin" },
      { onConflict: "organization_id,user_id,product" }
    );
  console.log("✓ membership (timebilling/admin):", error ? "ERROR " + error.message : "ok");
}

// 4. Worker logins (timebilling:worker → /log) + names in tb_workers.
for (const w of WORKERS) {
  const uid = await ensureUser(w.email);
  const { error: me } = await admin
    .from("memberships")
    .upsert(
      { organization_id: ORG, user_id: uid, product: "timebilling", role: "worker" },
      { onConflict: "organization_id,user_id,product" }
    );
  console.log(`✓ membership (timebilling/worker) ${w.email}:`, me ? "ERROR " + me.message : "ok");
  const { error: ne } = await admin
    .from("tb_workers")
    .upsert(
      { organization_id: ORG, user_id: uid, name: w.name },
      { onConflict: "organization_id,user_id" }
    );
  console.log(`✓ worker name "${w.name}":`, ne ? "ERROR " + ne.message : "ok");
}

// 5. Verify every login actually works.
console.log("\nVerifying logins:");
await verifyLogin(ADMIN_EMAIL);
for (const w of WORKERS) await verifyLogin(w.email);

// 6. Record the credentials (gitignored file, never stdout).
const creds = [
  `\n# Owl Electric demo tenant (org ${ORG}) — shared password`,
  `${ADMIN_EMAIL}\t${PASSWORD}\t(timebilling:admin -> /tb)`,
  ...WORKERS.map((w) => `${w.email}\t${PASSWORD}\t(timebilling:worker -> /log, ${w.name})`),
  "",
].join("\n");
appendFileSync("rotated-passwords.txt", creds + "\n");

console.log("\nDONE. Owl Electric provisioned. Logins (all password '" + PASSWORD + "') written to rotated-passwords.txt.");
console.log("Admin → /tb, workers → /log. Create customers/jobs/materials/time live in the UI.");
