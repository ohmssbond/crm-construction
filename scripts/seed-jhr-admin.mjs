// Add a SECOND full admin to the J Huber Restorations tenant:
// doug@jhuberrestorations.com as crm:owner + timebilling:admin (matches Jesse).
// Idempotent: creates-or-reuses the auth user (resets password on reuse) and
// upserts both memberships. J Huber is already entitled to crm + timebilling, so
// entitlements are upserted defensively (no-op if already active). The generated
// password is appended to ./rotated-passwords.txt (gitignored).
//   node scripts/seed-jhr-admin.mjs
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
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SR) {
  console.error("Missing SUPABASE URL or SERVICE_ROLE key in .env.local");
  process.exit(1);
}

const JHR = "04654563-0f3a-4f28-aca5-33a74edcf9c9";
const EMAIL = "doug@jhuberrestorations.com";
const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Entitlements (defensive; already active on J Huber)
for (const product of ["crm", "timebilling"]) {
  const { error } = await admin
    .from("organization_products")
    .upsert({ organization_id: JHR, product, status: "active" }, { onConflict: "organization_id,product" });
  console.log(`✓ entitlement (${product}/active):`, error ? "ERROR " + error.message : "ok");
}

// 2. Auth user (create or reuse)
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
    console.log("✓ auth user:", uid, "(existed — password reset)");
  } else {
    uid = created.user.id;
    console.log("✓ auth user:", uid, "(created)");
  }
}

// 3. Memberships: crm:owner + timebilling:admin
for (const [product, role] of [["crm", "owner"], ["timebilling", "admin"]]) {
  const { error } = await admin
    .from("memberships")
    .upsert(
      { organization_id: JHR, user_id: uid, product, role },
      { onConflict: "organization_id,user_id,product" }
    );
  console.log(`✓ membership (${product}/${role}):`, error ? "ERROR " + error.message : "ok");
}

appendFileSync(
  "rotated-passwords.txt",
  `\n# Second J Huber admin (crm:owner + timebilling:admin)\n${EMAIL}\t${password}\n`
);
console.log("\nDONE. Login written to rotated-passwords.txt (gitignored). Signs in → crm:owner lands on /dashboard.");
