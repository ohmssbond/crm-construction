# Cycle C — Image Thumbnails (Portal + Artisan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve right-sized transformed images (thumbnails for grids, a sized hero) via Supabase Storage image transformations, instead of full-resolution originals, across the customer portal and the artisan project view.

**Architecture:** Add a `thumbHref` (600px) to the shared `withAttachmentUrls` signing helper (images only, signed per-image since batch signing ignores transforms). Display-only sites receive a transformed URL from the data layer in their existing prop (no component change); the one click-through gallery (`PhotoGallery`) takes both a thumb and the full URL. The portal hero gets its own larger size (1400px). **No DB change — no migration, no cutover gate; ships as a normal merge/deploy.**

**Tech Stack:** Next.js 16 (App Router), Supabase Storage image transformations (confirmed available on this project — transformed requests return 200 via `/render/image/`), Vitest.

## Global Constraints

- **Not the Next.js you know** — read `node_modules/next/dist/docs/` before writing framework code; heed deprecation notices (per `AGENTS.md`).
- **Transform sizes:** grid/tile thumbnails = `{ width: 600, quality: 60 }`; portal hero = `{ width: 1400, quality: 65 }`. Full-resolution original kept for click-through / lightbox.
- **Batch signing ignores transforms** — thumbnails MUST use per-image `createSignedUrl(path, ttl, { transform })` (verified). Full URLs stay batched.
- **`thumbHref` is images only** (`isImageAttachment`), `null` otherwise; the full `href` is unchanged from today. Every render site falls back to `href` when `thumbHref` is null.
- **No `next/image`** — Supabase transforms already resize + serve modern formats, and signed URLs rotate hourly (which fights next/image caching). Plain `<img>` + transform URLs.
- **Scope:** portal + artisan (the `withAttachmentUrls` / `project-files` surfaces) only. Worker + T&B sign separately (`worker.ts` / `tb-report.ts`, `job-files` bucket) — a deliberate follow-up, not this cycle.
- **Gates before commit:** `npm test` + `npm run build`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- Modify: `src/lib/data/attachments.ts` — `withAttachmentUrls` returns `thumbHref`; add `signImageVariant` helper.
- Test: `src/lib/data/attachments.test.ts` — add `withAttachmentUrls` tests (new).
- Modify: `src/lib/data/portfolio.ts` — `Resolved` + `resolveSlot` + `GalleryItem` carry `thumbHref`.
- Modify: `src/lib/data/portal.ts` — `getPortalProject` (hero 1400 / before-after / gallery / update thumbs), `listPortalProjects` (cover thumb).
- Modify: `src/components/portal/PhotoGallery.tsx` — thumb for the tile, full URL for the click-through `<a>`.
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` — `imagePhotos` carries the thumb URL for the portfolio-slot previews.

---

### Task 1: `withAttachmentUrls` — add `thumbHref` + `signImageVariant` (TDD)

**Files:**
- Modify: `src/lib/data/attachments.ts`
- Test: `src/lib/data/attachments.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // AttachmentRef gains mime_type (needed to decide images)
  type AttachmentRef = { kind: string; url: string | null; storage_path: string | null; mime_type: string | null };
  export async function signImageVariant(
    supabase: SupabaseClient, storagePath: string, transform: { width: number; quality: number }
  ): Promise<string | null>;
  export async function withAttachmentUrls<T extends AttachmentRef>(
    supabase: SupabaseClient, rows: T[]
  ): Promise<(T & { href: string | null; thumbHref: string | null })[]>;
  ```
  `thumbHref` = a 600px transformed signed URL for image files, else `null`. `href` unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/data/attachments.test.ts` (keep the existing `groupAttachmentsByType` tests):

```ts
import { withAttachmentUrls } from "./attachments";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal storage stub: batch returns signed[path]; single (transform) returns thumbs[path].
function fakeSupabase(signed: Record<string, string>, thumbs: Record<string, string>) {
  return {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: signed[p] ?? null })),
        }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: thumbs[path] ?? null },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("withAttachmentUrls", () => {
  const rows = [
    { id: "img", kind: "file", url: null, storage_path: "p/img.jpg", mime_type: "image/jpeg" },
    { id: "doc", kind: "file", url: null, storage_path: "p/doc.pdf", mime_type: "application/pdf" },
    { id: "lnk", kind: "link", url: "https://x.test/d", storage_path: null, mime_type: null },
  ];

  test("image files get both a full href and a thumbHref", async () => {
    const supa = fakeSupabase(
      { "p/img.jpg": "FULL_IMG", "p/doc.pdf": "FULL_DOC" },
      { "p/img.jpg": "THUMB_IMG" }
    );
    const out = await withAttachmentUrls(supa, rows);
    const img = out.find((r) => r.id === "img")!;
    expect(img.href).toBe("FULL_IMG");
    expect(img.thumbHref).toBe("THUMB_IMG");
  });

  test("non-image files get a full href but no thumbHref", async () => {
    const supa = fakeSupabase({ "p/img.jpg": "FULL_IMG", "p/doc.pdf": "FULL_DOC" }, { "p/img.jpg": "THUMB_IMG" });
    const out = await withAttachmentUrls(supa, rows);
    const doc = out.find((r) => r.id === "doc")!;
    expect(doc.href).toBe("FULL_DOC");
    expect(doc.thumbHref).toBeNull();
  });

  test("links keep their url as href and have no thumbHref", async () => {
    const supa = fakeSupabase({}, {});
    const out = await withAttachmentUrls(supa, rows);
    const lnk = out.find((r) => r.id === "lnk")!;
    expect(lnk.href).toBe("https://x.test/d");
    expect(lnk.thumbHref).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/attachments.test.ts`
Expected: FAIL — `withAttachmentUrls` doesn't return `thumbHref` / the field is undefined.

- [ ] **Step 3: Implement**

In `src/lib/data/attachments.ts`, add the `isImageAttachment` import and rewrite the helper. Replace the current `AttachmentRef` type and `withAttachmentUrls` function with:

```ts
import { isImageAttachment } from "./portfolio";

type AttachmentRef = {
  kind: string;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
};

const THUMB = { width: 600, quality: 60 };

/** Sign a single transformed (resized) image variant — /render/image/ URL. */
export async function signImageVariant(
  supabase: SupabaseClient,
  storagePath: string,
  transform: { width: number; quality: number }
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL, { transform });
  return data?.signedUrl ?? null;
}

/**
 * Resolves a viewable `href` (raw URL for links, batched full-res signed URL for
 * files) and, for image files, a small `thumbHref` (600px transformed URL) for
 * grids/tiles. Full URLs are signed in one batch; thumbnails are signed per-image
 * because the batch endpoint ignores the transform option.
 */
export async function withAttachmentUrls<T extends AttachmentRef>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<(T & { href: string | null; thumbHref: string | null })[]> {
  const files = rows.filter((r) => r.kind === "file" && r.storage_path);
  const filePaths = files.map((r) => r.storage_path as string);

  const signed: Record<string, string> = {};
  if (filePaths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(filePaths, SIGNED_URL_TTL);
    data?.forEach((s) => {
      if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
    });
  }

  const thumbs: Record<string, string> = {};
  await Promise.all(
    files.filter(isImageAttachment).map(async (r) => {
      const path = r.storage_path as string;
      const url = await signImageVariant(supabase, path, THUMB);
      if (url) thumbs[path] = url;
    })
  );

  return rows.map((r) => ({
    ...r,
    href: r.kind === "link" ? r.url : r.storage_path ? (signed[r.storage_path] ?? null) : null,
    thumbHref:
      r.kind === "file" && r.storage_path ? (thumbs[r.storage_path] ?? null) : null,
  }));
}
```

(Keep the existing `BUCKET`, `SIGNED_URL_TTL`, and `groupAttachmentsByType` below unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/attachments.test.ts`
Expected: PASS (3 new tests + existing `groupAttachmentsByType` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/attachments.ts src/lib/data/attachments.test.ts
git commit -m "feat(images): withAttachmentUrls returns a 600px thumbHref for images

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Portal — thread thumbnails through the data layer + gallery

**Files:**
- Modify: `src/lib/data/portfolio.ts` (`Resolved`, `resolveSlot`, `GalleryItem`)
- Modify: `src/lib/data/portal.ts` (`getPortalProject`, `listPortalProjects`)
- Modify: `src/components/portal/PhotoGallery.tsx`

**Interfaces:**
- Consumes: `withAttachmentUrls` `thumbHref` + `signImageVariant` (Task 1).
- Produces: portal hero (1400px), cover/before-after/update/gallery-tile (600px) served as transformed URLs; gallery click-through keeps the full original.

- [ ] **Step 1: Carry `thumbHref` through `portfolio.ts`**

In `src/lib/data/portfolio.ts`:

Change `Resolved` (line 29):

```ts
export type Resolved = { href: string; thumbHref: string | null };
```

Change `resolveSlot` (lines 36-44) to accept and return `thumbHref`:

```ts
export function resolveSlot(
  attachmentId: string | null,
  sharedImagesById: Map<string, { href: string | null; thumbHref: string | null }>
): Resolved | null {
  if (!attachmentId) return null;
  const a = sharedImagesById.get(attachmentId);
  if (!a || !a.href) return null;
  return { href: a.href, thumbHref: a.thumbHref };
}
```

Change `GalleryItem` (line 51):

```ts
export type GalleryItem = { id: string; href: string | null; thumbHref: string | null; phase: string | null };
```

- [ ] **Step 1b: Update `portfolio.test.ts` for the new `thumbHref` field**

The `resolveSlot`, `beforeAfterVisible`, and `groupPhotosByPhase` tests pass `Resolved`/`GalleryItem` literals that now need `thumbHref`. In `src/lib/data/portfolio.test.ts`:

`resolveSlot` describe (the `map` and the assertion):

```ts
  const map = new Map([
    ["a", { href: "https://signed/a", thumbHref: "https://signed/a-thumb" }],
    ["b", { href: null, thumbHref: null }],
  ]);
  test("resolves a shared image with an href", () => {
    expect(resolveSlot("a", map)).toEqual({ href: "https://signed/a", thumbHref: "https://signed/a-thumb" });
  });
```

`beforeAfterVisible` (the `Resolved` literals — the `null` args stay as-is):

```ts
    expect(beforeAfterVisible({ href: "x", thumbHref: null }, { href: "y", thumbHref: null })).toBe(true);
    expect(beforeAfterVisible({ href: "x", thumbHref: null }, null)).toBe(false);
    expect(beforeAfterVisible(null, null)).toBe(false);
```

`groupPhotosByPhase` items (add `thumbHref: null` to each):

```ts
    const groups = groupPhotosByPhase([
      { id: "1", href: "h1", thumbHref: null, phase: "after" },
      { id: "2", href: "h2", thumbHref: null, phase: "before" },
      { id: "3", href: "h3", thumbHref: null, phase: null },
      { id: "4", href: "h4", thumbHref: null, phase: "before" },
    ]);
```

Run: `npx vitest run src/lib/data/portfolio.test.ts` → PASS.

- [ ] **Step 2: Produce transformed URLs in `getPortalProject`**

In `src/lib/data/portal.ts`, add the `signImageVariant` import to the existing `./attachments` import line:

```ts
import { withAttachmentUrls, signImageVariant } from "./attachments";
```

Update `sharedImagesById` (currently `new Map(images.map((a) => [a.id, { href: a.href }]))`) to carry the thumb:

```ts
  const sharedImagesById = new Map(
    images.map((a) => [a.id, { href: a.href, thumbHref: a.thumbHref }])
  );
```

Resolve the slots, then re-sign the hero at 1400px (the hero is the one large above-the-fold image). Replace the `cover`/`hero`/`before`/`after` block (currently lines ~160-163):

```ts
  const cover = resolveSlot(project.cover_attachment_id, sharedImagesById);
  const heroSlot = resolveSlot(project.hero_attachment_id, sharedImagesById);
  const beforeSlot = resolveSlot(project.before_attachment_id, sharedImagesById);
  const afterSlot = resolveSlot(project.after_attachment_id, sharedImagesById);

  // Hero: a dedicated larger transform (it fills a wide banner). Falls back to the
  // slot's full href if the variant sign fails. resolveSlot already enforced the
  // shared/isolation guard, so the storage_path lookup is safe.
  let hero = heroSlot;
  if (heroSlot && project.hero_attachment_id) {
    const heroImg = images.find((a) => a.id === project.hero_attachment_id);
    if (heroImg?.storage_path) {
      const big = await signImageVariant(supabase, heroImg.storage_path, { width: 1400, quality: 65 });
      if (big) hero = { href: big, thumbHref: heroSlot.thumbHref };
    }
  }

  // Before/After strip is display-only → hand it the 600px thumb.
  const before = beforeSlot ? { href: beforeSlot.thumbHref ?? beforeSlot.href, thumbHref: beforeSlot.thumbHref } : null;
  const after = afterSlot ? { href: afterSlot.thumbHref ?? afterSlot.href, thumbHref: afterSlot.thumbHref } : null;
```

Update the `gallery` mapping (currently `images.map((a) => ({ id: a.id, href: a.href, phase: a.phase }))`) to carry the thumb:

```ts
  const gallery = groupPhotosByPhase(
    images.map((a) => ({ id: a.id, href: a.href, thumbHref: a.thumbHref, phase: a.phase }))
  );
```

Update `shapedUpdates` (the `photoHref` line, currently `sharedImagesById.get(u.photo_attachment_id)?.href ?? null`) to prefer the thumb (update photos are display-only in a feed):

```ts
    photoHref: u.photo_attachment_id
      ? (sharedImagesById.get(u.photo_attachment_id)?.thumbHref ??
         sharedImagesById.get(u.photo_attachment_id)?.href ??
         null)
      : null,
```

(The `beforeAfter: beforeAfterVisible(before, after)` return line still works — `before`/`after` are non-null when both resolve.)

- [ ] **Step 3: Cover thumbnail in `listPortalProjects`**

In `src/lib/data/portal.ts`, `listPortalProjects` builds `coverById` and resolves `coverHref`. Update the map to carry the thumb and the `coverHref` to prefer it:

The `coverById` population (currently `signed.forEach((a) => coverById.set(a.id, { href: a.href }))`) →

```ts
    signed.forEach((a) => coverById.set(a.id, { href: a.href, thumbHref: a.thumbHref }));
```

And the returned `coverHref` (currently `resolveSlot(p.cover_attachment_id, coverById)?.href ?? null`) →

```ts
    coverHref: (() => {
      const c = resolveSlot(p.cover_attachment_id, coverById);
      return c ? (c.thumbHref ?? c.href) : null;
    })(),
```

(`coverById`'s type annotation, if present as `Map<string, { href: string | null }>`, becomes `Map<string, { href: string | null; thumbHref: string | null }>`.)

- [ ] **Step 4: `PhotoGallery` — thumb for the tile, full for the click-through**

In `src/components/portal/PhotoGallery.tsx`, widen the item type and use `thumbHref` for the `<img>` while the `<a>` keeps the full `href`:

Change the `groups` prop item type:

```tsx
  groups: { key: string; label: string; items: { id: string; href: string | null; thumbHref: string | null }[] }[];
```

Change the tile (the `<a href={img.href}>` wrapping the `<img src={img.href}>`) so the link opens the full image but the tile shows the thumb:

```tsx
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
                  <img loading="lazy" src={img.thumbHref ?? img.href} alt="" className="w-full h-full object-cover" />
                </a>
              ) : null
            )}
```

- [ ] **Step 5: Test + build**

Run: `npm test`
Expected: PASS (incl. updated `portfolio.test.ts` and the Task 1 `attachments.test.ts`).
Run: `npm run build`
Expected: build succeeds (types line up: `Resolved`/`GalleryItem`/`sharedImagesById`/`coverById` all carry `thumbHref`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/portfolio.ts src/lib/data/portfolio.test.ts src/lib/data/portal.ts src/components/portal/PhotoGallery.tsx
git commit -m "feat(images): serve transformed thumbnails across the customer portal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Artisan — thumbnails in the portfolio-slot previews

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (the `imagePhotos` derivation)

**Interfaces:**
- Consumes: `attachments[].thumbHref` (Task 1, via `getProjectDetail` → `withAttachmentUrls`).
- Produces: the artisan `PortfolioSlots` previews render 600px thumbs.

- [ ] **Step 1: Point `imagePhotos` at the thumb**

In `src/app/(artisan)/projects/[id]/page.tsx`, the `imagePhotos` derivation maps image attachments to `{ id, filename, href }`. `PortfolioSlots` shows these as small preview tiles (display-only, no click-through), so hand it the thumb in `href`:

```tsx
  const imagePhotos = imageAttachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    href: a.thumbHref ?? a.href,
  }));
```

(`imageAttachments` already exists from Cycle B. `PortfolioSlots`'s `PhotoPick` shape is unchanged — it just receives a smaller URL. The Files-tab file tiles are glyphs, unaffected.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(images): use thumbnails for artisan portfolio-slot previews

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verification (live)

**Files:** none.

- [ ] **Step 1: Final gates**

Run: `npm test` → PASS (incl. the new `withAttachmentUrls` tests).
Run: `npm run build` → succeeds.

- [ ] **Step 2: Live checks (dev server or preview + Chrome MCP)**

On a project with shared photos:
- **Portal gallery:** open a customer portal project → the Photos grid tiles load transformed images. In the network panel, the grid image requests hit `/render/image/…&width=600…` and are tens of KB (not the multi-MB originals). Clicking a tile opens the **full-resolution** original in a new tab.
- **Hero:** the project hero loads a `/render/image/…&width=1400…` URL (not the original).
- **Cover cards / Before-After / update photos:** load transformed URLs (600px).
- **Artisan:** the project "Customer portfolio" slot previews load 600px thumbs.
- Confirm no broken images (fallback to `href` works where a thumb is absent).

Report results with the observed URLs / sizes. Do not claim success without evidence.

---

## Notes for the executor

- **No migration / no cutover.** This is pure code; it ships as a normal PR → merge → deploy. Dev hits the same remote Supabase, so transforms work locally — verify before merge.
- **Rule of thumb for each site:** display-only sites (hero, cover, before/after, update photo, portfolio preview) receive the transformed URL from the data layer in their existing prop — no component change. The click-through gallery (`PhotoGallery`) is the only component that needs both a thumb (tile) and the full URL (its `<a>`).
- **Hero is the only 1400px case**; everything else is the 600px `thumbHref` from `withAttachmentUrls`.
- Worker + T&B (`job-files` bucket, separate signing in `worker.ts`/`tb-report.ts`) are intentionally out of scope — a follow-up applying the same `signImageVariant` technique there.
