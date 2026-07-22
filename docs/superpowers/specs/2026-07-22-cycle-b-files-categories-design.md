# Cycle B — Files & Categories (Design)

_Date: 2026-07-22_

> **⚠️ SCHEMA CORRECTION (post-review).** This doc originally stated that
> `attachments.category` is governed by a table-wide `CHECK` constraint. **It is
> not.** `20260603000002` dropped `attachments_category_check` and replaced it with
> a **per-org foreign key** `attachments_category_fk (organization_id, category) ->
> file_categories (organization_id, key)`. Wherever this doc says "CHECK constraint
> / allowed values", read it as "the per-org `file_categories` rows (FK targets)".
> Consequences: a category value is usable by an org only if that org has the
> `file_categories` row; `photo` must be inserted as a row for **every** org (not
> just construction); and `before_photo`/`after_photo` are **retired via
> `archived_at`**, not hard-deleted (legacy attachments reference them via the FK).
> The "product_documentation constraint drift" non-goal is moot (there is no CHECK).
> The implemented migration follows this corrected model.

Two backlog items in the artisan (tenant/admin) project view, built in dependency
order:

1. **#3 — Revise the file-type list** (foundational: DB migration; built first)
2. **#2 — Split "Photos & Files" into two tabs** (consumes the revised categories +
   the new `photo` placeholder)

## Goals

- Split the artisan project **"Photos & Files"** tab into separate **Photos** and
  **Files** tabs, mirroring the split the **customer portal already has** (portal
  divides attachments by `isImageAttachment` → `PhotoGallery` vs `FilesList`).
- Revise the file-type (category) list: add **Surveys** + **Designs**, pluralize
  **Contract → Contracts**, drop the **Before/After photo** options from the
  dropdown, and sort the dropdown **alphabetically**.

## Non-goals

- No change to the customer portal (it is already split; this brings the admin view
  in line with it).
- No settings UI for categories (they remain per-org rows managed by migration).
- No data migration of existing attachments' `category` values (legacy rows keep
  theirs; they split by mime type regardless).
- Not fixing the pre-existing `product_documentation` constraint drift (out of scope;
  the migration preserves all current constraint values).

---

## Key model facts (current state)

- The artisan **"Photos & Files"** tab (`src/app/(artisan)/projects/[id]/page.tsx`,
  the tab at ~line 128) bundles: `UploadForm` (requires a category), `LinkForm`,
  `PortfolioSlots` (cover/hero/before/after image assignment), and a
  `groupAttachmentsByType` display of **all** attachments (photos + files) with a
  per-image `PhaseControl`.
- The **portal** already splits by `isImageAttachment`: images → Photos, non-images
  → Files (`src/lib/data/portal.ts`, `getPortalProject`). This is the dividing line
  we mirror.
- `attachments.category` is **`text NOT NULL`** with a CHECK constraint. Current
  allowed values (`20260603000001_add_attachment_categories.sql`):
  `('before_photo','after_photo','plans','permits','proposal','contract','invoice','other')`.
- The **dropdown** is driven by the per-org `file_categories` table (`key,label,sort`),
  read in `getProjectDetail` ordered by `sort`, rendered in `UploadForm`/`LinkForm`.
  Seeded in `20260603000003_seed_tenants.sql`.
- Glyph/color per category: `FILE_STYLE` map (`page.tsx` ~line 48).

---

## Part 1 · #3 — Revise the file-type list

### DB migration (one migration; applied at cutover)

**CHECK constraint** — drop/recreate `attachments_category_check`, preserving all
current values and adding three:
- `surveys`, `designs` — the new document categories.
- `photo` — the placeholder value for uncategorized photo uploads (see Part 2). It is
  never shown in any dropdown; it exists only so photo rows satisfy the NOT NULL
  column without a document category.

New allowed set:
`('before_photo','after_photo','plans','permits','proposal','contract','invoice','other','surveys','designs','photo')`.

**`file_categories` rows** (per-org, apply to **all existing orgs**):
- Insert `surveys` → "Surveys" and `designs` → "Designs" for every org (idempotent,
  `on conflict (organization_id, key) do nothing`).
- Relabel `contract` → **"Contracts"** (label only; the `key` stays `contract`, so
  existing attachment rows and the constraint are untouched).
- **Delete** the `before_photo` and `after_photo` rows so they leave the dropdown.
  (Legacy attachments keep those category values — still constraint-valid — and are
  images, so they display in the Photos tab regardless.)

### Alphabetical sort

The dropdown currently renders in `file_categories.sort` order. Change to sort by
**label** (case-insensitive). Chosen mechanism: order by `label` in the
`getProjectDetail` `file_categories` query (`.order("label")`) rather than reworking
per-org `sort` integers. `UploadForm`/`LinkForm` render the list as-received.

### Glyph map

Add `surveys` and `designs` entries to `FILE_STYLE` (`page.tsx` ~line 48) with a
glyph + bg in the existing style. (`photo` needs no entry — photos render as image
tiles, not glyph tiles.)

---

## Part 2 · #2 — Split into Photos and Files tabs

Nav order becomes **Updates | Photos | Files | Tasks | Contacts** (Photos before
Files, matching the portal). Split criterion = `isImageAttachment`, identical to the
portal.

### Photos tab (image-related, write-enabled)

- **Photo uploader** — a `UploadForm` variant with **no category picker**; it records
  with a fixed `category="photo"` and uses `accept="image/*"`.
- `PortfolioSlots` (cover/hero/before/after assignment).
- Image grid: attachments where `isImageAttachment(a)` is true, each with its
  `PhaseControl` (before/during/after) and share toggle (the existing tile UI).

### Files tab (document-related, write-enabled)

- **File uploader** — `UploadForm` with the category dropdown (revised, alpha-sorted).
- `LinkForm` (with the category dropdown).
- Non-image attachments (`!isImageAttachment(a)`), grouped by category via
  `groupAttachmentsByType`, with share toggle. (Photo-`phase` control is not shown
  here — files aren't phased.)

### UploadForm change

Add an optional `fixedCategory?: string` prop. When set, the component hides the
category `<select>` and submits that fixed value (skipping the "Pick a category"
guard); the Photos tab passes `fixedCategory="photo"`. When unset, behavior is
unchanged (dropdown required) for the Files tab. `recordAttachment` already accepts
`category: string` and only needs the `photo` constraint value to exist (Part 1).

### Empty states

Each tab shows its own empty state when it has no items (Photos: no photos yet;
Files: no files yet), replacing the single combined empty state.

---

## Build order

1. **Part 1 migration + data-layer sort + glyph map** — the `photo` constraint value
   must exist before the Photos uploader can record with it.
2. **Part 2 UI split** — restructure the page into two tabs; add the `fixedCategory`
   uploader variant.

## Testing

- **Unit** (Vitest): if a pure category-sort or image/file partition helper is
  extracted, test it; otherwise rely on the existing `attachments.test.ts`
  (`groupAttachmentsByType`) and `portfolio.test.ts` (`isImageAttachment`).
- **Live** (Chrome MCP): upload a photo via the Photos tab (no category prompt) →
  lands in Photos; upload a file via the Files tab (category required) → lands in
  Files grouped by category; the category dropdown shows Surveys/Designs/Contracts,
  alpha-sorted, with no Before/After photo entries; the customer portal Photos/Files
  tabs still render correctly.

## Rollout

- One migration (constraint + `file_categories` data). Deferred to a **cutover gate**
  like Cycle A: author/commit during the build using the un-generic-typed client (no
  `database.types.ts` edit needed for these changes), then `supabase db push` +
  canonical `gen types` + deploy + live verify as one deliberate maintainer-run step.
- Gates before commit: `npm test` + `npm run build`.

## Resolved decisions

| Decision | Choice |
|---|---|
| Split depth | Full split, mirroring the portal (`isImageAttachment`) |
| Photo categorization | None — fixed `category="photo"` placeholder, no picker |
| `category` nullability | Unchanged (stays NOT NULL); `photo` added to CHECK |
| Contract label | Pluralize to "Contracts" (label only; key stays `contract`) |
| Before/After photo rows | Deleted from `file_categories` (dropdown); kept valid in CHECK for legacy |
| Dropdown order | Alphabetical by label (via query `.order("label")`) |
| New categories | Surveys, Designs (all orgs) |
| Nav order | Updates \| Photos \| Files \| Tasks \| Contacts |
| Existing attachments | No data migration; split by mime type |
