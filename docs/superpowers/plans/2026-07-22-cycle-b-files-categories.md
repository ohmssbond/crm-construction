# Cycle B — Files & Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise the file-category list (add Surveys/Designs, pluralize Contracts, drop Before/After from the dropdown, alpha-sort) and split the artisan project "Photos & Files" tab into separate Photos and Files tabs, mirroring the portal.

**Architecture:** Two backlog items built in dependency order. #3 (category migration) lands first so the `photo` placeholder value exists before #2's category-less photo uploader records with it. Category changes are scoped to construction-vertical orgs. Split criterion mirrors the portal exactly: `isImageAttachment`.

**Tech Stack:** Next.js 16 (App Router, "use client" where noted), Supabase (Postgres + per-org `file_categories` + table-wide CHECK constraint), Vitest, Chrome MCP for live verification.

> **⚠️ SCHEMA CORRECTION (post-review).** Task 1's original SQL manipulated a
> table-wide `attachments_category_check` that **no longer exists** —
> `20260603000002` replaced it with a per-org FK `attachments_category_fk
> (organization_id, category) -> file_categories (organization_id, key)`. The
> migration was reworked (commit after Task 4): NO CHECK ops; insert a `photo`
> `file_categories` row for **every** org (archived, so hidden from the dropdown but
> a valid FK target); construction orgs get surveys/designs + contract relabel +
> before/after **retired via `archived_at`** (not hard-deleted — they're FK-parents
> of legacy attachments); and the dropdown query gains `.is("archived_at", null)`.
> Task 1/Task 2 SQL snippets below are the superseded originals — see the fix commit
> for the authoritative migration.

## Global Constraints

- **Not the Next.js you know** — read `node_modules/next/dist/docs/` before writing framework code; heed deprecation notices (per `AGENTS.md`).
- **Migrations** live in `supabase/migrations/`, named `YYYYMMDD00000N_<slug>.sql`. During this build session, migration files are **authored and committed but NOT applied**. All production writes — `supabase db push`, canonical `gen types --linked`, deploy, live verify — are deferred to a single **cutover gate (final task)**, run deliberately with the maintainer (remote == production).
- **Types during build:** `createClient()` does NOT pass the `Database` generic, so `.from(...)`/`.rpc(...)` are loosely typed — these changes compile with **no edit** to `src/lib/supabase/database.types.ts`. Do NOT hand-edit it; it is regenerated canonically at cutover.
- **Gates before commit:** `npm test` (Vitest) and `npm run build` must pass. Neither needs the database.
- **Category scope:** the `file_categories` dropdown changes apply to **construction-vertical orgs only** — identified by having a `plans` category. The software vertical (e.g. Gargoyle: PRD/Tech architecture/Design) is left untouched.
- **Photo placeholder:** photo uploads record a fixed `category="photo"` — never shown in any dropdown; exists only so photo rows satisfy the `NOT NULL` column without a document category. The Photos/Files split is by mime type (`isImageAttachment`), independent of category.
- **No data migration** of existing attachments' `category` values. Legacy `before_photo`/`after_photo` rows stay constraint-valid and (being images) display in the Photos tab regardless.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Part 1 — #3 categories**
- Create: `supabase/migrations/20260722000003_revise_file_categories.sql` — CHECK widen + construction-org `file_categories` changes.
- Modify: `src/lib/data/projects.ts:102` — order `file_categories` by `label` (alpha).
- Modify: `src/app/(artisan)/projects/[id]/page.tsx:48-56` — `FILE_STYLE` glyphs for `surveys`/`designs`.

**Part 2 — #2 split**
- Modify: `src/app/(artisan)/projects/[id]/UploadForm.tsx` — optional `fixedCategory` + `accept` props.
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` — derive image/file attachment lists; replace the one "Photos & Files" tab with "Photos" + "Files".

---

## Part 1 · #3 — Revise the file-type list

### Task 1: Category migration (file only)

**Files:**
- Create: `supabase/migrations/20260722000003_revise_file_categories.sql`

**Interfaces:**
- Produces: `attachments.category` CHECK includes `surveys`, `designs`, `photo`; construction orgs' `file_categories` gain Surveys/Designs, `contract` relabeled "Contracts", `before_photo`/`after_photo` rows removed. (Applied at the cutover gate, not here.)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722000003_revise_file_categories.sql`:

```sql
-- #3: revise file categories. The table-wide CHECK gains the new document
-- categories plus the 'photo' placeholder for uncategorized photo uploads
-- (Cycle B #2). Per-org dropdown changes are scoped to CONSTRUCTION-vertical orgs
-- (identified by having a 'plans' category); the software vertical keeps its own
-- set. Legacy attachments retain any before_photo/after_photo category value
-- (still constraint-valid) — no data migration.

-- 1. Widen the attachments.category CHECK, preserving all existing values.
alter table attachments drop constraint attachments_category_check;
alter table attachments add constraint attachments_category_check
  check (category in ('before_photo', 'after_photo', 'plans', 'permits', 'proposal',
                      'contract', 'invoice', 'other', 'surveys', 'designs', 'photo'));

-- 2. Revise the dropdown categories for construction orgs only.
do $$
declare
  c_org uuid;
  v_sort int;
begin
  for c_org in
    select distinct organization_id from file_categories where key = 'plans'
  loop
    select coalesce(max(sort), 0) into v_sort
      from file_categories where organization_id = c_org;

    insert into file_categories (organization_id, key, label, sort) values
      (c_org, 'surveys', 'Surveys', v_sort + 1),
      (c_org, 'designs', 'Designs', v_sort + 2)
    on conflict (organization_id, key) do nothing;

    update file_categories set label = 'Contracts'
      where organization_id = c_org and key = 'contract';

    delete from file_categories
      where organization_id = c_org and key in ('before_photo', 'after_photo');
  end loop;
end $$;
```

- [ ] **Step 2: Verify the tree still builds**

Run: `npm run build`
Expected: build succeeds (this task adds only a SQL file). Do NOT run `supabase db push` or `gen types` — deferred to the cutover task.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260722000003_revise_file_categories.sql
git commit -m "feat(files): revise file-category migration — surveys/designs/photo, drop before-after (applied at cutover)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Alpha-sort the dropdown + glyphs for the new categories

**Files:**
- Modify: `src/lib/data/projects.ts:99-102` (file_categories query order)
- Modify: `src/app/(artisan)/projects/[id]/page.tsx:48-57` (`FILE_STYLE`)

**Interfaces:**
- Consumes: nothing from prior tasks (independent).
- Produces: `getProjectDetail().fileCategories` sorted by label; `FILE_STYLE` has `surveys`/`designs` entries.

- [ ] **Step 1: Order categories by label**

In `src/lib/data/projects.ts`, the `file_categories` query (currently ends `.order("sort", { ascending: true })` at line 102) — change the order key to `label`:

```ts
      supabase
        .from("file_categories")
        .select("key, label, sort")
        .order("label", { ascending: true }),
```

- [ ] **Step 2: Add glyphs for the new categories**

In `src/app/(artisan)/projects/[id]/page.tsx`, add two entries to `FILE_STYLE` (after the `invoice` line, before the closing brace at line 56):

```ts
  invoice: { glyph: "🧾", bg: "#9e9a7a" },
  surveys: { glyph: "🗺", bg: "#7a9e9e" },
  designs: { glyph: "🎨", bg: "#9e7a9e" },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/projects.ts "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(files): alpha-sort category dropdown + glyphs for surveys/designs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Part 2 · #2 — Split into Photos and Files tabs

### Task 3: `UploadForm` — optional `fixedCategory` + `accept` props

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/UploadForm.tsx`

**Interfaces:**
- Produces: `UploadForm` accepts optional `fixedCategory?: string` (hides the category select and submits that value) and `accept?: string` (sets the file input's `accept`). `categories` becomes optional. Consumed by Task 4.

- [ ] **Step 1: Update the props**

Change the props type + signature (currently lines 18-28):

```tsx
export function UploadForm({
  projectId,
  orgId,
  categories,
  shareLabel,
  fixedCategory,
  accept,
}: {
  projectId: string;
  orgId: string;
  categories?: { key: string; label: string }[];
  shareLabel: string;
  fixedCategory?: string;
  accept?: string;
}) {
```

- [ ] **Step 2: Use the effective category in submit**

In `submit` (currently lines 35-40), replace the category read + guard so a fixed category wins:

```tsx
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file to upload.");
    const cat = fixedCategory ?? category;
    if (!cat) return setError("Pick a category.");
    setError(null);
```

Then in the `recordAttachment` call (currently line 60), submit `cat` instead of `category`:

```tsx
        category: cat,
```

- [ ] **Step 3: Add `accept` to the file input and gate the category select**

Add `accept={accept}` to the file `<input>` (currently lines 83-88):

```tsx
        <input
          ref={fileRef}
          type="file"
          required
          accept={accept}
          className="text-sub max-w-[230px] file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-[6px] file:text-sub file:font-semibold"
        />
```

Wrap the category `<select>` (currently lines 89-103) so it only renders when there's no fixed category:

```tsx
        {!fixedCategory && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className={controlCls}
          >
            <option value="" disabled>
              Category…
            </option>
            {(categories ?? []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds (the existing Files usage still passes `categories`; `fixedCategory` is optional).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/UploadForm.tsx"
git commit -m "feat(files): UploadForm supports a fixed category (category-less photo upload)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Split the tab into Photos and Files

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (derivation at lines 74-82; the tab object at lines 128-186)

**Interfaces:**
- Consumes: `UploadForm`'s `fixedCategory`/`accept` (Task 3); the `photo` category value (Task 1); `isImageAttachment`, `groupAttachmentsByType`, `FILE_STYLE`/`FILE_FALLBACK` (already imported).
- Produces: the artisan project page shows separate **Photos** and **Files** tabs.

- [ ] **Step 1: Derive image and file attachment lists**

Replace the current `imagePhotos` derivation (lines 74-76) with three bindings:

```tsx
  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((a) => !isImageAttachment(a));
  const imagePhotos = imageAttachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    href: a.href,
  }));
```

- [ ] **Step 2: Replace the "Photos & Files" tab with two tabs**

Replace the entire single tab object (lines 128-186, the `{ label: "Photos & Files", content: (...) }` object) with two tab objects:

```tsx
          {
            label: "Photos",
            content: (
              <div className="flex flex-col gap-3">
                <UploadForm
                  projectId={project.id}
                  orgId={ctx?.org.id ?? ""}
                  fixedCategory="photo"
                  accept="image/*"
                  shareLabel={`Share with ${clientNoun.toLowerCase()}`}
                />
                <PortfolioSlots
                  photos={imagePhotos}
                  values={slotValues}
                  action={setProjectPhotoSlot.bind(null, project.id)}
                />
                {imageAttachments.length === 0 ? (
                  <EmptyState glyph="🖼" title="No photos yet." />
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {imageAttachments.map((a) => (
                      <div key={a.id} className="flex flex-col gap-1">
                        <FileTile
                          name={a.filename ?? a.url ?? "Photo"}
                          glyph="🖼"
                          bg="#7a9e93"
                          shared={a.is_shared}
                          href={a.href}
                          shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                        />
                        <PhaseControl
                          current={(a.phase as "before" | "during" | "after" | null) ?? null}
                          action={setPhotoPhase.bind(null, project.id, a.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            label: "Files",
            content: (
              <div className="flex flex-col gap-3">
                <UploadForm
                  projectId={project.id}
                  orgId={ctx?.org.id ?? ""}
                  categories={fileCategories}
                  shareLabel={`Share with ${clientNoun.toLowerCase()}`}
                />
                <LinkForm action={addLink.bind(null, project.id)} categories={fileCategories} />
                {fileAttachments.length === 0 ? (
                  <EmptyState glyph="🗂" title="No files yet." />
                ) : (
                  <div className="flex flex-col gap-4">
                    {groupAttachmentsByType(fileAttachments, fileCategories).map((group) => (
                      <div key={group.key} className="flex flex-col gap-2">
                        <h4 className="text-meta font-semibold text-faint">
                          {group.label} ({group.items.length})
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {group.items.map((a) => {
                            const style =
                              a.kind === "link"
                                ? { glyph: "🔗", bg: "#6a7c8a" }
                                : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                            return (
                              <FileTile
                                key={a.id}
                                name={a.filename ?? a.url ?? "Link"}
                                glyph={style.glyph}
                                bg={style.bg}
                                shared={a.is_shared}
                                href={a.href}
                                shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
```

Note: the Files tab drops the per-image `PhaseControl` (files aren't phased); the Photos tab uses a uniform `🖼` glyph for all image tiles (`FileTile` renders glyph tiles, not thumbnails — unchanged from today). The result nav is **Updates | Photos | Files | Tasks | Contacts**.

- [ ] **Step 3: Run tests and build**

Run: `npm test`
Expected: PASS (existing suite; no new tests — these changes are UI + migration).
Run: `npm run build`
Expected: build succeeds with no unused-import warnings (all of `UploadForm`, `LinkForm`, `PortfolioSlots`, `FileTile`, `PhaseControl`, `groupAttachmentsByType`, `FILE_STYLE`, `FILE_FALLBACK`, `EmptyState` remain used).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(files): split artisan Photos & Files into two tabs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cutover gate (deliberate — maintainer-run, NOT a subagent task)

The single production-write gate, run after the final whole-branch review, alongside `superpowers:finishing-a-development-branch`.

**Files:** Modify `src/lib/supabase/database.types.ts` (regenerated).

- [ ] **Step 1: Apply the migration to remote (deliberate — will prompt)**

Run: `supabase db push`
Then: `supabase migration list`
Expected: `20260722000003` shows applied (Local == Remote).

- [ ] **Step 2: Regenerate canonical types + commit**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
(The `attachments.category` type is a free `string`, so the diff may be empty or minimal — commit whatever changes, if any.)

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(cycle-b): regenerate canonical database types after db push

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Final gates**

Run: `npm test` → PASS
Run: `npm run build` → succeeds

- [ ] **Step 4: Deploy**

Merge the branch to `main` (PR per `finishing-a-development-branch`) so Vercel deploys, or `vercel --prod --yes`. Confirm READY. (No tight-window concern this cycle — the migration is additive-constraint + per-org data; the currently-live code keeps working against it.)

- [ ] **Step 5: Verify live (Chrome MCP)**

On a construction-org project (e.g. Test Tenant):
- Artisan project page shows **Photos** and **Files** tabs (nav: Updates | Photos | Files | Tasks | Contacts).
- **Photos tab:** the uploader shows **no category picker**; upload an image → it lands in Photos; portfolio slots + phase controls present.
- **Files tab:** the uploader shows the category dropdown; the dropdown lists **Surveys, Designs, Contracts** (and Plans/Permits/Proposal/Invoice/Other), **alphabetically**, with **no Before/After photo** entries; upload a non-image → lands in Files under its category.
- The **customer portal** Photos/Files tabs for that project still render correctly.

Report all results with output. Do not claim success without evidence.

---

## Notes for the executor

- **No production writes during the build session.** Tasks 1–4 only author/commit code and the migration file; fully verifiable with `npm test` + `npm run build`. All `supabase db push` / `gen types` / deploy / live-verify happen once, at the Task 5 cutover, run deliberately with the maintainer.
- **Do NOT hand-edit `database.types.ts`.** `attachments.category` is typed as a plain `string` regardless of the CHECK values, so no regen is needed to compile; it's refreshed canonically at cutover.
- **Scope boundary:** the Photos tab keeps `FileTile` glyph tiles (not image thumbnails) — a faithful split of today's behavior, not a photo-display redesign. Real thumbnails would be a separate enhancement.
- **Category scope is construction-only** (orgs with a `plans` category). Do not broaden the per-org `file_categories` changes to all orgs.
- **Line numbers are as-of-plan-writing.** Tasks 2 and 4 both edit `page.tsx`, so Task 2's two added `FILE_STYLE` lines shift Task 4's targets down by ~2. Locate each edit by the **quoted code** (the `imagePhotos` derivation; the `{ label: "Photos & Files", … }` tab object), not the literal line number.
