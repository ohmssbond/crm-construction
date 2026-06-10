// Provision a new artisan tenant: organizations row + default file_categories +
// an owner auth user (role stamped in app_metadata) + organization_members link.
// The generated password is written to ./rotated-passwords.txt (gitignored), never
// to stdout. Reusable — pass the tenant via env vars:
//
//   TENANT_NAME='Acme' TENANT_EMAIL='owner@acme.com' TENANT_COLOR='#199DB7' \
//   TENANT_MEMBER_NOUN='Builder' TENANT_CLIENT_NOUN='Customer' \
//   TENANT_FULLNAME='Jane Doe' node scripts/create-tenant.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY from .env.local.
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SR || !ANON) {
  console.error("Missing Supabase URL / anon / service-role key in .env.local");
  process.exit(1);
}

const T = {
  name: process.env.TENANT_NAME,
  email: process.env.TENANT_EMAIL,
  color: process.env.TENANT_COLOR || "#2f6f5e",
  member_noun: process.env.TENANT_MEMBER_NOUN || "Contractor",
  client_noun: process.env.TENANT_CLIENT_NOUN || "Customer",
  full_name: process.env.TENANT_FULLNAME || "",
};
if (!T.name || !T.email) {
  console.error("TENANT_NAME and TENANT_EMAIL are required.");
  process.exit(1);
}

// Default construction file-category set (key, label).
const CATEGORIES = [
  ["before_photo", "Before photo"],
  ["after_photo", "After photo"],
  ["plans", "Plans"],
  ["permits", "Permits"],
  ["proposal", "Proposal"],
  ["contract", "Contract"],
  ["invoice", "Invoice"],
  ["other", "Other"],
];

const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. organization
const { data: org, error: oe } = await admin
  .from("organizations")
  .insert({ name: T.name, primary_color: T.color, member_noun: T.member_noun, client_noun: T.client_noun })
  .select("id")
  .single();
if (oe || !org) {
  console.error("org insert failed:", oe?.message);
  process.exit(1);
}
console.log("✓ organization:", org.id, `(${T.name})`);

// 2. file categories
const cats = CATEGORIES.map(([key, label], i) => ({ organization_id: org.id, key, label, sort: i + 1 }));
const { error: ce } = await admin.from("file_categories").insert(cats);
console.log("✓ file_categories:", ce ? "ERROR " + ce.message : `${cats.length} inserted`);

// 3. owner auth user (refuse if the email already exists — never touch an existing account)
const password = randomBytes(12).toString("base64url");
const { data: created, error: ue } = await admin.auth.admin.createUser({
  email: T.email,
  password,
  email_confirm: true,
  user_metadata: T.full_name ? { full_name: T.full_name } : {},
  app_metadata: { role: "artisan", organization_id: org.id },
});
if (ue || !created?.user?.id) {
  console.error("auth user create failed (does the email already exist?):", ue?.message);
  console.error("Rolling back: removing the org just created.");
  await admin.from("organizations").delete().eq("id", org.id);
  process.exit(1);
}
console.log("✓ auth user:", created.user.id, `(${T.email})`);

// 4. membership
const { error: me } = await admin
  .from("organization_members")
  .insert({ organization_id: org.id, user_id: created.user.id, role: "owner" });
console.log("✓ membership:", me ? "ERROR " + me.message : "owner");

// 5. verify the login actually works (anon sign-in; password stays in memory)
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const { error: se } = await anon.auth.signInWithPassword({ email: T.email, password });
console.log("✓ login verified:", se ? "FAILED " + se.message : "ok");

// 6. write the credential to the gitignored file (never stdout)
appendFileSync(
  "rotated-passwords.txt",
  `\n# Tenant: ${T.name} (owner login)\n${T.email}\t${password}\n`
);
console.log("\nDONE. Login written to rotated-passwords.txt (gitignored) — open it, save it, change the password after first sign-in.");
console.log("org id:", org.id);
