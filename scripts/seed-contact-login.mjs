// Provision a PORTAL (contact) login for testing: creates an auth user, links it
// to an existing contact row (contacts.user_id), and stamps the branding the
// portal shell needs into app_metadata (a contact can't read the org row under
// RLS). Run from the project root:  node scripts/seed-contact-login.mjs
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

const CONTACT_ID = "22220002-0000-0000-0000-000000000001"; // Sarah Marsh (J Huber)
const LOGIN_EMAIL = "doug+sarahmarsh@myotherbrain.com";
const password = randomBytes(9).toString("base64url");

// Pull the real contact + org so the stamped branding isn't hardcoded.
const { data: contact, error: cErr } = await supabase
  .from("contacts")
  .select("first_name, last_name, organizations:organization_id(name, primary_color, member_noun, client_noun)")
  .eq("id", CONTACT_ID)
  .single();
if (cErr || !contact) {
  console.error("Could not load contact:", cErr?.message);
  process.exit(1);
}
const org = Array.isArray(contact.organizations) ? contact.organizations[0] : contact.organizations;
const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();

const app_metadata = {
  role: "contact",
  full_name: fullName,
  org_name: org.name,
  org_color: org.primary_color,
  member_noun: org.member_noun,
  client_noun: org.client_noun,
};

async function findUserId(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id;
}

let uid, status;
const { data: created } = await supabase.auth.admin.createUser({
  email: LOGIN_EMAIL,
  password,
  email_confirm: true,
  app_metadata,
});
if (created?.user?.id) {
  uid = created.user.id;
  status = "created";
} else {
  uid = await findUserId(LOGIN_EMAIL);
  if (!uid) {
    console.error("FAILED to create/find", LOGIN_EMAIL);
    process.exit(1);
  }
  await supabase.auth.admin.updateUserById(uid, { password, email_confirm: true, app_metadata });
  status = "existed (password reset)";
}

const { error: linkErr } = await supabase
  .from("contacts")
  .update({ user_id: uid })
  .eq("id", CONTACT_ID);

console.log(`Portal login for ${fullName} (${org.name}):`);
console.log(`  ${LOGIN_EMAIL}  [${status}]  contact link: ${linkErr ? "ERROR " + linkErr.message : "ok"}`);
console.log(`  Temporary password: ${password}`);
