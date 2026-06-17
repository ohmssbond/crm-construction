# T&B Materials catalog (slice 4)

_Design spec · 2026-06-17_

> Time & Billing build, slice 4 — the materials/items catalog, an admin CRUD list
> under `/tb`. Builds on the T&B admin shell (3a) and follows the Jobs (3b) blueprint.
> PRD §8.2 (Material/Item): [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Let a T&B admin maintain a per-org **materials/items catalog** (name, sku, type,
unit price, description) — the list workers will later pick from when logging
materials used on a job. QBO-ready (nullable mapping fields), but no QBO sync yet.

## Decisions

| Topic | Decision |
|---|---|
| Active state | Reuse `archived_at` (active ⇔ `archived_at IS NULL`); no separate `active` boolean. |
| QBO fields | Core sync fields now (`qbo_id`, `qbo_sync_token`, `last_synced_at`, `sync_status`, `source`); income/expense account refs deferred to the QBO slice. |
| Unique name | Partial unique `(organization_id, name) WHERE archived_at IS NULL` (matches QBO Item name uniqueness; friendly error on dup). |
| Detail view | None — flat catalog items edit in place (list → edit). |
| Unit price | The company's cost (`unit_price`); hidden from workers in the later materials-used slice, shown to admins here. |
| RLS | Read by any T&B member (`is_tb_member`), write by T&B admins (`is_tb_admin`) — reuse the helpers from the jobs migration. |

## Schema — migration `supabase/migrations/20260617000001_materials.sql`

```sql
create table materials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null,
  description     text,
  sku             text,
  unit_price      numeric(12, 2),
  currency        text not null default 'USD',
  type            text not null default 'non_inventory'
                    check (type in ('service', 'non_inventory', 'inventory')),
  qbo_id          text,
  qbo_sync_token  text,
  last_synced_at  timestamptz,
  sync_status     text not null default 'unsynced',
  source          text not null default 'local',
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on materials (organization_id);
create unique index materials_org_name_active_uq
  on materials (organization_id, name) where archived_at is null;
alter table materials enable row level security;

create policy member_read on materials for select to authenticated
  using (is_tb_member(organization_id));
create policy admin_write on materials for all to authenticated
  using (is_tb_admin(organization_id)) with check (is_tb_admin(organization_id));
```

(`is_tb_member` / `is_tb_admin` were created in the jobs migration `20260616000003`.)

## Data — `src/lib/data/materials.ts`

- `listMaterials()` — org's non-archived materials (RLS-scoped), ordered by `name`,
  selecting `id, name, type, unit_price, currency, sku`.
- `getMaterialDetail(id)` — a single non-archived material with all editable fields
  (`name, description, sku, unit_price, type`); null if archived/not visible.

## Actions — `src/app/(timebilling)/tb/materials/actions.ts`

`createMaterial`, `updateMaterial`, `archiveMaterial` — each calls `requireTbAdmin()`
first (writes also enforced by `is_tb_admin` RLS). `create`/`update`:
- read `name`, `description`, `sku`, `unit_price`, `type` from `FormData`;
- validate a non-empty `name` and a whitelisted `type`
  (`service|non_inventory|inventory`);
- coerce `unit_price` to a number when present, else null;
- map a unique-violation (`23505`) to a friendly "a material with that name already
  exists" error.

`archiveMaterial(id)` sets `archived_at`, checks the error, then redirects to
`/tb/materials`. A local `MaterialFormState = { error: string | null }`.

## UI — under `src/app/(timebilling)/tb/materials/`

- **Nav:** add a `Materials` item to `timebillingNav` (`/tb/materials`, a lucide icon
  such as `Package`), and `/tb/materials` to `timebillingTabs`.
- `materials/page.tsx` — list (name, `type`, unit price); empty state; "New material".
  Rows link to the edit page.
- `materials/new/page.tsx` + `materials/[id]/edit/page.tsx` — render `MaterialForm`;
  the edit page also shows the `ArchiveButton` (reused via `@/app/(artisan)/ArchiveButton`,
  `archiveMaterial.bind(null, id)`).
- `MaterialForm.tsx` (client) — `useActionState`; fields: `name` (required), `sku`,
  `type` `<select>` (Service / Non-inventory / Inventory), `unit_price`
  (number input), `description` (textarea); `FormError`.

## Testing

No new pure logic to unit-test (no formatter). Verification:
- `npm run build` succeeds; `/tb/materials`, `/tb/materials/new`, `/tb/materials/[id]/edit`
  appear in the route list.
- Manual (as the seeded `timebilling:admin`): create a material, see it in the list;
  edit it; archive it (leaves the list); a second active material with the same name is
  rejected with the friendly error.
- `npm test` (existing suite) stays green.

## Cutover (controller/operator)

`supabase db push` (materials table + RLS), deploy, then the manual checks above.

## Out of scope (later slices)

- Worker-facing material selection + ad-hoc/"your cost" material lines on a job
  (the materials-used slice).
- QBO read-only-when-connected behavior + income/expense account-reference fields
  (the QBO slice).
