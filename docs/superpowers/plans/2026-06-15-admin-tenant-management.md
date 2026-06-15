# Minimal Admin — Tenant Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gated `/admin` surface where a super-admin can list tenants and, per tenant, change the owner login email and reset the owner password (temp password shown once).

**Architecture:** Access is gated by a `SUPER_ADMIN_EMAILS` env allowlist — no new role/schema/proxy changes. All privileged reads/writes use the existing server-only service-role client (`createAdminClient`) inside Server Components / Server Actions. Three gates: proxy (auth) → admin layout (`requireSuperAdmin` → 404) → every action re-checks `isSuperAdmin`.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), TypeScript, Supabase (`auth.admin.*`), Vitest.

---

## File Structure

- **Modify** `.env.example` — document `SUPER_ADMIN_EMAILS`. (Operator adds the real value to `.env.local` + Vercel.)
- **Create** `src/lib/auth-admin.ts` — `isSuperAdmin` (pure) + `requireSuperAdmin` (server gate, lazy-imports server deps so the unit test loads cleanly).
- **Create** `src/lib/auth-admin.test.ts` — unit tests for `isSuperAdmin`.
- **Create** `src/lib/data/tenants.ts` — `listTenants()` via the admin client.
- **Create** `src/app/(admin)/admin/actions.ts` — `changeTenantEmail`, `resetTenantPassword`.
- **Create** `src/app/(admin)/admin/layout.tsx` — gates the group, minimal chrome.
- **Create** `src/app/(admin)/admin/page.tsx` — tenant table.
- **Create** `src/app/(admin)/admin/ChangeEmailForm.tsx` + `ResetPasswordButton.tsx` — client controls.

**Sequencing:** every task is additive (new files) until the UI in Task 4 wires them, so each commit builds green. Actions (Task 3) land before the UI (Task 4) that imports them.

---

## Task 1: Env var + super-admin gate (TDD)

**Files:**
- Modify: `.env.example`
- Create: `src/lib/auth-admin.ts`
- Create: `src/lib/auth-admin.test.ts`

- [ ] **Step 1: Document the env var**

In `.env.example`, find:

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Add directly below it:

```
# Comma-separated emails allowed into the /admin tenant console (server-only).
SUPER_ADMIN_EMAILS=
```

- [ ] **Step 2: Set the value locally (not committed)**

Append this line to `.env.local` (gitignored — do NOT commit it):

```
SUPER_ADMIN_EMAILS=doug@myotherbrain.com
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/auth-admin.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { isSuperAdmin } from "./auth-admin";

const original = process.env.SUPER_ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = original;
});

describe("isSuperAdmin", () => {
  test("matches an allowlisted email case-insensitively", () => {
    process.env.SUPER_ADMIN_EMAILS = "Doug@MyOtherBrain.com, ops@x.com";
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(true);
    expect(isSuperAdmin("OPS@X.COM")).toBe(true);
  });

  test("trims whitespace in both the allowlist and the input", () => {
    process.env.SUPER_ADMIN_EMAILS = "  doug@myotherbrain.com  ";
    expect(isSuperAdmin("  doug@myotherbrain.com ")).toBe(true);
  });

  test("rejects an email not in the list", () => {
    process.env.SUPER_ADMIN_EMAILS = "doug@myotherbrain.com";
    expect(isSuperAdmin("intruder@evil.com")).toBe(false);
  });

  test("returns false when the var is empty or unset", () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(false);
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(false);
  });

  test("returns false for null or empty email", () => {
    process.env.SUPER_ADMIN_EMAILS = "doug@myotherbrain.com";
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- auth-admin`
Expected: FAIL — cannot import `isSuperAdmin` (module does not exist).

- [ ] **Step 5: Implement the helper**

Create `src/lib/auth-admin.ts`:

```ts
import type { User } from "@supabase/supabase-js";

/**
 * True when `email` is in the SUPER_ADMIN_EMAILS allowlist (comma-separated,
 * server-only). Read at call time so it stays testable. Empty/unset var → false.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}

/**
 * Admin-surface gate: returns the signed-in user if they're a super-admin,
 * otherwise renders a 404 (does not reveal the route exists). Call from the admin
 * layout and re-call at the top of every admin Server Action. Server deps are
 * lazy-imported so this module's unit test loads without pulling in next/headers.
 */
export async function requireSuperAdmin(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { notFound } = await import("next/navigation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) notFound();
  return user as User;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- auth-admin`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit** (note: `.env.local` is gitignored and must NOT be staged)

```bash
git add .env.example src/lib/auth-admin.ts src/lib/auth-admin.test.ts
git commit -m "$(cat <<'EOF'
Add super-admin allowlist gate (isSuperAdmin/requireSuperAdmin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tenant listing data

**Files:**
- Create: `src/lib/data/tenants.ts`

- [ ] **Step 1: Implement `listTenants`**

Create `src/lib/data/tenants.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export type TenantRow = {
  orgId: string;
  name: string;
  userId: string | null;
  email: string | null;
};

/**
 * Lists every tenant (organization) with its owner login email, using the
 * service-role admin client (bypasses RLS — the admin may not be an org member).
 * The owner is the member with role 'owner', falling back to the org's first
 * member. `userId`/`email` are null when no owner login resolves.
 */
export async function listTenants(): Promise<TenantRow[]> {
  const admin = createAdminClient();

  const [orgsRes, membersRes, usersRes] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin.from("organization_members").select("organization_id, user_id, role"),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailByUid = new Map(
    (usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const membersByOrg = new Map<string, { user_id: string; role: string }[]>();
  for (const m of membersRes.data ?? []) {
    const list = membersByOrg.get(m.organization_id) ?? [];
    list.push({ user_id: m.user_id, role: m.role });
    membersByOrg.set(m.organization_id, list);
  }

  return (orgsRes.data ?? []).map((o) => {
    const ms = membersByOrg.get(o.id) ?? [];
    const owner = ms.find((m) => m.role === "owner") ?? ms[0] ?? null;
    return {
      orgId: o.id,
      name: o.name,
      userId: owner?.user_id ?? null,
      email: owner ? emailByUid.get(owner.user_id) ?? null : null,
    };
  });
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (new module, not yet imported).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/tenants.ts
git commit -m "$(cat <<'EOF'
Add listTenants admin data query

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Admin server actions

**Files:**
- Create: `src/app/(admin)/admin/actions.ts`

- [ ] **Step 1: Implement the actions**

Create `src/app/(admin)/admin/actions.ts`:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailState = { error: string | null; saved: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change a tenant owner's login email — direct + immediate (email_confirm: true),
 * no confirmation email. Re-gates on super-admin before touching anything.
 */
export async function changeTenantEmail(
  _prev: EmailState,
  fd: FormData
): Promise<EmailState> {
  await requireSuperAdmin();

  const userId = String(fd.get("userId") ?? "");
  const email = String(fd.get("email") ?? "").trim();
  if (!userId) return { error: "Missing tenant.", saved: false };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email.", saved: false };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) return { error: error.message, saved: false };

  revalidatePath("/admin");
  return { error: null, saved: true };
}

export type ResetResult = { error: string | null; password?: string };

/**
 * Reset a tenant owner's password to a fresh random value and return it for
 * one-time display. The value is never persisted or logged. Re-gates first.
 */
export async function resetTenantPassword(userId: string): Promise<ResetResult> {
  await requireSuperAdmin();
  if (!userId) return { error: "Missing tenant." };

  const password = randomBytes(12).toString("base64url");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  return { error: null, password };
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (new module, not yet imported).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/actions.ts"
git commit -m "$(cat <<'EOF'
Add admin actions: change tenant email, reset tenant password

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Admin UI (layout, page, client controls)

**Files:**
- Create: `src/app/(admin)/admin/layout.tsx`
- Create: `src/app/(admin)/admin/page.tsx`
- Create: `src/app/(admin)/admin/ChangeEmailForm.tsx`
- Create: `src/app/(admin)/admin/ResetPasswordButton.tsx`

- [ ] **Step 1: Create the gated layout**

Create `src/app/(admin)/admin/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth-admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin(); // 404s for non-admins

  return (
    <div className="mx-auto max-w-[860px] px-5 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">Admin · Tenants</h1>
        <p className="text-meta text-muted">
          Manage tenant logins. Changes take effect immediately.
        </p>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create the email form (client)**

Create `src/app/(admin)/admin/ChangeEmailForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldInput } from "@/components/ui/Field";
import { changeTenantEmail, type EmailState } from "./actions";

const initial: EmailState = { error: null, saved: false };

export function ChangeEmailForm({
  userId,
  currentEmail,
}: {
  userId: string;
  currentEmail: string;
}) {
  const [state, action, pending] = useActionState(changeTenantEmail, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="email"
        type="email"
        defaultValue={currentEmail}
        aria-label="Login email"
        className={`${fieldInput} max-w-[220px]`}
      />
      <Button size="sm" type="submit" disabled={pending} className="disabled:opacity-60">
        {pending ? "Saving…" : "Update"}
      </Button>
      {state.saved && !pending && (
        <span className="text-meta text-accent font-semibold">Saved ✓</span>
      )}
      {state.error && <span className="text-meta text-[#b42318]">{state.error}</span>}
    </form>
  );
}
```

- [ ] **Step 3: Create the reset-password control (client)**

Create `src/app/(admin)/admin/ResetPasswordButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { resetTenantPassword } from "./actions";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setPassword(null);
    start(async () => {
      const res = await resetTenantPassword(userId);
      if (res.error) setError(res.error);
      else setPassword(res.password ?? null);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        type="button"
        onClick={reset}
        disabled={pending}
        className="disabled:opacity-60"
      >
        {pending ? "Resetting…" : "Reset password"}
      </Button>
      {password && (
        <span className="text-meta font-mono bg-line-2 px-2 py-1 rounded-control">
          {password} <span className="text-faint">— copy now, shown once</span>
        </span>
      )}
      {error && <span className="text-meta text-[#b42318]">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create the tenant table page**

Create `src/app/(admin)/admin/page.tsx`:

```tsx
import { Card } from "@/components/ui/Card";
import { requireSuperAdmin } from "@/lib/auth-admin";
import { listTenants } from "@/lib/data/tenants";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function AdminTenantsPage() {
  await requireSuperAdmin(); // re-gate: layout + page can render concurrently
  const tenants = await listTenants();

  return (
    <Card className="flex flex-col">
      {tenants.map((t) => (
        <div
          key={t.orgId}
          className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-line-2 last:border-b-0"
        >
          <div className="min-w-[160px] flex-1">
            <div className="text-body font-semibold">{t.name}</div>
            <div className="text-meta text-faint">{t.email ?? "— no login —"}</div>
          </div>
          {t.userId ? (
            <div className="flex flex-wrap items-center gap-2">
              <ChangeEmailForm userId={t.userId} currentEmail={t.email ?? ""} />
              <ResetPasswordButton userId={t.userId} />
            </div>
          ) : (
            <span className="text-meta text-faint">No owner login</span>
          )}
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: build succeeds; `/admin` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/admin/layout.tsx" "src/app/(admin)/admin/page.tsx" "src/app/(admin)/admin/ChangeEmailForm.tsx" "src/app/(admin)/admin/ResetPasswordButton.tsx"
git commit -m "$(cat <<'EOF'
Add /admin tenant console UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including the new `isSuperAdmin` suite).

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds; `/admin` is listed.

- [ ] **Step 3: Manual verification** _(needs `SUPER_ADMIN_EMAILS=doug@myotherbrain.com` in `.env.local` and the dev server running)_

- As the allowlisted user (`doug@myotherbrain.com`), open `http://localhost:3000/admin` → the table lists J Huber Restorations and Gargoyle Systems with their owner login emails.
- Change J Huber's login email, then confirm sign-in works with the new address (and revert if desired).
- Click "Reset password" on a tenant; confirm sign-in works with the shown temp value.
- Confirm a non-allowlisted session (or the var unset) gets a **404** at `/admin`.
- _Caution:_ the temp password renders in the browser — do not echo real generated values into chat/transcripts.

---

## Notes for the implementer

- `requireSuperAdmin` lazy-imports `@/lib/supabase/server` and `next/navigation` so `auth-admin.test.ts` (which imports the same module for `isSuperAdmin`) doesn't pull `next/headers` into the Vitest node environment.
- `createAdminClient()` (`src/lib/supabase/admin.ts`) is server-only; only import it from Server Components / Server Actions. Never from a client component.
- No proxy change: `/admin` is outside `PORTAL_PREFIXES`/`ARTISAN_PREFIXES` and not public, so the proxy requires a session and otherwise passes it through to the layout's `requireSuperAdmin` gate.
- `SUPER_ADMIN_EMAILS` must also be added to the **Vercel** project env for production — operator step, outside this plan.
