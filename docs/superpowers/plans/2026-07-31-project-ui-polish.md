# Project UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a project's cover photo in the project list, put the customer's hero image on the artisan project header at reduced height, and apply one tab order across all three project surfaces.

**Architecture:** Three independent changes. The only shared piece is a batch cover-resolve helper extracted from the portal loader so the artisan loader can reuse it instead of copying it. Everything else is presentation: a size variant on the existing `ProjectHero`, and array reordering.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Components), Supabase (Postgres + RLS + Storage image transforms), TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-07-31-project-ui-polish-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **No migration, no schema change, no RLS change.** Every column used here already exists. Never run `supabase db push`.
- **`resolveCoverHrefs`'s `sharedOnly` option is required, never defaulted.** The portal must pass `true` (a contact must never resolve an unshared cover); the artisan passes `false`. Getting this backwards on the portal side is a tenant-visibility bug.
- **`ProjectHero`'s `size` prop defaults to `"full"`** so the portal and `/preview/[id]` render exactly as they do today. Only the artisan header passes `"compact"`.
- **The list thumbnail comes from the Cover slot only.** No fallback to "newest photo". No cover → today's `FolderKanban` glyph.
- **Tab order, all surfaces:** Updates, To-Dos, Schedule, Files, Photos — plus Contacts last on the artisan page only. Reorder the array entries; do not edit any panel's content, props, or labels.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (131 passing). `npm run build` before the final task is called done.

---

### Task 1: Extract `resolveCoverHrefs` and use it in the portal

**Files:**
- Modify: `src/lib/data/attachments.ts` (add one exported function)
- Modify: `src/lib/data/portal.ts` (`listPortalProjects` — replace its inline block)

**Interfaces:**
- Consumes: `withAttachmentUrls` and `isImageAttachment`, both already used by the inline block being replaced.
- Produces — Task 2 depends on this exact signature:
  `resolveCoverHrefs(supabase: SupabaseClient, coverIds: string[], opts: { sharedOnly: boolean }): Promise<Map<string, { href: string | null; thumbHref: string | null }>>`

This task is a pure refactor: `listPortalProjects` must behave identically afterwards.

- [ ] **Step 1: Read the block being extracted**

Run: `grep -n "coverIds" -A 14 src/lib/data/portal.ts`

Expected: the inline block inside `listPortalProjects` that builds `coverById` — collect ids, query `attachments` with `.eq("is_shared", true)`, filter to images, sign, populate the map. That block is the body you are lifting.

- [ ] **Step 2: Add the helper to `attachments.ts`**

Append to `src/lib/data/attachments.ts`:

```ts
/**
 * Resolve project cover photos in one batch: fetch the referenced attachments,
 * keep the images, sign them, and return them by id (for `resolveSlot`).
 *
 * `sharedOnly` is REQUIRED and differs per surface: the portal passes true (a
 * contact must never resolve an unshared cover), the artisan passes false (staff
 * see their own org's attachments — RLS `artisan_all` is the boundary). It is not
 * defaulted so neither caller can omit it by accident.
 */
export async function resolveCoverHrefs(
  supabase: SupabaseClient,
  coverIds: string[],
  opts: { sharedOnly: boolean }
): Promise<Map<string, { href: string | null; thumbHref: string | null }>> {
  const byId = new Map<string, { href: string | null; thumbHref: string | null }>();
  if (!coverIds.length) return byId;

  let query = supabase
    .from("attachments")
    .select("id, kind, mime_type, url, storage_path")
    .in("id", coverIds);
  if (opts.sharedOnly) query = query.eq("is_shared", true);

  const { data } = await query;
  const images = (data ?? []).filter(isImageAttachment);
  const signed = await withAttachmentUrls(supabase, images);
  signed.forEach((a) => byId.set(a.id, { href: a.href, thumbHref: a.thumbHref }));
  return byId;
}
```

- [ ] **Step 3: Call it from `listPortalProjects`**

In `src/lib/data/portal.ts`, replace the inline block with a call. The surrounding code (the `projects` fetch above and the `.map()` below that calls `resolveSlot(p.cover_attachment_id, coverById)`) stays exactly as it is:

```ts
  const coverIds = projects.map((p) => p.cover_attachment_id).filter(Boolean) as string[];
  const coverById = await resolveCoverHrefs(supabase, coverIds, { sharedOnly: true });
```

Add `resolveCoverHrefs` to the existing `import … from "./attachments"` statement rather than adding a second import line. If `isImageAttachment` or `withAttachmentUrls` is now unused in `portal.ts`, remove it from that file's imports — but check first, since both are used elsewhere in the file.

- [ ] **Step 4: Verify the refactor changed no behavior**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 131 tests pass. Then confirm by reading that `listPortalProjects` still passes `sharedOnly: true` — a portal call with `false` would expose unshared covers to customers.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/attachments.ts src/lib/data/portal.ts
git commit -m "refactor(attachments): extract resolveCoverHrefs from listPortalProjects"
```

---

### Task 2: Cover thumbnails in the artisan project list

**Files:**
- Modify: `src/lib/data/projects.ts` (`listProjects`)
- Modify: `src/app/(artisan)/projects/ProjectList.tsx`

**Interfaces:**
- Consumes: `resolveCoverHrefs` from Task 1; `resolveSlot` from `@/lib/data/portfolio`.
- Produces: `listProjects()` items gain `coverHref: string | null`.

- [ ] **Step 1: Return `coverHref` from `listProjects`**

In `src/lib/data/projects.ts`, add `cover_attachment_id` to the `listProjects` select — it currently reads:

```ts
      "id, name, stage, start_date, end_date, customer:customers(name), project_contacts(count)"
```

Change it to:

```ts
      "id, name, stage, start_date, end_date, cover_attachment_id, customer:customers(name), project_contacts(count)"
```

Add these imports to the file (`resolveSlot` may not be imported yet; `resolveCoverHrefs` joins the existing `./attachments` import if there is one):

```ts
import { resolveCoverHrefs } from "./attachments";
import { resolveSlot } from "./portfolio";
```

Then replace the function's `return (data ?? []).map(…)` with a resolve step followed by the map. Note `sharedOnly: false` — staff see their own org's attachments:

```ts
  const projects = data ?? [];
  const coverIds = projects.map((p) => p.cover_attachment_id).filter(Boolean) as string[];
  const coverById = await resolveCoverHrefs(supabase, coverIds, { sharedOnly: false });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    start_date: p.start_date,
    end_date: p.end_date,
    customerName: one(p.customer)?.name ?? "—",
    contactCount: p.project_contacts?.[0]?.count ?? 0,
    coverHref: (() => {
      const c = resolveSlot(p.cover_attachment_id, coverById);
      return c ? (c.thumbHref ?? c.href) : null;
    })(),
  }));
```

`resolveSlot` returns null for a dangling or unresolvable id, so a deleted cover degrades to the glyph rather than a broken image.

- [ ] **Step 2: Render the thumbnail in the list**

In `src/app/(artisan)/projects/ProjectList.tsx`, add `coverHref` to the local `Project` type:

```ts
type Project = {
  id: string;
  name: string;
  stage: string;
  start_date: string | null;
  end_date: string | null;
  customerName: string;
  contactCount: number;
  coverHref: string | null;
};
```

Then replace the `leading` prop on `<ListRow>`. It currently reads:

```tsx
                leading={
                  <Thumb>
                    <FolderKanban size={18} />
                  </Thumb>
                }
```

Change it to:

```tsx
                leading={
                  p.coverHref ? (
                    <Thumb className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.coverHref}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </Thumb>
                  ) : (
                    <Thumb>
                      <FolderKanban size={18} />
                    </Thumb>
                  )
                }
```

Keep the `FolderKanban` import — the no-cover branch still uses it. The 38px `Thumb` footprint is unchanged, so row height and alignment do not move.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 131 tests pass. A type error naming `coverHref` means the loader and the component disagree — fix the loader rather than widening the component's type.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/projects.ts "src/app/(artisan)/projects/ProjectList.tsx"
git commit -m "feat(projects): show the cover photo as the project-list thumbnail"
```

---

### Task 3: `ProjectHero` size variant

**Files:**
- Modify: `src/components/portal/ProjectHero.tsx`

**Interfaces:**
- Produces: `ProjectHero` gains `size?: "full" | "compact"`, default `"full"`. Task 4 passes `"compact"`.

- [ ] **Step 1: Add the variant**

Rewrite `src/components/portal/ProjectHero.tsx` as:

```tsx
import type { PortfolioStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/**
 * Full-width hero: current-progress photo (or placeholder) with an overlaid name
 * pill + status.
 *
 * `size` exists because the two surfaces want different things from it. The portal
 * is a showcase, so it gets the full banner. The artisan project page is a working
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
  hero,
  size = "full",
}: {
  name: string;
  status: PortfolioStatus;
  hero: { href: string } | null;
  size?: "full" | "compact";
}) {
  const s = SIZES[size];
  return (
    <div className={`relative w-full ${s.frame} rounded-card overflow-hidden`}>
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.href} alt="" className="w-full h-full object-cover" />
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
      </div>
    </div>
  );
}
```

The `full` values are byte-for-byte the current ones, so every existing caller renders identically.

- [ ] **Step 2: Verify nothing moved on the portal**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 131 tests pass. Then run `grep -rn "ProjectHero" src --include='*.tsx'` and confirm the only existing caller is `PortalProjectView.tsx`, which passes no `size` and therefore still gets `full`.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/ProjectHero.tsx
git commit -m "feat(portal): add a compact size variant to ProjectHero"
```

---

### Task 4: Hero image on the artisan project header

**Files:**
- Modify: `src/lib/data/projects.ts` (`getProjectDetail`)
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `ProjectHero`'s `size="compact"` (Task 3); `stageToStatus` and `resolveSlot` from `@/lib/data/portfolio`; `signImageVariant` and `isImageAttachment` from the existing data modules.
- Produces: `getProjectDetail(...)` gains `hero: { href: string } | null`.

- [ ] **Step 1: Resolve the hero in `getProjectDetail`**

`getProjectDetail` already selects `hero_attachment_id`, and already computes
`await withAttachmentUrls(supabase, attachments.data ?? [])` inside its return literal. Hoist that into a variable so the hero can reuse it, then resolve the hero from the **shared** images only — that is what makes the artisan header match the customer's.

Add the imports (join existing import statements where the module is already imported):

```ts
import { isImageAttachment, resolveSlot } from "./portfolio";
import { signImageVariant } from "./attachments";
```

Immediately before the `return {` in `getProjectDetail`, add:

```ts
  const signedAttachments = await withAttachmentUrls(supabase, attachments.data ?? []);

  // The artisan header shows exactly what the customer sees, so the hero resolves
  // from SHARED images only — mirroring getPortalProject. Slot-tagging auto-shares,
  // so this is populated in practice; when it isn't, ProjectHero draws the same
  // BrandedPlaceholder the customer gets.
  const sharedImagesById = new Map(
    signedAttachments
      .filter((a) => a.is_shared && isImageAttachment(a))
      .map((a) => [a.id, { href: a.href, thumbHref: a.thumbHref }])
  );
  const heroSlot = resolveSlot(project.hero_attachment_id, sharedImagesById);
  let hero: { href: string } | null = heroSlot?.href ? { href: heroSlot.href } : null;
  if (heroSlot && project.hero_attachment_id) {
    const heroImg = signedAttachments.find((a) => a.id === project.hero_attachment_id);
    if (heroImg?.storage_path) {
      const big = await signImageVariant(supabase, heroImg.storage_path, {
        width: 1400,
        quality: 65,
        resize: "contain",
      });
      if (big) hero = { href: big };
    }
  }
```

Then in the return literal, use the hoisted variable and add the new field:

```ts
    attachments: signedAttachments,
    hero,
    schedule: await getProjectSchedule(supabase, id),
```

- [ ] **Step 2: Render the hero on the page**

In `src/app/(artisan)/projects/[id]/page.tsx`:

Add the imports:

```ts
import { ProjectHero } from "@/components/portal/ProjectHero";
import { stageToStatus } from "@/lib/data/portfolio";
```

Add `hero` to the destructuring of `getProjectDetail`'s result (the statement that already yields `project`, `updates`, `todos`, `attachments`, `schedule`, `fileCategories`).

Replace the header block. It currently reads:

```tsx
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title font-semibold">{project.name}</h2>
        <StageChip stage={project.stage as Stage} />
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
```

Change it to:

```tsx
      {/* Header */}
      <ProjectHero
        name={project.name}
        status={stageToStatus(project.stage)}
        hero={hero}
        size="compact"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
```

The `<h2>` and `<StageChip>` are removed because `ProjectHero` overlays both. Everything inside the inner `<div>` — Preview, Edit, `ArchiveButton`, `StageControl` — is untouched.

- [ ] **Step 3: Remove the now-unused import if it is unused**

Run: `grep -n "StageChip\|Stage\b" "src/app/(artisan)/projects/[id]/page.tsx"`

If `StageChip` and the `Stage` type have no remaining uses in the file, remove them from the `@/components/ui/Chip` import. If either is still used elsewhere in the file, leave the import alone. Do not guess — check.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: no type errors, 131 tests pass, build succeeds. An unused-import lint error means Step 3 was skipped or overdone.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/projects.ts "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(projects): show the customer's hero image on the artisan project header"
```

---

### Task 5: Tab order across all three surfaces

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`
- Modify: `src/components/portal/PortalProjectView.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: nothing new. This is array reordering only.

- [ ] **Step 1: Reorder the artisan tabs**

In `src/app/(artisan)/projects/[id]/page.tsx`, the `<Tabs tabs={[…]} />` array currently runs: Updates, Photos, Files, Schedule, To-Dos, Contacts.

Move whole `{ label: …, content: … }` entries so the order becomes:

**Updates, To-Dos, Schedule, Files, Photos, Contacts**

Move each entry intact — do not edit any `label`, any `content`, or anything inside a panel. The only change to this file is the sequence of the array's elements.

- [ ] **Step 2: Reorder the portal tabs**

In `src/components/portal/PortalProjectView.tsx`, the array currently runs: Updates, Photos, Files, Schedule, To-Dos.

Reorder to: **Updates, To-Dos, Schedule, Files, Photos**

Same rule — move entries intact. This file serves both the customer portal and `/preview/[id]`, so one edit covers both surfaces.

- [ ] **Step 3: Verify the reorder moved entries rather than editing them**

Run: `git diff --stat`

Expected: only the two files, and the diff should be a pure movement of blocks. Then run:

```bash
grep -n "label: \"" "src/app/(artisan)/projects/[id]/page.tsx" src/components/portal/PortalProjectView.tsx
```

Expected output order — artisan: Updates, To-Dos, Schedule, Files, Photos, Contacts. Portal: Updates, To-Dos, Schedule, Files, Photos.

- [ ] **Step 4: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/page.tsx" src/components/portal/PortalProjectView.tsx
git commit -m "refactor(projects): order tabs Updates, To-Dos, Schedule, Files, Photos"
```

---

## Manual verification (before merge)

None of this is reachable by the automated gates — they prove it compiles and that nothing else broke, not that it looks right.

- [ ] Artisan project list: a project **with** a cover shows its photo; one **without** shows the folder glyph; row heights stay uniform down the list.
- [ ] Portal project list is visually **unchanged** — the Task 1 refactor must be invisible.
- [ ] Artisan project header shows the same image the customer sees, at roughly half the portal's height, with the name legible over it.
- [ ] A project with **no** hero shows `BrandedPlaceholder` on the artisan header.
- [ ] Stage is still visible (the hero's status badge) and still changeable (`StageControl` in the action row).
- [ ] Tab order is correct on the artisan page, the customer portal, and `/preview/[id]`, and every panel still renders its own content.
