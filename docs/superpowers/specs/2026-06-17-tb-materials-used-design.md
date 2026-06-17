# T&B Materials-used (slice 5b)

_Design spec · 2026-06-17_

> Time & Billing build, slice 5b — the worker **materials-used** logger. Second of
> the worker job sub-slices (5a time ✅ → **5b materials** → 5c photos). Builds on
> the worker `/log` job-detail tabs and the admin-managed `materials` catalog
> (slice 4). PRD §6, §8.2, entity §8.2 MaterialLine:
> [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Goal

Turn the job-detail **Materials** tab stub into a real catalog-based logger: a
worker picks a catalog item and enters a quantity; the line records the material's
name and **company cost as a snapshot** (cost never shown to the worker). Lines
accumulate on the job for that worker and feed the eventual pre-invoice. The
**ad-hoc free-text** add-path and crew-shared visibility are out of scope (later).

## Decisions

| Topic | Decision |
|---|---|
| Line ownership | **Per-worker**, mirroring time tracking: each line carries `worker_user_id`; a worker sees/manages only their own lines; admin reads all. Reuses the 5a worker-self RLS shape. |
| Add-paths | **Catalog-only** this slice. Pick a catalog item + qty (cost hidden). The ad-hoc free-text path (`material_id` null, worker-typed description + price) is deferred — schema leaves the slot open. |
| Line management | Worker can **add, edit quantity, and remove** their own lines. |
| Cost handling | **Snapshot** the catalog `name` (→ `item`) and `unit_price` (→ `unit_cost`, "your cost") + `currency` onto the line at add time. `material_id` is kept for traceability/QBO. Rationale: the pre-invoice must reflect cost-when-used; later catalog rename/re-price/archive must not alter historical lines. |
| Cost visibility | Cost is **never sent to the worker** — not in the line list, not in the picker. The picker query selects `id, name` only; the worker line query omits `unit_cost`. |
| Date dimension | **Not day-partitioned** (unlike time's per-day entries). Lines just carry `created_at` and accumulate on the job for that worker. |
| Quantity | `numeric(12,3)`, must be `> 0` (DB check + app validation). |

## Schema — migration `supabase/migrations/20260617000004_job_material_lines.sql`

```sql
-- Materials used on a job, catalog-sourced, one row per worker-added line.
-- Cost is snapshotted ("your cost") and never exposed to the worker. Maps toward
-- the pre-invoice material lines; material_id keeps catalog/QBO traceability.
create table job_material_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id          uuid not null references jobs (id) on delete cascade,
  worker_user_id  uuid not null references auth.users (id) on delete cascade,
  material_id     uuid references materials (id) on delete restrict,
  item            text not null,
  qty             numeric(12, 3) not null check (qty > 0),
  unit_cost       numeric(12, 2),
  currency        text not null default 'USD',
  created_at      timestamptz not null default now()
);
create index on job_material_lines (organization_id, job_id);

alter table job_material_lines enable row level security;

-- Worker manages only their own lines; admin can read all (for the pre-invoice).
create policy worker_rw on job_material_lines for all to authenticated
  using (worker_user_id = auth.uid() and is_tb_member(organization_id))
  with check (worker_user_id = auth.uid() and is_tb_member(organization_id));
create policy admin_read on job_material_lines for select to authenticated
  using (is_tb_admin(organization_id));
```

`is_tb_member` / `is_tb_admin` exist from the jobs migration. The `on delete
restrict` on `material_id` means an admin can't hard-delete a catalog material
that's referenced by a line — consistent with the catalog's archive-not-delete
model (materials carry `archived_at`).

## Pure helper — `src/lib/data/worktime.ts`

Add a deterministic, unit-tested validator beside the existing ones (it lives in
`worktime.ts` next to `validateSegmentTime`, so the validators stay together and
the existing test file covers it):

```ts
/** Parse and validate a worker-entered quantity. Returns the number if it is a
 *  finite value > 0, else null (caller surfaces a user-facing error). */
export function validateQty(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
```

## Data — `src/lib/data/worker.ts`

- `getJobMaterialsForWorker(jobId)` — the signed-in worker's own lines for the
  job: `id, item, qty, material_id`, ordered by `created_at`. **No `unit_cost` /
  `currency`** in the select. (RLS already restricts to the worker's rows; the
  explicit `worker_user_id = user.id` filter is kept as defense-in-depth, matching
  `getJobTimeForWorker`.)
- `listMaterialsForPicker()` — the org's non-archived catalog as `{ id, name }`
  only, ordered by `name`. A cost-free sibling of the existing `listMaterials()`
  (which returns `unit_price`); used so price never reaches the worker client.

## Actions — `src/app/(worker)/log/actions.ts` (each `requireTbWorker()` via `workerCtx`)

- `addJobMaterial(jobId, materialId, qty)` — validate `qty` with `validateQty`
  (return error string if null); server-side fetch the material (`id, name,
  unit_price, currency`, non-archived, RLS-scoped) — if missing, return an error;
  insert a line snapshotting `item = name`, `unit_cost = unit_price`, `currency`,
  with `worker_user_id` and `organization_id` from `workerCtx`. `revalidatePath`.
- `updateJobMaterialQty(lineId, jobId, qty)` — validate `qty`; update the worker's
  own line's `qty`. `revalidatePath`.
- `removeJobMaterial(lineId, jobId)` — delete the worker's own line. `revalidatePath`.

All three return `Promise<string | void>` (error string surfaced inline), matching
the 5a clock-action pattern. RLS enforces ownership; actions never read or return
cost to the client.

## UI — `src/app/(worker)/log/MaterialsControl.tsx` (new client component)

Replaces the Materials tab stub in `[jobId]/page.tsx`. Props:
`{ jobId, lines, catalog }` where `lines` is the worker's lines (`id, item, qty,
material_id`) and `catalog` is `{ id, name }[]`.

- **Add row:** a `<select>` of `catalog` (alphabetical) + a qty `<input>` +
  **Add** button → `addJobMaterial(jobId, materialId, qty)`. Disabled until a
  material and qty are chosen.
- **Line list:** each line shows **item name + qty only** (never cost). Inline
  qty edit (a small editable field / "save" calling `updateJobMaterialQty`) and a
  **remove** control (`removeJobMaterial`). Empty state when no lines.
- Errors from any action render inline via the shared `FormError`. Uses
  `useTransition` and the existing `Card`/`Button`/`fieldInput` primitives,
  mirroring `ClockControl`.

`[jobId]/page.tsx` (a server component) fetches `getJobMaterialsForWorker(jobId)`
and `listMaterialsForPicker()` and passes them into `<MaterialsControl>`, replacing
the Materials `stub`. The Time tab and Photos stub are untouched.

## Testing

- **Unit** (`src/lib/data/worktime.test.ts`): `validateQty` — positive integer and
  decimal pass; `0`, negative, `NaN`/non-numeric, and empty string return null.
- **Manual** (seed `timebilling:worker`, on a job's Materials tab):
  1. Add a catalog item with a qty → line appears with item name + qty, **no price**.
  2. Edit the qty → persists.
  3. Remove a line → disappears.
  4. Enter `0` or blank qty → inline error, nothing added.
  5. Inspect the page source / network payload → **no `unit_cost` / price** present.
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (1 table + RLS), `vercel --prod`, then the manual checks. New
table only — no change to existing tables.

## Out of scope (later slices)

- **Ad-hoc lines** (free-text item + worker-typed price; `material_id` null) — a
  fast follow-up reusing this table's reserved slot.
- Crew-shared visibility (seeing other workers' lines on a job).
- Photos/attachments (5c); pre-invoice assembly; export; QBO import.
- Admin-side material-line CRUD / promoting an ad-hoc line into the catalog.
