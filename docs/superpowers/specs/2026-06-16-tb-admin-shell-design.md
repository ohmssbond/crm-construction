# T&B admin shell (slice 3a)

_Design spec · 2026-06-16_

> Time & Billing build, slice **3a** (the empty admin surface). Jobs CRUD is the
> separate **3b** slice, built on this and specced after 3a ships + verifies.
> Architecture: [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md).

## Goal

Stand up the **Time & Billing admin surface** as a third `AppShell` world at `/tb`,
gated to `timebilling:admin`, with a placeholder home — and **nothing else**. The
point of isolating this slice is to ship and **live-verify the regression-risky
routing change** (the new world + `resolveHome`/proxy) and the org-branding RLS
*before* any Jobs logic is layered on. Bar: CRM, portal, and worker routing are
unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Admin surface | Third `AppShell` world `timebilling`; routes under `/tb`. |
| This slice | Shell + routing + org context/RLS + entitlement gate + placeholder `/tb` home. No jobs. |
| Verification | A live checkpoint: `timebilling:admin` reaches `/tb`; CRM/portal/worker routing unchanged. |

## Context

Foundation 1b gives per-product roles (`roles` claim), `proxy.ts` world-separation,
`is_org_member_any`, the entitlement gate (`orgHasProduct` + `NotEnabled`), and
`resolveHome`. `getOrgContext` is CRM-scoped (memberships `product='crm'`) → null for
a `timebilling`-only admin, and the `organizations` row isn't member-readable by a
T&B-only account. The seed `timebilling:worker` exists; no `timebilling:admin` does yet.

## Changes

### 1. AppShell third world `timebilling`

- `src/components/shell/nav.ts`: `World` → `"artisan" | "portal" | "timebilling"`;
  add `timebillingNav = [{ href: "/tb", label: "Jobs", icon: FolderKanban }]`
  (points at the placeholder home for now; 3b repoints it to `/tb/jobs`) and
  `timebillingTabs = ["/tb"]`; extend `navFor`/`tabsFor`.
- `Sidebar`/`TopBar`/`BottomTabBar`/`Fab` handle the new world (nav via `navFor`; the
  Sidebar footer shows **Sign out** via the existing `signOut` action — no settings
  page yet; `Fab` hidden for `timebilling` this slice, since there's no create yet).
- `AppShell` themes from `org.primary_color` as today (`data-world="timebilling"`).

### 2. Org context + RLS for the shell

- Migration `supabase/migrations/20260616000002_org_member_read.sql`: add an
  `organizations` **`member_read`** SELECT policy
  `using (is_org_member_any(organization_id))` so any member (incl. T&B-only) reads
  their org's branding. CRM's `artisan_all` (write) + `contact_read` are unchanged.
- `src/lib/data/org.ts`: add `getWorkspaceContext()` — same return shape as
  `OrgContext` (org branding + user identity), but resolves the user's org from
  `memberships` **without** the `product='crm'` filter (single org per account).
  `getOrgContext` is unchanged.

### 3. Routing

- `src/lib/auth.ts` `resolveHome`: insert the admin branch. Precedence:
  `crm → /dashboard`; `timebilling:admin → /tb`; `timebilling:worker → /log`;
  `contact → /my-projects`; else `/login`. (Unit tests updated.)
- `src/proxy.ts`: add `TB_ADMIN_PREFIXES = ["/tb"]`; a non-`timebilling:admin` hitting
  `/tb` is redirected to `home`. Existing artisan/portal/worker separation unchanged.

### 4. T&B admin gate helper

`src/lib/auth-tb.ts` (new): `requireTbAdmin()` — reads the session claims; returns the
user if `productRole(claims, 'timebilling') === 'admin'`, else `redirect(resolveHome
(claims))` (lazy-imports server deps so it stays unit-test-friendly if needed; mirrors
the worker-layout gate). Used by the `/tb` layout this slice; reused by 3b's job actions.

### 5. Shell pages

- `src/app/(timebilling)/tb/layout.tsx`: gate — `requireTbAdmin()`, then
  `orgHasProduct('timebilling')` → `NotEnabled` if off; render
  `AppShell world="timebilling"` fed by `getWorkspaceContext()`.
- `src/app/(timebilling)/tb/page.tsx`: a placeholder home (e.g. "Jobs coming soon").

### 6. Seed a T&B admin (for verification)

`scripts/seed-tb-admin.mjs` (mirrors `seed-worker.mjs`): ensure Gargoyle's
`timebilling` entitlement is active and create/link a `timebilling:admin` account
`doug+tbadmin@myotherbrain.com` (admin-only, no CRM membership, so it routes to `/tb`);
write the credential to gitignored `rotated-passwords.txt`.

## Testing

- **Unit (Vitest):** `resolveHome` — the new `timebilling:admin → /tb` branch plus the
  full precedence order (crm wins over timebilling; admin over worker; etc.).
- **Regression (manual, the whole point of this slice):**
  - The seed `timebilling:admin` logs in → lands on `/tb`, sees the themed shell
    (org branding, Jobs nav item, Sign out) + the placeholder.
  - **CRM artisan → `/dashboard`, portal contact → `/my-projects`, worker → `/log` are
    all unchanged.** A non-admin hitting `/tb` is redirected to their home.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (org `member_read` policy), deploy, run the seed, then the
regression checks above.

## Out of scope (3b and later)

- Jobs (table, RLS, CRUD pages, forms, status) — slice **3b**.
- Materials catalog, worker job access, full T&B customer CRUD, QBO sync.
