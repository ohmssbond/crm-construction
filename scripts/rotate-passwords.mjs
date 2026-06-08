// Rotate the password of EVERY Supabase auth user to a fresh random value.
// Writes the new credentials to ./rotated-passwords.txt (gitignored) — NOT to
// stdout — so they never land in logs/transcripts. Run from project root:
//   node scripts/rotate-passwords.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync, writeFileSync } from "node:fs";
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

const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (error) {
  console.error("listUsers failed:", error.message);
  process.exit(1);
}

const out = [
  "# Rotated credentials — save to your password manager, then DELETE this file.",
  "# email\tnew_password",
];
let ok = 0;
for (const u of data.users) {
  const pw = randomBytes(12).toString("base64url"); // strong, URL-safe
  const { error: e } = await supabase.auth.admin.updateUserById(u.id, { password: pw });
  if (e) {
    console.error(`  FAILED ${u.email}: ${e.message}`);
    continue;
  }
  out.push(`${u.email}\t${pw}`);
  ok++;
}

writeFileSync("rotated-passwords.txt", out.join("\n") + "\n");
console.log(`Rotated ${ok} of ${data.users.length} password(s).`);
console.log("New credentials written to rotated-passwords.txt (gitignored).");
console.log("Open it, save the logins you keep, then DELETE the file.");
