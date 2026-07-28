# Edit a Project Update — Design

_Date: 2026-07-28_

Backlog #5. Let a tenant edit an existing status update (fix a typo, reword, swap
the photo) — the same **inline edit-in-place** pattern already shipped for tasks
(PR #8: `TaskRow` + `updateTodo`), extended with the update's title + photo.

## Goal

An **Edit** affordance on each update in the artisan project **Updates** tab that
flips the card into an editable form for **title + body + photo**, saves via a
scoped server action, and reverts on cancel. Artisan-only; the portal stays
read-only.

## Decisions (settled)

- **Reuse the task-edit pattern** — inline edit-in-place, client state via
  `useState`/`useTransition`, a scoped `.update()` action + `revalidatePath`, auth by
  RLS (`is_org_member`), no explicit auth check (matches `updateTodo`).
- **Editable fields: title + body + photo.** Body is multi-line (a `<textarea>`).
- **Editing does NOT re-send the update notification email.** The team is emailed only
  when a *new* shared update is posted (`postUpdate`); a later edit never re-notifies
  (avoids spamming on a typo fix).
- **Editing does NOT change share state.** `is_shared` stays on the separate
  `ShareToggle`, exactly as with tasks.

## Non-goals

- Portal-side editing (read-only).
- Re-notifying the team on edit.
- An edit-history / "edited" indicator.
- Uploading a *new* photo from the edit form — the photo picker chooses among the
  project's already-uploaded images (same as the Composer). New uploads still go
  through the existing upload flow.

---

## Components

### 1. `updateStatusUpdate` server action

New action in `src/app/(artisan)/projects/[id]/actions.ts`, a mirror of `postUpdate`
minus the insert / email / share:

```
updateStatusUpdate(projectId, updateId, title, body, photoAttachmentId)
```

- Trim body; **empty → no-op** (body required), matching `updateTodo`.
- **Photo: reuse `postUpdate`'s exact logic** — look up the referenced attachment
  (`project_id, kind, mime_type`); `validatePhotoAssignment(a, projectId)` → drop a
  stale/foreign/non-image ref (set `photo_attachment_id = null`), otherwise auto-share
  the photo (`attachments.update({ is_shared: true })`). Never fail the save over a bad
  photo ref.
- `status_updates.update({ title: title.trim() || null, body, photo_attachment_id })`
  scoped by `.eq("id", updateId)` (RLS confines it to the tenant's org).
- `revalidatePath('/projects/${projectId}')`.
- **Does NOT touch `is_shared`** and **does NOT send email** (per Decisions).

### 2. `UpdateCard` gains an inline edit mode

`src/components/ui/UpdateCard.tsx` (today a server-rendered card: body + `ShareToggle`
+ timestamp) becomes a `"use client"` component modeled on `TaskRow`:

- **New props:** the current values (`title`, `body`, `photoId`), the project's image
  list (`photos: {id, filename}[]`, same shape the Composer takes), and an
  `editAction(title, body, photoAttachmentId)` callback. Existing `shareAction` /
  `when` / `shared` / `portal` props unchanged.
- **Display mode:** now renders the **title** (bold, when present) above the body — it's
  hidden in the artisan card today — plus an **Edit** button (hidden when `portal`).
- **Edit mode** (mirrors `TaskRow`'s editing/body/save/cancel state):
  - title `<input>` (optional),
  - body `<textarea>` (multi-line; required — Save disabled when empty),
  - photo `<select>` prefilled to the current `photoId` (options = project images +
    a "No photo" choice), reusing the Composer's select styling,
  - **Save** → `editAction`, then exit edit mode; **Cancel** → revert to props.
- **Portal path unchanged:** when `portal` is set, no Edit button, no title-edit — the
  portal renders through `PortalProjectView`, not this card, so nothing there changes.

### 3. Data plumbing

- `getProjectDetail` (`src/lib/data/projects.ts`) — add **`title, photo_attachment_id`**
  to the updates select (currently `id, body, created_at, is_shared`) so the card can
  prefill them.
- `src/app/(artisan)/projects/[id]/page.tsx` — the Updates tab maps each update to an
  `<UpdateCard>`, now also passing `title`, `photoId` (`u.photo_attachment_id`), the
  project image list (`imagePhotos` → `{id, filename}`), and the bound
  `updateStatusUpdate.bind(null, project.id, u.id)` as `editAction` (alongside the
  existing `setUpdateShared` binding).

---

## Data / DB

**No migration.** `status_updates.title` and `.photo_attachment_id` already exist
(added in the photo-portfolio work); this only reads/writes existing columns.

## Testing

- **Unit:** `validatePhotoAssignment` is already unit-tested (`portfolio.ts`); the new
  action is thin glue over it. No new pure logic to test beyond confirming the empty-body
  no-op guard.
- **Live (Chrome, dev vs prod data):**
  - Edit an update's **body** → persists across reload; the portal preview reflects it
    (for a shared update).
  - Edit the **title** (add / change / clear) → persists; shows in both the artisan card
    and the portal.
  - **Photo**: attach, swap, and remove → persists; a newly-attached photo auto-shares
    and appears in the portal; removing clears it.
  - **Empty body Save** → no-op (guard).
  - Editing a **shared** update does **not** trigger a notification email (check no send).

## Rollout

- Pure app code, no migration → **no cutover**. Normal PR → merge → deploy.
- Gates: `tsc --noEmit` + `npm test` + `npm run build`.

## Resolved decisions

| Decision | Choice |
|---|---|
| Pattern | Inline edit-in-place, mirroring task-edit (`TaskRow` + `updateTodo`) |
| Editable fields | Title + body + photo |
| Body input | Multi-line `<textarea>` |
| Photo source | Project's existing images (Composer picker); no new upload from edit |
| Re-notify on edit | No (email only on new shared post) |
| Share state on edit | Unchanged (separate `ShareToggle`) |
| Portal | Read-only, unchanged |
| DB | None (columns exist) |
