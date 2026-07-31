# Project UI Polish — Design

_Date: 2026-07-31_

Three small, independent changes to how a project presents itself, all on surfaces
that already exist. No new entities, no migration.

1. The project **list** shows a cover photo instead of a folder glyph.
2. The artisan project **header** shows the same hero image the customer sees — at a
   reduced height, so it costs less vertical space on the working surface.
3. The project **tabs** are reordered to match how the work actually flows.

## Goal

- A tenant scanning their project list recognizes projects by photo, not by reading names.
- A staff member opening a project sees what their customer sees at the top of it.
- The tab order reads Updates → To-Dos → Schedule → Files → Photos on every surface.

## Decisions (settled)

- **The thumbnail is the Cover slot, and only the Cover slot.** No fallback to "the
  newest photo" — staff already choose a cover on the project page, and an auto-picked
  image that silently changes as people upload is worse than no image. A project with no
  cover keeps today's `FolderKanban` glyph.
- **The list uses the 600px `thumbHref`**, not the original, falling back to `href`.
- **The artisan header mirrors the customer's hero resolution exactly** — the
  `hero_attachment_id` slot, restricted to **shared** images. That is the point of the
  change: staff see the customer's header, `BrandedPlaceholder` included. In practice it
  is nearly always populated, because tagging a photo into a slot auto-shares it.
- **The admin hero is shorter than the portal's.** The portal is a showcase; the artisan
  project page is a working surface, and a 280px banner pushes the tabs below the fold.
  `ProjectHero` gains a `size` prop — `"full"` (default, portal unchanged) and
  `"compact"` (artisan).
- **The artisan `<h2>` and `<StageChip>` are removed** from the header. `ProjectHero`
  overlays the project name and a status badge, so keeping them shows both twice.
  `StageControl` — the stage *changer* — is a separate component in the action row and
  stays exactly where it is.
- **Contacts stays last** on the artisan surface. It is artisan-only and already last, so
  the requested order simply extends with it.
- **The batch cover-resolve is extracted, not copied.** `listPortalProjects` already does
  this; a second near-identical copy in `listProjects` would drift.

## Non-goals

- Any fallback photo logic beyond the Cover slot.
- Real thumbnails in the artisan **Photos** tab — that is backlog item #2 and stays there.
- Changing the portal hero's height, the portal list, or `ProjectCard`.
- Uploading or choosing a cover from the list view.
- Any change to which photos are shared, or to the portfolio-slot picker.

---

## Components

### 1. `resolveCoverHrefs` — extracted shared helper

New export in `src/lib/data/attachments.ts`:

```ts
export async function resolveCoverHrefs(
  supabase: SupabaseClient,
  coverIds: string[],
  opts: { sharedOnly: boolean }
): Promise<Map<string, { href: string | null; thumbHref: string | null }>>
```

Batch-fetches the referenced attachments, keeps images, signs them, and returns them by
id. `sharedOnly` gates the `.eq("is_shared", true)` filter: the **portal passes `true`**
(a contact must never resolve an unshared cover), the **artisan passes `false`** (staff
see their own org's attachments; RLS `artisan_all` is the boundary). Returns an empty map
for an empty id list, without a query.

`listPortalProjects` (`src/lib/data/portal.ts`) is refactored to call it with
`sharedOnly: true`, replacing its inline block. Its behavior does not change.

### 2. Cover thumbnails in the artisan list

`listProjects` (`src/lib/data/projects.ts`) adds `cover_attachment_id` to its select,
calls `resolveCoverHrefs(..., { sharedOnly: false })`, and returns
`coverHref: string | null` per project — `thumbHref ?? href`, resolved through
`resolveSlot` so a dangling id yields null rather than throwing.

`ProjectList.tsx`: the local `Project` type gains `coverHref: string | null`, and the
`leading` prop becomes an image when one exists:

```tsx
leading={
  p.coverHref ? (
    <Thumb className="overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.coverHref} alt="" loading="lazy" className="size-full object-cover" />
    </Thumb>
  ) : (
    <Thumb><FolderKanban size={18} /></Thumb>
  )
}
```

The 38px `Thumb` footprint is unchanged, so row height and alignment are untouched.

### 3. `ProjectHero` size variant

`src/components/portal/ProjectHero.tsx` gains `size?: "full" | "compact"`, defaulting to
`"full"` so every existing caller is unaffected.

| | `full` (portal) | `compact` (artisan) |
| --- | --- | --- |
| height | `h-[200px] sm:h-[280px]` | `h-[120px] sm:h-[150px]` |
| name pill | `text-[20px] sm:text-[26px]` | `text-[17px] sm:text-[20px]` |
| inset | `left-5 sm:left-10 bottom-5` | `left-4 sm:left-5 bottom-4` |

Roughly half the height on the working surface, with the overlay scaled to match so the
pill doesn't crowd a shorter image.

### 4. Artisan header

`getProjectDetail` (`src/lib/data/projects.ts`) gains `hero: { href: string } | null`,
resolved exactly as `getPortalProject` does it: find `hero_attachment_id` among the
project's **shared** image attachments and sign a `{ width: 1400, quality: 65, resize:
"contain" }` variant via `signImageVariant`, falling back to the slot's own href if the
variant sign fails.

`src/app/(artisan)/projects/[id]/page.tsx` renders, above the action row:

```tsx
<ProjectHero
  name={project.name}
  status={stageToStatus(project.stage)}
  hero={hero}
  size="compact"
/>
```

and drops the `<h2>{project.name}</h2>` and `<StageChip …>`. `stageToStatus` already
exists in `src/lib/data/portfolio.ts` and is unit-tested.

### 5. Tab order

Array reordering only — no content, prop, or logic change to any panel:

- `src/app/(artisan)/projects/[id]/page.tsx` — Updates, To-Dos, Schedule, Files, Photos, Contacts
- `src/components/portal/PortalProjectView.tsx` — Updates, To-Dos, Schedule, Files, Photos
  (covers the customer portal and `/preview/[id]`)

---

## Testing

Most of this change is loader plumbing or presentation, and the one piece of pure logic
involved (`stageToStatus`) is already covered. `resolveCoverHrefs` does I/O, but I/O
functions here ARE testable via a stubbed client — `withAttachmentUrls` is the existing
precedent (`attachments.test.ts`'s `fakeSupabase` stub) — so `resolveCoverHrefs` gets the
same treatment: tests assert the `sharedOnly` filter gates an unshared cover, that
`sharedOnly: false` returns it, that an empty id list issues no query, and that the
returned map is keyed by attachment id.

Gates: `npx tsc --noEmit`, `npm test`, `npm run build`.

Manual verification, since none of this is reachable by the automated gates:

- A project **with** a cover shows its photo in the artisan list; one **without** still
  shows the folder glyph; row heights stay uniform down the list.
- The portal list is visually unchanged (the refactor must be invisible).
- The artisan header shows the same image the customer sees, at roughly half the portal's
  height, with the name legible over it.
- A project with **no** hero shows `BrandedPlaceholder` on the artisan header.
- Stage is still visible (hero badge) and still changeable (`StageControl`).
- Tab order is correct on all three surfaces, and every panel still renders its own content.

## Risks

- **The header costs vertical space.** Even compact, ~150px sits above the tabs on a
  surface staff use all day. The reduced height is the mitigation; if it still reads as
  too much, the next step is making it collapsible rather than shrinking it further.
- **`sharedOnly: false` is a real behavior difference** between the two callers of
  `resolveCoverHrefs`. Getting it backwards on the portal side would expose an unshared
  cover to a contact. The parameter is required — not defaulted — so neither caller can
  omit it by accident.
- **The list adds one query per page load** (the batch cover fetch), plus one signing
  round trip per distinct cover. Bounded by the number of projects on screen; the portal
  has carried the same cost since Cycle C.
