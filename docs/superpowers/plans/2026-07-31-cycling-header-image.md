# Cycling Header Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a viewer step through a project's four portfolio slot images (cover, hero, before, after) from the project header, via one arrow on the right of the image, on both the staff page and the customer portal.

**Architecture:** A pure helper orders and labels whatever slots resolved; a shared I/O helper signs all four at header size and replaces the hero-signing block currently duplicated across three loaders; `ProjectHero` becomes a Client Component holding the current index in local state, which is why a reload returns to the hero.

**Tech Stack:** Next.js 16.2.6 (App Router, Server + Client Components), Supabase (Storage image transforms), TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-07-31-cycling-header-image-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data. This change turns a Server Component into a Client Component — read the relevant guide before doing that.
- **No migration, no schema change, no RLS change.** Never run `supabase db push`.
- **Fixed slot order: `cover, hero, before, after`.** The viewer *starts* on the hero, so the sequence opens mid-list and wraps.
- **Empty slots are skipped**, never rendered as placeholders. Fewer than two images → no arrow and no label chip. Zero images → `BrandedPlaceholder`, exactly as today.
- **No hero → start at the first available slot** (index 0 of the filtered list), not the placeholder.
- **Labels, verbatim:** `cover → "Cover"`, `hero → "Current progress"`, `before → "Before"`, `after → "After"`.
- **Header-size transform, verbatim:** `{ width: 1400, quality: 65, resize: "contain" }`. `resize: "contain"` matters — this codebase shipped a bug where the default `cover` with only a width kept the original height and distorted the image.
- **Do not touch the portal's `before` / `after` fields.** They are 600px thumbs feeding the before/after strip, which is display-only and must keep working.
- **Tailwind class strings must be complete literals**, never built by concatenation — a concatenated class compiles, tests, builds, and then fails to render because the scanner never emits it.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (135 passing today). `npm run build` before the final task is called done.

---

### Task 1: `buildHeaderImages` — pure ordering and labeling

**Files:**
- Modify: `src/lib/data/portfolio.ts` (add types + one function)
- Modify: `src/lib/data/portfolio.test.ts` (add a describe block)

**Interfaces:**
- Consumes: nothing.
- Produces — Tasks 2 and 4 depend on these exact names:
  - `type HeaderSlot = "cover" | "hero" | "before" | "after"`
  - `type HeaderImage = { slot: HeaderSlot; label: string; href: string }`
  - `buildHeaderImages(signed: Record<HeaderSlot, string | null>): { images: HeaderImage[]; startIndex: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data/portfolio.test.ts`. Add `buildHeaderImages` to the existing `import { … } from "./portfolio"` statement rather than adding a second import line:

```ts
describe("buildHeaderImages", () => {
  const all = { cover: "C", hero: "H", before: "B", after: "A" };

  test("orders all four slots and starts on the hero", () => {
    const { images, startIndex } = buildHeaderImages(all);
    expect(images.map((i) => i.slot)).toEqual(["cover", "hero", "before", "after"]);
    expect(images.map((i) => i.href)).toEqual(["C", "H", "B", "A"]);
    expect(startIndex).toBe(1);
  });

  test("labels each slot", () => {
    expect(buildHeaderImages(all).images.map((i) => i.label)).toEqual([
      "Cover",
      "Current progress",
      "Before",
      "After",
    ]);
  });

  test("skips unresolved slots and keeps the hero's index correct", () => {
    const { images, startIndex } = buildHeaderImages({
      cover: null,
      hero: "H",
      before: null,
      after: "A",
    });
    expect(images.map((i) => i.slot)).toEqual(["hero", "after"]);
    expect(startIndex).toBe(0);
  });

  test("falls back to the first available slot when there is no hero", () => {
    const { images, startIndex } = buildHeaderImages({
      cover: "C",
      hero: null,
      before: "B",
      after: null,
    });
    expect(images.map((i) => i.slot)).toEqual(["cover", "before"]);
    expect(startIndex).toBe(0);
  });

  test("starts on Before when only before and after resolved", () => {
    const { images, startIndex } = buildHeaderImages({
      cover: null,
      hero: null,
      before: "B",
      after: "A",
    });
    expect(images[startIndex].label).toBe("Before");
  });

  test("returns one image and index 0 when only the hero resolved", () => {
    const { images, startIndex } = buildHeaderImages({
      cover: null,
      hero: "H",
      before: null,
      after: null,
    });
    expect(images).toHaveLength(1);
    expect(startIndex).toBe(0);
  });

  test("returns an empty list when nothing resolved", () => {
    expect(
      buildHeaderImages({ cover: null, hero: null, before: null, after: null })
    ).toEqual({ images: [], startIndex: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/portfolio.test.ts`

Expected: FAIL — `buildHeaderImages is not a function` (or an import error).

- [ ] **Step 3: Implement**

Append to `src/lib/data/portfolio.ts`:

```ts
export type HeaderSlot = "cover" | "hero" | "before" | "after";
export type HeaderImage = { slot: HeaderSlot; label: string; href: string };

/**
 * The header cycles the four portfolio slots in a fixed order, but OPENS on the hero —
 * so the sequence starts mid-list and wraps. Slots that didn't resolve are dropped
 * rather than shown as placeholders, and with no hero the header opens on the first
 * slot that did resolve (showing a placeholder while a real photo sits one click away
 * is worse than showing the photo).
 */
const HEADER_ORDER: { slot: HeaderSlot; label: string }[] = [
  { slot: "cover", label: "Cover" },
  { slot: "hero", label: "Current progress" },
  { slot: "before", label: "Before" },
  { slot: "after", label: "After" },
];

export function buildHeaderImages(signed: Record<HeaderSlot, string | null>): {
  images: HeaderImage[];
  startIndex: number;
} {
  const images = HEADER_ORDER.filter((o) => signed[o.slot]).map((o) => ({
    slot: o.slot,
    label: o.label,
    href: signed[o.slot] as string,
  }));
  const heroIndex = images.findIndex((i) => i.slot === "hero");
  return { images, startIndex: heroIndex === -1 ? 0 : heroIndex };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/portfolio.test.ts`

Expected: PASS — 7 new tests.

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 142 tests pass (135 + 7).

```bash
git add src/lib/data/portfolio.ts src/lib/data/portfolio.test.ts
git commit -m "feat(portfolio): buildHeaderImages orders and labels the header slots"
```

---

### Task 2: `resolveHeaderImages` — the shared signing helper

**Files:**
- Modify: `src/lib/data/attachments.ts` (add one exported function)
- Modify: `src/lib/data/attachments.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `buildHeaderImages`, `HeaderSlot`, `HeaderImage`, `resolveSlot` from `./portfolio` (Task 1); `signImageVariant`, already in this file.
- Produces — Task 3 depends on this exact signature:
  ```ts
  resolveHeaderImages(
    supabase: SupabaseClient,
    slotIds: Record<HeaderSlot, string | null>,
    sharedImagesById: Map<string, { href: string | null; thumbHref: string | null }>,
    signedAttachments: { id: string; storage_path: string | null }[]
  ): Promise<{ images: HeaderImage[]; startIndex: number }>
  ```

`attachments.ts` already imports from `./portfolio` (`isImageAttachment`), and `portfolio.ts` imports nothing from `attachments.ts`, so there is no import cycle.

- [ ] **Step 1: Write the failing tests**

`src/lib/data/attachments.test.ts` already has a `fakeSupabase` stub used for `withAttachmentUrls`. Read it first — you need a stub exposing `storage.from().createSignedUrl(path, ttl, { transform })`, which that helper already models for thumbnails. Append:

```ts
describe("resolveHeaderImages", () => {
  const shared = new Map([
    ["cover-id", { href: "COVER_FULL", thumbHref: "COVER_THUMB" }],
    ["hero-id", { href: "HERO_FULL", thumbHref: "HERO_THUMB" }],
  ]);
  const rows = [
    { id: "cover-id", storage_path: "p/cover.jpg" },
    { id: "hero-id", storage_path: "p/hero.jpg" },
  ];

  test("signs a header-size variant for each resolved slot", async () => {
    const supa = fakeSupabase({}, { "p/cover.jpg": "COVER_BIG", "p/hero.jpg": "HERO_BIG" });
    const out = await resolveHeaderImages(
      supa,
      { cover: "cover-id", hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.href)).toEqual(["COVER_BIG", "HERO_BIG"]);
    expect(out.startIndex).toBe(1);
  });

  test("falls back to the slot's own href when the variant sign fails", async () => {
    const supa = fakeSupabase({}, {});
    const out = await resolveHeaderImages(
      supa,
      { cover: null, hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.href)).toEqual(["HERO_FULL"]);
  });

  test("drops a slot whose id is not in the shared map", async () => {
    const supa = fakeSupabase({}, { "p/hero.jpg": "HERO_BIG" });
    const out = await resolveHeaderImages(
      supa,
      { cover: "not-shared", hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.slot)).toEqual(["hero"]);
  });

  test("returns an empty list when no slot is set", async () => {
    const supa = fakeSupabase({}, {});
    const out = await resolveHeaderImages(
      supa,
      { cover: null, hero: null, before: null, after: null },
      shared,
      rows
    );
    expect(out).toEqual({ images: [], startIndex: 0 });
  });
});
```

If `fakeSupabase`'s current shape does not support these calls, extend the stub — do not weaken the assertions to fit it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/attachments.test.ts`

Expected: FAIL — `resolveHeaderImages is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/data/attachments.ts` (add `resolveSlot`, `buildHeaderImages`, and the two types to the existing `./portfolio` import):

```ts
/** The transform the project header uses — it fills a wide banner. */
const HEADER = { width: 1400, quality: 65, resize: "contain" as const };

/**
 * Resolve and sign all four portfolio slots at header size for the cycling header.
 *
 * Replaces the hero-only signing block that was duplicated across getPortalProject,
 * getProjectPreview, and getProjectDetail. `resolveSlot` runs first so the
 * shared/isolation guard still decides what is visible; only then is a storage_path
 * looked up. A failed variant sign falls back to the slot's own href rather than
 * dropping the image. At most four signs, so they all run concurrently — the batching
 * cap that withAttachmentUrls needs does not apply at this size.
 */
export async function resolveHeaderImages(
  supabase: SupabaseClient,
  slotIds: Record<HeaderSlot, string | null>,
  sharedImagesById: Map<string, { href: string | null; thumbHref: string | null }>,
  signedAttachments: { id: string; storage_path: string | null }[]
): Promise<{ images: HeaderImage[]; startIndex: number }> {
  const slots: HeaderSlot[] = ["cover", "hero", "before", "after"];

  const signedHrefs = await Promise.all(
    slots.map(async (slot) => {
      const id = slotIds[slot];
      const resolved = resolveSlot(id, sharedImagesById);
      if (!resolved) return null;
      const row = signedAttachments.find((a) => a.id === id);
      if (row?.storage_path) {
        const big = await signImageVariant(supabase, row.storage_path, HEADER);
        if (big) return big;
      }
      return resolved.href;
    })
  );

  return buildHeaderImages({
    cover: signedHrefs[0],
    hero: signedHrefs[1],
    before: signedHrefs[2],
    after: signedHrefs[3],
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/attachments.test.ts`

Expected: PASS — 4 new tests.

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 146 tests pass (142 + 4).

```bash
git add src/lib/data/attachments.ts src/lib/data/attachments.test.ts
git commit -m "feat(attachments): resolveHeaderImages signs all four slots at header size"
```

---

### Task 3: Wire the loaders and make the header cycle

Loaders and component ship as one task on purpose: swapping the `hero` field for
`headerImages` breaks both call sites until `ProjectHero` is rewritten, so there is no
point between them where the branch compiles. One task, one commit, one review.

**Files:**
- Modify: `src/lib/data/portal.ts` (`getPortalProject`)
- Modify: `src/lib/data/preview.ts` (`getProjectPreview`)
- Modify: `src/lib/data/projects.ts` (`getProjectDetail`)
- Modify: `src/components/portal/ProjectHero.tsx`
- Modify: `src/components/portal/PortalProjectView.tsx` (call site)
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (call site)

**Interfaces:**
- Consumes: `resolveHeaderImages` (Task 2); `HeaderImage` from `@/lib/data/portfolio` (Task 1).
- Produces: all three loaders return `headerImages: { images: HeaderImage[]; startIndex: number }` and **no longer return `hero`**; `ProjectHero` takes `images` + `startIndex` in place of `hero`.

`getProjectPreview` is declared `Promise<PortalProjectDetail | null>`, and `PortalProjectDetail` is inferred from `getPortalProject` — so updating only one of those two fails `tsc`. That type error is the intended drift guard, not something to work around by widening a type.

- [ ] **Step 1: Replace the hero block in `getPortalProject`**

In `src/lib/data/portal.ts`, the current block reads (roughly lines 160-173): `const afterSlot = …`, then a comment beginning "Hero: a dedicated larger transform", then `let hero = heroSlot; if (heroSlot && project.hero_attachment_id) { … }`.

Delete that hero block — the `let hero = …` statement and its `if` — and replace it with:

```ts
  const headerImages = await resolveHeaderImages(
    supabase,
    {
      cover: project.cover_attachment_id,
      hero: project.hero_attachment_id,
      before: project.before_attachment_id,
      after: project.after_attachment_id,
    },
    sharedImagesById,
    images
  );
```

**Keep** `coverSlot`/`cover`, `beforeSlot`, `afterSlot`, and the two lines below the deleted block that build `before` and `after` from `thumbHref` — those feed the before/after strip and must not change. Then in the return object, replace `hero,` with `headerImages,`.

Add `resolveHeaderImages` to the existing `./attachments` import.

- [ ] **Step 2: Do the same in `getProjectPreview`**

`src/lib/data/preview.ts` has the identical hero block (roughly lines 106-113). Apply the identical change: delete the hero block, add the same `resolveHeaderImages` call with the same arguments, replace `hero,` with `headerImages,` in the return, and add the import. `before`/`after` stay as they are.

- [ ] **Step 3: Do the same in `getProjectDetail`**

`src/lib/data/projects.ts` has a hero block at roughly lines 155-167 (`const heroSlot = …` through the closing brace of the `if`). It builds `sharedImagesById` just above — keep that. Delete `heroSlot`, `hero`, and the `if` block, and replace with:

```ts
  const headerImages = await resolveHeaderImages(
    supabase,
    {
      cover: project.cover_attachment_id,
      hero: project.hero_attachment_id,
      before: project.before_attachment_id,
      after: project.after_attachment_id,
    },
    sharedImagesById,
    signedAttachments
  );
```

Then in the return object, replace `hero,` with `headerImages,`.

`getProjectDetail`'s project select already includes all four `*_attachment_id` columns — verify with `grep -n "cover_attachment_id" src/lib/data/projects.ts` and add any that are missing.

Remove `resolveSlot` and `signImageVariant` from this file's imports **only if** nothing else in the file still uses them — check with grep, do not guess.

At this point the two call sites still pass a `hero` prop that no longer exists, so `tsc` will fail until Step 4. That is expected — do not "fix" it by leaving the `hero` field on the loaders. If you see an error naming `PortalProjectDetail`, one of the two portal loaders was missed.

- [ ] **Step 4: Rewrite `ProjectHero` as a Client Component**

Replace `src/components/portal/ProjectHero.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PortfolioStatus, HeaderImage } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/**
 * Full-width hero with an overlaid name pill + status, cycling through the project's
 * portfolio slots (cover / current progress / before / after) via the arrow on the
 * right. Position lives in local state ONLY, so a reload always returns to the hero.
 *
 * Every resolved image is rendered and stacked, with just the active one visible —
 * cycling is then instant instead of flashing while the next one loads. Bounded at
 * four images.
 *
 * `size` exists because the two surfaces want different things from it. The portal is
 * a showcase, so it gets the full banner. The artisan project page is a working
 * surface where a 280px banner pushes the tabs below the fold, so it gets a compact
 * one with the overlay scaled to match.
 */
const SIZES = {
  full: {
    frame: "h-[200px] sm:h-[280px]",
    inset: "left-5 sm:left-10 bottom-5",
    pill: "text-[20px] sm:text-[26px]",
  },
  compact: {
    frame: "h-[120px] sm:h-[150px]",
    inset: "left-4 sm:left-5 bottom-4",
    pill: "text-[17px] sm:text-[20px]",
  },
} as const;

export function ProjectHero({
  name,
  status,
  images,
  startIndex,
  size = "full",
}: {
  name: string;
  status: PortfolioStatus;
  images: HeaderImage[];
  startIndex: number;
  size?: "full" | "compact";
}) {
  const s = SIZES[size];
  const [index, setIndex] = useState(startIndex);
  const active = images[index] ?? images[0] ?? null;
  const canCycle = images.length > 1;

  return (
    <div className={`relative w-full ${s.frame} rounded-card overflow-hidden`}>
      {active ? (
        images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.slot}
            src={img.href}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
      ) : (
        <BrandedPlaceholder name={name} />
      )}

      <div className={`absolute ${s.inset} flex items-center gap-3`}>
        <span
          className={`bg-white text-[#1a1a1a] font-bold ${s.pill} rounded-[8px] px-4 py-2 shadow-card`}
        >
          {name}
        </span>
        <StatusBadge status={status} />
        {canCycle && active && (
          <span className="bg-black/55 text-white text-meta font-semibold rounded-[6px] px-2 py-1">
            {active.label}
          </span>
        )}
      </div>

      {canCycle && (
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % images.length)}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 -translate-y-1/2 size-9 grid place-items-center rounded-full bg-black/45 text-white hover:bg-black/65"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
```

Note the `images.map` renders every image absolutely positioned with opacity toggling — do not switch this to a single `<img>` with a swapped `src`, which reintroduces the load flash.

- [ ] **Step 5: Update the portal call site**

In `src/components/portal/PortalProjectView.tsx`, change `hero,` to `headerImages,` in the destructuring of `detail`, and change the render:

```tsx
      <ProjectHero
        name={project.name}
        status={status}
        images={headerImages.images}
        startIndex={headerImages.startIndex}
      />
```

No `size` prop — the portal keeps `full`.

- [ ] **Step 6: Update the artisan call site**

In `src/app/(artisan)/projects/[id]/page.tsx`, change `hero` to `headerImages` in the destructuring on line 83, and change the render:

```tsx
      <ProjectHero
        name={project.name}
        status={stageToStatus(project.stage)}
        images={headerImages.images}
        startIndex={headerImages.startIndex}
        size="compact"
      />
```

Leave the `slotValues` object on line 101 alone — that is the portfolio-slot picker's state, unrelated to the header.

- [ ] **Step 7: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green, 146 tests. Any remaining reference to a `hero` prop means a call site was missed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/portal.ts src/lib/data/preview.ts src/lib/data/projects.ts \
        src/components/portal/ProjectHero.tsx src/components/portal/PortalProjectView.tsx \
        "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(projects): cycle the header image through the portfolio slots"
```

---

## Manual verification (before merge)

The interaction is not reachable by the automated gates — they prove it compiles and that the ordering logic is correct, not that it works in a browser.

- [ ] A project with all four slots cycles Cover → Current progress → Before → After and wraps back to Cover; the label chip changes with each.
- [ ] The header opens on **Current progress**, and a reload returns to it from wherever the viewer had cycled.
- [ ] A project with only a hero shows no arrow and no label chip.
- [ ] A project with no hero but a cover opens on the **cover**, not the branded placeholder.
- [ ] A project with no slots at all still shows `BrandedPlaceholder`, with no arrow.
- [ ] Cycling is instant — no flash of empty space on the first click of each image.
- [ ] Works on the artisan `compact` header and the portal `full` header.
- [ ] On a phone: the arrow does not collide with the name pill, status badge, or label chip.
- [ ] The portal's before/after strip below the hero still renders correctly.
