# Materials-used (slice 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a worker log catalog materials used on a job (pick item + quantity, cost hidden), with add / edit-qty / remove, on the job-detail Materials tab.

**Architecture:** A new per-worker `job_material_lines` table (RLS mirroring `job_time_segments`) holds lines that snapshot the catalog item name + cost at add time. A pure `validateQty` helper guards quantity. Three server actions (add/update/remove) return inline error strings like the 5a clock actions. A `MaterialsControl` client component owns the picker + line list; the server `page.tsx` feeds it cost-free data.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), TypeScript, Supabase (Postgres/RLS), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-17-tb-materials-used-design.md`

**Notes for the engineer:**
- This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing server-action / client-component code.
- Do NOT run `git push`, `supabase db push`, or `vercel` — those are operator-run at cutover. The migration is applied to the remote DB by the operator, not during implementation.
- Each task below builds green on its own (the actions/data functions are new — they don't change existing call sites), so `npm run build` is a valid gate per task.

---

## File Structure

- `supabase/migrations/20260617000004_job_material_lines.sql` — **create**: the table + indexes + RLS.
- `src/lib/data/worktime.ts` — **modify**: add the pure `validateQty` helper (beside `validateSegmentTime`).
- `src/lib/data/worktime.test.ts` — **modify**: add a `validateQty` describe block.
- `src/lib/data/worker.ts` — **modify**: add `getJobMaterialsForWorker(jobId)` (worker's own lines, no cost).
- `src/lib/data/materials.ts` — **modify**: add `listMaterialsForPicker()` (cost-free `{id, name}` catalog).
- `src/app/(worker)/log/actions.ts` — **modify**: add `addJobMaterial`, `updateJobMaterialQty`, `removeJobMaterial`.
- `src/app/(worker)/log/MaterialsControl.tsx` — **create**: client component (picker + line list with inline qty edit + remove).
- `src/app/(worker)/log/[jobId]/page.tsx` — **modify**: fetch lines + catalog, render `<MaterialsControl>` in place of the Materials stub.

---

## Task 1: Migration — `job_material_lines` table + RLS

**Files:**
- Create: `supabase/migrations/20260617000004_job_material_lines.sql`

No automated test (DDL applied at cutover by the operator). Verification is a careful read against the spec + the migration applying cleanly at cutover.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260617000004_job_material_lines.sql` with exactly:

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

- [ ] **Step 2: Sanity-check it parses against the prior migration's conventions**

Run: `grep -n "is_tb_member\|is_tb_admin" supabase/migrations/20260617000003_time_tracking.sql`
Expected: shows the same helper names used by the time-tracking RLS — confirming `is_tb_member` / `is_tb_admin` exist for our policies to reference. (Do NOT run `supabase db push`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000004_job_material_lines.sql
git commit -m "Add job_material_lines table + RLS (T&B materials-used)"
```

---

## Task 2: `validateQty` pure helper (TDD)

**Files:**
- Modify: `src/lib/data/worktime.ts`
- Test: `src/lib/data/worktime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `validateQty` to the existing import at the top of `src/lib/data/worktime.test.ts` (it currently imports `timeToMinutes, sumSegmentHours, roundQuarterHours, fmtTimeOfDay, nowTimeInZone, todayInZone, validateSegmentTime` from `./worktime` — add `validateQty` to that list), then append this block:

```ts
describe("validateQty", () => {
  test("accepts a positive integer", () => {
    expect(validateQty("3")).toBe(3);
  });

  test("accepts a positive decimal", () => {
    expect(validateQty("2.5")).toBe(2.5);
  });

  test("rejects zero", () => {
    expect(validateQty("0")).toBeNull();
  });

  test("rejects a negative number", () => {
    expect(validateQty("-1")).toBeNull();
  });

  test("rejects non-numeric input", () => {
    expect(validateQty("abc")).toBeNull();
  });

  test("rejects an empty string", () => {
    expect(validateQty("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worktime`
Expected: FAIL — `validateQty is not a function`.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/data/worktime.ts`, immediately after the `validateSegmentTime` function:

```ts
/** Parse and validate a worker-entered quantity. Returns the number if it is a
 *  finite value > 0, else null (caller surfaces a user-facing error).
 *  Note: `Number("")` is 0, so empty string is correctly rejected by `<= 0`. */
export function validateQty(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worktime`
Expected: PASS (6 new `validateQty` cases + all existing worktime tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/worktime.ts src/lib/data/worktime.test.ts
git commit -m "Add validateQty helper for material quantities"
```

---

## Task 3: Data layer — worker lines + cost-free picker

**Files:**
- Modify: `src/lib/data/worker.ts`
- Modify: `src/lib/data/materials.ts`

No unit test (these are thin Supabase reads, RLS-enforced); covered by the build + manual checks.

- [ ] **Step 1: Add `getJobMaterialsForWorker` to `worker.ts`**

Append to `src/lib/data/worker.ts` (it already imports `createClient`):

```ts
/** The signed-in worker's own material lines for a job (no cost fields). */
export async function getJobMaterialsForWorker(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("job_material_lines")
    .select("id, item, qty, material_id")
    .eq("job_id", jobId)
    .eq("worker_user_id", user.id)
    .order("created_at", { ascending: true });
  return data ?? [];
}
```

- [ ] **Step 2: Add `listMaterialsForPicker` to `materials.ts`**

Append to `src/lib/data/materials.ts` (it already imports `createClient`):

```ts
/** Org's non-archived catalog as cost-free picker options (id + name only), so
 *  no price ever reaches the worker client. */
export async function listMaterialsForPicker() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. (Both functions are new and not yet called — that's fine.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/worker.ts src/lib/data/materials.ts
git commit -m "Add worker material-line reads + cost-free material picker"
```

---

## Task 4: Server actions — add / update-qty / remove

**Files:**
- Modify: `src/app/(worker)/log/actions.ts`

No unit test (Supabase/RLS); the qty validation is unit-tested in Task 2. Covered by build + manual checks.

- [ ] **Step 1: Import `validateQty`**

In `src/app/(worker)/log/actions.ts`, the worktime import currently reads:
```ts
import { nowTimeInZone, todayInZone, validateSegmentTime } from "@/lib/data/worktime";
```
Change it to:
```ts
import { nowTimeInZone, todayInZone, validateSegmentTime, validateQty } from "@/lib/data/worktime";
```

- [ ] **Step 2: Append the three actions**

Add to the END of `src/app/(worker)/log/actions.ts` (the `workerCtx`, `createClient`, `revalidatePath` helpers are already imported/defined in this file):

```ts
export async function addJobMaterial(
  jobId: string,
  materialId: string,
  qtyInput: string
): Promise<string | void> {
  const { userId, orgId } = await workerCtx();
  const qty = validateQty(qtyInput);
  if (qty === null) return "Enter a quantity greater than zero.";

  const supabase = await createClient();
  // Snapshot the catalog name + cost at add time (cost never returned to client).
  const { data: material } = await supabase
    .from("materials")
    .select("name, unit_price, currency")
    .eq("id", materialId)
    .is("archived_at", null)
    .maybeSingle();
  if (!material) return "That material is no longer available.";

  await supabase.from("job_material_lines").insert({
    organization_id: orgId,
    job_id: jobId,
    worker_user_id: userId,
    material_id: materialId,
    item: material.name,
    unit_cost: material.unit_price,
    currency: material.currency,
    qty,
  });
  revalidatePath(`/log/${jobId}`);
}

export async function updateJobMaterialQty(
  lineId: string,
  jobId: string,
  qtyInput: string
): Promise<string | void> {
  const { userId } = await workerCtx();
  const qty = validateQty(qtyInput);
  if (qty === null) return "Enter a quantity greater than zero.";

  const supabase = await createClient();
  await supabase
    .from("job_material_lines")
    .update({ qty })
    .eq("id", lineId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}

export async function removeJobMaterial(lineId: string, jobId: string): Promise<void> {
  const { userId } = await workerCtx();
  const supabase = await createClient();
  await supabase
    .from("job_material_lines")
    .delete()
    .eq("id", lineId)
    .eq("worker_user_id", userId);
  revalidatePath(`/log/${jobId}`);
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(worker)/log/actions.ts"
git commit -m "Add server actions for job material lines"
```

---

## Task 5: UI — `MaterialsControl` component + wire into the job page

**Files:**
- Create: `src/app/(worker)/log/MaterialsControl.tsx`
- Modify: `src/app/(worker)/log/[jobId]/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(worker)/log/MaterialsControl.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fieldInput, FormError } from "@/components/ui/Field";
import { addJobMaterial, updateJobMaterialQty, removeJobMaterial } from "./actions";

type Line = { id: string; item: string; qty: number; material_id: string | null };
type Material = { id: string; name: string };

export function MaterialsControl({
  jobId,
  lines,
  catalog,
}: {
  jobId: string;
  lines: Line[];
  catalog: Material[];
}) {
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const msg = await addJobMaterial(jobId, materialId, qty);
      if (typeof msg === "string") {
        setError(msg);
      } else {
        setMaterialId("");
        setQty("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className={fieldInput}
        >
          <option value="">Add a material…</option>
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={fieldInput}
          />
          <Button type="button" disabled={pending || !materialId || !qty} onClick={add}>
            Add
          </Button>
        </div>
        <FormError message={error} />
      </Card>

      <div className="flex flex-col">
        {lines.length === 0 ? (
          <p className="text-meta text-faint py-2">No materials logged yet.</p>
        ) : (
          lines.map((line) => <MaterialLineRow key={line.id} jobId={jobId} line={line} />)
        )}
      </div>
    </div>
  );
}

function MaterialLineRow({ jobId, line }: { jobId: string; line: Line }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(line.qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const msg = await updateJobMaterialQty(line.id, jobId, qty);
      if (typeof msg === "string") setError(msg);
      else setEditing(false);
    });
  }

  function remove() {
    start(async () => {
      await removeJobMaterial(line.id, jobId);
    });
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-2 border-b border-line-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2 text-meta">
        <span className="flex-1 min-w-0 truncate">{line.item}</span>
        {editing ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-20 rounded-control border border-line bg-surface px-2 py-1 text-body outline-none focus:border-accent"
            />
            <button type="button" disabled={pending} onClick={save} className="text-accent font-semibold">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setQty(String(line.qty));
                setError(null);
              }}
              className="text-faint"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-faint">{line.qty}</span>
            <button type="button" onClick={() => setEditing(true)} className="text-muted hover:text-text">
              Edit
            </button>
            <button type="button" disabled={pending} onClick={remove} className="text-faint hover:text-[#b42318]">
              Remove
            </button>
          </>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the job page**

In `src/app/(worker)/log/[jobId]/page.tsx`:

(a) Update imports. Change:
```tsx
import { getJobTimeForWorker } from "@/lib/data/worker";
```
to:
```tsx
import { getJobTimeForWorker, getJobMaterialsForWorker } from "@/lib/data/worker";
import { listMaterialsForPicker } from "@/lib/data/materials";
import { MaterialsControl } from "../MaterialsControl";
```

(b) After the existing `const data = await getJobTimeForWorker(jobId);` / `if (!data) notFound();` / `const { job, entry } = data;` lines, fetch the materials data. Add these two lines just before the `const segments = ...` line:
```tsx
  const materialLines = await getJobMaterialsForWorker(jobId);
  const catalog = await listMaterialsForPicker();
```

(c) Build the materials tab content. Just before the `const stub = ...` line, add:
```tsx
  const materialsTab = (
    <MaterialsControl jobId={jobId} lines={materialLines} catalog={catalog} />
  );
```

(d) In the `<Tabs tabs={[...]} />`, replace the Materials entry `{ label: "Materials", content: stub }` with `{ label: "Materials", content: materialsTab }`. Leave `{ label: "Time", content: timeTab }` and `{ label: "Photos", content: stub }` unchanged (Photos still uses `stub`, so keep the `stub` const).

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds; no unused-import/variable errors (`stub` is still used by Photos).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all pass (52 total — the prior 46 plus 6 `validateQty` cases).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(worker)/log/MaterialsControl.tsx" "src/app/(worker)/log/[jobId]/page.tsx"
git commit -m "Add materials-used logger to the job Materials tab"
```

---

## Manual verification (controller/operator, after cutover)

Cutover applies the migration: `supabase db push` then `vercel --prod`. Then, signed in as the seed `timebilling:worker` on a job's Materials tab:

1. Pick a catalog item + qty → **Add** → the line appears with **item name + qty only** (no price).
2. **Edit** a line's qty → **Save** → the new qty persists after reload.
3. **Remove** a line → it disappears.
4. Enter `0` or a blank qty → **Add**/**Save** shows the inline error "Enter a quantity greater than zero."; nothing is added/changed.
5. View page source / the network payload for the route → confirm **no `unit_cost` / price** value is present anywhere.
6. The Time tab and Photos tab are unchanged.

---

## Self-Review

**Spec coverage:**
- New `job_material_lines` table + per-worker RLS (worker_rw + admin_read) → Task 1. ✓
- Snapshot `item`/`unit_cost`/`currency`, keep `material_id` → Task 4 `addJobMaterial`. ✓
- Cost never sent to worker → Task 3 (`getJobMaterialsForWorker` omits cost; `listMaterialsForPicker` selects `id, name`); Task 4 actions never return cost. ✓
- Catalog-only (no ad-hoc) → picker uses catalog; no free-text path. ✓
- Add / edit-qty / remove → Task 4 three actions + Task 5 `MaterialsControl`/`MaterialLineRow`. ✓
- `validateQty` (positive; zero/neg/NaN/empty rejected), unit-tested → Task 2. ✓
- Not day-partitioned (no entry_date; ordered by created_at) → Task 1 schema + Task 3 read. ✓
- Inline errors via `FormError`, `string | void` actions → Tasks 4 + 5. ✓

**Type consistency:** `validateQty(input: string): number | null` is identical across Task 2 (def + tests) and Task 4 (call sites). `Line = { id, item, qty, material_id }` matches the `getJobMaterialsForWorker` select (`id, item, qty, material_id`). `Material = { id, name }` matches `listMaterialsForPicker` (`id, name`). Action signatures (`addJobMaterial(jobId, materialId, qtyInput)`, `updateJobMaterialQty(lineId, jobId, qtyInput)`, `removeJobMaterial(lineId, jobId)`) match their `MaterialsControl` call sites.

**Placeholder scan:** none — every code step shows complete code.

**Note on runtime qty type:** Postgres `numeric` may deserialize as a string via the client. The UI only renders `{line.qty}` and `String(line.qty)`, both safe for a string or number; the `Line.qty: number` annotation is for clarity and TS accepts the loosely-typed Supabase result. No coercion needed.
