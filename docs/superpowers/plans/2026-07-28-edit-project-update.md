# Edit a Project Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tenant edit an existing status update's title, body, and photo inline on the artisan project Updates tab.

**Architecture:** Reuse the shipped task-edit pattern (`TaskRow` + `updateTodo`): a scoped server action does the write, and `UpdateCard` becomes a client component with an inline edit mode. The action mirrors `postUpdate`'s photo handling but never re-notifies the team and never changes `is_shared`.

**Tech Stack:** Next.js 16 App Router (server actions, `revalidatePath`), React (`useState`/`useTransition`), Supabase (loosely-typed `createClient`, RLS `is_org_member`).

## Global Constraints

- **No migration** — `status_updates.title` and `status_updates.photo_attachment_id` already exist. Read/write existing columns only.
- **Artisan-only.** The portal renders updates through `PortalProjectView`, not `UpdateCard`; do not touch portal code.
- **Editing never re-sends the update-notification email** and **never changes `is_shared`** (share stays on the separate `ShareToggle`).
- **Auth = RLS.** No explicit auth check in the action (matches `updateTodo`); the scoped `.update()` is confined to the tenant's org by RLS.
- **No new Vitest unit test is warranted** — the action is thin glue over the already-tested `validatePhotoAssignment` (`portfolio.ts`), and the card is UI. Gates are `tsc --noEmit`, the existing suite staying green, `npm run build`, and live-browser verification (same as how task-edit / PR #8 shipped). Do **not** fabricate a unit test.
- Gates before commit on each task: `npx tsc --noEmit` and `npm test` must pass; `npm run build` on the final task.

---

### Task 1: `updateStatusUpdate` action + extend the updates query

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts` (add the action after `updateTodo`, ~line 281)
- Modify: `src/lib/data/projects.ts` (updates select in `getProjectDetail`, ~line 66)

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `validatePhotoAssignment` (`./portfolio` / `@/lib/data/portfolio`), `revalidatePath` — all already imported in `actions.ts`.
- Produces: `updateStatusUpdate(projectId: string, updateId: string, title: string, body: string, photoAttachmentId: string | null): Promise<void>` — consumed by Task 2. After this task, `getProjectDetail`'s `updates` rows also carry `title: string | null` and `photo_attachment_id: string | null`.

- [ ] **Step 1: Extend the updates select in `getProjectDetail`**

In `src/lib/data/projects.ts`, the `status_updates` query inside the `Promise.all` currently reads:

```ts
      supabase
        .from("status_updates")
        .select("id, body, created_at, is_shared")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
```

Change the `.select(...)` line to add `title` and `photo_attachment_id`:

```ts
      supabase
        .from("status_updates")
        .select("id, title, body, created_at, is_shared, photo_attachment_id")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
```

- [ ] **Step 2: Add the `updateStatusUpdate` action**

In `src/app/(artisan)/projects/[id]/actions.ts`, immediately after the `updateTodo` function (ends ~line 281), add:

```ts
/**
 * Edit an existing status update's title, body, and photo. Mirrors postUpdate's
 * photo handling (validate + auto-share) but never re-notifies the team and never
 * changes is_shared (that stays on the separate ShareToggle). RLS scopes the write
 * to the tenant's org.
 */
export async function updateStatusUpdate(
  projectId: string,
  updateId: string,
  title: string,
  body: string,
  photoAttachmentId: string | null
) {
  const text = body.trim();
  if (!text) return; // body required; an empty save is a no-op

  const supabase = await createClient();

  // A photo on an update auto-shares it (mirrors postUpdate). If the referenced
  // photo is invalid/stale, drop ONLY the photo ref — never fail the save over it.
  // validatePhotoAssignment returns an error string when invalid, null when valid.
  let photoId = photoAttachmentId;
  if (photoId) {
    const { data: a } = await supabase
      .from("attachments")
      .select("project_id, kind, mime_type")
      .eq("id", photoId)
      .maybeSingle();
    if (validatePhotoAssignment(a, projectId)) {
      photoId = null;
    } else {
      await supabase.from("attachments").update({ is_shared: true }).eq("id", photoId);
    }
  }

  await supabase
    .from("status_updates")
    .update({ title: title.trim() || null, body: text, photo_attachment_id: photoId })
    .eq("id", updateId);
  revalidatePath(`/projects/${projectId}`);
}
```

- [ ] **Step 3: Typecheck + existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exits 0 (no output); Vitest reports all files passed (currently 114 tests).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts" src/lib/data/projects.ts
git commit -m "feat(updates): updateStatusUpdate action + title/photo in updates query"
```

---

### Task 2: `UpdateCard` inline edit + wire into the Updates tab

**Files:**
- Modify (rewrite): `src/components/ui/UpdateCard.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (the `UpdateCard` render, lines 134–142; imports at top)

**Interfaces:**
- Consumes: `updateStatusUpdate` from Task 1; each update row now carries `title` and `photo_attachment_id`; `imagePhotos` (already built at page line 82 as `{ id, filename, href }[]`).
- Produces: the finished feature (no downstream consumers).

- [ ] **Step 1: Rewrite `UpdateCard` as a client component with inline edit**

Replace the entire contents of `src/components/ui/UpdateCard.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ShareToggle } from "./ShareToggle";
import { fieldInput } from "./Field";

export type UpdatePhoto = { id: string; filename: string | null };

export function UpdateCard({
  when,
  title,
  body,
  photoId: photoIdDefault,
  shared = false,
  portal = false,
  photos,
  shareAction,
  editAction,
}: {
  when: string;
  title?: string | null;
  body: string;
  photoId?: string | null;
  shared?: boolean;
  portal?: boolean;
  photos?: UpdatePhoto[];
  shareAction?: (shared: boolean) => void | Promise<void>;
  editAction?: (title: string, body: string, photoAttachmentId: string | null) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [titleV, setTitleV] = useState(title ?? "");
  const [bodyV, setBodyV] = useState(body);
  const [photoV, setPhotoV] = useState<string | null>(photoIdDefault ?? null);
  const [pending, start] = useTransition();

  const startEdit = () => {
    setTitleV(title ?? "");
    setBodyV(body);
    setPhotoV(photoIdDefault ?? null);
    setEditing(true);
  };
  const save = () => {
    if (!bodyV.trim() || !editAction) return;
    start(async () => {
      await editAction(titleV, bodyV, photoV);
      setEditing(false);
    });
  };

  if (editing && !portal) {
    return (
      <div className="bg-surface border border-line rounded-card p-4 shadow-card flex flex-col gap-2">
        <input
          value={titleV}
          onChange={(e) => setTitleV(e.target.value)}
          disabled={pending}
          placeholder="Title (optional)"
          aria-label="Update title"
          className={`${fieldInput} text-[13px] font-semibold`}
        />
        <textarea
          value={bodyV}
          onChange={(e) => setBodyV(e.target.value)}
          disabled={pending}
          rows={3}
          aria-label="Update body"
          className={`${fieldInput} text-[13px] resize-y`}
        />
        <div className="flex flex-wrap items-center gap-[10px] pt-[6px]">
          {photos && photos.length > 0 && (
            <select
              value={photoV ?? ""}
              onChange={(e) => setPhotoV(e.target.value || null)}
              disabled={pending}
              aria-label="Update photo"
              className="rounded-control border border-line bg-surface px-2 py-[5px] text-sub outline-none focus:border-accent"
            >
              <option value="">No photo</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.filename ?? "Photo"}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !bodyV.trim()}
            className="ml-auto text-meta font-semibold text-accent disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="text-meta text-faint hover:text-body"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card p-4 shadow-card">
      <div className="flex items-center gap-[10px] mb-2">
        {!portal && <ShareToggle defaultShared={shared} action={shareAction} />}
        <span className="text-meta text-faint ml-auto">{when}</span>
        {!portal && editAction && (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit update"
            className="text-meta text-faint hover:text-accent"
          >
            Edit
          </button>
        )}
      </div>
      {title && <p className="text-body font-semibold mb-1">{title}</p>}
      <p className="text-body text-[#344054]">{body}</p>
      {portal && (
        <div className="mt-[11px] pt-[10px] border-t border-dashed border-line text-meta text-faint">
          ↪ Acknowledge / comment — planned fast-follow (read-only today)
        </div>
      )}
    </div>
  );
}
```

Notes: `fieldInput` is the shared input class already used by `TaskRow` (`@/components/ui/Field`). The `portal` branch is preserved unchanged for safety even though no portal caller exists today.

- [ ] **Step 2: Wire the new props + action into the Updates tab**

In `src/app/(artisan)/projects/[id]/page.tsx`, the `UpdateCard` render (lines 134–142) currently reads:

```tsx
                  updates.map((u) => (
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at, timezone)}
                      body={u.body}
                      shared={u.is_shared}
                      shareAction={setUpdateShared.bind(null, project.id, u.id)}
                    />
                  ))
```

Replace it with:

```tsx
                  updates.map((u) => (
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at, timezone)}
                      title={u.title}
                      body={u.body}
                      photoId={u.photo_attachment_id}
                      shared={u.is_shared}
                      photos={imagePhotos.map((p) => ({ id: p.id, filename: p.filename }))}
                      shareAction={setUpdateShared.bind(null, project.id, u.id)}
                      editAction={updateStatusUpdate.bind(null, project.id, u.id)}
                    />
                  ))
```

- [ ] **Step 3: Add `updateStatusUpdate` to the actions import**

In the same file, the import block from `"./actions"` (starts ~line 30) lists the server actions. Add `updateStatusUpdate` to it, e.g. alongside `setUpdateShared`:

```tsx
  postUpdate,
  setUpdateShared,
  updateStatusUpdate,
```

(Insert the `updateStatusUpdate,` line into the existing `import { … } from "./actions";` list — do not create a second import statement.)

- [ ] **Step 4: Typecheck, tests, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc 0; Vitest all passed; build succeeds with `/projects/[id]` in the route tree.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/UpdateCard.tsx "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(updates): inline edit (title/body/photo) on UpdateCard"
```

- [ ] **Step 6: Live verification (Chrome, dev server vs prod data)**

Start `npm run dev`; sign in to a construction tenant (e.g. J Huber → "2 Heath Street: ADU"); on the project Updates tab:
- Click **Edit** on an update → title input + body textarea + photo select appear, prefilled.
- Change the **body** → Save → persists across reload.
- Add / change / clear the **title** → persists and shows on the card (and in the portal preview `/preview/[id]` for a shared update).
- **Photo**: attach → appears in the portal preview and the attachment auto-shares; swap; remove ("No photo") → clears. 
- **Empty body** → Save disabled (no-op guard).
- Editing a **shared** update sends **no** email (confirm no Resend send in the dev server log).
- **Cancel** discards edits.

---

## Notes for the executor

- The `imagePhotos` binding already exists at `src/app/(artisan)/projects/[id]/page.tsx:82` as `{ id, filename, href }[]` — reuse it; don't rebuild it.
- Keep `setUpdateShared` wiring exactly as-is; the edit action is additive.
- `fmtDateTime`, `EmptyState`, `Composer` usage in the Updates tab are unchanged.
