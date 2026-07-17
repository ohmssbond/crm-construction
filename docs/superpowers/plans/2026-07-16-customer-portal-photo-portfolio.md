# Customer Portal Photo Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer portal into a photo-led experience — a card grid of projects and a hero/before-after/gallery project page — fed by a contractor-side photo-tagging surface on the existing artisan project page.

**Architecture:** One additive migration (per-photo `phase` on `attachments`; four nullable slot FKs on `projects`; `title` + `photo_attachment_id` on `status_updates`). A new pure-transform module `src/lib/data/portfolio.ts` (status mapping, phase grouping, slot resolution, validation) is unit-tested in isolation. The portal loaders in `src/lib/data/portal.ts` are extended to resolve slots to signed URLs, group gallery photos, and split shared attachments into images vs. files — always reading only `is_shared` rows (portal isolation unchanged). Contractor tagging adds three server actions that validate + auto-share. The portal UI is rebuilt into a card grid + photo-led detail page with two new shared primitives (`StatusBadge`, `BrandedPlaceholder`).

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + RLS + Storage `project-files` bucket), Tailwind v4 (token-based accent theming via `--accent`), Vitest.

## Global Constraints

- **Modified Next.js:** read the relevant guide in `node_modules/next/dist/docs/` before writing app code (per `AGENTS.md`). Heed deprecation notices.
- **Portal isolation invariant:** the portal reads **only `is_shared` attachments** and resolves a slot to its photo **only if that attachment is shared AND an image**; otherwise render `BrandedPlaceholder`. A private photo must never leak via tagging. Never remove an `.eq("is_shared", true)` filter from a portal loader.
- **Image detection:** there is no image-flag column. A photo is `kind === "file" && mime_type` starts with `"image/"`. Use the shared `isImageAttachment` helper — do not re-derive.
- **Stage values are fixed:** `projects.stage ∈ {proposal, signed, in_progress, completed}`. Do **not** alter the stage CHECK. Portal status mapping: proposal→Proposal, signed→Signed, in_progress→Active, completed→Completed. There is no "On Hold" (nothing maps to it).
- **Accent theming:** every design "teal" (`#0f7a86`) resolves to the tenant accent. Use Tailwind tokens `text-accent` / `bg-accent` / `bg-accent-soft` / `border-accent`, or `var(--accent)` in inline styles. Never hardcode teal.
- **DB column names:** the mime column is `mime_type` (not `mime`); the shared flag is `is_shared`; attachment `kind ∈ {file, link}`; `category` is a per-tenant FK to `file_categories`.
- **Migrations are authored-not-applied** until cutover. `npm test` + `npm run build` are green before any commit that closes a task.
- **Types:** the migration is authored-not-applied, so `supabase gen types --linked` (which reads the *remote* DB) would NOT yet include the new columns. During development, **hand-edit** `src/lib/supabase/database.types.ts` to add the new columns (Task 1). A canonical regen from `--linked` happens at cutover (Task 9) once the migration is live on remote.

---

## File Structure

**New files**
- `supabase/migrations/20260716000001_photo_portfolio.sql` — the one migration.
- `src/lib/data/portfolio.ts` — pure transforms + validation (no I/O).
- `src/lib/data/portfolio.test.ts` — unit tests for the above.
- `src/components/ui/StatusBadge.tsx` — portal status pill (stage→label+palette).
- `src/components/ui/BrandedPlaceholder.tsx` — accent-gradient + monogram fallback for empty photo slots.
- `src/components/portal/ProjectCard.tsx` — grid card (cover or placeholder + name + status + customer).
- `src/components/portal/ProjectHero.tsx` — 280px hero with overlaid name pill + status.
- `src/components/portal/BeforeAfterStrip.tsx` — two-panel before→after row.
- `src/components/portal/PhotoGallery.tsx` — phase-grouped thumbnail grid.
- `src/components/portal/FilesList.tsx` — shared non-image attachments as rows.
- `src/app/(artisan)/projects/[id]/PhaseControl.tsx` — per-tile Before/During/After/— picker.
- `src/app/(artisan)/projects/[id]/PortfolioSlots.tsx` — the four-slot "Customer portfolio" panel.

**Modified files**
- `src/lib/data/portal.ts` — extend `listPortalProjects` (cover) + `getPortalProject` (slots/gallery/files/update-photos).
- `src/app/(artisan)/projects/[id]/actions.ts` — add `setPhotoPhase`, `setProjectPhotoSlot`; extend `postUpdate` (title + photo).
- `src/components/ui/Composer.tsx` — optional title input + optional photo picker.
- `src/app/(artisan)/projects/[id]/page.tsx` — wire PhaseControl + PortfolioSlots + Composer photo picker.
- `src/app/(portal)/my-projects/page.tsx` — replace the list `Card` with the `ProjectCard` grid.
- `src/app/(portal)/my-projects/[id]/page.tsx` — rebuild as the photo-led page with 4 tabs.
- `src/lib/supabase/database.types.ts` — regenerated.

---

## Task 1: Migration + regenerated types

**Files:**
- Create: `supabase/migrations/20260716000001_photo_portfolio.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: nothing.
- Produces: new columns — `attachments.phase text|null`; `projects.cover_attachment_id|hero_attachment_id|before_attachment_id|after_attachment_id uuid|null`; `status_updates.title text|null`, `status_updates.photo_attachment_id uuid|null`. All later tasks read these.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716000001_photo_portfolio.sql`:

```sql
-- Customer Portal Photo Portfolio: per-photo phase, four headline slots, update photo+title.
-- Purely additive & nullable. No new RLS — new columns inherit each table's existing policies.

-- 1. Per-photo phase for the portal gallery grouping. Null = untagged/general.
alter table attachments
  add column phase text
    check (phase is null or phase in ('before', 'during', 'after'));

-- 2. Four headline slots on the project. on delete set null → a deleted photo
--    clears the slot (no dangling ref; slot falls back to the branded placeholder).
alter table projects
  add column cover_attachment_id  uuid references attachments (id) on delete set null,
  add column hero_attachment_id   uuid references attachments (id) on delete set null,
  add column before_attachment_id uuid references attachments (id) on delete set null,
  add column after_attachment_id  uuid references attachments (id) on delete set null;

-- 3. Optional title + lead photo on a status update.
alter table status_updates
  add column title text,
  add column photo_attachment_id uuid references attachments (id) on delete set null;
```

- [ ] **Step 2: Verify the migration parses locally (no remote push)**

Run: `npx supabase db lint --schema public 2>/dev/null || echo "lint unavailable — proceed"`
Expected: no syntax errors reported for the new file (or the fallback echo). Do **not** run `supabase db push` — cutover happens in Task 9.

- [ ] **Step 3: Hand-edit the database types (do NOT run `--linked` — see Global Constraints)**

The migration is authored-not-applied, so a `--linked` regen reads the remote DB and would omit these columns. Hand-edit `src/lib/supabase/database.types.ts`, adding the new columns to the `Row`, `Insert`, and `Update` blocks of three tables (field order within a block does not affect validity; keep it alphabetical for cleanliness). A canonical regen happens in Task 9 after cutover.

**`attachments`** — add to Row: `phase: string | null`; to Insert and Update: `phase?: string | null`.

**`projects`** — add to Row (all four):
```ts
          after_attachment_id: string | null
          before_attachment_id: string | null
          cover_attachment_id: string | null
          hero_attachment_id: string | null
```
and to Insert and Update the same four as optional-nullable, e.g. `cover_attachment_id?: string | null` (repeat for all four).

**`status_updates`** — add to Row: `photo_attachment_id: string | null` and `title: string | null`; to Insert and Update: the same two as optional-nullable (`photo_attachment_id?: string | null`, `title?: string | null`).

(Relationships arrays need no edit — string-select typing does not depend on them; the Task 9 canonical regen fills them in.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: build succeeds (additive columns break nothing).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716000001_photo_portfolio.sql src/lib/supabase/database.types.ts
git commit -m "feat(portfolio): migration for photo phase, project slots, update photo+title"
```

---

## Task 2: Pure transforms + validation module

**Files:**
- Create: `src/lib/data/portfolio.ts`
- Test: `src/lib/data/portfolio.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces (all imported by loaders / actions / UI in later tasks):
  - `type PortfolioStatus = { label: string; tone: "proposal" | "signed" | "active" | "completed" }`
  - `stageToStatus(stage: string): PortfolioStatus`
  - `isImageAttachment(a: { kind: string; mime_type: string | null }): boolean`
  - `type Resolved = { href: string }`
  - `resolveSlot(attachmentId: string | null, sharedImagesById: Map<string, { href: string | null }>): Resolved | null`
  - `beforeAfterVisible(before: Resolved | null, after: Resolved | null): boolean`
  - `type GalleryItem = { id: string; href: string | null; phase: string | null }`
  - `type GalleryGroup = { key: "before" | "during" | "after" | "general"; label: string; items: GalleryItem[] }`
  - `groupPhotosByPhase<T extends GalleryItem>(images: T[]): { key: GalleryGroup["key"]; label: string; items: T[] }[]`
  - `validatePhotoAssignment(attachment: { project_id: string; kind: string; mime_type: string | null } | null, projectId: string): string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/portfolio.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
  validatePhotoAssignment,
} from "./portfolio";

describe("stageToStatus", () => {
  test("maps the four real stages", () => {
    expect(stageToStatus("proposal")).toEqual({ label: "Proposal", tone: "proposal" });
    expect(stageToStatus("signed")).toEqual({ label: "Signed", tone: "signed" });
    expect(stageToStatus("in_progress")).toEqual({ label: "Active", tone: "active" });
    expect(stageToStatus("completed")).toEqual({ label: "Completed", tone: "completed" });
  });
  test("falls back to Proposal for an unknown stage", () => {
    expect(stageToStatus("whatever")).toEqual({ label: "Proposal", tone: "proposal" });
  });
});

describe("isImageAttachment", () => {
  test("true only for file kind with an image/* mime", () => {
    expect(isImageAttachment({ kind: "file", mime_type: "image/jpeg" })).toBe(true);
    expect(isImageAttachment({ kind: "file", mime_type: "application/pdf" })).toBe(false);
    expect(isImageAttachment({ kind: "file", mime_type: null })).toBe(false);
    expect(isImageAttachment({ kind: "link", mime_type: "image/png" })).toBe(false);
  });
});

describe("resolveSlot", () => {
  const map = new Map([
    ["a", { href: "https://signed/a" }],
    ["b", { href: null }],
  ]);
  test("resolves a shared image with an href", () => {
    expect(resolveSlot("a", map)).toEqual({ href: "https://signed/a" });
  });
  test("returns null for missing id, null href, or null slot", () => {
    expect(resolveSlot(null, map)).toBeNull();
    expect(resolveSlot("missing", map)).toBeNull();
    expect(resolveSlot("b", map)).toBeNull();
  });
});

describe("beforeAfterVisible", () => {
  test("true only when both resolve", () => {
    expect(beforeAfterVisible({ href: "x" }, { href: "y" })).toBe(true);
    expect(beforeAfterVisible({ href: "x" }, null)).toBe(false);
    expect(beforeAfterVisible(null, null)).toBe(false);
  });
});

describe("groupPhotosByPhase", () => {
  test("buckets into before/during/after/general in fixed order, omitting empty groups", () => {
    const groups = groupPhotosByPhase([
      { id: "1", href: "h1", phase: "after" },
      { id: "2", href: "h2", phase: "before" },
      { id: "3", href: "h3", phase: null },
      { id: "4", href: "h4", phase: "before" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["before", "after", "general"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["2", "4"]);
    expect(groups.find((g) => g.key === "general")!.label).toBe("Photos");
  });
  test("empty input → empty array", () => {
    expect(groupPhotosByPhase([])).toEqual([]);
  });
});

describe("validatePhotoAssignment", () => {
  const img = { project_id: "p1", kind: "file", mime_type: "image/png" };
  test("passes for a same-project image", () => {
    expect(validatePhotoAssignment(img, "p1")).toBeNull();
  });
  test("rejects missing, cross-project, and non-image", () => {
    expect(validatePhotoAssignment(null, "p1")).toBe("Photo not found.");
    expect(validatePhotoAssignment({ ...img, project_id: "other" }, "p1")).toBe(
      "Photo belongs to another project."
    );
    expect(validatePhotoAssignment({ ...img, mime_type: "application/pdf" }, "p1")).toBe(
      "Only photos can be tagged."
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/portfolio.test.ts`
Expected: FAIL — `Cannot find module './portfolio'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/portfolio.ts`:

```ts
// Pure transforms + validation for the customer-portal photo portfolio.
// No I/O — loaders and server actions do the DB work and pass rows in.

export type PortfolioStatus = {
  label: string;
  tone: "proposal" | "signed" | "active" | "completed";
};

/** Map a project stage to the portal status pill's label + palette tone. */
export function stageToStatus(stage: string): PortfolioStatus {
  switch (stage) {
    case "signed":
      return { label: "Signed", tone: "signed" };
    case "in_progress":
      return { label: "Active", tone: "active" };
    case "completed":
      return { label: "Completed", tone: "completed" };
    case "proposal":
    default:
      return { label: "Proposal", tone: "proposal" };
  }
}

/** A photo is a stored file whose mime type is an image. */
export function isImageAttachment(a: { kind: string; mime_type: string | null }): boolean {
  return a.kind === "file" && !!a.mime_type && a.mime_type.startsWith("image/");
}

export type Resolved = { href: string };

/**
 * Resolve a headline slot to its photo — only if the referenced attachment is
 * present in the shared-image map AND has a usable href; otherwise null (the
 * caller renders a BrandedPlaceholder). Enforces the portal isolation invariant.
 */
export function resolveSlot(
  attachmentId: string | null,
  sharedImagesById: Map<string, { href: string | null }>
): Resolved | null {
  if (!attachmentId) return null;
  const a = sharedImagesById.get(attachmentId);
  if (!a || !a.href) return null;
  return { href: a.href };
}

/** The before→after strip shows only when both slots resolve to shared images. */
export function beforeAfterVisible(before: Resolved | null, after: Resolved | null): boolean {
  return before !== null && after !== null;
}

export type GalleryItem = { id: string; href: string | null; phase: string | null };

const GROUP_ORDER = [
  { key: "before", label: "Before" },
  { key: "during", label: "During" },
  { key: "after", label: "After" },
  { key: "general", label: "Photos" },
] as const;

/**
 * Bucket shared images into Before / During / After, plus a trailing "Photos"
 * group for shared-but-untagged images (phase null) so nothing shared silently
 * disappears. Groups render in fixed order; empty groups are omitted; item order
 * within a group is preserved from the input (callers pass newest-first).
 */
export function groupPhotosByPhase<T extends GalleryItem>(
  images: T[]
): { key: (typeof GROUP_ORDER)[number]["key"]; label: string; items: T[] }[] {
  const byKey = new Map<string, T[]>();
  for (const img of images) {
    const key = img.phase === "before" || img.phase === "during" || img.phase === "after"
      ? img.phase
      : "general";
    const bucket = byKey.get(key) ?? [];
    bucket.push(img);
    byKey.set(key, bucket);
  }
  return GROUP_ORDER.filter((g) => byKey.has(g.key)).map((g) => ({
    key: g.key,
    label: g.label,
    items: byKey.get(g.key) as T[],
  }));
}

/**
 * Validate a phase/slot/update-photo assignment (run inside each server action
 * under the artisan write RLS). Clearing (null id) is handled by the caller and
 * never reaches here. Returns an error string, or null when valid.
 */
export function validatePhotoAssignment(
  attachment: { project_id: string; kind: string; mime_type: string | null } | null,
  projectId: string
): string | null {
  if (!attachment) return "Photo not found.";
  if (attachment.project_id !== projectId) return "Photo belongs to another project.";
  if (!isImageAttachment(attachment)) return "Only photos can be tagged.";
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/portfolio.test.ts`
Expected: PASS (all groups green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/portfolio.ts src/lib/data/portfolio.test.ts
git commit -m "feat(portfolio): pure transforms — status, phase grouping, slot resolution, validation"
```

---

## Task 3: Extend portal loaders

**Files:**
- Modify: `src/lib/data/portal.ts`

**Interfaces:**
- Consumes: `stageToStatus`, `isImageAttachment`, `resolveSlot`, `beforeAfterVisible`, `groupPhotosByPhase` from `./portfolio`; `withAttachmentUrls` from `./attachments`.
- Produces:
  - `listPortalProjects()` items gain `coverHref: string | null`.
  - `getPortalProject(id)` return gains: `status: PortfolioStatus`, `cover/hero/before/after: Resolved | null`, `beforeAfter: boolean`, `gallery: {key,label,items}[]` (items have `id, href, phase`), `files` (non-image shared attachments, same shape the current Photos&Files tab uses), and each `updates[]` row gains `title: string | null` and `photoHref: string | null`. **Keep** the existing `attachments` and `fileCategories` fields in the return so the current portal page keeps compiling until Task 8.

- [ ] **Step 1: Extend `listPortalProjects` to resolve a cover photo**

Replace the body of `listPortalProjects` in `src/lib/data/portal.ts` (currently lines ~56-71):

```ts
/** Projects visible to the contact (RLS: attached, non-archived), newest first. */
export async function listPortalProjects() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, stage, start_date, end_date, cover_attachment_id, customer:customers(name)"
    )
    .order("created_at", { ascending: false });

  const projects = data ?? [];

  // Resolve cover photos in one batch: fetch the referenced attachments (RLS
  // returns only shared ones), keep images, sign their URLs.
  const coverIds = projects.map((p) => p.cover_attachment_id).filter(Boolean) as string[];
  const coverById = new Map<string, { href: string | null }>();
  if (coverIds.length) {
    const { data: covers } = await supabase
      .from("attachments")
      .select("id, kind, mime_type, url, storage_path")
      .in("id", coverIds)
      .eq("is_shared", true);
    const images = (covers ?? []).filter(isImageAttachment);
    const signed = await withAttachmentUrls(supabase, images);
    signed.forEach((a) => coverById.set(a.id, { href: a.href }));
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
    coverHref: resolveSlot(p.cover_attachment_id, coverById)?.href ?? null,
  }));
}
```

- [ ] **Step 2: Add the imports**

At the top of `src/lib/data/portal.ts`, extend the existing `./attachments` import is unchanged; add a new import line after it:

```ts
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
} from "./portfolio";
```

- [ ] **Step 3: Extend `getPortalProject` — selects**

In `getPortalProject`, update the project select to include the four slot IDs and the updates/attachments selects to include the new columns. Replace the project query and the `status_updates` + `attachments` entries inside `Promise.all`:

Project query:
```ts
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, stage, organization_id, cover_attachment_id, hero_attachment_id, before_attachment_id, after_attachment_id, customer:customers(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) return null;
```

`status_updates` select (add `title, photo_attachment_id`):
```ts
    supabase
      .from("status_updates")
      .select("id, title, body, created_at, is_shared, photo_attachment_id")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
```

`attachments` select (add `mime_type, phase`):
```ts
    supabase
      .from("attachments")
      .select(
        "id, filename, category, kind, url, is_shared, storage_path, mime_type, phase, created_at"
      )
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
```

- [ ] **Step 4: Extend `getPortalProject` — resolution + return**

Replace the `return { ... }` block at the end of `getPortalProject` with:

```ts
  // Sign all shared attachments once, then split into images (gallery/slots) vs files.
  const signed = await withAttachmentUrls(supabase, attachments.data ?? []);
  const images = signed.filter(isImageAttachment);
  const files = signed.filter((a) => !isImageAttachment(a));
  const sharedImagesById = new Map(images.map((a) => [a.id, { href: a.href }]));

  const cover = resolveSlot(project.cover_attachment_id, sharedImagesById);
  const hero = resolveSlot(project.hero_attachment_id, sharedImagesById);
  const before = resolveSlot(project.before_attachment_id, sharedImagesById);
  const after = resolveSlot(project.after_attachment_id, sharedImagesById);

  const gallery = groupPhotosByPhase(
    images.map((a) => ({ id: a.id, href: a.href, phase: a.phase }))
  );

  const shapedUpdates = (updates.data ?? []).map((u) => ({
    ...u,
    photoHref: u.photo_attachment_id
      ? (sharedImagesById.get(u.photo_attachment_id)?.href ?? null)
      : null,
  }));

  return {
    project: { ...project, customer: one(project.customer) },
    status: stageToStatus(project.stage),
    cover,
    hero,
    before,
    after,
    beforeAfter: beforeAfterVisible(before, after),
    gallery,
    files,
    updates: shapedUpdates,
    // Kept for the pre-redesign portal page (Task 8 removes these consumers):
    attachments: signed,
    fileCategories: fileCategories.data ?? [],
    tasks: tasks.data ?? [],
    timezone: org.data?.timezone ?? DEFAULT_TIMEZONE,
  };
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run build`
Expected: build succeeds. The existing portal detail page still destructures `attachments`, `fileCategories`, `tasks`, `timezone` — all still present.

- [ ] **Step 6: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS (loaders have no unit tests; the pure transforms they call are covered by Task 2).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/portal.ts
git commit -m "feat(portfolio): portal loaders resolve cover/slots, gallery, files, update photos"
```

---

## Task 4: Contractor server actions

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts`

**Interfaces:**
- Consumes: `validatePhotoAssignment` from `@/lib/data/portfolio`; `getOrgContext`, `createClient` (already imported).
- Produces (bound in the artisan page, called by Task 5 components):
  - `setPhotoPhase(projectId: string, attachmentId: string, phase: "before" | "during" | "after" | null): Promise<{ error: string | null }>`
  - `setProjectPhotoSlot(projectId: string, slot: "cover" | "hero" | "before" | "after", attachmentId: string | null): Promise<{ error: string | null }>`
  - `postUpdate(projectId: string, title: string, body: string, isShared: boolean, photoAttachmentId: string | null): Promise<void>` (extended signature)

- [ ] **Step 1: Add the import**

At the top of `src/app/(artisan)/projects/[id]/actions.ts`, after the existing imports:

```ts
import { validatePhotoAssignment } from "@/lib/data/portfolio";
```

- [ ] **Step 2: Add `setPhotoPhase`**

Append to `actions.ts`:

```ts
/**
 * Tag (or clear) a photo's phase. Tagging a phase auto-shares the photo
 * (is_shared = true) so the portal gallery can show it; clearing leaves sharing
 * as-is (the contractor can still pull it back via the share toggle). Validates
 * that the attachment is a same-project image before writing.
 */
export async function setPhotoPhase(
  projectId: string,
  attachmentId: string,
  phase: "before" | "during" | "after" | null
): Promise<RecordResult> {
  const supabase = await createClient();

  if (phase !== null) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", attachmentId)
      .maybeSingle();
    const err = validatePhotoAssignment(a, projectId);
    if (err) return { error: err };
    const { error } = await supabase
      .from("attachments")
      .update({ phase, is_shared: true })
      .eq("id", attachmentId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("attachments")
      .update({ phase: null })
      .eq("id", attachmentId);
    if (error) return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}
```

- [ ] **Step 3: Add `setProjectPhotoSlot`**

Append to `actions.ts`:

```ts
const SLOT_COLUMN = {
  cover: "cover_attachment_id",
  hero: "hero_attachment_id",
  before: "before_attachment_id",
  after: "after_attachment_id",
} as const;

/**
 * Point one of the four headline slots at a photo (or clear it). Assigning a
 * photo validates it (same-project image) and auto-shares it; clearing sets the
 * slot column to null. RLS confines both writes to the signed-in org.
 */
export async function setProjectPhotoSlot(
  projectId: string,
  slot: "cover" | "hero" | "before" | "after",
  attachmentId: string | null
): Promise<RecordResult> {
  const supabase = await createClient();
  const column = SLOT_COLUMN[slot];

  if (attachmentId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", attachmentId)
      .maybeSingle();
    const err = validatePhotoAssignment(a, projectId);
    if (err) return { error: err };
    const { error: shareErr } = await supabase
      .from("attachments")
      .update({ is_shared: true })
      .eq("id", attachmentId);
    if (shareErr) return { error: shareErr.message };
  }

  const { error } = await supabase
    .from("projects")
    .update({ [column]: attachmentId })
    .eq("id", projectId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}
```

- [ ] **Step 4: Extend `postUpdate` (title + photo)**

Replace the existing `postUpdate` in `actions.ts` with:

```ts
/** Post a status update (optional title + lead photo; optionally shared). */
export async function postUpdate(
  projectId: string,
  title: string,
  body: string,
  isShared: boolean,
  photoAttachmentId: string | null
) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // A photo on an update auto-shares it (mirrors slot/phase tagging).
  if (photoAttachmentId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", photoAttachmentId)
      .maybeSingle();
    if (validatePhotoAssignment(a, projectId)) return; // silently drop a bad photo ref
    await supabase.from("attachments").update({ is_shared: true }).eq("id", photoAttachmentId);
  }

  await supabase.from("status_updates").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    title: title.trim() || null,
    body: text,
    is_shared: isShared,
    photo_attachment_id: photoAttachmentId,
  });
  revalidatePath(`/projects/${projectId}`);
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — the artisan page still calls `postUpdate.bind(null, project.id)` and passes it to `Composer`'s old `(body, shared)` action shape. This is expected; Task 5 updates the call site. If any OTHER error appears, fix it now.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(artisan\)/projects/\[id\]/actions.ts
git commit -m "feat(portfolio): server actions setPhotoPhase, setProjectPhotoSlot; postUpdate title+photo"
```

---

## Task 5: Contractor tagging UI

**Files:**
- Create: `src/app/(artisan)/projects/[id]/PhaseControl.tsx`
- Create: `src/app/(artisan)/projects/[id]/PortfolioSlots.tsx`
- Modify: `src/components/ui/Composer.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `setPhotoPhase`, `setProjectPhotoSlot`, `postUpdate` (Task 4); `getProjectDetail` attachments (each has `id, filename, category, kind, mime_type, phase, href, is_shared`). **Note:** confirm `getProjectDetail` in `src/lib/data/projects.ts` selects `mime_type` and `phase` on attachments; if it does not, add them to that select (same pattern as Task 3, Step 3) as the first step here.
- Produces: a `PhotoPick[]` shape reused by Composer + PortfolioSlots — `type PhotoPick = { id: string; filename: string | null; href: string | null }`.

- [ ] **Step 1: Ensure the artisan loader returns `mime_type` + `phase` on attachments**

Open `src/lib/data/projects.ts`, find the `attachments` select inside `getProjectDetail` and confirm it includes `mime_type` and `phase`. If missing, add them. Also confirm each attachment carries `id` and `href` (via `withAttachmentUrls`). Run `npx tsc --noEmit` after any edit here and confirm no new errors in `projects.ts`.

- [ ] **Step 2: Create `PhaseControl`**

Create `src/app/(artisan)/projects/[id]/PhaseControl.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

type Phase = "before" | "during" | "after" | null;
const OPTIONS: { value: Phase; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
  { value: null, label: "—" },
];

/** Per-photo Before/During/After/— picker on an artisan image tile. */
export function PhaseControl({
  current,
  action,
}: {
  current: Phase;
  action: (phase: Phase) => Promise<{ error: string | null }>;
}) {
  const [phase, setPhase] = useState<Phase>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (value: Phase) => {
    if (pending) return;
    const prev = phase;
    setPhase(value);
    setError(null);
    start(async () => {
      const res = await action(value);
      if (res.error) {
        setPhase(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            disabled={pending}
            onClick={() => choose(o.value)}
            className={`text-chip rounded-full px-2 py-[2px] border ${
              phase === o.value
                ? "bg-accent-soft text-accent border-accent"
                : "border-line text-muted"
            } disabled:opacity-60`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <span className="text-chip text-[#b42318]">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Create `PortfolioSlots`**

Create `src/app/(artisan)/projects/[id]/PortfolioSlots.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

type Slot = "cover" | "hero" | "before" | "after";
export type PhotoPick = { id: string; filename: string | null; href: string | null };

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "cover", label: "Cover" },
  { slot: "hero", label: "Hero (current)" },
  { slot: "before", label: "Before" },
  { slot: "after", label: "After" },
];

/**
 * The "Customer portfolio" panel: four named headline slots the customer's
 * portal leads with. Each shows its current photo (or empty) and a picker to
 * choose from the project's photos or clear it.
 */
export function PortfolioSlots({
  photos,
  values,
  action,
}: {
  photos: PhotoPick[];
  values: Record<Slot, string | null>;
  action: (slot: Slot, attachmentId: string | null) => Promise<{ error: string | null }>;
}) {
  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-body font-semibold">Customer portfolio</h4>
        <p className="text-meta text-faint">
          Choose the four photos that headline this project in the customer&apos;s portal.
          Picking a photo shares it automatically.
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SLOTS.map(({ slot, label }) => (
          <SlotPicker
            key={slot}
            label={label}
            photos={photos}
            value={values[slot]}
            action={(id) => action(slot, id)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotPicker({
  label,
  photos,
  value,
  action,
}: {
  label: string;
  photos: PhotoPick[];
  value: string | null;
  action: (attachmentId: string | null) => Promise<{ error: string | null }>;
}) {
  const [selected, setSelected] = useState<string | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = photos.find((p) => p.id === selected);

  const choose = (id: string | null) => {
    if (pending) return;
    const prev = selected;
    setSelected(id);
    setError(null);
    start(async () => {
      const res = await action(id);
      if (res.error) {
        setSelected(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        {label}
      </span>
      <div className="aspect-[4/3] rounded-[8px] border border-line overflow-hidden bg-line-2 grid place-items-center">
        {current?.href ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.href} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-meta text-faint">Empty</span>
        )}
      </div>
      <select
        value={selected ?? ""}
        disabled={pending}
        onChange={(e) => choose(e.target.value || null)}
        className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent disabled:opacity-60"
      >
        <option value="">— none —</option>
        {photos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.filename ?? "Photo"}
          </option>
        ))}
      </select>
      {error && <span className="text-chip text-[#b42318]">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Extend `Composer` with an optional title + photo picker**

Replace `src/components/ui/Composer.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { Button } from "./Button";

export type ComposerPhoto = { id: string; filename: string | null };

export function Composer({
  placeholder = "Post an update…",
  photos,
  action,
}: {
  placeholder?: string;
  photos?: ComposerPhoto[];
  action?: (
    title: string,
    body: string,
    shared: boolean,
    photoAttachmentId: string | null
  ) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text || !action || pending) return;
    start(async () => {
      await action(title, text, shared, photoId);
      setTitle("");
      setBody("");
      setShared(false);
      setPhotoId(null);
    });
  };

  return (
    <div className="bg-surface border border-line rounded-card p-[14px] shadow-card">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-transparent text-[13px] font-semibold py-[6px] outline-none placeholder:text-faint"
      />
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] py-[9px] outline-none placeholder:text-faint"
      />
      <div className="flex flex-wrap items-center gap-[10px] mt-[10px] border-t border-line-2 pt-[11px]">
        <ShareToggle shared={shared} action={setShared} />
        {photos && photos.length > 0 && (
          <select
            value={photoId ?? ""}
            onChange={(e) => setPhotoId(e.target.value || null)}
            className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent"
          >
            <option value="">Add photo…</option>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.filename ?? "Photo"}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="ml-auto disabled:opacity-60 disabled:cursor-default"
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the artisan page**

In `src/app/(artisan)/projects/[id]/page.tsx`:

1. Add imports:
```tsx
import { PhaseControl } from "./PhaseControl";
import { PortfolioSlots } from "./PortfolioSlots";
```
2. Add `setPhotoPhase, setProjectPhotoSlot` to the existing `./actions` import.
3. After destructuring `detail`, derive the image list and slot values (place near the other `const` derivations around line 64):
```tsx
  const imagePhotos = attachments
    .filter((a) => a.kind === "file" && a.mime_type?.startsWith("image/"))
    .map((a) => ({ id: a.id, filename: a.filename, href: a.href }));
  const slotValues = {
    cover: project.cover_attachment_id ?? null,
    hero: project.hero_attachment_id ?? null,
    before: project.before_attachment_id ?? null,
    after: project.after_attachment_id ?? null,
  };
```
   (If `getProjectDetail` does not already return the four slot IDs on `project`, add them to its project select in `projects.ts` — same as Task 3 Step 3.)
4. In the **Photos & Files** tab content, render the `PortfolioSlots` panel above the file grid and a `PhaseControl` under each image tile. Replace the tab's grid block so each image tile is wrapped with its phase picker:
```tsx
                  <PortfolioSlots
                    photos={imagePhotos}
                    values={slotValues}
                    action={setProjectPhotoSlot.bind(null, project.id)}
                  />
                  {/* ...existing UploadForm + LinkForm stay above the grid... */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {group.items.map((a) => {
                      const isImg = a.kind === "file" && a.mime_type?.startsWith("image/");
                      const style =
                        a.kind === "link"
                          ? { glyph: "🔗", bg: "#6a7c8a" }
                          : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                      return (
                        <div key={a.id} className="flex flex-col gap-1">
                          <FileTile
                            name={a.filename ?? a.url ?? "Link"}
                            glyph={style.glyph}
                            bg={style.bg}
                            shared={a.is_shared}
                            href={a.href}
                            shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                          />
                          {isImg && (
                            <PhaseControl
                              current={(a.phase as "before" | "during" | "after" | null) ?? null}
                              action={setPhotoPhase.bind(null, project.id, a.id)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
```
5. Update the Updates-tab `Composer` call to pass `photos` and the new action shape:
```tsx
                <Composer
                  action={postUpdate.bind(null, project.id)}
                  photos={imagePhotos.map((p) => ({ id: p.id, filename: p.filename }))}
                />
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: build succeeds. `postUpdate` now matches Composer's `(title, body, shared, photoId)` action shape.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/app/\(artisan\)/projects/\[id\]/PhaseControl.tsx src/app/\(artisan\)/projects/\[id\]/PortfolioSlots.tsx src/components/ui/Composer.tsx src/app/\(artisan\)/projects/\[id\]/page.tsx src/lib/data/projects.ts
git commit -m "feat(portfolio): contractor tagging UI — phase picker, slots panel, update photo+title"
```

---

## Task 6: Portal shared primitives (StatusBadge + BrandedPlaceholder)

**Files:**
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/BrandedPlaceholder.tsx`

**Interfaces:**
- Consumes: `PortfolioStatus` from `@/lib/data/portfolio`; `monogram` from `@/lib/data/format`.
- Produces:
  - `StatusBadge({ status }: { status: PortfolioStatus })`
  - `BrandedPlaceholder({ name, className }: { name: string; className?: string })`

- [ ] **Step 1: Create `StatusBadge`**

Create `src/components/ui/StatusBadge.tsx`:

```tsx
import type { PortfolioStatus } from "@/lib/data/portfolio";

const chipBase =
  "inline-flex items-center rounded-full text-chip font-semibold px-[10px] py-[4px] whitespace-nowrap";

// Active uses the tenant accent tint; the rest reuse the app's stage palettes.
const TONE: Record<PortfolioStatus["tone"], string> = {
  proposal: "bg-proposal-soft text-proposal",
  signed: "bg-signed-soft text-signed",
  active: "bg-accent-soft text-accent",
  completed: "bg-completed-soft text-completed",
};

/** Portal status pill. Map a stage with `stageToStatus` first, pass the result here. */
export function StatusBadge({ status }: { status: PortfolioStatus }) {
  return <span className={`${chipBase} ${TONE[status.tone]}`}>{status.label}</span>;
}
```

- [ ] **Step 2: Create `BrandedPlaceholder`**

Create `src/components/ui/BrandedPlaceholder.tsx`:

```tsx
import { monogram } from "@/lib/data/format";

/**
 * Accent-gradient fallback (with the project monogram) for any empty photo slot
 * — cover, hero, or thumbnail. Fills its parent; the parent controls size.
 */
export function BrandedPlaceholder({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      className={`w-full h-full grid place-items-center ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))",
      }}
    >
      <span className="text-white/90 font-bold text-[clamp(18px,6vw,40px)] tracking-wide">
        {monogram(name)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: build succeeds (components unused so far — they compile cleanly).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/StatusBadge.tsx src/components/ui/BrandedPlaceholder.tsx
git commit -m "feat(portfolio): StatusBadge + BrandedPlaceholder portal primitives"
```

---

## Task 7: My Projects → card grid

**Files:**
- Create: `src/components/portal/ProjectCard.tsx`
- Modify: `src/app/(portal)/my-projects/page.tsx`

**Interfaces:**
- Consumes: `listPortalProjects()` items (now with `coverHref`); `stageToStatus` from `@/lib/data/portfolio`; `StatusBadge`, `BrandedPlaceholder`.
- Produces: `ProjectCard({ id, name, customerName, stage, coverHref }: { id: string; name: string; customerName: string; stage: string; coverHref: string | null })`.

- [ ] **Step 1: Create `ProjectCard`**

Create `src/components/portal/ProjectCard.tsx`:

```tsx
import Link from "next/link";
import { stageToStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/** A single project tile in the customer's My Projects grid. */
export function ProjectCard({
  id,
  name,
  customerName,
  stage,
  coverHref,
}: {
  id: string;
  name: string;
  customerName: string;
  stage: string;
  coverHref: string | null;
}) {
  return (
    <Link
      href={`/my-projects/${id}`}
      className="block bg-surface border border-line rounded-card overflow-hidden shadow-card hover:shadow-md transition-shadow"
    >
      <div className="h-[150px] w-full">
        {coverHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverHref} alt="" className="w-full h-full object-cover" />
        ) : (
          <BrandedPlaceholder name={name} />
        )}
      </div>
      <div className="p-4 flex flex-col gap-[6px]">
        <div className="flex items-start justify-between gap-2">
          <span className="text-body font-bold">{name}</span>
          <StatusBadge status={stageToStatus(stage)} />
        </div>
        <span className="text-meta text-faint">{customerName}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Rebuild the My Projects page**

Replace `src/app/(portal)/my-projects/page.tsx` with:

```tsx
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectCard } from "@/components/portal/ProjectCard";
import { getPortalContext, listPortalProjects } from "@/lib/data/portal";

export default async function MyProjectsPage() {
  const [ctx, projects] = await Promise.all([getPortalContext(), listPortalProjects()]);
  const orgName = ctx?.orgName ?? "your contractor";

  return (
    <div className="flex flex-col gap-4">
      <Banner>Welcome — here are the projects shared with you by {orgName}.</Banner>
      {projects.length === 0 ? (
        <EmptyState glyph="📂" title="No projects shared with you yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              name={p.name}
              customerName={p.customerName}
              stage={p.stage}
              coverHref={p.coverHref}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: build succeeds. The old `Card`/`ListRow`/`Thumb`/`StageChip`/`projectMeta` imports are gone from this page.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/ProjectCard.tsx src/app/\(portal\)/my-projects/page.tsx
git commit -m "feat(portfolio): My Projects card grid with cover photos"
```

---

## Task 8: Project detail → photo-led page

**Files:**
- Create: `src/components/portal/ProjectHero.tsx`
- Create: `src/components/portal/BeforeAfterStrip.tsx`
- Create: `src/components/portal/PhotoGallery.tsx`
- Create: `src/components/portal/FilesList.tsx`
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `getPortalProject(id)` (now returns `status, cover, hero, before, after, beforeAfter, gallery, files, updates` with `title`/`photoHref`, plus `tasks, timezone`); `StatusBadge`, `BrandedPlaceholder`; `Tabs`, `UpdateCard`, `FileTile`, `Card`, `EmptyState`; `fmtDate`, `fmtDateTime`, `fmtZonedDate`.
- Produces:
  - `ProjectHero({ name, status, hero }: { name: string; status: PortfolioStatus; hero: { href: string } | null })`
  - `BeforeAfterStrip({ before, after }: { before: { href: string }; after: { href: string } })` (parent decides visibility)
  - `PhotoGallery({ groups }: { groups: { key: string; label: string; items: { id: string; href: string | null }[] }[] })`
  - `FilesList({ files }: { files: { id: string; filename: string | null; url: string | null; kind: string; category: string; href: string | null }[] })`

- [ ] **Step 1: Create `ProjectHero`**

Create `src/components/portal/ProjectHero.tsx`:

```tsx
import type { PortfolioStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/** Full-width hero: current-progress photo (or placeholder) with an overlaid name pill + status. */
export function ProjectHero({
  name,
  status,
  hero,
}: {
  name: string;
  status: PortfolioStatus;
  hero: { href: string } | null;
}) {
  return (
    <div className="relative w-full h-[200px] sm:h-[280px] rounded-card overflow-hidden">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.href} alt="" className="w-full h-full object-cover" />
      ) : (
        <BrandedPlaceholder name={name} />
      )}
      <div className="absolute left-5 sm:left-10 bottom-5 flex items-center gap-3">
        <span className="bg-white text-[#1a1a1a] font-bold text-[20px] sm:text-[26px] rounded-[8px] px-4 py-2 shadow-card">
          {name}
        </span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `BeforeAfterStrip`**

Create `src/components/portal/BeforeAfterStrip.tsx`:

```tsx
/** Two 50% panels (before | after) with a white divider. Parent renders only when both resolve. */
export function BeforeAfterStrip({
  before,
  after,
}: {
  before: { href: string };
  after: { href: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        Before → After
      </h4>
      <div className="flex rounded-[10px] overflow-hidden h-[150px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before.href} alt="Before" className="w-1/2 h-full object-cover" />
        <div className="w-[3px] bg-white" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after.href} alt="After" className="w-1/2 h-full object-cover" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `PhotoGallery`**

Create `src/components/portal/PhotoGallery.tsx`:

```tsx
import { EmptyState } from "@/components/ui/EmptyState";

/** Phase-grouped thumbnail grid. Thumbnails link to the full signed-URL image (lightbox deferred). */
export function PhotoGallery({
  groups,
}: {
  groups: { key: string; label: string; items: { id: string; href: string | null }[] }[];
}) {
  if (groups.length === 0) {
    return <EmptyState glyph="🖼" title="No photos shared yet." />;
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <h4 className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
            {g.label}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[10px]">
            {g.items.map((img) =>
              img.href ? (
                <a
                  key={img.id}
                  href={img.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-[110px] rounded-[8px] overflow-hidden border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.href} alt="" className="w-full h-full object-cover" />
                </a>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `FilesList`**

Create `src/components/portal/FilesList.tsx`:

```tsx
import { FileTile } from "@/components/ui/FileTile";
import { EmptyState } from "@/components/ui/EmptyState";

const FILE_STYLE: Record<string, { glyph: string; bg: string }> = {
  plans: { glyph: "📐", bg: "#7a8a9e" },
  permits: { glyph: "📋", bg: "#9e7a8a" },
  proposal: { glyph: "📝", bg: "#8a7a9e" },
  contract: { glyph: "✍️", bg: "#7a9e8a" },
  invoice: { glyph: "🧾", bg: "#9e9a7a" },
};
const FILE_FALLBACK = { glyph: "📄", bg: "#8a93a0" };

/** Shared non-image attachments (docs + links) as a tile grid. */
export function FilesList({
  files,
}: {
  files: {
    id: string;
    filename: string | null;
    url: string | null;
    kind: string;
    category: string;
    href: string | null;
  }[];
}) {
  if (files.length === 0) {
    return <EmptyState glyph="🗂" title="No files shared yet." />;
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {files.map((a) => {
        const style =
          a.kind === "link" ? { glyph: "🔗", bg: "#6a7c8a" } : FILE_STYLE[a.category] ?? FILE_FALLBACK;
        return (
          <FileTile
            key={a.id}
            name={a.filename ?? a.url ?? "Link"}
            glyph={style.glyph}
            bg={style.bg}
            readOnly
            href={a.href}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Rebuild the portal detail page**

Replace `src/app/(portal)/my-projects/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectHero } from "@/components/portal/ProjectHero";
import { BeforeAfterStrip } from "@/components/portal/BeforeAfterStrip";
import { PhotoGallery } from "@/components/portal/PhotoGallery";
import { FilesList } from "@/components/portal/FilesList";
import { getPortalProject } from "@/lib/data/portal";
import { fmtDate, fmtDateTime, fmtZonedDate } from "@/lib/data/format";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPortalProject(id);
  if (!detail) notFound();

  const { project, status, hero, before, after, beforeAfter, gallery, files, updates, tasks, timezone } =
    detail;

  return (
    <div className="flex flex-col gap-5">
      <ProjectHero name={project.name} status={status} hero={hero} />

      {beforeAfter && before && after && <BeforeAfterStrip before={before} after={after} />}

      <Tabs
        tabs={[
          {
            label: "Updates",
            content: (
              <div className="flex flex-col gap-3">
                {updates.length === 0 ? (
                  <EmptyState glyph="📣" title="No updates shared yet." />
                ) : (
                  updates.map((u) => (
                    <div
                      key={u.id}
                      className="bg-surface border border-line rounded-card overflow-hidden shadow-card"
                    >
                      {u.photoHref && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.photoHref} alt="" className="w-full h-[160px] object-cover" />
                      )}
                      <div className="p-4 flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          {u.title && <span className="text-body font-semibold">{u.title}</span>}
                          <span className="text-meta text-faint ml-auto">
                            {fmtDateTime(u.created_at, timezone)}
                          </span>
                        </div>
                        <p className="text-body text-[#344054]">{u.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Photos",
            content: <PhotoGallery groups={gallery} />,
          },
          {
            label: "Files",
            content: <FilesList files={files} />,
          },
          {
            label: "Tasks",
            content:
              tasks.length === 0 ? (
                <EmptyState glyph="✅" title="No tasks yet." />
              ) : (
                <Card>
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-[15px] py-[12px] border-b border-line-2 last:border-b-0"
                    >
                      <span
                        className={`size-5 rounded-[6px] grid place-items-center shrink-0 text-white text-[12px] ${
                          t.done ? "bg-accent border-2 border-accent" : "border-2 border-[#cfd4dc]"
                        }`}
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={`text-body flex-1 ${t.done ? "text-faint line-through" : ""}`}>
                        {t.body}
                      </span>
                      <span className="text-meta text-faint">
                        {t.done
                          ? t.completed_at
                            ? `done ${fmtZonedDate(String(t.completed_at), timezone)}`
                            : "done"
                          : t.due_date
                            ? `due ${fmtDate(t.due_date)}`
                            : ""}
                      </span>
                    </div>
                  ))}
                </Card>
              ),
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 6: Remove the now-dead `attachments`/`fileCategories` fields from the loader**

Now that no consumer reads them, delete the two "Kept for the pre-redesign portal page" lines (`attachments: signed,` and `fileCategories: fileCategories.data ?? [],`) from the `getPortalProject` return in `src/lib/data/portal.ts`. Keep `files`, `gallery`, and the slot fields.

- [ ] **Step 7: Typecheck + build**

Run: `npm run build`
Expected: build succeeds. If the build flags an unused `groupAttachmentsByType` import anywhere, remove it.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/portal/ProjectHero.tsx src/components/portal/BeforeAfterStrip.tsx src/components/portal/PhotoGallery.tsx src/components/portal/FilesList.tsx src/app/\(portal\)/my-projects/\[id\]/page.tsx src/lib/data/portal.ts
git commit -m "feat(portfolio): photo-led portal detail — hero, before/after, gallery, files, 4 tabs"
```

---

## Task 9: Gates, cutover & live verification

**Files:** none (verification + deploy only).

**Interfaces:**
- Consumes: everything above.
- Produces: the migration applied to prod + a deployed, verified feature.

- [ ] **Step 1: Full gate — tests + build**

Run: `npm test && npm run build`
Expected: both green. Do not proceed if either fails.

- [ ] **Step 2: Confirm migration status before push**

Run: `supabase migration list`
Expected: `20260716000001_photo_portfolio` shows as a local migration not yet applied to remote.

- [ ] **Step 3: Apply the migration to prod (explicit cutover)**

Run: `supabase db push`
Expected: applies `20260716000001_photo_portfolio.sql`. (This writes the production DB — the deliberate confirmation gate per project conventions.)

- [ ] **Step 4: Canonical types regen from the now-live remote**

Now that the migration is applied to remote, regenerate the canonical types (this reconciles the hand-edits from Task 1 and fills in relationship metadata):
Run: `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: `git diff` shows no *semantic* change to the columns added in Task 1 (only, possibly, relationship entries + ordering). Commit if the file changed:
```bash
git add src/lib/supabase/database.types.ts && git commit -m "chore(portfolio): canonical types regen post-migration" || echo "no change"
```

- [ ] **Step 5: Deploy**

Deploy via the project's normal path (git push to the feature branch → open a PR/merge to `main` → Vercel auto-deploy, or `vercel --prod`). Confirm the deployment reaches ● Ready.

- [ ] **Step 6: Live browser verification — contractor side**

On the artisan project page for a real project: upload an image → set its phase (Before/During/After) → set all four portfolio slots (Cover / Hero / Before / After) → post an update with a title and a photo. Confirm each write persists across reload and that tagging auto-shared the photos (share toggle shows Shared).

- [ ] **Step 7: Live browser verification — customer side**

Sign in as a portal contact for that project (e.g. J Huber's Gretchen Woodard `doug+2heathst@…`). Confirm: My Projects shows the cover card; the detail page shows the hero + before→after strip; the Photos tab is phase-grouped; an update card leads with its photo + title; the Files tab lists shared docs; and a project with no tagged photos shows clean branded placeholders (not broken).

- [ ] **Step 8: Isolation check**

As the contractor, un-share (or never share) a photo, then confirm as the customer that it never appears in any slot, the gallery, or an update — the slot falls back to the placeholder. Direct-URL to a non-attached project still 404s.

- [ ] **Step 9: Update project memory**

Record in project memory: feature shipped, migration `20260716000001`, the four decisions locked (title column added; stage→status map with no On Hold; 4-tab split; null-phase images grouped under "Photos"), and any follow-ups surfaced during verification.

---

## Self-Review

**Spec coverage:**
- Data model (phase, four slots, update photo) → Task 1. Update **title** column (locked decision) → Task 1.
- Sharing invariant / defensive slot resolution → Task 2 (`resolveSlot`, `isImageAttachment`) + enforced in Task 3 loaders.
- Contractor tagging (phase, slots, update photo, auto-share, validation) → Tasks 4–5.
- Portal redesign (card grid, hero, before/after, 4 tabs, gallery, files) → Tasks 6–8.
- Status→badge mapping (locked: proposal/signed/in_progress/completed → Proposal/Signed/Active/Completed, no On Hold) → Task 2 `stageToStatus` + Task 6 `StatusBadge`.
- Branded placeholders for every empty state → Task 6 `BrandedPlaceholder`, used in Tasks 7–8.
- Testing (pure transforms) → Task 2. Authz/isolation → live verification Task 9 (validation logic unit-tested via `validatePhotoAssignment`; DB-level RLS verified live, matching the project's established loader-verification approach).
- Migration & rollout, verification → Task 9.
- Responsive collapse (3→2→1 grid; hero/gallery scale down) → Tasks 7–8 (Tailwind `sm:`/`lg:` breakpoints).

**Decisions folded in (from brainstorming + this session's clarifications):**
- 4-tab split (Updates / Photos / Files / Tasks) — Task 8.
- Add a `title` column + composer title input — Tasks 1, 4, 5, 8.
- Map the four real stages, drop On Hold — Task 2.
- Null-phase shared images grouped under a trailing "Photos" group (defensive; avoids silent data loss) — Task 2. **Flag for reviewer:** veto here if you'd rather untagged-but-shared images be hidden entirely.

**Type consistency:** `PortfolioStatus`, `Resolved`, `GalleryItem`, `PhotoPick`, `ComposerPhoto` are defined once and imported. `stageToStatus` returns `{label,tone}` consumed identically by `StatusBadge`. `setPhotoPhase`/`setProjectPhotoSlot` return `RecordResult` (`{error}`), matching the client callers' `.error` checks. `postUpdate`'s `(title, body, shared, photoId)` shape matches `Composer`'s action prop.

**Open implementation note:** Task 5 Step 1 and Step 5 depend on `getProjectDetail` (`src/lib/data/projects.ts`) returning `mime_type` + `phase` on attachments and the four slot IDs on the project — verify/extend that select before wiring the UI.
