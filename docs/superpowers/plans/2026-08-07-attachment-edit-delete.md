# Attachment Category Edit + Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff change an uploaded file's category, and delete an uploaded file or photo — row and stored object both.

**Architecture:** One pure helper decides where an attachment is in use; two thin RLS-scoped Server Actions do the writes; one client component renders the controls under each tile on both the Files and Photos tabs.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), Supabase Postgres + Storage, TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-08-07-attachment-edit-delete-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **No migration, no schema change.** Attachments already have everything needed. Never run `supabase db push`.
- **Delete is a HARD delete: the row AND the object in the `project-files` bucket.** Row first, then storage — if storage fails afterwards you get an invisible orphan, whereas storage-first leaves a row pointing at a missing file, which surfaces as a broken link in the customer's portal.
- **Links have no storage object.** Only `kind === 'file'` rows with a `storage_path` get a storage removal; a link must delete cleanly without one.
- **Both actions scope by `project_id` AND `id`.** A caller passing a mismatched pair must not reach another project's attachment.
- **`attachments.category` is validated by a PER-ORG foreign key** (`attachments_category_fk → file_categories(organization_id, key)`), not a table-wide CHECK. The valid set differs per tenant, and an unknown key raises a foreign-key violation. Validate against the org's non-archived categories before writing and return silently if absent, matching the file's existing quiet-return-on-invalid-input convention.
- **The delete confirm is the shipped inline two-step control** (`src/app/(artisan)/ArchiveButton.tsx`'s pattern). Never a native `confirm()` — it blocks automation and keyboard users.
- **Category editing is Files-tab only.** Photos carry the fixed `category='photo'`; a category control there would be meaningless. Delete appears on both tabs.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (161 passing today). `npm run build` before the final task is called done.

---

### Task 1: `attachmentUses`

**Files:**
- Modify: `src/lib/data/portfolio.ts`
- Modify: `src/lib/data/portfolio.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — Task 3 depends on this exact name and shape:
  `attachmentUses(attachmentId: string, slots: { cover: string | null; hero: string | null; before: string | null; after: string | null }, updatePhotoIds: string[]): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/portfolio.test.ts`. Add `attachmentUses` to the existing `import { … } from "./portfolio"` statement rather than adding a second import line:

```ts
describe("attachmentUses", () => {
  const none = { cover: null, hero: null, before: null, after: null };

  test("returns an empty list for an unused attachment", () => {
    expect(attachmentUses("x", none, [])).toEqual([]);
  });

  test("names each slot it fills", () => {
    expect(attachmentUses("a", { ...none, cover: "a" }, [])).toEqual(["Cover photo"]);
    expect(attachmentUses("a", { ...none, hero: "a" }, [])).toEqual(["Current progress photo"]);
    expect(attachmentUses("a", { ...none, before: "a" }, [])).toEqual(["Before photo"]);
    expect(attachmentUses("a", { ...none, after: "a" }, [])).toEqual(["After photo"]);
  });

  test("lists every slot when one file fills several, in fixed order", () => {
    expect(attachmentUses("a", { cover: "a", hero: null, before: "a", after: "a" }, [])).toEqual([
      "Cover photo",
      "Before photo",
      "After photo",
    ]);
  });

  test("names an update photo", () => {
    expect(attachmentUses("a", none, ["a"])).toEqual(["a project update"]);
  });

  test("combines slot and update uses, slots first", () => {
    expect(attachmentUses("a", { ...none, hero: "a" }, ["b", "a"])).toEqual([
      "Current progress photo",
      "a project update",
    ]);
  });

  test("ignores slots and updates belonging to other attachments", () => {
    expect(attachmentUses("a", { cover: "b", hero: "c", before: "d", after: "e" }, ["f"])).toEqual(
      []
    );
  });

  test("mentions an update only once however many updates use it", () => {
    expect(attachmentUses("a", none, ["a", "a", "a"])).toEqual(["a project update"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/portfolio.test.ts`

Expected: FAIL — `attachmentUses is not a function` (or an import error).

- [ ] **Step 3: Implement**

Append to `src/lib/data/portfolio.ts`:

```ts
/**
 * Where an attachment is currently used, as labels for the delete confirm. Empty when
 * unused. The labels match what staff already see: the project header calls the hero
 * slot "Current progress", so this does too.
 *
 * All five references are `on delete set null`, so deleting a used attachment empties
 * the slot rather than dangling — this exists to make that consequence visible before
 * the fact, not to prevent it.
 */
export function attachmentUses(
  attachmentId: string,
  slots: { cover: string | null; hero: string | null; before: string | null; after: string | null },
  updatePhotoIds: string[]
): string[] {
  const uses: string[] = [];
  if (slots.cover === attachmentId) uses.push("Cover photo");
  if (slots.hero === attachmentId) uses.push("Current progress photo");
  if (slots.before === attachmentId) uses.push("Before photo");
  if (slots.after === attachmentId) uses.push("After photo");
  if (updatePhotoIds.includes(attachmentId)) uses.push("a project update");
  return uses;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/portfolio.test.ts`

Expected: PASS — 7 new tests.

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 168 tests pass (161 + 7).

```bash
git add src/lib/data/portfolio.ts src/lib/data/portfolio.test.ts
git commit -m "feat(portfolio): attachmentUses reports where an attachment is used"
```

---

### Task 2: The two server actions

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces — Task 3 binds these exact signatures:
  - `setAttachmentCategory(projectId: string, attachmentId: string, category: string): Promise<void>`
  - `deleteAttachment(projectId: string, attachmentId: string): Promise<void>`

This task adds two new exports and changes no existing signature, so it compiles and is reviewable on its own.

- [ ] **Step 1: Add both actions**

Append to `src/app/(artisan)/projects/[id]/actions.ts`, near the other attachment actions (`setAttachmentShared`, `setPhotoPhase`):

```ts
/**
 * Re-file an attachment under a different category.
 *
 * `attachments.category` is validated by a PER-ORG foreign key
 * (attachments_category_fk → file_categories(organization_id, key)), NOT a table-wide
 * CHECK — the valid set differs per tenant, so an unknown key would surface as a
 * foreign-key violation. Validate first and return quietly instead, matching this
 * file's convention for invalid input.
 */
export async function setAttachmentCategory(
  projectId: string,
  attachmentId: string,
  category: string
) {
  const ctx = await getOrgContext();
  if (!ctx) return;
  const supabase = await createClient();

  // Scope the lookup by organization_id explicitly, not by RLS visibility alone: RLS
  // admits every org the caller belongs to, so a user in two orgs could match two rows
  // and blow up maybeSingle(). The FK is (organization_id, key), so the session's org is
  // exactly the right scope.
  const { data: known } = await supabase
    .from("file_categories")
    .select("key")
    .eq("organization_id", ctx.org.id)
    .eq("key", category)
    .is("archived_at", null)
    .maybeSingle();
  if (!known) return; // not one of this org's categories

  await supabase
    .from("attachments")
    .update({ category })
    .eq("id", attachmentId)
    .eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Delete an attachment: the row AND its object in the project-files bucket.
 *
 * Row first, then storage. A failed storage remove leaves an invisible orphan;
 * storage-first would leave a row pointing at a file that no longer exists, which shows
 * up as a broken link in the customer's portal. Links (kind='link') have no object.
 *
 * The five references to attachments (the four project photo slots and
 * status_updates.photo_attachment_id) are all `on delete set null`, so a used
 * attachment empties its slot rather than dangling. The UI warns before this point.
 */
export async function deleteAttachment(projectId: string, attachmentId: string) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("storage_path, kind")
    .eq("id", attachmentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return;

  await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("project_id", projectId);

  if (row.kind === "file" && row.storage_path) {
    await supabase.storage.from("project-files").remove([row.storage_path as string]);
  }
  revalidatePath(`/projects/${projectId}`);
}
```

Both scope by `project_id` as well as `id` so a mismatched pair cannot reach another project's attachment. Authorization is RLS (`artisan_all` → `is_org_member`), matching every other action in this file.

- [ ] **Step 2: Confirm the bucket name and the storage-delete shape against the precedent**

Run: `grep -n "storage.from" src/lib/data/attachments.ts "src/app/(worker)/log/actions.ts"`

Expected: the project bucket is `project-files` (used in `attachments.ts`) and the worker's `removeJobPhoto` calls `.remove([path])` on `job-files`. Your new code must use `project-files` — using `job-files` would silently fail to delete anything.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 168 tests pass (this task adds none).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts"
git commit -m "feat(attachments): setAttachmentCategory and deleteAttachment actions"
```

---

### Task 3: `AttachmentControls` and both tabs

**Files:**
- Create: `src/components/ui/AttachmentControls.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `attachmentUses` (Task 1); `setAttachmentCategory`, `deleteAttachment` (Task 2).
- Produces: `AttachmentControls`, a client component.

- [ ] **Step 1: Write the component**

Create `src/components/ui/AttachmentControls.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { fieldInput } from "./Field";

/**
 * Row of controls under a file/photo tile: re-file it under another category, or delete
 * it outright.
 *
 * The category control is omitted entirely when no `categoryAction` is passed — that is
 * how the Photos tab opts out, since photos carry the fixed category 'photo'.
 *
 * Delete uses the inline two-step confirm shipped in ArchiveButton (never a native
 * confirm(), which blocks automation and keyboard users). `uses` names where the file is
 * currently used so the consequence is visible BEFORE the click, not after — deleting a
 * used file empties that slot via `on delete set null`.
 */
export function AttachmentControls({
  categories,
  category,
  categoryAction,
  deleteAction,
  uses,
}: {
  categories?: { key: string; label: string }[];
  category?: string;
  categoryAction?: (category: string) => Promise<void>;
  deleteAction: () => Promise<void>;
  uses: string[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {categoryAction && categories && (
          <select
            value={category}
            onChange={(e) => start(() => categoryAction(e.target.value))}
            disabled={pending}
            aria-label="File category"
            className={`${fieldInput} flex-1 min-w-0 text-chip py-[3px]`}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            aria-label="Delete file"
            className="text-chip text-faint hover:text-[#b42318] disabled:opacity-60 shrink-0"
          >
            Delete
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-1">
          <span className="text-chip text-muted">
            {uses.length > 0 ? `Also used as: ${uses.join(", ")}. Delete anyway?` : "Delete this file?"}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => start(() => deleteAction())}
              disabled={pending}
              className="text-chip font-semibold text-[#b42318] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-chip text-faint hover:text-body"
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the Files tab**

In `src/app/(artisan)/projects/[id]/page.tsx`, add the imports:

```ts
import { AttachmentControls } from "@/components/ui/AttachmentControls";
import { attachmentUses } from "@/lib/data/portfolio";
import { setAttachmentCategory, deleteAttachment } from "./actions";
```

`attachmentUses` may join an existing `@/lib/data/portfolio` import; the two actions join the existing `./actions` import.

The page already computes `slotValues`. Add the update photo ids once, near it:

```ts
  const updatePhotoIds = updates
    .map((u) => u.photo_attachment_id)
    .filter((id): id is string => id != null);
```

In the Files tab, the `group.items.map((a) => …)` currently returns a bare `<FileTile … />`. Wrap it so the controls sit below, matching how the Photos tab already pairs a tile with `PhaseControl`:

```tsx
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
                                <AttachmentControls
                                  categories={fileCategories}
                                  category={a.category}
                                  categoryAction={setAttachmentCategory.bind(null, project.id, a.id)}
                                  deleteAction={deleteAttachment.bind(null, project.id, a.id)}
                                  uses={attachmentUses(a.id, slotValues, updatePhotoIds)}
                                />
                              </div>
                            );
```

Note the `key` moves from `FileTile` to the wrapping `div`.

- [ ] **Step 3: Wire the Photos tab**

Each photo tile already sits in a `<div key={a.id} className="flex flex-col gap-1">` with `PhaseControl` below it. Add `AttachmentControls` after `PhaseControl`, **with no category props**:

```tsx
                        <AttachmentControls
                          deleteAction={deleteAttachment.bind(null, project.id, a.id)}
                          uses={attachmentUses(a.id, slotValues, updatePhotoIds)}
                        />
```

Omitting `categories`/`category`/`categoryAction` is what suppresses the category control — photos carry the fixed `category='photo'`.

- [ ] **Step 4: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green, 168 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/AttachmentControls.tsx "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(attachments): edit category and delete from the Files and Photos tabs"
```

---

## Manual verification (before merge)

The automated gates prove the use-detection is correct and that it compiles — not that the flow works, and **not** that the storage object actually went away.

- [ ] Change a file's category → the tile moves to the new group.
- [ ] Delete a file → the tile disappears, and the object is gone from the `project-files` bucket (check in Supabase Storage, not just the UI).
- [ ] Delete a **link** → it disappears with no storage error.
- [ ] Delete a photo assigned as the **Cover** → the confirm names it; afterwards the portfolio slot is empty and the portal shows the branded placeholder.
- [ ] Delete a photo attached to an **update** → the confirm names it; the update survives without its photo.
- [ ] Delete a photo holding **two slots** → the confirm names both.
- [ ] The confirm is the inline two-step control, never a browser dialog.
- [ ] The Photos tab shows **no** category control; the Files tab does.
