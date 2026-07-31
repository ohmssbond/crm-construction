# Cycling Header Image — Design

_Date: 2026-07-31_

The project header shows one photo — the hero. This lets the viewer step through all
four portfolio slots (cover, hero, before, after) with a single arrow on the right of
the image, on both the staff page and the customer portal.

## Goal

- A viewer can see every slot image a project has without leaving the header.
- The viewer always knows *which* image they are looking at — "Before" reads very
  differently from an unlabeled photo of a torn-up kitchen.
- A page reload always returns to the hero.

## Decisions (settled)

- **Both surfaces.** The artisan project page and the customer portal (which also
  covers `/preview/[id]`, since both render `PortalProjectView`).
- **Fixed order: Cover → Current progress (hero) → Before → After**, wrapping. The
  viewer *starts* on the hero, so the sequence opens mid-list and wraps around.
- **One arrow, forward-only**, on the right edge of the image. Hidden entirely when
  fewer than two images resolve — no control that does nothing.
- **Empty slots are skipped**, not rendered as placeholders. A project with only a
  cover and an after cycles between exactly those two.
- **If the hero is unset, the header opens on the first available slot** (cover →
  before → after) rather than the branded placeholder. This is a deliberate change
  from today's behavior: showing a placeholder while a real photo sits one click away
  is worse than showing the photo.
- **A small label chip** beside the name pill names the current image, shown only when
  more than one image exists. Labels: `Cover`, `Current progress`, `Before`, `After`.
- **Client-side state only.** No persistence, no URL parameter, no server round trip on
  cycle — which is precisely why a reload returns to the hero, and why this needs no
  schema or data change.
- **All four are signed at header size** (`{ width: 1400, quality: 65, resize: "contain" }`),
  the transform the hero already uses. The portal's `before`/`after` fields stay the
  600px thumbs they are today — those feed the before/after strip, which is display-only
  and must not change.
- **The hero-signing block is extracted, not copied a fourth time.** It exists today in
  `getPortalProject`, `getProjectPreview`, and `getProjectDetail`; this change needs all
  four slots in all three, so it becomes one shared helper.

## Non-goals

- Backward cycling, swipe gestures, keyboard arrow navigation, autoplay, or a lightbox.
- Cycling through *all* project photos — only the four designated slots.
- Persisting the viewer's position across reloads (explicitly the opposite).
- Changing the before/after strip, the Photos tab, the portfolio-slot picker, or which
  photos are shared.
- Any change to `ProjectCard` or the project lists.

## Known consequence, accepted

The portal will show the before and after images **twice** — once in the header cycle,
once in the strip below it. This was raised and accepted. If it reads badly in
practice, the cheap fix is to drop `before`/`after` from the portal's cycle while
keeping all four on the artisan side; the ordering helper takes the slot list as input,
so that is a one-line change at the call site, not a redesign.

---

## Components

### 1. `buildHeaderImages` — pure ordering + labeling

New export in `src/lib/data/portfolio.ts` (the pure, unit-tested module that already
owns `resolveSlot` and `stageToStatus`):

```ts
export type HeaderSlot = "cover" | "hero" | "before" | "after";
export type HeaderImage = { slot: HeaderSlot; label: string; href: string };

export function buildHeaderImages(
  signed: Record<HeaderSlot, string | null>
): { images: HeaderImage[]; startIndex: number }
```

Walks the fixed order `["cover", "hero", "before", "after"]`, keeps the slots whose
href is non-null, attaches the label, and returns the index of the hero within the
*filtered* list — or `0` when there is no hero, which is the fall-back-to-first-available
rule. Empty input yields `{ images: [], startIndex: 0 }`.

Labels: `cover → "Cover"`, `hero → "Current progress"`, `before → "Before"`,
`after → "After"`.

### 2. `resolveHeaderImages` — the shared I/O helper

New export in `src/lib/data/attachments.ts`:

```ts
export async function resolveHeaderImages(
  supabase: SupabaseClient,
  slotIds: Record<HeaderSlot, string | null>,
  sharedImagesById: Map<string, { href: string | null; thumbHref: string | null }>,
  signedAttachments: { id: string; storage_path: string | null }[]
): Promise<{ images: HeaderImage[]; startIndex: number }>
```

For each of the four slots: `resolveSlot` first (which enforces the shared/isolation
guard), then sign a header-size variant from that attachment's `storage_path`, falling
back to the slot's own href when the variant sign fails. All four sign concurrently in
one `Promise.all` — at most four requests, so the batching cap added for
`withAttachmentUrls` is not needed here. Hands the four resulting hrefs to
`buildHeaderImages`.

This replaces the hero-only signing block currently duplicated in three loaders.

### 3. Loaders

All three gain `headerImages: { images, startIndex }` and **lose their `hero` field**,
which nothing will consume once `ProjectHero` takes the new props:

- `getProjectDetail` (`src/lib/data/projects.ts`) — today resolves only the hero; now
  passes all four slot ids.
- `getPortalProject` (`src/lib/data/portal.ts`) — already resolves all four slots; its
  `before`/`after` fields (600px thumbs for the strip) are untouched.
- `getProjectPreview` (`src/lib/data/preview.ts`) — same shape as the portal. It is
  typed `Promise<PortalProjectDetail | null>`, so the two cannot drift.

### 4. `ProjectHero` becomes a Client Component

`src/components/portal/ProjectHero.tsx` gains `"use client"` and swaps its `hero` prop:

```tsx
export function ProjectHero({
  name, status, images, startIndex, size = "full",
}: {
  name: string;
  status: PortfolioStatus;
  images: HeaderImage[];
  startIndex: number;
  size?: "full" | "compact";
})
```

State is `useState(startIndex)`; the arrow advances `(i + 1) % images.length`.

- **Zero images** → `BrandedPlaceholder`, exactly as today, no arrow, no chip.
- **One image** → that image, no arrow, no chip.
- **Two or more** → arrow + label chip.

All images render stacked and absolutely positioned, with only the active one visible,
so cycling is instant instead of flashing while the next one loads. The cost is up to
four images fetched on page load; most projects have one or two slots filled, and the
ceiling is four.

The arrow is a circular button on the right edge, vertically centered, with
`aria-label="Next photo"`. The label chip sits beside the existing name pill and
matches its type scale per `size`.

Both size variants (`full` on the portal, `compact` on the artisan header) keep working
unchanged.

---

## Testing

`buildHeaderImages` is pure and gets real unit tests in `src/lib/data/portfolio.test.ts`:

- all four present → four images in fixed order, `startIndex` 1 (the hero)
- hero missing, cover present → cover first, `startIndex` 0
- hero missing, only before/after → `startIndex` 0 lands on Before
- only the hero → one image, `startIndex` 0
- nothing resolved → empty array, `startIndex` 0
- labels correct for each slot

`resolveHeaderImages` does I/O; it is testable via the `fakeSupabase` stub already used
for `withAttachmentUrls` in `src/lib/data/attachments.test.ts`, and gets a test that a
slot whose variant sign fails falls back to the slot's own href.

Gates: `npx tsc --noEmit`, `npm test` (135 passing today), `npm run build`.

Manual verification, since the interaction is not reachable by the automated gates:

- A project with all four slots cycles through them in order and wraps; the label
  changes with each.
- Reload returns to the hero, wherever the viewer had cycled to.
- A project with only a hero shows no arrow and no chip.
- A project with no hero but a cover opens on the cover rather than the placeholder.
- A project with no slots at all still shows `BrandedPlaceholder`.
- Cycling is instant — no flash of empty space on first click.
- Works on the artisan `compact` header and the portal `full` header, and on a phone.

---

## Addendum: Schedule disclaimer

Unrelated to the header, folded into the same branch because both are small project-view
UI changes and it saves a full ship cycle.

A short disclaimer appears above the phases and tasks on the Schedule tab, on **all
three surfaces** (artisan, portal, preview), telling the reader that schedule dates
move for reasons outside anyone's control.

**Copy, verbatim:**

> Dates are included to support planning and scheduling. Changes will occur due to
> factors such as: seasonality, weather, scheduling with subcontractors, etc. The
> project team will work to keep this as accurate as possible.

Doug supplied this wording; three punctuation fixes were applied and approved — a space
before a colon removed, "sub contractors" → "subcontractors", and a doubled space
closed.

**It lives inside `ScheduleTable`** (`src/components/schedule/ScheduleTable.tsx`), not
at the two call sites. That component is already shared by all three surfaces, so one
insertion covers them all and the copy cannot drift between them.

- Rendered **above** the `Card` that holds the phase rows.
- Rendered **only when the schedule has at least one phase** — a disclaimer about dates
  on a project with no dates is noise. The empty state stays exactly as it is.
- Straight text: a plain `<p>` in the existing muted-meta type. No `Banner`, no icon —
  it is a statement of fact, not a warning.
- On the artisan tab it sits below the existing "always visible to the customer"
  banner, which says a different thing and stays.

No data, loader, prop, or test changes. The existing suite stays green.

## Risks

- **`ProjectHero` becomes a Client Component.** It currently renders inside Server
  Components on three surfaces; its props must stay serializable. They are — plain
  strings, numbers, and arrays of objects.
- **Up to four images load per project page** instead of one. Bounded at four and only
  for projects that have all four slots filled.
- **Four signing round trips replace one** on every project page load, though they run
  concurrently. `resolveHeaderImages` is the single place to add a cache or trim the
  set if that ever matters.
