# Minimal admin — tenant management

_Design spec · 2026-06-15_

## Goal

Give the operator (super-admin) a gated in-app surface to manage tenant logins as
real customers start using the app. The smallest first version: **list tenants,
change a tenant's login email, and reset a tenant's password.** Build more on this
core later.

## Decisions

| Question | Decision |
|----------|----------|
| Access gating | **Env-var email allowlist** (`SUPER_ADMIN_EMAILS`). No new role/schema/proxy changes. |
| Password reset | **Generate a strong temp password, shown once** in the UI for the admin to relay. Never persisted or logged. |
| v1 scope | **List tenants + change login email + reset password.** Defer create/delete/branding/multi-member. |
| Admin identity | The operator's existing account (`doug@myotherbrain.com`) is allowlisted. |
| Email change | **Direct + immediate** (`email_confirm: true`), no confirmation email to the tenant. |

## Background (current model)

- **Tenants = `organizations`.** Each has one artisan **owner login** — a Supabase
  `auth.users` row linked through `organization_members` (`role` in `'artisan' | 'owner'`).
  The login email lives on the `auth.users` row, not the org.
- **`src/lib/supabase/admin.ts`** exports `createAdminClient()` — a server-only
  service-role client (keyed by `SUPABASE_SERVICE_ROLE_KEY`, never bundled to the
  client) that bypasses RLS and can call `auth.admin.*`. This is the engine for all
  admin operations here.
- **`src/proxy.ts`** gates by role: unauthenticated users are bounced to `/login`
  for any non-public path; authenticated `contact`/`artisan` users are kept inside
  their own prefix lists (`PORTAL_PREFIXES` / `ARTISAN_PREFIXES`). `/admin` is in
  **neither** list and is not public, so an authenticated user reaches it and the
  page-level gate decides. **No proxy change is required.**
- Roles today are only `artisan` / `contact` (`src/lib/auth.ts`). We are **not**
  adding an admin role.
- Existing CLI scripts (`scripts/create-tenant.mjs`, `rotate-passwords.mjs`) already
  perform these auth-admin operations via the service role; this brings the two
  most-needed ones into a gated UI.

## Security model (non-negotiable)

1. **Service role stays server-side.** All reads/writes go through
   `createAdminClient()` inside Server Components / Server Actions only. The
   service-role key is never sent to the browser.
2. **Three gates, defense in depth:**
   - Proxy requires an authenticated session for `/admin` (existing behavior).
   - The `(admin)` layout calls `requireSuperAdmin()` and `notFound()`s
     (404 — does not reveal the route) for any non-allowlisted user.
   - **Every admin Server Action re-checks `isSuperAdmin` server-side** before
     touching anything. The page gate is never trusted alone.
3. **`SUPER_ADMIN_EMAILS` is server-only** (not `NEXT_PUBLIC_`).
4. **The temp password is returned to the page and shown once**, never written to
   the database, server logs, or anywhere persistent.

## Changes

### 1. Environment

- Add `SUPER_ADMIN_EMAILS` (comma-separated emails) to `.env.local` (with
  `doug@myotherbrain.com`) and document it in `.env.example` (placeholder/empty).
- Add the same var to the Vercel project envs (operator step, like other secrets).

### 2. Auth-admin helper — `src/lib/auth-admin.ts` (new)

- `isSuperAdmin(email: string | null | undefined): boolean` — reads
  `process.env.SUPER_ADMIN_EMAILS` **at call time** (so it's testable), splits on
  commas, trims, compares case-insensitively. Empty/missing var → always `false`.
- `requireSuperAdmin(): Promise<User>` — gets the session user via the server
  Supabase client (`@/lib/supabase/server`); if there's no user or
  `isSuperAdmin(user.email)` is false, it `notFound()`s. Returns the user otherwise.
  Used by the layout and (re-)by each action.

### 3. Data — `src/lib/data/tenants.ts` (new)

- `listTenants(): Promise<TenantRow[]>` using `createAdminClient()`:
  - select `id, name` from `organizations` (ordered by name),
  - select `organization_id, user_id, role` from `organization_members`,
  - `auth.admin.listUsers({ perPage: 200 })` once → `Map<user_id, email>`,
  - for each org pick the **owner** member (`role === 'owner'`, else the first
    member), resolve `{ orgId, name, userId, email }`.
  - `TenantRow = { orgId: string; name: string; userId: string | null; email: string | null }`
    (`userId`/`email` null when an org has no resolvable owner login → actions
    disabled for that row).

### 4. Server actions — `src/app/(admin)/admin/actions.ts` (new)

Both call `requireSuperAdmin()` first.

- `changeTenantEmail(prev, formData)` — reads `userId` + `email`; validates a basic
  email shape; `createAdminClient().auth.admin.updateUserById(userId, { email,
  email_confirm: true })`; on Supabase error (e.g. email already in use) returns the
  message; `revalidatePath("/admin")`; returns `{ error, saved }`.
- `resetTenantPassword(userId): Promise<{ error: string | null; password?: string }>`
  — generates a strong password (`crypto.randomBytes(12).toString("base64url")`);
  `updateUserById(userId, { password })`; returns the generated password on success
  (for one-time display). It is **not** persisted or logged.

### 5. UI — `src/app/(admin)/admin/`

- `layout.tsx` (server) — `await requireSuperAdmin()` to gate the whole group;
  renders a minimal admin container + heading ("Admin · Tenants").
- `page.tsx` (server) — `listTenants()`; renders a table: **Tenant (org name) ·
  Login email · Actions**. Each row renders the two client components below.
- `ChangeEmailForm.tsx` (client) — inline email input pre-filled with the current
  address + "Update" button; `useActionState(changeTenantEmail)`; inline
  success/error. Hidden `userId` field.
- `ResetPasswordButton.tsx` (client) — "Reset password" button; on success reveals
  the returned temp password in a copyable box with a "copy now — shown once"
  warning. Uses a transition; clears on row change.

Rows with `userId === null` show "—" and disabled actions.

## Testing

- **Unit (`src/lib/auth-admin.test.ts`, Vitest):** `isSuperAdmin` — matches an
  allowlisted email case-insensitively, trims whitespace, rejects non-listed emails,
  and returns false when `SUPER_ADMIN_EMAILS` is empty/unset. (Set
  `process.env.SUPER_ADMIN_EMAILS` within each test.)
- **Manual / integration:** the auth-admin write ops hit Supabase, so verify by hand
  — load `/admin` as the allowlisted user (table lists J Huber + Gargoyle with owner
  emails); change J Huber's login email and confirm sign-in works with the new
  address; reset its password and confirm sign-in works with the shown temp value.
  Confirm a non-allowlisted user gets a 404 at `/admin`.
  - _Verification caution:_ the temp password renders in the browser; do not echo
    real generated values into chat/transcripts.
- `npm run build` succeeds.

## Out of scope (future increments)

- Create / delete tenants from the UI (provisioning stays in `create-tenant.mjs`).
- Editing branding (already in Settings) and multi-member management.
- An audit log of admin actions.
- A dedicated admin role / proxy-level admin world (email allowlist suffices now).
