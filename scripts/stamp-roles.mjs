// DEPRECATED (Foundation 1a): roles are derived live from `memberships` by the
// access-token hook; the app no longer reads app_metadata.role. Kept for reference.
// Stamp app_metadata.role + organization_id onto the artisan logins so the proxy
// can gate worlds from the JWT (zero DB round-trips). Idempotent; does NOT reset
// passwords. Run from the project root:  node scripts/stamp-roles.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
//
// NOTE (MVP): tenants are onboarded by script, so we stamp the role at
// provisioning time. The production-grade equivalent is a Supabase custom
// access-token Auth hook that derives the claim at token mint — switch to that
// when self-serve onboarding lands (needs project-level hook config).
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

const artisans = [
  { email: "doug+jhuber@myotherbrain.com", org: "22222222-2222-2222-2222-222222222222" },
  { email: "doug+gargoyle@myotherbrain.com", org: "11111111-1111-1111-1111-111111111111" },
];

const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}

for (const a of artisans) {
  const user = list.users.find((u) => u.email === a.email);
  if (!user) {
    console.log(`  ${a.email}  ->  NOT FOUND (run authorize-artisans.mjs first)`);
    continue;
  }
  const app_metadata = { ...user.app_metadata, role: "artisan", organization_id: a.org };
  const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata });
  console.log(`  ${a.email}  ->  role=artisan org=${a.org.slice(0, 8)}…  ${error ? "ERROR " + error.message : "ok"}`);
}

console.log("Done. Contacts are stamped at provisioning by seed-contact-login.mjs.");
