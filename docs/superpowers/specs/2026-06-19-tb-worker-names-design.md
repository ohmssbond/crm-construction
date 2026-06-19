# T&B Worker names (slice 7a)

_Design spec · 2026-06-19_

> Time & Billing build, slice 7a — give workers a **human name** instead of just a
> login email. Surfaced from dogfooding the slice-6 report (techs were labeled by
> email). First step of the deferred "formal Worker entity" item. Pairs with slice 7b
> (collapse the job detail + report), which follows. Builds on `/tb` (admin),
> the `/log` worker shell, and `getJobReport` (slice 6).

## Goal

An admin can set a **name** for each T&B worker on a new `/tb/workers` screen. The name
then labels each tech in the completed-job report (falling back to email when unset) and
greets the worker in their own `/log` app. **Scope: naming existing workers only** —
net-new worker creation/invite is out (workers remain seed-provisioned).

## Decisions

| Topic | Decision |
|---|---|
| Storage | New per-org table **`tb_workers(organization_id, user_id, name, …)`**, PK `(org, user_id)`. A row exists only once a name is set. Aligns with the PRD Worker entity (room to grow: QBO employee/vendor mapping, type, rate). |
| RLS | `admin_rw` (tb admin reads/writes all org rows) + `worker_read_own` (a worker reads only their own row, for the shell greeting). |
| Admin list source | The `/tb/workers` data function is admin-gated and uses the **service-role client** to enumerate `memberships` (product `timebilling`, role `worker`) **for the admin's own org** (org id from the gated `getWorkspaceContext`, never a param) + resolve emails — because memberships aren't admin-readable under RLS. It left-joins `tb_workers` for the current name. |
| Report label | Tech label = `workerLabel(name, email, id)` = `name ?? email ?? id-slice`. Names take precedence; the existing service-role email lookup stays as the fallback. |
| Worker greeting | The `/log` layout reads the worker's **own** `tb_workers` row (via `worker_read_own`) and shows "Hi, {name}" by the org tile when set; nothing when unset. |
| Out of scope | Net-new worker create/invite; QBO mapping fields; pay rates; deleting/deactivating workers. |

## Schema — migration `supabase/migrations/20260619000001_tb_workers.sql`

```sql
-- Per-org worker profile (name, for now). The eventual Worker entity (maps to a QBO
-- Employee/Vendor); admin-managed, worker reads own.
create table tb_workers (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table tb_workers enable row level security;

-- Admin manages every worker in the org.
create policy admin_rw on tb_workers for all to authenticated
  using (is_tb_admin(organization_id))
  with check (is_tb_admin(organization_id));

-- A worker may read only their own profile (drives the /log shell greeting).
create policy worker_read_own on tb_workers for select to authenticated
  using (user_id = auth.uid() and is_tb_member(organization_id));
```

`is_tb_admin` / `is_tb_member` exist from the jobs migration.

## Pure helper — `src/lib/data/worktime.ts` (unit-tested)

```ts
/** Display label for a worker: their set name, else their login email, else a short
 *  id fallback. Used by the report and anywhere a worker is named. */
export function workerLabel(
  name: string | null,
  email: string | null,
  id: string
): string {
  return name?.trim() || email || id.slice(0, 8);
}
```

## Data + actions

**`src/lib/data/tb-workers.ts`** (new):
- `listTbWorkers()` — admin-gated. Get the org id from `getWorkspaceContext()` (RLS).
  Using `createAdminClient()` (service-role): select `memberships` where
  `organization_id = <that org>`, `product = 'timebilling'`, `role = 'worker'`; resolve
  each `user_id` → email via `admin.auth.admin.getUserById`. Read `tb_workers` (RLS
  client) for current names. Return `[{ userId, email, name }]` sorted by
  `workerLabel(...)`.
- `getWorkerName()` — worker-side. The signed-in user's own `tb_workers.name` (via the
  `worker_read_own` policy) or `null`.

**`src/app/(timebilling)/tb/workers/actions.ts`** (new), `requireTbAdmin()` first:
- `setWorkerName(userId, name)` → validate non-empty (reuse `validateLabel`); upsert
  `tb_workers { organization_id: <admin org>, user_id: userId, name, updated_at: now() }`
  on conflict `(organization_id, user_id)`; `revalidatePath('/tb/workers')`. Returns an
  inline error string on empty name, matching the established action pattern.

## UI

- **`src/app/(timebilling)/tb/workers/page.tsx`** (new) — server component listing
  `listTbWorkers()`. Each worker is a row: email + an inline **name editor** (a small
  client component `WorkerNameForm` with a text input + Save, calling `setWorkerName`,
  surfacing errors via `FormError`). Empty state when the org has no workers.
- **Nav** — add `{ href: "/tb/workers", label: "Workers", icon: Users }` to
  `timebillingNav` in `src/components/shell/nav.ts`, and `"/tb/workers"` to
  `timebillingTabs`. (`Users` is already imported there.)
- **Report** — in `getJobReport` (`src/lib/data/tb-report.ts`): after resolving emails,
  read `tb_workers` (RLS, admin) for the org's `{ user_id → name }`; set each worker
  group's display label to `workerLabel(name, email, userId)`. The returned shape's
  `workers[].email` field is **renamed to `label`** (its only consumer is the report
  page); update the page to render `w.label`.
- **Worker shell** — in `src/app/(worker)/log/layout.tsx`: call `getWorkerName()`; when
  non-null, render a muted "Hi, {name}" near the org brand tile in the header.

## Testing

- **Unit** (`src/lib/data/worktime.test.ts`): `workerLabel` — name wins; falls back to
  email when name is null/blank; falls back to `id.slice(0,8)` when both null.
- **Manual**:
  1. As `timebilling:admin`, open **Workers** (`/tb/workers`) → the seed worker
     (`doug+worker@…`) is listed by email with an empty name field. Set a name → Save.
  2. Open the completed-job report for a job that worker logged → the time section now
     labels the tech by **name**.
  3. Sign in as that `timebilling:worker` → `/log` header greets **"Hi, {name}"**.
  4. A second, unnamed worker still shows their **email** in the report (fallback holds).
- `npm test` + `npm run build` pass.

## Cutover (controller/operator)

`supabase db push` (1 table + RLS), `vercel --prod`, then the manual checks. New table
only — no change to existing tables.

## Out of scope (later)

- **Slice 7b**: collapse the job detail + report into one screen (separate spec/plan).
- Net-new worker onboarding (create/invite); QBO employee/vendor mapping; pay rates;
  worker deactivation; editing a worker's email.
