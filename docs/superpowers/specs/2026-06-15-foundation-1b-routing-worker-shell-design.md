# Foundation 1b — product-aware routing + worker shell + entitlement toggle

_Design spec · 2026-06-15_

> Slice 1b of the Foundation (see
> [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md)).
> Builds on 1a (unified `memberships` + `organization_products`, the `roles` JWT claim).

## Goal

Make the app product-aware: route by per-product roles, gate each surface by org
entitlement + membership, add a dedicated minimal **worker `/log`** shell, and add a
per-tenant **entitlement toggle** to the `/admin` console. CRM and portal behavior
stay identical for existing users.

## Context (post-1a)

The JWT carries `org_id`, a `roles` object (e.g. `{"crm":"artisan"}`), the
back-compat `user_role`, and `contact_id`. But `proxy.ts`, `login/actions.ts`, and
`src/lib/auth.ts` still route off `user_role`. `organization_products` exists but
nothing reads it. `getOrgContext()` is crm-scoped (queries `memberships` where
`product='crm'`), so it returns null for a worker-only account.

## Decisions

| Topic | Decision |
|---|---|
| Landing precedence | crm role → `/dashboard`; else `timebilling:worker` → `/log`; else contact → `/my-projects`; else `/login`. |
| Cross-surface nav | A plain cross-link only (no switcher component yet). |
| `user_role` claim | **Drop it** (small hook migration); route by `roles` + `contact_id`. |
| Not-entitled UX | A friendly **"product not enabled for your workspace"** page (not a raw 404). |
| Gating layers | `proxy.ts` does fast claims-only role routing; **layouts** do the authoritative entitlement (+membership) gate (DB). |

## Changes

### 1. Auth helpers — `src/lib/auth.ts`

Replace the `user_role`/`app_metadata` helpers with `roles`-claim helpers:

- `productRole(claims, product: 'crm' | 'timebilling'): string | null` — reads
  `claims.roles?.[product]`.
- `isContact(claims): boolean` — true when `claims.contact_id` is present.
- `resolveHome(claims): string` — the precedence rule:
  `productRole(claims,'crm')` → `/dashboard`; else
  `productRole(claims,'timebilling') === 'worker'` → `/log`; else
  `isContact(claims)` → `/my-projects`; else `/login`.
- Remove `getSessionRole` (app_metadata) and the `user_role`-based `roleFromClaims`.

All pure functions over the claims object — unit-tested.

### 2. Hook cleanup — migration `supabase/migrations/20260615000002_drop_user_role_claim.sql`

Update `custom_access_token_hook` to **stop stamping `user_role`** (keep `org_id`,
`roles`, `contact_id`; contact branch keeps `org_id`/`contact_id`). Safe: the app no
longer reads `user_role` after this slice, and existing sessions' tokens simply carry
an ignored claim until they refresh.

### 3. Routing — `proxy.ts`

- Derive routing from the `roles` claim + `contact_id` (via the new helpers); compute
  `home = resolveHome(claims)`.
- Prefix groups, each with a required role:
  - `ARTISAN_PREFIXES` (existing: `/dashboard`, `/projects`, `/customers`,
    `/contacts`, `/settings`) → requires a `crm` role.
  - `PORTAL_PREFIXES` (`/my-projects`, `/account`) → requires contact.
  - `WORKER_PREFIXES` (`/log`) → requires `timebilling:worker`.
- World separation: if the user lacks the required role for the matched prefix group,
  redirect to their `home`. Unauthenticated → `/login` (unchanged). `/` and `/login`
  for an authenticated user → `home`. (`/admin` keeps its own super-admin gate and is
  not part of role-based separation.)

### 4. Entitlement gate — layouts + a friendly page

- New server helper `requireProductAccess(product, role?)`:
  - confirms the user holds the membership role (from claims/`memberships`);
    if not → redirect to `home` (they don't belong here).
  - confirms the org is **entitled** — `organization_products` row `active` for
    `(org, product)`; if not → render the **"not enabled" page**.
- The existing `(artisan)` layout calls `requireProductAccess('crm')`. The new worker
  layout calls `requireProductAccess('timebilling', 'worker')`.
- A small shared **"This product isn't enabled for your workspace"** page (with a
  sign-out / contact-support hint), shown by the gate when entitlement is off.

### 5. Worker shell — `src/app/(worker)/log/` (skeleton)

A dedicated route group with a **minimal shell** (no sidebar/product nav), gated to
`timebilling:worker` + `timebilling` entitlement. A placeholder "today" landing
(e.g. greeting + "time logging coming soon"). A light worker context reads the org
name by `org_id` for the header (full branding deferred). Real screens
(start-of-day, jobs, logging) are the Time-tracking slice.

### 6. Cross-surface link

- In the CRM shell nav: a **"Time logging"** link to `/log`, shown only when the
  account holds a `timebilling:worker` role.
- In the `/log` shell: a **"Back to CRM"** link to `/dashboard`, shown only when the
  account holds a `crm` role.

### 7. `/admin` entitlement toggle

- Extend `listTenants()` to include each tenant's product entitlements.
- The `/admin` tenant rows gain **crm / timebilling toggles**; a re-gated server
  action `setTenantProduct(orgId, product, active)` upserts `organization_products`.
  This is how a tenant (e.g. Gargoyle) gets Time & Billing enabled.

## Testing

- **Unit (Vitest):** `productRole`, `isContact`, `resolveHome` (each precedence
  branch), and the entitlement-gate decision (entitled+member → allow;
  member but not entitled → "not enabled"; not a member → redirect home).
- **Regression (manual):**
  - Artisan → `/dashboard` (unchanged); contact → `/my-projects` (unchanged).
  - Grant Gargoyle `timebilling` + give an account a `timebilling:worker` membership
    → that account reaches `/log`; a crm-only account hitting `/log` is bounced home.
  - Toggle `timebilling` off → the worker sees the "not enabled" page.
- `npm test` + `npm run build` pass.

## Out of scope (later slices)

- Real T&B admin surface and worker time screens; full worker branding/context.
- A product switcher component (cross-links suffice with one worker surface).
- T&B domain tables, shared-customer evolution, QBO.

## Risks

- **Routing refactor touches the proxy** — the regression bar is that existing CRM +
  portal flows are unchanged; verified manually before merge.
- **Dropping `user_role`** must follow the app refactor (app stops reading it first),
  so the order within the slice matters; the migration ships with the code.
- Entitlement read is a DB call in layouts — fine at current scale; revisit if it
  becomes hot (could move into the JWT claim later).
