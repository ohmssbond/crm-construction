// Seed a Time & Billing ADMIN test account in the Gargoyle org so /tb can be
// verified end-to-end: ensures Gargoyle's timebilling entitlement is active and
// creates/links a timebilling:admin account (no CRM membership, so it routes to
// /tb). The generated password is written to ./rotated-passwords.txt (gitignored).
//   node scripts/seed-tb-admin.mjs
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
const EMAIL = "doug+tbadmin@myotherbrain.com";
const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

{
  const { error } = await admin
    .from("organization_products")
    .upsert(
      { organization_id: GARGOYLE, product: "timebilling", status: "active" },
      { onConflict: "organization_id,product" }
    );
  console.log("✓ entitlement (timebilling/active):", error ? "ERROR " + error.message : "ok");
}

const password = randomBytes(12).toString("base64url");
let uid;
{
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
  });
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users.find((u) => u.email === EMAIL);
    if (!existing) {
      console.error("createUser failed and no existing user found:", error.message);
      process.exit(1);
    }
    uid = existing.id;
    await admin.auth.admin.updateUserById(uid, { password });
    console.log("✓ tb admin auth user:", uid, "(existed — password reset)");
  } else {
    uid = created.user.id;
    console.log("✓ tb admin auth user:", uid, "(created)");
  }
}

{
  const { error } = await admin
    .from("memberships")
    .upsert(
      { organization_id: GARGOYLE, user_id: uid, product: "timebilling", role: "admin" },
      { onConflict: "organization_id,user_id,product" }
    );
  console.log("✓ membership (timebilling/admin):", error ? "ERROR " + error.message : "ok");
}

appendFileSync(
  "rotated-passwords.txt",
  `\n# Test T&B admin (Gargoyle, timebilling:admin)\n${EMAIL}\t${password}\n`
);
console.log("\nDONE. T&B admin login written to rotated-passwords.txt (gitignored). Sign in to land on /tb.");
