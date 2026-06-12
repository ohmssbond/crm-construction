# Photos & Files — grouped by type, ordered by upload date

_Design spec · 2026-06-12_

## Goal

In the project **Photos & Files** tab, replace the single flat tile grid with
sections grouped by file **type** (category). Within each type, show the most
recently uploaded file first. Apply to both the artisan project page and the
customer portal project page.

## Decisions

| Question | Decision |
|----------|----------|
| Scope | Artisan project page **and** customer portal project page |
| Group ordering | Alphabetical by category **label** (A→Z) |
| Order within a group | Newest upload first (`created_at` descending) |
| External links | Grouped inside their own category, keeping the 🔗 glyph |
| Group header | `Label (count)`, always open — no collapse |
| Empty categories | Hidden — only types with at least one attachment render |
| Whole-tab empty state | Unchanged: shows only when the project has zero attachments |

## Current state

- `src/lib/data/projects.ts` loads attachments with
  `.select("id, filename, category, kind, url, is_shared, storage_path")`
  ordered by `created_at` descending, and also loads `fileCategories`
  (`key, label, sort, icon`) ordered by `sort`.
- `src/lib/data/portal.ts` loads attachments with the same `select`, ordered by
  `created_at` descending, but **does not load `file_categories`** — the portal
  page maps the raw category key to a glyph via a hardcoded `FILE_STYLE` table
  and has no display labels.
- `src/app/(artisan)/projects/[id]/page.tsx` and
  `src/app/(portal)/my-projects/[id]/page.tsx` each render attachments as one
  `attachments.map(...)` grid of `FileTile`s, choosing glyph/background from
  `FILE_STYLE[a.category]` (with a `FILE_FALLBACK`) or the link style.
- `file_categories` already has a `contact_read` RLS policy, so a portal contact
  is permitted to read the labels for orgs whose projects they can see.

## Changes

### 1. Data loaders

**`src/lib/data/projects.ts`**
- Add `created_at` to the attachments `.select(...)` so grouping and ordering are
  explicit on the returned rows. Query order (`created_at` descending) is kept.

**`src/lib/data/portal.ts`**
- Add `created_at` to the attachments `.select(...)`.
- Load `file_categories` for the project's organization (`key, label`), mirroring
  the artisan loader, and return it as `fileCategories` alongside `attachments`.
  RLS (`contact_read`) already permits this read for portal contacts.

### 2. Shared grouping helper

Add a pure function to `src/lib/data/attachments.ts` (next to
`withAttachmentUrls`):

```ts
type Categorized = { category: string };
type CategoryRef = { key: string; label: string };

export function groupAttachmentsByType<T extends Categorized>(
  attachments: T[],
  categories: CategoryRef[]
): { key: string; label: string; items: T[] }[];
```

Behavior:
- Build a group only for categories that appear in `attachments` (empty
  categories are excluded).
- Resolve each group's `label` from `categories` by `key`; if the key is not
  found, fall back to the raw `category` key as the label.
- Preserve the incoming order of `items` within each group — callers pass
  attachments already sorted newest-first, so groups inherit newest-first order.
- Sort the returned groups alphabetically by `label`
  (case-insensitive, locale compare).

The helper is pure and Supabase-free, so it is unit-testable directly. It does
not depend on `href`/signed-url resolution and composes with the output of
`withAttachmentUrls` (which only adds an `href` field).

### 3. UI

Both `src/app/(artisan)/projects/[id]/page.tsx` and
`src/app/(portal)/my-projects/[id]/page.tsx`:
- Compute `groups = groupAttachmentsByType(attachments, fileCategories)`.
- Replace the single `attachments.map(...)` grid with `groups.map(...)`. For each
  group, render a header (`Label` + count) followed by the existing tile grid
  (`grid grid-cols-2 lg:grid-cols-4 gap-3`) over `group.items`.
- Reuse the existing `FileTile`, `FILE_STYLE`/`FILE_FALLBACK`, link-style, and
  glyph/background logic unchanged inside each group.
- Keep the whole-tab `EmptyState` ("No files yet.") for the zero-attachments
  case (i.e. when `attachments.length === 0`).

A small group-header element (label + count) styled to match the existing
section heading treatment on these pages.

The artisan page additionally renders `UploadForm` and `LinkForm` above the
grouped list; those stay exactly where they are.

## Testing

Unit tests for `groupAttachmentsByType`:
- Groups are ordered alphabetically by label.
- Newest-first order within a group is preserved from the input order.
- Categories with no attachments produce no group.
- An attachment whose category is missing from `categories` falls back to the
  raw key as its label and still forms a group.
- A link (`kind === "link"`) is placed in its category's group alongside files.

## Out of scope

- Collapsible/expandable sections.
- Reordering or per-user sort preferences.
- Changes to upload, link, sharing, or category-management flows.
- Any settings UI for file categories.
