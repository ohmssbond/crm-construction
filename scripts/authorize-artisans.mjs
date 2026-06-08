// One-off: create the two artisan logins and link them to their tenants.
// Run from the project root:  node scripts/authorize-artisans.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from "node:fs";
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

const supabase = createClient(URL, SR, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = randomBytes(9).toString("base64url");

const targets = [
  { email: "doug+jhuber@myotherbrain.com", org: "22222222-2222-2222-2222-222222222222", name: "J Huber Restorations" },
  { email: "doug+gargoyle@myotherbrain.com", org: "11111111-1111-1111-1111-111111111111", name: "Gargoyle Systems" },
];

async function findUserId(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id;
}

for (const t of targets) {
  let uid, status;
  const { data, error } = await supabase.auth.admin.createUser({
    email: t.email,
    password,
    email_confirm: true,
  });
  if (data?.user?.id) {
    uid = data.user.id;
    status = "created";
  } else {
    uid = await findUserId(t.email);
    if (!uid) {
      console.error("  FAILED to create/find", t.email, error?.message);
      continue;
    }
    await supabase.auth.admin.updateUserById(uid, { password, email_confirm: true });
    status = "existed (password reset)";
  }
  const { error: mErr } = await supabase
    .from("organization_members")
    .upsert(
      { organization_id: t.org, user_id: uid, role: "owner" },
      { onConflict: "organization_id,user_id" }
    );
  console.log(
    `  ${t.email}  ->  ${t.name}  [${status}]  membership: ${mErr ? "ERROR " + mErr.message : "ok"}`
  );
}

console.log("\nTemporary password for BOTH logins:", password);
console.log("Change it after first sign-in (Supabase Auth, or the app once login is wired).");
