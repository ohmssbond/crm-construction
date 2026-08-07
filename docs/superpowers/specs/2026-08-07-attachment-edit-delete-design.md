# Edit an Attachment's Category, Delete a File — Design

_Date: 2026-08-07_

Once a file is uploaded there is no way to change its category or remove it. A file
filed under the wrong category stays there, and a wrong photo — blurry, or of the wrong
house — is permanent. This adds both.

## Goal

- Change an uploaded file's category from the Files tab.
- Delete an uploaded file or photo, removing both the database row and the stored object.
- Warn before deleting a file that is currently in use, without blocking it.

## Decisions (settled)

- **Delete is a hard delete: the row *and* the object in the `project-files` bucket.**
  Attachments have no `archived_at` today, so this needs no migration, and it mirrors the
  worker app's shipped `removeJobPhoto`. It is irreversible — no undo, no restore. Any
  signed URL already handed out dies with the object.
- **Row first, then storage.** If the storage call fails afterwards, the result is an
  orphaned object — recoverable and invisible to users. Storage-first would risk the
  opposite: a row pointing at a file that no longer exists, which surfaces as a broken
  link in the customer's portal.
- **Deleting a file that is in use warns but proceeds.** All five references
  (`projects.cover/hero/before/after_attachment_id`, `status_updates.photo_attachment_id`)
  are `on delete set null`, so nothing dangles — the slot simply empties and the portal
  falls back to `BrandedPlaceholder`. The confirm names the uses so the decision is
  informed; it does not force a scavenger hunt through the portfolio panel and the
  updates list before a wrong file can be removed.
- **Category editing on the Files tab only.** Photos all carry the fixed
  `category='photo'` from a category-less upload, so a category control there would be
  meaningless. **Delete appears on both tabs**, and on link attachments too.
- **Both actions scope by `project_id` as well as `id`.** A caller passing a mismatched
  id/project pair must not be able to touch another project's attachment. This closes,
  for the new actions, the gap a previous review flagged on `updateStatusUpdate`.
- **The category dropdown is built from the org's own `file_categories`.**
  `attachments.category` is validated by a **per-org foreign key**
  (`attachments_category_fk → file_categories(organization_id, key)`), not a table-wide
  CHECK — so the valid set differs per tenant, and an unknown key raises a foreign-key
  violation rather than failing gracefully. The action validates before writing.
  Cycle B (migration `20260722000003`) archived three keys — `photo` for every org and
  `before_photo`/`after_photo` for construction orgs — that existing rows still
  legitimately carry (the Photos uploader still pins `category="photo"`, and a photo
  can land on the Files tab if its mime is non-image, e.g. HEIC as
  `application/octet-stream`). The dropdown options come from the non-archived set, so a
  controlled `<select>` on one of those rows has no matching option and would render
  blank. `AttachmentControls` guards this by prepending a disabled option carrying the
  raw key when it isn't among `categories`, so the control shows the true value instead
  of silently going empty.

## Non-goals

- Undo, restore, or a trash view.
- Bulk select / bulk delete.
- Renaming a file, replacing its contents, or moving it between projects.
- Editing a photo's category (photos are fixed at `photo`).
- Any change to who may upload, or to the share toggle.
- Cleaning up storage objects orphaned by a failed remove — out of scope, and invisible.

---

## Components

### 1. `attachmentUses` — pure, in `src/lib/data/portfolio.ts`

That module already owns the slot logic (`resolveSlot`, `buildHeaderImages`) and is pure
and unit-tested.

```ts
export function attachmentUses(
  attachmentId: string,
  slots: { cover: string | null; hero: string | null; before: string | null; after: string | null },
  updatePhotoIds: string[]
): string[];
```

Returns the human labels of every place the attachment is currently used, in a fixed
order, or `[]` when unused:

| Reference | Label |
| --- | --- |
| `slots.cover` | `Cover photo` |
| `slots.hero` | `Current progress photo` |
| `slots.before` | `Before photo` |
| `slots.after` | `After photo` |
| appears in `updatePhotoIds` | `a project update` |

`Current progress` rather than "hero" because that is the label staff already see in the
cycling project header. A file can hold several slots at once, so the return is a list,
not a single string; the component joins it.

The page already has the four slot ids (`slotValues`) and the updates in scope, so this
costs **no extra query**.

### 2. Two server actions — `src/app/(artisan)/projects/[id]/actions.ts`

```ts
setAttachmentCategory(projectId: string, attachmentId: string, category: string)
deleteAttachment(projectId: string, attachmentId: string)
```

`setAttachmentCategory` looks up the key among the org's non-archived `file_categories`
and returns silently if absent — matching the file's existing convention of a quiet
return on invalid input, and avoiding a foreign-key violation surfacing as a 500. Then
`.update({ category }).eq("id", attachmentId).eq("project_id", projectId)`.

`deleteAttachment` mirrors `removeJobPhoto` (`src/app/(worker)/log/actions.ts`):

1. select `storage_path, kind` for the row, scoped by both id and `project_id`; return if absent
2. delete the row, scoped the same way
3. if `kind === 'file'` and `storage_path` is set, `supabase.storage.from("project-files").remove([path])` — links have no object
4. `revalidatePath`

Authorization is RLS (`artisan_all` → `is_org_member`), matching every other action in
this file.

### 3. `AttachmentControls` — `src/components/ui/AttachmentControls.tsx`

A client component rendered directly below each tile:

```tsx
{
  categories?: { key: string; label: string }[];   // omitted → no category control
  category?: string;
  categoryAction?: (category: string) => Promise<void>;
  deleteAction: () => Promise<void>;
  uses: string[];                                   // from attachmentUses
}
```

- A category `<select>` when `categoryAction` is present, styled like the existing
  `PhaseControl` / `ShareToggle` row controls.
- A **Delete** with the shipped inline two-step confirm (`ArchiveButton`'s pattern —
  never a native `confirm()`, which blocks automation and keyboard users). When `uses`
  is non-empty the confirm names them: *"Also used as: Cover photo, a project update.
  Delete anyway?"*

### 4. Wiring — `src/app/(artisan)/projects/[id]/page.tsx`

- **Files tab:** each `FileTile` is wrapped in a `flex flex-col gap-1` div with
  `AttachmentControls` below it, passing the org's `fileCategories`, the attachment's
  current category, and both bound actions.
- **Photos tab:** each tile already sits in exactly that wrapper with `PhaseControl`
  below; `AttachmentControls` joins it, with no category props.

Changing a category moves the tile to a different group on revalidate, because the Files
tab groups by category. That is correct and expected.

---

## Testing

Unit tests for `attachmentUses` in `src/lib/data/portfolio.test.ts`: each slot
individually, one file holding two slots, an update photo, a slot plus an update, an
unused file, and an empty update list.

The two actions are thin RLS-scoped I/O and get no tests, matching the repo's convention.

Gates: `npx tsc --noEmit`, `npm test` (161 passing today), `npm run build`.

Manual verification, since none of the interaction is reachable by the automated gates:

- Change a file's category → it moves to the new group.
- Delete a file → the tile disappears and the object is gone from the bucket.
- Delete a link → it disappears with no storage error.
- Delete a photo assigned as the Cover → the confirm names it, and afterwards the
  portfolio slot is empty and the portal shows the placeholder.
- Delete a photo attached to an update → the confirm names it, and the update survives
  without its photo.
- The confirm is a two-step inline control, never a browser dialog.

## Risks

- **Hard delete has no undo.** A staff member who deletes the wrong file re-uploads it.
  The two-step confirm and the in-use warning are the only guards.
- **The warning is advisory.** Deleting the hero blanks the customer's project header
  immediately — degrading to `BrandedPlaceholder` rather than breaking, but with no
  further confirmation beyond the named warning.
- **A failed storage remove orphans the object.** Deliberate: the alternative ordering
  produces a visibly broken file, which is worse. Nothing surfaces or cleans up orphans.
