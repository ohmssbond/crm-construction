# Foundation 1a — Memberships + Entitlements + Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `organization_members` with a unified per-product `memberships` table and add `organization_products` entitlements, migrating the auth hook + `is_org_member` accordingly — with **zero change to CRM behavior**.

**Architecture:** One big-bang migration creates the new tables, backfills from `organization_members`, rewrites `is_org_member` to mean "has a `crm` membership", rewrites `custom_access_token_hook` to derive from `memberships` (preserving the `user_role='artisan'` claim and adding a new `roles` claim), then drops the old table. App code only swaps the readers of the dropped table. A single coordinated remote cutover + deploy lands it.

**Tech Stack:** Supabase (Postgres, RLS, auth hook), Next.js 16, TypeScript.

---

## File Structure

- **Create** `supabase/migrations/20260615000001_unify_memberships.sql` — the whole migration.
- **Modify** `src/lib/supabase/database.types.ts` — drop `organization_members` type; add `memberships` + `organization_products`.
- **Modify** `src/lib/data/org.ts`, `src/app/(auth)/login/actions.ts`, `src/lib/data/tenants.ts` — swap reads to `memberships` filtered to `product='crm'`.
- **Modify** `src/lib/auth.ts` — stale doc comment only.
- **Modify** `scripts/create-tenant.mjs`, `scripts/authorize-artisans.mjs`, `scripts/stamp-roles.mjs` — write `memberships`; deprecate the stamp script.

**Sequencing:** the migration file (Task 1) and the types+reader swap (Task 2) make the *local build* green together; the app won't successfully run against the remote DB until the migration is applied in the **cutover (Task 5)**. That coupling is inherent to a schema cutover and is called out there.

---

## Task 1: Author the migration

**Files:**
- Create: `supabase/migrations/20260615000001_unify_memberships.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260615000001_unify_memberships.sql`:

```sql
-- Foundation 1a: unify staff roles into per-product `memberships`, add per-org
-- `organization_products` entitlements, migrate the auth hook + is_org_member off
-- `organization_members`, then drop it. CRM behavior is preserved: the hook still
-- stamps user_role='artisan' for CRM staff, and is_org_member now means "has a crm
-- membership" — which every backfilled member satisfies.

-- 1. memberships ------------------------------------------------------------
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
alter table memberships enable row level security;

-- 2. organization_products (per-org entitlements) ---------------------------
create table organization_products (
  organization_id uuid not null references organizations (id) on delete cascade,
  product         text not null check (product in ('crm', 'timebilling')),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, product)
);
alter table organization_products enable row level security;

-- 3. Backfill (all existing members are CRM staff) --------------------------
insert into memberships (organization_id, user_id, product, role, created_at)
  select organization_id, user_id, 'crm', role, created_at from organization_members;

insert into organization_products (organization_id, product, status)
  select distinct organization_id, 'crm', 'active' from organization_members
on conflict do nothing;

-- 4. is_org_member → "has a crm membership" (preserves all CRM RLS behavior) -
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.product = 'crm'
  );
$$;

-- 5. RLS on the new tables (reads for staff; writes are service-role only) ---
create policy self_or_member_read on memberships for select to authenticated
  using (user_id = auth.uid() or is_org_member(organization_id));
create policy member_read on organization_products for select to authenticated
  using (is_org_member(organization_id));

-- 6. Let the Auth server read memberships for the access-token hook ----------
grant select on memberships to supabase_auth_admin;
create policy auth_admin_read on memberships for select to supabase_auth_admin using (true);

-- 7. Rewrite the access-token hook off organization_members ------------------
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
  -- Staff: this user's per-product roles within their (single) org.
  select m.organization_id, jsonb_object_agg(m.product, m.role)
    into v_org, v_roles
  from public.memberships m
  where m.user_id = uid
  group by m.organization_id
  limit 1;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{roles}',  v_roles);
    -- Back-compat: keep the legacy single-role claim for CRM staff (1b drops it).
    if v_roles ? 'crm' then
      claims := jsonb_set(claims, '{user_role}', to_jsonb('artisan'::text));
    end if;
  else
    -- Otherwise: a portal contact (unchanged behavior).
    select c.organization_id, c.id into v_org, v_contact
      from public.contacts c where c.user_id = uid limit 1;
    if v_org is not null then
      claims := jsonb_set(claims, '{user_role}',  to_jsonb('contact'::text));
      claims := jsonb_set(claims, '{org_id}',     to_jsonb(v_org::text));
      claims := jsonb_set(claims, '{contact_id}', to_jsonb(v_contact::text));
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- 8. Drop the old table (data already backfilled in step 3) ------------------
drop table organization_members;
```

- [ ] **Step 2: Sanity-check the SQL is well-formed**

Run: `grep -c "create table\|create or replace function\|drop table" supabase/migrations/20260615000001_unify_memberships.sql`
Expected: `5` (2 tables, 2 functions, 1 drop). Do NOT apply it yet — the cutover (Task 5) applies it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615000001_unify_memberships.sql
git commit -m "$(cat <<'EOF'
Migration: unify memberships + add org entitlements, migrate auth hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update generated types + swap the readers

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/data/org.ts`
- Modify: `src/app/(auth)/login/actions.ts`
- Modify: `src/lib/data/tenants.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Replace the `organization_members` type with the two new tables**

In `src/lib/supabase/database.types.ts`, locate the `organization_members: { ... }`
entry under `Tables` (Row/Insert/Update/Relationships) and replace that entire entry
with these two entries:

```ts
      memberships: {
        Row: {
          created_at: string
          organization_id: string
          product: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          product: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          product?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_products: {
        Row: {
          created_at: string
          organization_id: string
          product: string
          status: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          product: string
          status?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          product?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Swap the `getOrgContext` reader**

In `src/lib/data/org.ts`, find:

```ts
  const { data } = await supabase
    .from("organization_members")
    .select("organizations(id, name, primary_color, member_noun, client_noun, timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
```

Replace with:

```ts
  const { data } = await supabase
    .from("memberships")
    .select("organizations(id, name, primary_color, member_noun, client_noun, timezone)")
    .eq("user_id", user.id)
    .eq("product", "crm")
    .limit(1)
    .maybeSingle();
```

- [ ] **Step 3: Swap the login-redirect membership check**

In `src/app/(auth)/login/actions.ts`, find:

```ts
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .limit(1)
      .maybeSingle();
```

Replace with:

```ts
    const { data: membership } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", data.user.id)
      .eq("product", "crm")
      .limit(1)
      .maybeSingle();
```

- [ ] **Step 4: Swap the `listTenants` reader**

In `src/lib/data/tenants.ts`, find:

```ts
    admin.from("organization_members").select("organization_id, user_id, role"),
```

Replace with:

```ts
    admin.from("memberships").select("organization_id, user_id, role").eq("product", "crm"),
```

- [ ] **Step 5: Fix the stale doc comment in `auth.ts`**

In `src/lib/auth.ts`, find:

```ts
 * (derived live from organization_members / contacts at token time). This is the
```

Replace with:

```ts
 * (derived live from memberships / contacts at token time). This is the
```

- [ ] **Step 6: Verify the build passes**

Run: `npm run build`
Expected: build succeeds — no TypeScript reference to `organization_members` remains. (The app won't *run* against remote until Task 5 applies the migration; this step only checks types compile.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/database.types.ts src/lib/data/org.ts "src/app/(auth)/login/actions.ts" src/lib/data/tenants.ts src/lib/auth.ts
git commit -m "$(cat <<'EOF'
Swap organization_members readers to memberships (product=crm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update provisioning scripts

**Files:**
- Modify: `scripts/create-tenant.mjs`
- Modify: `scripts/authorize-artisans.mjs`
- Modify: `scripts/stamp-roles.mjs`

- [ ] **Step 1: `create-tenant.mjs` — write a membership + entitlement**

In `scripts/create-tenant.mjs`, find:

```js
const { error: me } = await admin
  .from("organization_members")
  .insert({ organization_id: org.id, user_id: created.user.id, role: "owner" });
console.log("✓ membership:", me ? "ERROR " + me.message : "owner");
```

Replace with:

```js
const { error: me } = await admin
  .from("memberships")
  .insert({ organization_id: org.id, user_id: created.user.id, product: "crm", role: "owner" });
console.log("✓ membership:", me ? "ERROR " + me.message : "owner");

// 4b. entitlement
await admin
  .from("organization_products")
  .upsert({ organization_id: org.id, product: "crm", status: "active" });
```

- [ ] **Step 2: `authorize-artisans.mjs` — write a membership**

In `scripts/authorize-artisans.mjs`, find:

```js
  const { error: mErr } = await supabase
    .from("organization_members")
    .upsert(
      { organization_id: t.org, user_id: uid, role: "owner" },
      { onConflict: "organization_id,user_id" }
    );
```

Replace with:

```js
  const { error: mErr } = await supabase
    .from("memberships")
    .upsert(
      { organization_id: t.org, user_id: uid, product: "crm", role: "owner" },
      { onConflict: "organization_id,user_id,product" }
    );
```

- [ ] **Step 3: Deprecate `stamp-roles.mjs`**

At the very top of `scripts/stamp-roles.mjs`, add a deprecation note (the access-token
hook now derives roles live from `memberships`, so stamping `app_metadata.role` is no
longer used by the app):

```js
// DEPRECATED (Foundation 1a): roles are derived live from `memberships` by the
// access-token hook; the app no longer reads app_metadata.role. Kept for reference.
```

Do not change its logic.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-tenant.mjs scripts/authorize-artisans.mjs scripts/stamp-roles.mjs
git commit -m "$(cat <<'EOF'
Update provisioning scripts for memberships + entitlements

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify the test suite + build (pre-cutover gate)

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: existing tests pass (no new tests in 1a; the `roles` claim is consumed in 1b).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds, no `organization_members` references.

- [ ] **Step 3: Commit (no-op if clean)**

Nothing to commit if Tasks 1–3 are committed; this task is a gate before the cutover.

---

## Task 5: Cutover & verification _(controller/operator — NOT a subagent)_

This applies the destructive migration to the **production** Supabase DB and deploys.
Run by the controller/operator, not an implementation subagent. The backfill copies
all `organization_members` data into `memberships` before the drop, so there is no
data loss; the only window is between applying the migration and deploying the new
code (brief, acceptable at current low usage).

- [ ] **Step 1: Apply the migration to remote**

Run: `supabase db push`
Expected: `20260615000001_unify_memberships.sql` applies; `supabase migration list`
shows it on Local + Remote.

- [ ] **Step 2: (Optional) reconcile generated types from remote**

Run: `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
then `npm run build`. If the diff is non-trivial, commit it:
```bash
git add src/lib/supabase/database.types.ts && git commit -m "$(cat <<'EOF'
Reconcile generated types after memberships migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Restart the local dev server and run the regression checks**

Restart `npm run dev` (so it reconnects post-migration), then verify against
`http://localhost:3000`:
- Sign in as an artisan (`doug+jhuber@…`) → lands on `/dashboard`; only that org's
  projects/customers are visible (RLS via the rewritten `is_org_member` intact).
- Sign in as a portal contact → lands on `/my-projects`; only shared data visible.
- `/admin` tenant list still shows the correct owner emails for both tenants.

If any check fails, stop and diagnose before deploying.

- [ ] **Step 4: Deploy to production**

Merge to `main`, push, and deploy (`vercel --prod`) so the production app matches the
new schema. Re-run the three regression checks against `https://app.build-it-together.com`.

---

## Notes for the implementer

- **Why `is_org_member` = "crm membership" is safe:** the backfill makes every current
  member a `crm` membership, so the rewritten function returns the same result for all
  existing users — every CRM RLS policy that calls it is unaffected.
- **The hook keeps `user_role='artisan'`** for CRM staff, so `proxy.ts`, `login`, and
  `src/lib/auth.ts` are intentionally NOT changed in 1a (that's 1b). Pure-`timebilling`
  users would get no `user_role` — but none exist until later slices.
- **Contacts are untouched** — the contact branch of the hook and `contacts` grants/RLS
  stay exactly as they were.
- Tasks 1–4 are subagent-safe (no remote writes). Task 5 is operator-run (prod DB + deploy).
