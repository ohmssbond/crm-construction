// Seed a Time & Billing test worker in the Gargoyle org so /log can be exercised
// end-to-end: enables the `timebilling` entitlement for Gargoyle, creates (or
// reuses) a worker auth user, and links a `timebilling:worker` membership. The
// generated password is written to ./rotated-passwords.txt (gitignored) — NOT to
// stdout. Run from the project root after the 1b migrations are applied:
//   node scripts/seed-worker.mjs
import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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

const GARGOYLE = "11111111-1111-1111-1111-111111111111";
const EMAIL = "doug+worker@myotherbrain.com";
const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Enable the Time & Billing entitlement for Gargoyle.
{
  const { error } = await admin
    .from("organization_products")
    .upsert(
      { organization_id: GARGOYLE, product: "timebilling", status: "active" },
      { onConflict: "organization_id,product" }
    );
  console.log("✓ entitlement (timebilling/active):", error ? "ERROR " + error.message : "ok");
}

// 2. Create or reuse the worker auth user with a fresh password.
const password = randomBytes(12).toString("base64url");
let uid;
{
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
  });
  if (error) {
    // Likely already exists — find them and reset the password.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users.find((u) => u.email === EMAIL);
    if (!existing) {
      console.error("createUser failed and no existing user found:", error.message);
      process.exit(1);
    }
    uid = existing.id;
    await admin.auth.admin.updateUserById(uid, { password });
    console.log("✓ worker auth user:", uid, "(existed — password reset)");
  } else {
    uid = created.user.id;
    console.log("✓ worker auth user:", uid, "(created)");
  }
}

// 3. Link the timebilling:worker membership.
{
  const { error } = await admin
    .from("memberships")
    .upsert(
      { organization_id: GARGOYLE, user_id: uid, product: "timebilling", role: "worker" },
      { onConflict: "organization_id,user_id,product" }
    );
  console.log("✓ membership (timebilling/worker):", error ? "ERROR " + error.message : "ok");
}

// 4. Write the credential to the gitignored file (never stdout).
appendFileSync(
  "rotated-passwords.txt",
  `\n# Test worker (Gargoyle, timebilling:worker)\n${EMAIL}\t${password}\n`
);
console.log("\nDONE. Worker login written to rotated-passwords.txt (gitignored). Open it to sign in and land on /log.");
