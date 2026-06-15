# Foundation 1a — entitlements + unified memberships + auth migration

_Design spec · 2026-06-15_

> Slice 1a of the Foundation (see
> [`2026-06-15-platform-architecture-design.md`](2026-06-15-platform-architecture-design.md)).
> 1b (product-aware routing, worker shell, admin entitlement toggle) is a separate
> spec that builds on this.

## Goal

Replace the CRM's single-purpose `organization_members` table with a unified,
per-product **`memberships`** table and add per-org **`organization_products`**
entitlements — **without changing any CRM behavior**. This is the risky core of the
Foundation; the success bar is regression-clean: artisans and portal contacts log
in and see exactly what they do today.

## Safety guarantee (how this stays non-breaking)

1. **The JWT `user_role` claim is preserved.** The access-token hook still stamps
   `user_role='artisan'` for org staff and `user_role='contact'` for portal
   contacts — now derived from `memberships`/`contacts` instead of
   `organization_members`. `proxy.ts`, `login`, and `src/lib/auth.ts` keep reading
   `user_role` and are **not changed in 1a** (1b switches them to the new claim).
   The hook *additionally* stamps a new `roles` claim for 1b to consume.
2. **`is_org_member(org)` is rewritten to mean "has a `crm` membership in org."**
   The backfill turns every existing member into a `crm` membership, so every CRM
   RLS policy that calls `is_org_member` behaves **identically** after the migration.
3. Only **reads of the dropped table** are swapped to `memberships` (filtered to
   `product='crm'`), preserving current semantics.

## Decisions baked in (from the Foundation brainstorm)

- **Single org per account** for now — all of an account's memberships share one
  `organization_id`. Multi-org is deferred.
- Per-product roles: `crm` → `owner|artisan`; `timebilling` → `admin|worker`.
- Portal **contacts are untouched** (`contacts.user_id` + `contact` role stay as-is).
- **Big-bang migration:** one SQL migration creates the new tables, backfills,
  rewrites the hook + `is_org_member`, and drops `organization_members`.

## Data model (new migration `supabase/migrations/20260615000001_unify_memberships.sql`)

```sql
-- 1. Per-product staff membership (replaces organization_members).
create table memberships (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  product         text not null check (product in ('crm', 'timebilling')),
  role            text not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id, product),
  check (
    (product = 'crm' and role in ('owner', 'artisan')) or
    (product = 'timebilling' and role in ('admin', 'worker'))
  )
);
create index on memberships (user_id);

-- 2. Per-org product entitlements.
create table organization_products (
  organization_id uuid not null references organizations (id) on delete cascade,
  product         text not null check (product in ('crm', 'timebilling')),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, product)
);
```

- **Backfill (same migration):** insert into `memberships` from
  `organization_members` with `product = 'crm'` (carrying the existing `role`);
  insert `organization_products(organization_id, 'crm', 'active')` for every org
  that has a crm membership.
- **RLS:** enable on both. Staff read their own org's rows
  (`using (is_org_member(organization_id))` — defined below, post-rewrite). Writes
  are service-role only (the `/admin` console + provisioning), matching how
  `organization_members` was managed. Grant `select` on `memberships` to
  `supabase_auth_admin` with an `auth_admin_read` policy (mirroring what the hook
  needs; the equivalent grant/policy on `organization_members` disappears with the
  drop).

## Auth rewrites (same migration)

**`is_org_member(org)`** — rewrite to check a `crm` membership:

```sql
create or replace function public.is_org_member(org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.product = 'crm'
  );
$$;
```

**`custom_access_token_hook`** — derive from `memberships`, preserve `user_role`,
add `roles`:

- If the user has any `crm` membership: stamp `user_role='artisan'`, `org_id`, and
  add `roles` = a JSON object of `{product: role}` across all their membership rows
  (e.g. `{"crm":"owner"}`, later `{"crm":"owner","timebilling":"admin"}`).
- Else if a contact: stamp `user_role='contact'`, `org_id`, `contact_id` (unchanged).
- Keep the existing grants/`security` posture; grant `select on memberships to
  supabase_auth_admin` and add its `auth_admin_read` policy.

**Drop** `organization_members` at the end of the migration (after the hook and
`is_org_member` no longer reference it).

## App reader swaps (1a code changes)

Swap each reader from `organization_members` to `memberships` (filter
`product = 'crm'` — preserving "CRM staff" semantics). Behavior is unchanged.

- `src/lib/data/org.ts` (`getOrgContext`, ~line 49) — `.from("memberships")` +
  `.eq("product", "crm")` when resolving the artisan's org.
- `src/app/(auth)/login/actions.ts` (~line 47) — same swap when checking membership
  for the post-login redirect (crm member → `/dashboard`, as today).
- `src/lib/data/tenants.ts` (`listTenants`, ~line 21) — select from `memberships`
  filtered to `product='crm'` for the owner-email resolution (owner = `role='owner'`
  membership, fallback first).
- `src/lib/supabase/database.types.ts` — remove the `organization_members` block;
  add `memberships` and `organization_products` Row/Insert/Update types (hand-edit
  to match the schema, since the migration isn't on remote until apply-time).
- `src/lib/auth.ts` — update the stale doc comment referencing
  `organization_members`. (No logic change in 1a.)

## Provisioning scripts (keep them working)

- `scripts/create-tenant.mjs` — insert a `memberships(product='crm', role='owner')`
  row instead of `organization_members`; also insert
  `organization_products(org, 'crm', 'active')`.
- `scripts/authorize-artisans.mjs` — insert into `memberships(product='crm', ...)`.
- `scripts/stamp-roles.mjs` — now **obsolete** (the hook derives roles live from
  `memberships`; nothing reads `app_metadata.role` after 1b). Leave a note at the
  top that it's deprecated; do not delete in 1a.

## Testing

- **Unit (Vitest):** none strictly required for 1a (the new `roles` claim isn't
  consumed until 1b). If a `roles`-claim parser helper is added to `auth.ts` for
  1b's benefit, give it a small test; otherwise defer to 1b.
- **Regression — the bar for this slice (manual, against a local dev server after
  applying the migration):**
  - An artisan (`doug+jhuber@…`) logs in → lands on `/dashboard`, sees only their
    org's projects/customers (RLS via the rewritten `is_org_member` intact).
  - A portal contact logs in → lands on `/my-projects`, sees only shared data.
  - The `/admin` tenant list still renders correct owner emails (the `listTenants`
    swap).
- `npm test` and `npm run build` pass.

## Rollout

- Apply the migration to the remote DB with `supabase db push` (controller/operator
  step — outward), then verify the regression checks against production. The app
  code and migration must ship together (the dropped table + swapped readers are
  atomic in effect).

## Out of scope (1b and later)

- Product-aware routing, entitlement gating in layouts, the worker `/log` shell, the
  product switcher, and the `/admin` entitlement toggle UI — all **1b**.
- Consuming the new `roles` claim / removing the `user_role` claim — 1b.
- T&B domain tables, shared-customer evolution, QBO columns — later slices.
