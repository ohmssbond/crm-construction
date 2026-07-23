# Enhancements backlog

Small, low-risk polish items to batch into a future build. Each item notes the
exact location and change so it can be picked up cold.

## Open

### 1. Thumbnails for worker + T&B photos
- **Why:** Cycle C added transformed thumbnails (`/render/image/`, 600px,
  `resize:contain`) for portal + artisan photos via `withAttachmentUrls`, but the
  **worker** and **Time & Billing** photo views were deliberately out of scope —
  they sign their own URLs from a *different* bucket (`job-files`) and still serve
  full-resolution originals.
- **Where the signing lives (no transform today):**
  - `src/lib/data/worker.ts:120` — `createSignedUrls("job-files", …)`.
  - `src/lib/data/tb-report.ts:56` — `createSignedUrls("job-files", …)`.
- **Where they render (raw `<img>`, already `loading="lazy"`):**
  - `src/app/(worker)/log/PhotosControl.tsx:125`, `WorkerHistory.tsx:87`.
  - `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx:106`.
- **Change:** apply the Cycle C pattern — sign a per-image 600px thumbnail
  (`resize:"contain"`, quality 60) for the grid tiles and keep the full-res URL for
  the click-through `<a>`. NOTE: `signImageVariant` (`src/lib/data/attachments.ts`)
  is hardcoded to `BUCKET = "project-files"`; generalize it to take a bucket arg (or
  add a `job-files` sibling) since worker/T&B use `job-files`.
- **Scope:** two signing functions + three render sites; mirrors Cycle C.

### 2. Real image thumbnails in the artisan Photos tab
- **Why:** the artisan project **Photos** tab still shows **glyph tiles**
  (`FileTile` — a colored box with 🖼), not actual image previews — a deliberate
  scope boundary from Cycle B. The thumbnail infra now exists, so it can show real
  previews.
- **Where:** `src/app/(artisan)/projects/[id]/page.tsx` — the Photos tab's image
  grid maps `imageAttachments` to `<FileTile glyph="🖼" …>`. The attachments already
  carry `a.thumbHref` (Cycle C). Swap the glyph tile for an actual
  `<img loading="lazy" src={a.thumbHref ?? a.href} className="object-cover">`
  (keeping the share toggle + `PhaseControl`). Likely a small dedicated photo-tile,
  or extend `FileTile` (`src/components/ui/FileTile.tsx`) to render an image preview
  when handed one.
- **Scope:** artisan-only UI; no data/DB change (thumbHref already flows through).

### 3. Bound the thumbnail-signing concurrency
- **Why:** `withAttachmentUrls` (`src/lib/data/attachments.ts`) signs thumbnails
  with an **unbounded** `Promise.all(files.filter(isImageAttachment).map(…))` — one
  Storage round-trip per image. Fine for today's modest galleries (a handful to a
  few dozen), but a 100+-image gallery fires 100+ simultaneous requests on one
  render (rate-limit / tail-latency risk). A code comment already flags this.
- **Change:** cap concurrency (chunk into batches of ~10, or a small `p-limit`).
  **Do this before** galleries grow large or before item 1 copies the technique to
  worker/T&B.
- **Scope:** one helper; no behavior change beyond throttling.

## Done

- **Portal "Your Project Team" grouped roster** — replaced the rep-only
  point-of-contact card with a Tenant / Partners / Customer roster via a new
  `portal_project_team` RPC. Shipped **Cycle A**, PR #2 (merge `10732cb`). Later laid
  out in 3 columns (PR #3, merge `538b881`).
- **Company field on contacts** — partners-only `contacts.company`. Shipped
  **Cycle A**, PR #2.
- **Split "Photos & Files" into two tabs** — artisan project view now has separate
  Photos + Files tabs (mirrors the portal's `isImageAttachment` split). Shipped
  **Cycle B**, PR #4 (merge `9bddf25`).
- **Revise the file-type list** — added Surveys/Designs, Contract→Contracts, retired
  Before/After from the dropdown (soft-delete via `archived_at`), alpha-sorted;
  construction-orgs-only. Shipped **Cycle B**, PR #4. (Category validity is a per-org
  FK to `file_categories`, not a table-wide CHECK.)
- **Faster photo loading** — lazy-loading (PR #5) + Supabase-transform thumbnails
  (600px grids / 1400px hero, `resize:contain`) for portal + artisan. Shipped
  **Cycle C**, PRs #5/#6/#7.
