# Foundation 1b — Routing + Worker Shell + Entitlement Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make routing product-aware (by the `roles` claim), gate each surface by org entitlement, add a minimal worker `/log` shell, a CRM↔worker cross-link, and a per-tenant entitlement toggle in `/admin`.

**Architecture:** New pure auth helpers (`productRole`/`isContact`/`resolveHome`) drive `proxy.ts` + `login`; layouts add a DB entitlement check rendering a friendly "not enabled" page; a `(worker)/log` route group provides the stripped shell; the `/admin` console gets product toggles. A final migration drops the now-unused `user_role` claim, applied with the deploy.

**Tech Stack:** Next.js 16 (App Router, RSC, proxy/middleware), TypeScript, Supabase, Vitest.

---

## File Structure

- **Modify** `src/lib/auth.ts` — replace `user_role` helpers with `productRole`/`isContact`/`resolveHome`.
- **Create** `src/lib/auth.test.ts` — unit tests for the helpers.
- **Modify** `src/proxy.ts`, `src/app/(auth)/login/actions.ts` — route via the new helpers + worker prefix.
- **Create** `src/lib/data/entitlements.ts` — `orgHasProduct(orgId, product)`.
- **Create** `src/components/NotEnabled.tsx` — the friendly "product not enabled" page.
- **Modify** `src/app/(artisan)/layout.tsx` — CRM entitlement gate + compute the worker cross-link flag.
- **Create** `src/app/(worker)/log/layout.tsx` + `page.tsx` — gated minimal worker shell + placeholder.
- **Modify** `src/components/shell/AppShell.tsx` + `Sidebar.tsx` — optional "Time logging" cross-link.
- **Modify** `src/lib/data/tenants.ts`, `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/actions.ts` — entitlement toggle + a `ProductToggles` client component (new).
- **Create** `supabase/migrations/20260615000002_drop_user_role_claim.sql` — drop the `user_role` claim.

**Sequencing:** Task 1 adds the new helpers additively (build green). Task 2 switches routing and removes the old helpers together (build green). Tasks 3–6 are additive features. Task 7 authors the migration. Task 8 is the controller cutover (apply + deploy + verify).

---

## Task 1: Auth helpers (TDD)

**Files:**
- Create: `src/lib/auth.test.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { productRole, isContact, resolveHome } from "./auth";

const staff = { org_id: "o1", roles: { crm: "artisan" } };
const worker = { org_id: "o1", roles: { timebilling: "worker" } };
const both = { org_id: "o1", roles: { crm: "owner", timebilling: "worker" } };
const contact = { org_id: "o1", contact_id: "c1" };

describe("productRole", () => {
  test("returns the role for a product present in the roles claim", () => {
    expect(productRole(staff, "crm")).toBe("artisan");
    expect(productRole(both, "timebilling")).toBe("worker");
  });
  test("returns null when the product or roles claim is absent", () => {
    expect(productRole(staff, "timebilling")).toBeNull();
    expect(productRole(contact, "crm")).toBeNull();
    expect(productRole(undefined, "crm")).toBeNull();
  });
});

describe("isContact", () => {
  test("true only when contact_id is present", () => {
    expect(isContact(contact)).toBe(true);
    expect(isContact(staff)).toBe(false);
    expect(isContact(undefined)).toBe(false);
  });
});

describe("resolveHome", () => {
  test("crm role wins → dashboard", () => {
    expect(resolveHome(staff)).toBe("/dashboard");
    expect(resolveHome(both)).toBe("/dashboard");
  });
  test("worker (no crm) → /log", () => {
    expect(resolveHome(worker)).toBe("/log");
  });
  test("contact → /my-projects", () => {
    expect(resolveHome(contact)).toBe("/my-projects");
  });
  test("nothing → /login", () => {
    expect(resolveHome(undefined)).toBe("/login");
    expect(resolveHome({ org_id: "o1" })).toBe("/login");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "lib/auth"`
Expected: FAIL — `productRole`/`isContact`/`resolveHome` not exported.

- [ ] **Step 3: Add the new helpers (keep the old ones for now)**

In `src/lib/auth.ts`, append below the existing code (do NOT remove the existing
`roleFromClaims`/`getSessionRole` yet — Task 2 does that, so the build stays green):

```ts
type Claims = Record<string, unknown> | null | undefined;

export type Product = "crm" | "timebilling";

/** A staff role for a product, read from the `roles` claim object (or null). */
export function productRole(claims: Claims, product: Product): string | null {
  const roles = claims?.roles;
  if (roles && typeof roles === "object") {
    const r = (roles as Record<string, unknown>)[product];
    return typeof r === "string" ? r : null;
  }
  return null;
}

/** True when the token represents a portal contact. */
export function isContact(claims: Claims): boolean {
  const id = claims?.contact_id;
  return typeof id === "string" && id.length > 0;
}

/** Where a freshly-authenticated user should land, by role precedence. */
export function resolveHome(claims: Claims): string {
  if (productRole(claims, "crm")) return "/dashboard";
  if (productRole(claims, "timebilling") === "worker") return "/log";
  if (isContact(claims)) return "/my-projects";
  return "/login";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- "lib/auth"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "$(cat <<'EOF'
Add roles-claim auth helpers (productRole/isContact/resolveHome)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Product-aware routing (proxy + login) + remove old helpers

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Refactor the proxy**

In `src/proxy.ts`, change the import:

```ts
import { getSessionRole, roleFromClaims } from "@/lib/auth";
```

to:

```ts
import { productRole, isContact, resolveHome } from "@/lib/auth";
```

Add the worker prefix next to the existing prefix consts:

```ts
const ARTISAN_PREFIXES = ["/dashboard", "/projects", "/customers", "/contacts", "/settings"];
```

becomes (add the line after it):

```ts
const ARTISAN_PREFIXES = ["/dashboard", "/projects", "/customers", "/contacts", "/settings"];
const WORKER_PREFIXES = ["/log"];
```

Replace the routing block. Find:

```ts
  // Role: prefer the fresh JWT claim from the access-token hook; fall back to
  // app_metadata for tokens minted before the hook was enabled.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  // The contact portal home; everyone else (artisan, or unstamped) lands on the
  // artisan dashboard.
  const role = roleFromClaims(claims) ?? getSessionRole(user);
  const home = role === "contact" ? "/my-projects" : "/dashboard";

  // Unauthenticated → only public routes; everything else bounces to login.
  if (!user) {
    return isPublic ? response : go("/login");
  }

  // Authenticated users have no business on the login screen or bare root.
  if (pathname === "/" || pathname === "/login") return go(home);

  // World separation: keep each role inside its own surface.
  if (role === "contact" && matches(pathname, ARTISAN_PREFIXES)) return go("/my-projects");
  if (role === "artisan" && matches(pathname, PORTAL_PREFIXES)) return go("/dashboard");

  return response;
```

with:

```ts
  // Per-product roles from the access-token hook's `roles` claim.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  const hasCrm = !!productRole(claims, "crm");
  const isWorker = productRole(claims, "timebilling") === "worker";
  const contact = isContact(claims);
  const home = resolveHome(claims);

  // Unauthenticated → only public routes; everything else bounces to login.
  if (!user) {
    return isPublic ? response : go("/login");
  }

  // Authenticated users have no business on the login screen or bare root.
  if (pathname === "/" || pathname === "/login") return go(home);

  // World separation: keep each surface to the role that owns it.
  if (!hasCrm && matches(pathname, ARTISAN_PREFIXES)) return go(home);
  if (!contact && matches(pathname, PORTAL_PREFIXES)) return go(home);
  if (!isWorker && matches(pathname, WORKER_PREFIXES)) return go(home);

  return response;
```

- [ ] **Step 2: Refactor the login redirect**

In `src/app/(auth)/login/actions.ts`, change the import:

```ts
import { getSessionRole, roleFromClaims } from "@/lib/auth";
```

to:

```ts
import { resolveHome } from "@/lib/auth";
```

Replace the redirect-resolution block. Find:

```ts
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const role = roleFromClaims(claims) ?? getSessionRole(data.user);
  let dest = role === "contact" ? "/my-projects" : role === "artisan" ? "/dashboard" : null;

  if (!dest) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .eq("product", "crm")
      .limit(1)
      .maybeSingle();
    dest = membership ? "/dashboard" : "/my-projects";
  }

  // redirect() throws a control-flow exception — must be outside any try/catch.
  redirect(dest);
```

with:

```ts
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  // redirect() throws a control-flow exception — must be outside any try/catch.
  redirect(resolveHome(claims));
```

- [ ] **Step 3: Remove the obsolete helpers from `auth.ts`**

In `src/lib/auth.ts`, delete the now-unused legacy code — the `User` import, `SessionRole`
type, `asRole`, `roleFromClaims`, and `getSessionRole` — leaving only the `Claims`
type, `Product`, and the three new helpers from Task 1. The file should start with:

```ts
type Claims = Record<string, unknown> | null | undefined;

export type Product = "crm" | "timebilling";
```

(followed by `productRole`, `isContact`, `resolveHome`).

- [ ] **Step 4: Verify build + tests + no stale references**

Run: `grep -rn "roleFromClaims\|getSessionRole" src/` — expect zero hits.
Run: `npm run build` — expect success.
Run: `npm test` — expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts "src/app/(auth)/login/actions.ts" src/lib/auth.ts
git commit -m "$(cat <<'EOF'
Route by per-product roles claim; drop user_role/app_metadata helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Entitlement gate + "not enabled" page (CRM)

**Files:**
- Create: `src/lib/data/entitlements.ts`
- Create: `src/components/NotEnabled.tsx`
- Modify: `src/app/(artisan)/layout.tsx`

- [ ] **Step 1: Add the entitlement data helper**

Create `src/lib/data/entitlements.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/auth";

/** True when the org has the product entitlement active. Member-readable via RLS. */
export async function orgHasProduct(
  orgId: string | null | undefined,
  product: Product
): Promise<boolean> {
  if (!orgId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_products")
    .select("status")
    .eq("organization_id", orgId)
    .eq("product", product)
    .maybeSingle();
  return data?.status === "active";
}
```

- [ ] **Step 2: Add the friendly page component**

Create `src/components/NotEnabled.tsx`:

```tsx
export function NotEnabled({ product }: { product: string }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg px-6">
      <div className="max-w-[420px] text-center flex flex-col gap-2">
        <div className="text-[40px]">🔒</div>
        <h1 className="text-title font-semibold">{product} isn’t enabled</h1>
        <p className="text-meta text-muted">
          This product isn’t enabled for your workspace. Contact your administrator to
          turn it on.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Gate the artisan layout on the CRM entitlement**

In `src/app/(artisan)/layout.tsx`, add imports:

```ts
import { NotEnabled } from "@/components/NotEnabled";
import { orgHasProduct } from "@/lib/data/entitlements";
```

Find:

```tsx
  const ctx = await getOrgContext();

  // No session/membership → render the shell with placeholder branding rather
  // than blow up; proxy.ts owns redirect-to-login once ENFORCE_AUTH is on.
  if (!ctx) return <AppShell world="artisan">{children}</AppShell>;

  const { org, user } = ctx;
```

Replace with:

```tsx
  const ctx = await getOrgContext();

  // No session/membership → render the shell with placeholder branding rather
  // than blow up; proxy.ts owns redirect-to-login once ENFORCE_AUTH is on.
  if (!ctx) return <AppShell world="artisan">{children}</AppShell>;

  const { org, user } = ctx;

  // Org must be entitled to CRM (membership is implied by ctx being non-null).
  if (!(await orgHasProduct(org.id, "crm"))) return <NotEnabled product="CRM" />;
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: success. (Existing CRM tenants have `crm` entitlement active from the 1a backfill, so no regression.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/entitlements.ts src/components/NotEnabled.tsx "src/app/(artisan)/layout.tsx"
git commit -m "$(cat <<'EOF'
Gate CRM on org entitlement with a friendly not-enabled page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Worker `/log` shell (skeleton)

**Files:**
- Create: `src/app/(worker)/log/layout.tsx`
- Create: `src/app/(worker)/log/page.tsx`

- [ ] **Step 1: Create the gated minimal worker layout**

Create `src/app/(worker)/log/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productRole, resolveHome } from "@/lib/auth";
import { orgHasProduct } from "@/lib/data/entitlements";
import { NotEnabled } from "@/components/NotEnabled";
import { signOut } from "@/lib/auth-actions";

export default async function WorkerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;

  // Must be a timebilling worker; otherwise send them to their own home.
  if (productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));

  // Org must be entitled to Time & Billing.
  const orgId = typeof claims?.org_id === "string" ? claims.org_id : null;
  if (!(await orgHasProduct(orgId, "timebilling"))) {
    return <NotEnabled product="Time & Billing" />;
  }

  const hasCrm = !!productRole(claims, "crm");

  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <span className="text-body font-semibold">Time logging</span>
        <div className="flex items-center gap-3 text-meta">
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">
              Back to CRM
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-muted hover:text-text">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the placeholder landing**

Create `src/app/(worker)/log/page.tsx`:

```tsx
export default function WorkerHome() {
  return (
    <div className="flex flex-col gap-2 text-center pt-10">
      <div className="text-[40px]">⏱️</div>
      <h1 className="text-title font-semibold">Time logging</h1>
      <p className="text-meta text-muted">
        Your daily time and materials logging will appear here soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: success; `/log` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(worker)/log/layout.tsx" "src/app/(worker)/log/page.tsx"
git commit -m "$(cat <<'EOF'
Add gated minimal worker /log shell (skeleton)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CRM → worker cross-link

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/app/(artisan)/layout.tsx`

- [ ] **Step 1: Accept a `showTimeLink` prop on the Sidebar and render the link**

In `src/components/shell/Sidebar.tsx`, find the component's prop destructuring (the
function signature that takes `world`, `brand`, `user`, `clientNoun`) and add
`showTimeLink` to both the params and its prop type. Then, inside the `<nav>` block,
after the `{nav.map(...)}` that renders the nav items (just before `</nav>`), add:

```tsx
        {showTimeLink && (
          <Link
            href="/log"
            className="flex items-center gap-2 px-3 py-2 rounded-control text-meta text-muted hover:text-text"
          >
            Time logging
          </Link>
        )}
```

(The file already imports `Link` from `next/link`.)

- [ ] **Step 2: Thread `showTimeLink` through `AppShell`**

In `src/components/shell/AppShell.tsx`, add `showTimeLink?: boolean` to the prop type
and the destructured params, and pass it to `<Sidebar>`:

```tsx
      <Sidebar world={world} brand={brand} user={user} clientNoun={clientNoun} showTimeLink={showTimeLink} />
```

- [ ] **Step 3: Compute the flag in the artisan layout**

In `src/app/(artisan)/layout.tsx`, add two imports:

```ts
import { createClient } from "@/lib/supabase/server";
import { productRole } from "@/lib/auth";
```

Then, after the CRM-entitlement gate added in Task 3, read the claims to detect a
worker role:

```tsx
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const showTimeLink =
    productRole(
      claimsData?.claims as Record<string, unknown> | undefined,
      "timebilling"
    ) === "worker";
```

Then add `showTimeLink={showTimeLink}` to the `<AppShell world="artisan" ...>` props.

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/Sidebar.tsx src/components/shell/AppShell.tsx "src/app/(artisan)/layout.tsx"
git commit -m "$(cat <<'EOF'
Show a Time logging cross-link in the CRM nav for worker accounts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/admin` entitlement toggle

**Files:**
- Modify: `src/lib/data/tenants.ts`
- Modify: `src/app/(admin)/admin/actions.ts`
- Create: `src/app/(admin)/admin/ProductToggles.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Include entitlements in `listTenants`**

In `src/lib/data/tenants.ts`, extend `TenantRow` and the query. Change the `TenantRow`
type to add a `products` field:

```ts
export type TenantRow = {
  orgId: string;
  name: string;
  userId: string | null;
  email: string | null;
  products: { crm: boolean; timebilling: boolean };
};
```

In `listTenants`, add `organization_products` to the parallel reads — change:

```ts
  const [orgsRes, membersRes, usersRes] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin.from("memberships").select("organization_id, user_id, role").eq("product", "crm"),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);
```

to:

```ts
  const [orgsRes, membersRes, usersRes, productsRes] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin.from("memberships").select("organization_id, user_id, role").eq("product", "crm"),
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("organization_products").select("organization_id, product, status"),
  ]);

  const activeByOrg = new Map<string, Set<string>>();
  for (const p of productsRes.data ?? []) {
    if (p.status !== "active") continue;
    const set = activeByOrg.get(p.organization_id) ?? new Set<string>();
    set.add(p.product);
    activeByOrg.set(p.organization_id, set);
  }
```

Then in the final `return (orgsRes.data ?? []).map((o) => {...})`, add `products` to
the returned object:

```ts
      products: {
        crm: activeByOrg.get(o.id)?.has("crm") ?? false,
        timebilling: activeByOrg.get(o.id)?.has("timebilling") ?? false,
      },
```

- [ ] **Step 2: Add the toggle server action**

In `src/app/(admin)/admin/actions.ts`, add (it already imports `requireSuperAdmin`,
`createAdminClient`, and `revalidatePath`):

```ts
export async function setTenantProduct(
  orgId: string,
  product: "crm" | "timebilling",
  active: boolean
): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  if (!orgId) return { error: "Missing tenant." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_products")
    .upsert(
      { organization_id: orgId, product, status: active ? "active" : "inactive" },
      { onConflict: "organization_id,product" }
    );
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}
```

- [ ] **Step 3: Create the toggles client component**

Create `src/app/(admin)/admin/ProductToggles.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { setTenantProduct } from "./actions";

const PRODUCTS = [
  { key: "crm", label: "CRM" },
  { key: "timebilling", label: "Time & Billing" },
] as const;

export function ProductToggles({
  orgId,
  products,
}: {
  orgId: string;
  products: { crm: boolean; timebilling: boolean };
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      {PRODUCTS.map((p) => (
        <label key={p.key} className="flex items-center gap-1 text-meta">
          <input
            type="checkbox"
            defaultChecked={products[p.key]}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setTenantProduct(orgId, p.key, e.target.checked);
              })
            }
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Render the toggles in the admin page**

In `src/app/(admin)/admin/page.tsx`, add the import:

```ts
import { ProductToggles } from "./ProductToggles";
```

Then, inside the per-tenant row, add the toggles alongside the existing controls.
Find:

```tsx
          {t.userId ? (
            <div className="flex flex-wrap items-center gap-2">
              <ChangeEmailForm userId={t.userId} currentEmail={t.email ?? ""} />
              <ResetPasswordButton userId={t.userId} />
            </div>
          ) : (
            <span className="text-meta text-faint">No owner login</span>
          )}
```

Replace with:

```tsx
          <div className="flex flex-wrap items-center gap-3">
            <ProductToggles orgId={t.orgId} products={t.products} />
            {t.userId ? (
              <div className="flex flex-wrap items-center gap-2">
                <ChangeEmailForm userId={t.userId} currentEmail={t.email ?? ""} />
                <ResetPasswordButton userId={t.userId} />
              </div>
            ) : (
              <span className="text-meta text-faint">No owner login</span>
            )}
          </div>
```

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/tenants.ts "src/app/(admin)/admin/actions.ts" "src/app/(admin)/admin/ProductToggles.tsx" "src/app/(admin)/admin/page.tsx"
git commit -m "$(cat <<'EOF'
Add per-tenant product entitlement toggles to the admin console

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Author the `user_role`-drop migration

**Files:**
- Create: `supabase/migrations/20260615000002_drop_user_role_claim.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260615000002_drop_user_role_claim.sql`:

```sql
-- Foundation 1b: drop the back-compat user_role claim. The app now routes by the
-- `roles` object + contact_id, so user_role is unused. Hook otherwise unchanged.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims    jsonb := event -> 'claims';
  uid       uuid  := (event ->> 'user_id')::uuid;
  v_org     uuid;
  v_contact uuid;
  v_roles   jsonb;
begin
  select m.organization_id, jsonb_object_agg(m.product, m.role)
    into v_org, v_roles
  from public.memberships m
  where m.user_id = uid
  group by m.organization_id
  limit 1;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{roles}',  v_roles);
  else
    select c.organization_id, c.id into v_org, v_contact
      from public.contacts c where c.user_id = uid limit 1;
    if v_org is not null then
      claims := jsonb_set(claims, '{org_id}',     to_jsonb(v_org::text));
      claims := jsonb_set(claims, '{contact_id}', to_jsonb(v_contact::text));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
```

- [ ] **Step 2: Sanity check**

Run: `grep -c "create or replace function" supabase/migrations/20260615000002_drop_user_role_claim.sql` → expect `1`.
Run: `grep -c "user_role" supabase/migrations/20260615000002_drop_user_role_claim.sql` → expect `1` (the comment only — confirm `user_role` does NOT appear in the function body / any `jsonb_set`). Do NOT apply it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615000002_drop_user_role_claim.sql
git commit -m "$(cat <<'EOF'
Migration: drop unused user_role claim from access-token hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Cutover & verification _(controller/operator — NOT a subagent)_

- [ ] **Step 1: Full gate**

Run: `npm test` (all pass) and `npm run build` (succeeds).

- [ ] **Step 2: Apply the migration to remote**

Run: `supabase db push` → applies `20260615000002`. (Low risk: it only removes an
unused claim; the app already ignores `user_role`.)

- [ ] **Step 3: Merge + deploy**

Merge to `main`, push, `vercel --prod`.

- [ ] **Step 4: Verify (against production)**

- Artisan signs in → `/dashboard`, org-scoped data intact (CRM entitlement active).
- Contact signs in → `/my-projects`.
- In `/admin`, toggle **Time & Billing ON** for a tenant (e.g. Gargoyle). Give an
  account a `timebilling:worker` membership for that org (via SQL or a later admin
  flow), sign in as them → lands on `/log` (minimal shell). A crm-only account hitting
  `/log` is redirected to `/dashboard`.
- Toggle **Time & Billing OFF** → the worker sees the "not enabled" page.

---

## Notes for the implementer

- **Proxy stays claims-only** (fast, no DB) — it does role-based world separation.
  Entitlement (a DB read) is enforced in layouts, so an `/admin` toggle takes effect
  immediately without a token refresh.
- **Membership is implied** in the artisan layout: `getOrgContext()` already queries
  `memberships` where `product='crm'`, so a non-null `ctx` means the user is a CRM
  member — the layout only needs the entitlement check.
- **No worker org branding yet** — the worker shell shows generic chrome; reading the
  org name for a worker needs an RLS policy letting non-crm members read their org
  (deferred to a later T&B slice).
- Tasks 1–7 are subagent-safe. Task 8 (remote migration + deploy) is operator-run.
