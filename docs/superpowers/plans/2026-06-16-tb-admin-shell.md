# T&B Admin Shell (slice 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty Time & Billing admin surface — a third `AppShell` world at `/tb`, gated to `timebilling:admin`, with a placeholder home — and live-verify the routing change before any Jobs logic.

**Architecture:** Add a `timebilling` world to the shell, route `timebilling:admin` to `/tb` via `resolveHome`/proxy, expose org branding to T&B-only accounts (`organizations` member-read RLS + `getWorkspaceContext`), gate the `/tb` layout (`requireTbAdmin` + entitlement), and seed a `timebilling:admin` for verification.

**Tech Stack:** Next.js 16 (App Router, RSC, proxy), TypeScript, Supabase, Vitest.

---

## File Structure

- **Modify** `src/lib/auth.ts` + `src/lib/auth.test.ts` — `resolveHome` admin branch + tests.
- **Modify** `src/proxy.ts` — `TB_ADMIN_PREFIXES` + gate.
- **Modify** `src/components/shell/nav.ts`, `Sidebar.tsx`, `Fab.tsx` — third world.
- **Create** `supabase/migrations/20260616000002_org_member_read.sql` — org member-read RLS.
- **Modify** `src/lib/data/org.ts` — `getWorkspaceContext`.
- **Create** `src/lib/auth-tb.ts` — `requireTbAdmin`.
- **Create** `src/app/(timebilling)/tb/layout.tsx` + `page.tsx` — gated shell + placeholder.
- **Create** `scripts/seed-tb-admin.mjs` — seed a `timebilling:admin` for testing.

**Sequencing:** routing (Task 1) and shell wiring (Task 2) are additive code that keep the build green; helpers + migration (Task 3), the `/tb` pages (Task 4), and the seed (Task 5) follow; gate (Task 6); controller cutover (Task 7).

---

## Task 1: Route `timebilling:admin` → `/tb` (TDD)

**Files:**
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add failing tests**

In `src/lib/auth.test.ts`, add a `tbadmin` fixture near the other claim consts:

```ts
const tbadmin = { org_id: "o1", roles: { timebilling: "admin" } };
```

and add these tests inside the existing `describe("resolveHome", ...)` block:

```ts
  test("timebilling admin (no crm) → /tb", () => {
    expect(resolveHome(tbadmin)).toBe("/tb");
  });
  test("crm wins over timebilling admin", () => {
    expect(resolveHome({ org_id: "o1", roles: { crm: "owner", timebilling: "admin" } })).toBe("/dashboard");
  });
  test("timebilling admin wins over worker", () => {
    expect(resolveHome({ org_id: "o1", roles: { timebilling: "admin" } })).toBe("/tb");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- "lib/auth"`
Expected: FAIL — `resolveHome(tbadmin)` returns `/login` (no admin branch yet).

- [ ] **Step 3: Add the admin branch to `resolveHome`**

In `src/lib/auth.ts`, replace:

```ts
export function resolveHome(claims: Claims): string {
  if (productRole(claims, "crm")) return "/dashboard";
  if (productRole(claims, "timebilling") === "worker") return "/log";
  if (isContact(claims)) return "/my-projects";
  return "/login";
}
```

with:

```ts
export function resolveHome(claims: Claims): string {
  if (productRole(claims, "crm")) return "/dashboard";
  if (productRole(claims, "timebilling") === "admin") return "/tb";
  if (productRole(claims, "timebilling") === "worker") return "/log";
  if (isContact(claims)) return "/my-projects";
  return "/login";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- "lib/auth"`
Expected: PASS.

- [ ] **Step 5: Add the proxy prefix + gate**

In `src/proxy.ts`, find:

```ts
const WORKER_PREFIXES = ["/log"];
```

Add below it:

```ts
const TB_ADMIN_PREFIXES = ["/tb"];
```

Find:

```ts
  const hasCrm = !!productRole(claims, "crm");
  const isWorker = productRole(claims, "timebilling") === "worker";
  const contact = isContact(claims);
  const home = resolveHome(claims);
```

Replace with:

```ts
  const hasCrm = !!productRole(claims, "crm");
  const isWorker = productRole(claims, "timebilling") === "worker";
  const isTbAdmin = productRole(claims, "timebilling") === "admin";
  const contact = isContact(claims);
  const home = resolveHome(claims);
```

Find:

```ts
  if (!isWorker && matches(pathname, WORKER_PREFIXES)) return go(home);
```

Replace with:

```ts
  if (!isWorker && matches(pathname, WORKER_PREFIXES)) return go(home);
  if (!isTbAdmin && matches(pathname, TB_ADMIN_PREFIXES)) return go(home);
```

- [ ] **Step 6: Verify build + tests**

Run: `npm run build` (success) and `npm test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/proxy.ts
git commit -m "$(cat <<'EOF'
Route timebilling admins to /tb (resolveHome + proxy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add the `timebilling` shell world

**Files:**
- Modify: `src/components/shell/nav.ts`
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/Fab.tsx`

- [ ] **Step 1: `nav.ts` — world type + nav/tabs**

In `src/components/shell/nav.ts`, change:

```ts
export type World = "artisan" | "portal";
```

to:

```ts
export type World = "artisan" | "portal" | "timebilling";
```

After the `portalTabs` line (`export const portalTabs = ...`), add:

```ts
export const timebillingNav: NavItem[] = [
  { href: "/tb", label: "Jobs", icon: FolderKanban },
];
export const timebillingTabs = ["/tb"];
```

Replace `navFor` and `tabsFor`:

```ts
export const navFor = (world: World): NavItem[] =>
  world === "portal" ? portalNav : world === "timebilling" ? timebillingNav : artisanNav;

export const tabsFor = (world: World): string[] =>
  world === "portal" ? portalTabs : world === "timebilling" ? timebillingTabs : artisanTabs;
```

(`FolderKanban` is already imported in `nav.ts`.)

- [ ] **Step 2: `Sidebar.tsx` — fallback brand entry + sign-out footer for timebilling**

In `src/components/shell/Sidebar.tsx`, add the import (with the others at top):

```ts
import { signOut } from "@/lib/auth-actions";
```

Add a `timebilling` entry to the exhaustive `FALLBACK_BRAND` record. Find:

```ts
const FALLBACK_BRAND: Record<World, Brand> = {
  artisan: { tile: "JH", name: "J Huber Restorations", label: "Artisan workspace" },
  portal: { tile: "JH", name: "J Huber Restorations", label: "Customer portal" },
};
```

Replace with:

```ts
const FALLBACK_BRAND: Record<World, Brand> = {
  artisan: { tile: "JH", name: "J Huber Restorations", label: "Artisan workspace" },
  portal: { tile: "JH", name: "J Huber Restorations", label: "Customer portal" },
  timebilling: { tile: "TB", name: "Workspace", label: "Time & Billing" },
};
```

Replace the account footer. Find:

```tsx
      {/* Account footer */}
      <div className="p-3 border-t border-line">
        <Link
          href={world === "portal" ? "/account" : "/settings"}
          className="flex items-center gap-3 px-2 py-2 rounded-control hover:bg-line-2"
        >
          <div className="size-8 rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-meta font-bold">
            {user.tile}
          </div>
          <div className="min-w-0">
            <div className="text-sub font-semibold truncate">{user.name}</div>
            <div className="text-meta text-faint truncate">{user.email}</div>
          </div>
        </Link>
      </div>
```

with:

```tsx
      {/* Account footer */}
      <div className="p-3 border-t border-line">
        {world === "timebilling" ? (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-8 rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-meta font-bold">
              {user.tile}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sub font-semibold truncate">{user.name}</div>
              <form action={signOut}>
                <button type="submit" className="text-meta text-faint hover:text-text">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <Link
            href={world === "portal" ? "/account" : "/settings"}
            className="flex items-center gap-3 px-2 py-2 rounded-control hover:bg-line-2"
          >
            <div className="size-8 rounded-full bg-[#d4dae3] text-[#475467] grid place-items-center text-meta font-bold">
              {user.tile}
            </div>
            <div className="min-w-0">
              <div className="text-sub font-semibold truncate">{user.name}</div>
              <div className="text-meta text-faint truncate">{user.email}</div>
            </div>
          </Link>
        )}
      </div>
```

- [ ] **Step 3: `Fab.tsx` — hide for timebilling**

In `src/components/shell/Fab.tsx`, find:

```tsx
  // No create verb in the read-only portal.
  if (world === "portal") return null;
```

Replace with:

```tsx
  // No create verb in the read-only portal, and none yet in T&B admin.
  if (world === "portal" || world === "timebilling") return null;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success (the `World` union widened; `FALLBACK_BRAND` is exhaustive again).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/nav.ts src/components/shell/Sidebar.tsx src/components/shell/Fab.tsx
git commit -m "$(cat <<'EOF'
Add timebilling world to the app shell

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Org-branding RLS + workspace context + admin gate

**Files:**
- Create: `supabase/migrations/20260616000002_org_member_read.sql`
- Modify: `src/lib/data/org.ts`
- Create: `src/lib/auth-tb.ts`

- [ ] **Step 1: Author the migration (do NOT apply)**

Create `supabase/migrations/20260616000002_org_member_read.sql`:

```sql
-- T&B admin shell: any org member (incl. timebilling-only) can read their org's
-- branding for the shell. CRM artisan_all (write) + contact_read stay unchanged.
create policy member_read on organizations for select to authenticated
  using (is_org_member_any(id));
```

Run: `grep -c "create policy" supabase/migrations/20260616000002_org_member_read.sql` → expect `1`. Do NOT run `supabase db push`.

- [ ] **Step 2: Add `getWorkspaceContext` to `org.ts`**

In `src/lib/data/org.ts`, append (after `getOrgContext`):

```ts
/**
 * Org branding + identity for ANY member (product-agnostic) — used by the T&B
 * admin shell, where the account may have no CRM membership. Single org per
 * account, so the first membership resolves the org.
 */
export const getWorkspaceContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("organizations(id, name, primary_color, member_noun, client_noun, timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const orgRow = one(data?.organizations);
  if (!orgRow) return null;
  const org = { ...orgRow, initials: initials(orgRow.name) };

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() || "";
  const email = user.email ?? "";
  const name = fullName || email.split("@")[0] || "Account";
  return {
    org,
    user: { name, email, initials: initials(name), hasName: Boolean(fullName) },
  };
});
```

- [ ] **Step 3: Create the admin gate**

Create `src/lib/auth-tb.ts`:

```ts
import type { User } from "@supabase/supabase-js";

/**
 * Gate for the T&B admin surface: returns the user if they're a `timebilling`
 * admin, else redirects to their role-home. Server deps are lazy-imported.
 */
export async function requireTbAdmin(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { redirect } = await import("next/navigation");
  const { productRole, resolveHome } = await import("@/lib/auth");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  if (!user || productRole(claims, "timebilling") !== "admin") redirect(resolveHome(claims));
  return user as User;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success (additive helpers; nothing consumes them yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260616000002_org_member_read.sql src/lib/data/org.ts src/lib/auth-tb.ts
git commit -m "$(cat <<'EOF'
Add org member-read RLS, getWorkspaceContext, requireTbAdmin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The gated `/tb` shell + placeholder home

**Files:**
- Create: `src/app/(timebilling)/tb/layout.tsx`
- Create: `src/app/(timebilling)/tb/page.tsx`

- [ ] **Step 1: Create the gated layout**

Create `src/app/(timebilling)/tb/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { orgHasProduct } from "@/lib/data/entitlements";
import { NotEnabled } from "@/components/NotEnabled";

export default async function TbLayout({ children }: { children: ReactNode }) {
  await requireTbAdmin();
  const ctx = await getWorkspaceContext();
  if (!ctx) return <AppShell world="timebilling">{children}</AppShell>;

  const { org, user } = ctx;
  if (!(await orgHasProduct(org.id, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  return (
    <AppShell
      world="timebilling"
      accent={org.primary_color}
      brand={{ tile: org.initials, name: org.name, label: "Time & Billing" }}
      user={{ tile: user.initials, name: user.name, email: user.email }}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: Create the placeholder home**

Create `src/app/(timebilling)/tb/page.tsx`:

```tsx
export default function TbHome() {
  return (
    <div className="flex flex-col gap-2 pt-6">
      <h2 className="text-title font-semibold">Jobs</h2>
      <p className="text-meta text-muted">Job management is coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success; `/tb` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(timebilling)/tb/layout.tsx" "src/app/(timebilling)/tb/page.tsx"
git commit -m "$(cat <<'EOF'
Add gated /tb T&B admin shell with placeholder home

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Seed a `timebilling:admin` for verification

**Files:**
- Create: `scripts/seed-tb-admin.mjs`

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-tb-admin.mjs`:

```js
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
```

- [ ] **Step 2: Commit (do NOT run it — that's the cutover)**

```bash
git add scripts/seed-tb-admin.mjs
git commit -m "$(cat <<'EOF'
Add seed-tb-admin script for /tb verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verify gate (pre-cutover)

- [ ] **Step 1: Tests + build**

Run: `npm test` (all pass, incl. the new `resolveHome` cases) and `npm run build` (succeeds, `/tb` listed). This is the gate before the controller cutover.

---

## Task 7: Cutover & verification _(controller/operator — NOT a subagent)_

- [ ] **Step 1: Apply the migration**

Run: `supabase db push` → applies `20260616000002_org_member_read.sql`. Confirm via `supabase migration list`.

- [ ] **Step 2: Merge + deploy**

Merge to `main`, push, `vercel --prod`.

- [ ] **Step 3: Seed the T&B admin**

Run: `node scripts/seed-tb-admin.mjs` (writes the login to `rotated-passwords.txt`).

- [ ] **Step 4: Verify — the regression bar**

- Sign in as `doug+tbadmin@myotherbrain.com` (password in `rotated-passwords.txt`) → lands on **`/tb`**, sees the themed shell (org branding, Jobs nav, Sign out) + the placeholder.
- **CRM artisan → `/dashboard`; portal contact → `/my-projects`; worker (`doug+worker@`) → `/log` — all unchanged.**
- A non-admin visiting `/tb` is redirected to their home. Toggling Gargoyle's Time & Billing off → the admin sees the "not enabled" page.

---

## Notes for the implementer

- The proxy stays claims-only; the `/tb` layout does the authoritative entitlement check (`orgHasProduct`) so an `/admin` toggle takes effect without re-login.
- `getWorkspaceContext` deliberately mirrors `getOrgContext` minus the `product='crm'` filter — `getOrgContext` is unchanged so CRM is unaffected.
- `requireTbAdmin` lazy-imports server deps (same pattern as `requireSuperAdmin`/the worker gate).
- Tasks 1–6 are subagent-safe. Task 7 (remote migration + deploy + seed) is operator-run.
