// Seed the Owl Electric demo tenant's customers. Working assumption: customers are
// INHERITED from the CRM / QuickBooks Online (not hand-entered by the T&B admin), so
// we seed them directly with source='crm' rather than via the /tb UI. Jobs, time, and
// materials are still created live in the app.
//
// Idempotent: fixed UUIDs + upsert on id, scoped to the Owl org. Service role.
//   node scripts/seed-owl-customers.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
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

const ORG = "33333333-3333-3333-3333-333333333333"; // Owl Electric
const cust = (n) => `33330001-0000-0000-0000-00000000000${n}`;

// "Inherited" customers (source: crm). Light, realistic detail for the demo.
const CUSTOMERS = [
  {
    id: cust(1),
    organization_id: ORG,
    name: "Thomas Fagan",
    email: "thomas.fagan@example.com",
    phone: "(617) 555-0142",
    bill_city: "Boston",
    bill_state: "MA",
    source: "crm",
  },
  {
    id: cust(2),
    organization_id: ORG,
    name: "K&P Construction",
    email: "office@kpconstruction.example.com",
    phone: "(617) 555-0198",
    bill_city: "Cambridge",
    bill_state: "MA",
    source: "crm",
  },
];

const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

const { error } = await admin.from("customers").upsert(CUSTOMERS, { onConflict: "id" });
if (error) {
  console.error("customer upsert failed:", error.message);
  process.exit(1);
}
console.log(`✓ ${CUSTOMERS.length} customers upserted for Owl Electric:`);
for (const c of CUSTOMERS) console.log(`  - ${c.name} (${c.id})`);
console.log("\nDONE. They'll appear in /tb when creating jobs.");
