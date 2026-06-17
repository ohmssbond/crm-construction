# T&B Materials Catalog (slice 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-org materials/items catalog with admin CRUD under `/tb/materials` (name, sku, type, unit price, description), QBO-ready, reusing the T&B RLS helpers.

**Architecture:** A migration adds `materials` + `member_read`/`admin_write` policies (reusing `is_tb_member`/`is_tb_admin` from the jobs migration). App code adds the generated type, a data layer, admin-gated server actions, and CRUD UI (list → edit, no detail) under `/tb/materials`, plus a nav item. Controller cutover applies it + deploys.

**Tech Stack:** Supabase (Postgres, RLS), Next.js 16 (App Router, RSC, Server Actions), TypeScript.

---

## File Structure

- **Create** `supabase/migrations/20260617000001_materials.sql` — table + RLS + unique index.
- **Modify** `src/lib/supabase/database.types.ts` — `materials` types.
- **Create** `src/lib/data/materials.ts` — `listMaterials`/`getMaterialDetail`.
- **Create** `src/app/(timebilling)/tb/materials/actions.ts` — `createMaterial`/`updateMaterial`/`archiveMaterial`.
- **Create** `src/app/(timebilling)/tb/materials/MaterialForm.tsx`, `page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`.
- **Modify** `src/components/shell/nav.ts` — add the Materials nav item.

**Sequencing:** additive throughout (build green); the app only *runs* against remote after the migration is applied in the cutover (Task 7). No new unit tests (no pure helper); verification is build + manual.

---

## Task 1: Author the materials migration

**Files:**
- Create: `supabase/migrations/20260617000001_materials.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260617000001_materials.sql`:

```sql
-- T&B materials/items catalog: per-org, admin-managed. Readable by any T&B member,
-- writable by T&B admins. Reuses is_tb_member/is_tb_admin (jobs migration).
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

- [ ] **Step 2: Sanity check (do NOT apply)**

Run: `grep -c "create table\|create unique index\|create policy" supabase/migrations/20260617000001_materials.sql`
Expected: `4` (1 table + 1 unique index + 2 policies). Do NOT run `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000001_materials.sql
git commit -m "$(cat <<'EOF'
Migration: materials catalog table + RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Materials types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Add the `materials` table type**

In `src/lib/supabase/database.types.ts`, inside the `Tables` object (TS key order
doesn't matter — e.g. just before `memberships`), add:

```ts
      materials: {
        Row: {
          archived_at: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          qbo_id: string | null
          qbo_sync_token: string | null
          sku: string | null
          source: string
          sync_status: string
          type: string
          unit_price: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          sku?: string | null
          source?: string
          sync_status?: string
          type?: string
          unit_price?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          sku?: string | null
          source?: string
          sync_status?: string
          type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
Add materials DB types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Materials data layer

**Files:**
- Create: `src/lib/data/materials.ts`

- [ ] **Step 1: Create `src/lib/data/materials.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

/** Org's non-archived materials (RLS-scoped), ordered by name. */
export async function listMaterials() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, name, type, unit_price, currency, sku")
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

/** A single non-archived material with its editable fields. */
export async function getMaterialDetail(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, name, description, sku, unit_price, type")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/materials.ts
git commit -m "$(cat <<'EOF'
Add materials data layer (list/detail)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Materials server actions

**Files:**
- Create: `src/app/(timebilling)/tb/materials/actions.ts`

- [ ] **Step 1: Create the actions**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";

export type MaterialFormState = { error: string | null };

const TYPES = ["service", "non_inventory", "inventory"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (s: string) => (s ? s : null);

function readMaterial(fd: FormData) {
  const priceRaw = str(fd, "unit_price");
  return {
    name: str(fd, "name"),
    description: orNull(str(fd, "description")),
    sku: orNull(str(fd, "sku")),
    type: str(fd, "type"),
    unit_price: priceRaw ? Number(priceRaw) : null,
  };
}

function validate(m: ReturnType<typeof readMaterial>): string | null {
  if (!m.name) return "Material name is required.";
  if (!TYPES.includes(m.type)) return "Pick a type.";
  if (m.unit_price !== null && Number.isNaN(m.unit_price)) return "Unit price must be a number.";
  return null;
}

export async function createMaterial(
  _prev: MaterialFormState,
  fd: FormData
): Promise<MaterialFormState> {
  await requireTbAdmin();
  const m = readMaterial(fd);
  const err = validate(m);
  if (err) return { error: err };

  const ctx = await getWorkspaceContext();
  if (!ctx) return { error: "No workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .insert({ organization_id: ctx.org.id, ...m });
  if (error?.code === "23505") return { error: "A material with that name already exists." };
  if (error) return { error: error.message };
  redirect("/tb/materials");
}

export async function updateMaterial(
  id: string,
  _prev: MaterialFormState,
  fd: FormData
): Promise<MaterialFormState> {
  await requireTbAdmin();
  const m = readMaterial(fd);
  const err = validate(m);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase.from("materials").update(m).eq("id", id);
  if (error?.code === "23505") return { error: "A material with that name already exists." };
  if (error) return { error: error.message };
  redirect("/tb/materials");
}

export async function archiveMaterial(id: string): Promise<void> {
  await requireTbAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  redirect("/tb/materials");
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(timebilling)/tb/materials/actions.ts"
git commit -m "$(cat <<'EOF'
Add materials server actions (create/update/archive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Materials UI (form, pages, nav)

**Files:**
- Create: `src/app/(timebilling)/tb/materials/MaterialForm.tsx`, `page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`
- Modify: `src/components/shell/nav.ts`

- [ ] **Step 1: `MaterialForm.tsx` (client)**

Create `src/app/(timebilling)/tb/materials/MaterialForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import type { MaterialFormState } from "./actions";

type Defaults = {
  name?: string;
  description?: string | null;
  sku?: string | null;
  unit_price?: number | null;
  type?: string;
};

const initial: MaterialFormState = { error: null };

export function MaterialForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: MaterialFormState, fd: FormData) => Promise<MaterialFormState>;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-[560px]">
      <Card className="p-4 flex flex-col gap-3">
        <Field label="Name" required>
          <input name="name" required defaultValue={defaults?.name ?? ""} className={fieldInput} />
        </Field>
        <div className="flex gap-3">
          <Field label="SKU">
            <input name="sku" defaultValue={defaults?.sku ?? ""} className={fieldInput} />
          </Field>
          <Field label="Type" required>
            <select name="type" defaultValue={defaults?.type ?? "non_inventory"} className={fieldInput}>
              <option value="service">Service</option>
              <option value="non_inventory">Non-inventory</option>
              <option value="inventory">Inventory</option>
            </select>
          </Field>
          <Field label="Unit price">
            <input name="unit_price" type="number" step="0.01" min="0" defaultValue={defaults?.unit_price ?? ""} className={fieldInput} />
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className={fieldInput} />
        </Field>
      </Card>
      <FormError message={state.error} />
      <div>
        <Button type="submit" disabled={pending} className="disabled:opacity-60">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: List page**

Create `src/app/(timebilling)/tb/materials/page.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { listMaterials } from "@/lib/data/materials";

const TYPE_LABEL: Record<string, string> = {
  service: "Service",
  non_inventory: "Non-inventory",
  inventory: "Inventory",
};

export default async function MaterialsPage() {
  const materials = await listMaterials();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold">Materials</h2>
        <Link href="/tb/materials/new" className={buttonClasses("primary", "sm")}>New material</Link>
      </div>
      {materials.length === 0 ? (
        <EmptyState glyph="📦" title="No materials yet." />
      ) : (
        <Card className="flex flex-col">
          {materials.map((m) => (
            <Link key={m.id} href={`/tb/materials/${m.id}/edit`} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0 hover:bg-line-2">
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold truncate">{m.name}</div>
                <div className="text-meta text-faint">{TYPE_LABEL[m.type] ?? m.type}{m.sku ? ` · ${m.sku}` : ""}</div>
              </div>
              <span className="text-meta text-faint">{m.unit_price != null ? `${m.currency} ${m.unit_price}` : "—"}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: New + edit pages**

Create `src/app/(timebilling)/tb/materials/new/page.tsx`:

```tsx
import { createMaterial } from "../actions";
import { MaterialForm } from "../MaterialForm";

export default function NewMaterialPage() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New material</h2>
      <MaterialForm action={createMaterial} submitLabel="Create material" />
    </div>
  );
}
```

Create `src/app/(timebilling)/tb/materials/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ArchiveButton } from "@/app/(artisan)/ArchiveButton";
import { getMaterialDetail } from "@/lib/data/materials";
import { updateMaterial, archiveMaterial } from "../../actions";
import { MaterialForm } from "../../MaterialForm";

export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await getMaterialDetail(id);
  if (!material) notFound();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">Edit {material.name}</h2>
        <ArchiveButton action={archiveMaterial.bind(null, id)} noun="material" />
      </div>
      <MaterialForm action={updateMaterial.bind(null, id)} defaults={material} submitLabel="Save changes" />
    </div>
  );
}
```

- [ ] **Step 4: Add the Materials nav item**

In `src/components/shell/nav.ts`, add `Package` to the lucide import (the existing
`import { ... } from "lucide-react";` block), then replace:

```ts
export const timebillingNav: NavItem[] = [
  { href: "/tb/jobs", label: "Jobs", icon: FolderKanban },
];
export const timebillingTabs = ["/tb/jobs"];
```

with:

```ts
export const timebillingNav: NavItem[] = [
  { href: "/tb/jobs", label: "Jobs", icon: FolderKanban },
  { href: "/tb/materials", label: "Materials", icon: Package },
];
export const timebillingTabs = ["/tb/jobs", "/tb/materials"];
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success; `/tb/materials`, `/tb/materials/new`, `/tb/materials/[id]/edit` in the route list.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(timebilling)/tb/materials" "src/components/shell/nav.ts"
git commit -m "$(cat <<'EOF'
Add T&B materials catalog UI (list/new/edit, nav)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verify gate (pre-cutover)

- [ ] **Step 1: Tests + build**

Run: `npm test` (existing suite green) and `npm run build` (succeeds, `/tb/materials` routes listed).

---

## Task 7: Cutover & verification _(controller/operator — NOT a subagent)_

- [ ] **Step 1: Apply the migration**

Run: `supabase db push` → applies `20260617000001_materials.sql`. Confirm via `supabase migration list`.

- [ ] **Step 2: Merge + deploy**

Merge to `main`, push, `vercel --prod`.

- [ ] **Step 3: Verify (as the seeded `timebilling:admin`, `doug+tbadmin@`)**

- `/tb` shows the Materials nav item; `/tb/materials` lists (empty at first).
- Create a material (name, type, unit price) → appears in the list; edit it; archive it
  (leaves the list); a second active material with the same name is rejected with the
  friendly error.
- CRM/portal/worker surfaces unaffected.

---

## Notes for the implementer

- Materials reuse the jobs migration's `is_tb_member`/`is_tb_admin` helpers — this
  migration only creates the table, index, and policies.
- `createMaterial` spreads the validated `m` (name/description/sku/type/unit_price)
  into the insert with `organization_id` from `getWorkspaceContext()`; `updateMaterial`
  spreads `m` into the update (org-scoped by RLS).
- Tasks 1–6 are subagent-safe. Task 7 (remote migration + deploy) is operator-run.
