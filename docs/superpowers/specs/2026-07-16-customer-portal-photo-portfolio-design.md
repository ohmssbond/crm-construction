# Design: Customer Portal — Photo Project Portfolio

**Date:** 2026-07-16
**Status:** Design — pending user review
**Scope approach:** A (one cohesive spec, built bottom-up in dependency order)
**Design source:** `~/Desktop/design_handoff_customer_project_portfolio/` (README + 3 screenshots + `.dc.html` references). High-fidelity; treat hex/layout numbers as real targets. Photos in the mockups are placeholders.

---

## Goal

Make the customer portal visually engaging by leading with **photos of the customer's project** (before / during / after). Turn the text-first `My Projects` list and project-detail page into a photo-driven experience where a customer sees status and progress at a glance.

This is a **two-sided feature**: a contractor-side tagging surface (so real photos get roles) plus the portal-side visual redesign that consumes it. Built in dependency order: **data model → contractor tagging → portal redesign.**

## Decisions locked during brainstorming

1. **Curation:** contractor **manually tags** photos; the portal displays the curation.
2. **Granularity:** **four explicit headline slots** per project (cover, hero/current, before, after) **plus** a per-photo `phase` (before/during/after) driving the gallery.
3. **Empty states:** always **photo-led layout** with **branded placeholders** (tenant-accent gradient + project monogram) filling empty slots; photo-dependent elements (before→after strip, gallery groups) appear only once populated.
4. **Tab IA:** split into **Updates / Photos / Files / Tasks** (Photos = phase-grouped gallery; Files = docs & links).
5. **Sharing:** tagging a photo (slot, phase, or update-photo) **auto-shares** it (`is_shared = true`); the portal only ever reads shared rows.
6. **Contractor surface:** extend the **existing artisan project-detail** page (no new route); a dedicated "Customer portfolio" slots panel + per-tile phase picker.
7. **Branding:** the design's teal resolves to each **tenant's accent** (per-tenant), not hardcoded.
8. **Responsive:** build in mobile-friendly collapse (mockups are desktop-only).

---

## Section 1 — Data model & sharing

One migration, reusing the existing `attachments` table + `project-files` storage bucket + existing RLS.

**1. Per-photo phase** — add to `attachments`:
- `phase text` nullable, `check (phase is null or phase in ('before','during','after'))`. Null = untagged/general. Only surfaced for image mime; non-image files ignore it. Drives the Photos gallery grouping.

**2. Four headline slots** — add to `projects`, each nullable FK `references attachments(id) on delete set null`:
- `cover_attachment_id` — list-card cover
- `hero_attachment_id` — detail hero ("current progress")
- `before_attachment_id`, `after_attachment_id` — the before→after strip

`on delete set null` clears any slot when its photo is deleted (no dangling refs → slot falls back to the branded placeholder). Slots may point at the same or different photos. Chosen over a normalized `project_photo_roles` join table because the role set is fixed at exactly four — plain FK columns are simpler to query and read.

**3. Photo on an update** — add `photo_attachment_id uuid` nullable FK (`on delete set null`) to the updates/posts table, so an update can lead with one shared photo.

**Sharing rule (portal invariant, unchanged + defensive):** the portal reads **only `is_shared` attachments**. Slots + phase are pure curation metadata. The portal loader resolves a slot to its attachment **only if that attachment is shared AND an image**; otherwise it renders the `BrandedPlaceholder`. So a private photo can never leak via tagging, and the gallery groups only shared images. Contractor tagging auto-sets `is_shared = true` (decision 5).

**RLS:** no new policies. New columns inherit their tables' existing policies — a contact who can read an attached project row can read its slot IDs and resolve each via the existing `attachments` contact-read (shared-only) policy. All **write** actions run under the existing artisan project-write scope. Migration regenerates `database.types.ts`.

**Schema names to confirm at implementation start** (blocked from reading source during design — see Environment note): exact updates/posts table name (`project_updates`? `updates`?), current `attachments` column names (`is_shared`, `mime`, `kind`, `category` assumed), and the `Stage` enum values for status mapping.

---

## Section 2 — Contractor tagging UI

Lives inside the **existing artisan project-detail page**, extending the current Photos & Files area (direct-to-Storage upload, signed-URL tiles, per-photo share toggle already exist). No new route.

**Phase — per-photo control.** Each image tile gains a small **Before / During / After / —** picker. Action `setPhotoPhase(projectId, attachmentId, phase|null)`.

**Headline slots — "Customer portfolio" panel.** A compact panel on the artisan project page showing the four named slots (**Cover / Hero (current) / Before / After**), each rendering its current thumbnail (or empty state) with a picker to choose from the project's photos or clear it. One legible surface for "which four photos headline the customer's view." Action `setProjectPhotoSlot(projectId, slot, attachmentId|null)` where `slot ∈ {cover,hero,before,after}`.

**Photo on an update.** The existing update Composer gains an optional **"Add photo"** picker (choose from the project's images). Sets `photo_attachment_id`.

**Auto-share coupling:** setting a slot, tagging a phase, or attaching a photo to an update sets `is_shared = true`. The existing share toggle still lets the contractor pull a photo back (portal then falls back to placeholder).

**Validation (in each server action, under existing artisan write RLS):**
- Only image attachments are taggable (phase / slot / update-photo).
- The attachment must belong to the same project (no cross-project assignment).
- Clearing (`null`) is always allowed.

Follows the established pattern: bind server action in the server page → client component calls it in `useTransition`. New client components: `PhaseControl` (per tile), `PortfolioSlots` (panel), update-composer photo picker.

---

## Section 3 — Portal redesign (customer-facing)

Every "teal" resolves to the tenant accent via `getPortalContext`.

**My Projects list → card grid.** Replaces `ListRow` with a responsive grid of **`ProjectCard`** (150px cover or `BrandedPlaceholder`, name + `StatusBadge` + customer name). Grid `repeat(3,1fr)` desktop, collapsing **3→2→1** on narrower widths. Keeps the existing welcome line.

**Project detail → photo-led page** with back link + four tabs:
- **`ProjectHero`** (280px, scales down on mobile): hero photo or `BrandedPlaceholder`; project name in a white pill + `StatusBadge` overlaid bottom-left.
- **`BeforeAfterStrip`**: two 50% panels — rendered **only when both** before + after slots resolve to shared images; otherwise hidden.
- **Tabs (`Updates / Photos / Files / Tasks`)** — local client state, tenant-accent underline on active (no route change).
  - **Updates:** feed of **`UpdateCard`** (max-w 640) — optional 160px top photo + title + date + body. Shared updates only.
  - **Photos:** **`PhotoGallery`** — Before / During / After groups (uppercase labels), each a grid (~5 cols desktop → 3→2 mobile), 110px thumbs. Only non-empty groups render; empty tab → "No photos shared yet." Thumbnail click opens the full signed-URL image (lightbox deferred).
  - **Files:** **`FilesList`** — shared non-image attachments (docs, links) as rows.
  - **Tasks:** existing read-only tasks, restyled to the design's checkbox rows.

**Shared primitives:**
- **`StatusBadge`** — maps `project.stage` → Active / Proposal / Completed / On Hold. *Active* uses the tenant-accent tint; Proposal (amber `#916a1a`/`#faf1de`), Completed (muted-green `#3f6f74`/`#e8f0ef`), On Hold (neutral `#6b675e`/`#ece9e3`) use fixed palettes.
- **`BrandedPlaceholder`** — tenant-accent gradient + project monogram; fallback for any empty cover/hero/thumbnail.

**Data flow (loaders — read-only, cost-free).** Extend `listPortalProjects` + the portal detail loader to: resolve slot IDs → signed URLs (if shared & image, else placeholder), group gallery photos by `phase`, attach each update's optional photo, and split shared attachments into images (gallery) vs. non-images (Files). Reuses `withAttachmentUrls`. Portal keeps reading only `is_shared` rows — isolation unchanged.

**Branding & shell:** unchanged sidebar (already tenant-branded, "Customer portal" label). Single-project customers still see the grid (one card) — no auto-open.

---

## Section 4 — Status mapping, testing, migration & verification

### Status → badge mapping
Map the existing `projects.stage` values to the four design statuses + palettes above. Exact `Stage` values TBD at implementation start (reconcile with `src/components/ui/Chip.tsx`'s `Stage` type). `StatusBadge` supersedes/extends the existing `StageChip` for portal surfaces; keep `StageChip` where artisan surfaces still use it, or unify if trivial.

### Empty / error states
- No cover → `BrandedPlaceholder` on the card.
- No hero → `BrandedPlaceholder` hero (name/status overlay still shows).
- Missing before OR after → strip hidden.
- Empty phase group → hidden; all-empty Photos tab → "No photos shared yet."
- Zero-photo project → placeholder hero, no strip, empty Photos tab; Updates/Files/Tasks as available.
- Zero-project customer → existing empty state.
- Slot pointing at an unshared/deleted photo → placeholder (defensive).

### Testing (Vitest, mirroring `worktime.ts`/`format.ts` test style)
Pure transforms (unit):
- `groupPhotosByPhase` — buckets shared images into before/during/after; omits empty groups.
- Slot resolution → `{ url } | placeholder` (unshared/non-image/missing → placeholder).
- `stageToStatus` mapping (stage → label + palette).
- Update shaping with/without photo.
- `beforeAfterVisible` (true only when both resolve).
Authz / isolation:
- Contact sees only shared photos; unshared slot photo → placeholder.
- `setProjectPhotoSlot` rejects a cross-project attachment and a non-image.
- Direct URL to a non-attached project still 404s.
Gates: `npm test` + `npm run build` green before merge.

### Migration & rollout
- Single migration under `supabase/migrations/` adding the columns above + regenerating `database.types.ts`. Authored-not-applied until cutover.
- Cutover: `supabase db push` (writes prod DB) + Vercel deploy + live verification.
- Purely additive, nullable columns → no backfill, no breaking change. Existing projects render entirely via placeholders until photos are tagged.

### Verification (post-deploy, live browser)
- Contractor: upload → tag phase → set all four slots → attach a photo to an update.
- Customer (contact login, e.g. J Huber's Gretchen Woodard `doug+2heathst@…`): list grid shows cover; detail shows hero + before→after strip; Photos tab grouped; Updates card shows photo; Files tab lists docs; a project with no photos shows clean placeholders (not broken).
- Isolation: private photo never appears in the portal.

---

## Out of scope / deferred
- Lightbox / carousel for gallery thumbnails (click opens full image for now).
- Tab deep-linking via `?tab=` (local state only).
- Bulk photo tagging / drag-reorder of gallery.
- Auto-derived phases or AI photo classification (curation is fully manual).
- Video attachments.

## Environment note (blocker for implementation)
During design, Bash access to the project path under `~/Documents` began returning `Operation not permitted` (macOS Full Disk Access / TCC revoked mid-session; harness Write tool still works, but `git`, `npm`, `supabase`, and file reads via shell are blocked). **Full Disk Access must be restored to the terminal/app running Claude Code before implementation** — the plan needs git, tests, build, and `supabase db push`. The schema-name reconciliations flagged above also depend on reading source once access returns.
