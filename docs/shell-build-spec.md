# Artisan Project Hub — Shell Build Spec

*Instructions for **Claude Code** to scaffold the runnable app shell in the codebase, on-system
from day one. The shell is the navigation skeleton + themed primitive components — no business
data yet. Build it to match [`component-gallery.html`](component-gallery.html) and obey
[`design-system.md`](design-system.md). Tokens come from [`design-tokens.css`](design-tokens.css).*

> **Where this gets built:** the codebase (`src/…`), by Claude Code at the CLI. Cowork writes
> only `docs/`, so this spec is the handoff. The gallery is the visual target; this is the
> structural target.

---

## 1. Stack already in place

Next.js 16 (App Router) · React 19 · Tailwind **v4** (`@tailwindcss/postcss`, configured in CSS
via `@theme`, no `tailwind.config.js`) · `@supabase/ssr`. Existing files of note:
`src/app/globals.css`, `src/app/layout.tsx`, `src/proxy.ts` (refreshes the session only),
`src/lib/supabase/{client,server}.ts`. Add one dependency: **`lucide-react`** for icons.

> **Framework note (Next 16, verified against `node_modules/next/dist/docs/`):** the
> `middleware` convention is **renamed to `proxy`** — use `src/proxy.ts` exporting
> `proxy(request)`. Also `params`/`searchParams` and `cookies()`/`headers()` are **async**
> (await them; client components unwrap `params` with React's `use()`).

---

## 2. Step 1 — wire the tokens into Tailwind

Copy `docs/design-tokens.css` into the app (or paste the `:root` block) and replace
`src/app/globals.css` with the following. This exposes every token as a Tailwind utility
(`bg-surface`, `text-muted`, `border-line`, `rounded-card`, `shadow-card`, `text-body`, …) **and**
keeps the runtime accent swap so `data-world="portal"` re-themes the whole tree.

```css
@import "tailwindcss";

/* ---- Design tokens — mirror of docs/design-tokens.css ---- */
:root{
  --bg:#f4f5f7; --surface:#ffffff; --line:#e4e7ec; --line-2:#eef0f3;
  --text:#1b2430; --muted:#667085; --faint:#98a2b3;
  --accent:#2f6f5e; --accent-soft:#e7f1ee;
  --portal:#2563a8; --portal-soft:#e6eef7;
  --proposal:#475467; --proposal-soft:#eef1f4;
  --signed:#4f46e5; --signed-soft:#eceafe;
  --progress:#b54708; --progress-soft:#fdf0e6;
  --completed:#157347; --completed-soft:#e6f4ec;
  --shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  --shadow-lg:0 8px 24px rgba(16,24,40,.12);
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
/* The two worlds differ ONLY by accent. */
[data-world="portal"]{ --accent:var(--portal); --accent-soft:var(--portal-soft); }

/* ---- Map tokens → Tailwind theme (NON-inline so the accent stays overridable) ---- */
@theme{
  --color-bg:var(--bg); --color-surface:var(--surface);
  --color-line:var(--line); --color-line-2:var(--line-2);
  --color-text:var(--text); --color-muted:var(--muted); --color-faint:var(--faint);
  --color-accent:var(--accent); --color-accent-soft:var(--accent-soft);
  --color-proposal:var(--proposal); --color-proposal-soft:var(--proposal-soft);
  --color-signed:var(--signed); --color-signed-soft:var(--signed-soft);
  --color-progress:var(--progress); --color-progress-soft:var(--progress-soft);
  --color-completed:var(--completed); --color-completed-soft:var(--completed-soft);

  --radius-card:14px; --radius-control:9px;
  --shadow-card:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  --shadow-float:0 8px 24px rgba(16,24,40,.12);

  --font-sans:var(--sans);

  --text-title:17px; --text-section:13px; --text-body:13.5px;
  --text-sub:12.5px; --text-meta:11.5px; --text-chip:11px; --text-stat:26px;
}

body{ background:var(--bg); color:var(--text); font-family:var(--sans); }
```

Then in `src/app/layout.tsx`: drop the Geist `next/font` wiring (the system stack in `--sans` is
the design-system font), fix the metadata title to **"Artisan Project Hub"**, and keep
`className="h-full antialiased"`. Use `pill` radius via Tailwind's built-in `rounded-full` for
chips.

**Utility cheat-sheet** (use these, never hard-coded values):
`bg-surface bg-accent bg-accent-soft text-text text-muted text-faint border-line border-line-2
rounded-card rounded-control rounded-full shadow-card shadow-float text-title text-section
text-body text-sub text-meta text-stat`. Stage colors: `text-progress bg-progress-soft`, etc.

---

## 3. Step 2 — file structure (route groups split the two worlds)

```
src/
  app/
    layout.tsx                      # root: <html>, fonts off, metadata
    page.tsx                        # redirect → role home (see proxy.ts)
    globals.css                     # tokens + theme (Step 1)
    (auth)/
      login/page.tsx
      invite/[token]/page.tsx       # accept invite → set password
    (artisan)/
      layout.tsx                    # <AppShell world="artisan">{children}</AppShell>
      dashboard/page.tsx
      projects/page.tsx
      projects/[id]/page.tsx        # the workhorse (tabbed sections)
      customers/page.tsx
      customers/[id]/page.tsx
      contacts/page.tsx
      contacts/[id]/page.tsx
      settings/page.tsx
    (portal)/
      layout.tsx                    # <AppShell world="portal">{children}</AppShell>
      my-projects/page.tsx
      my-projects/[id]/page.tsx
      account/page.tsx
  components/
    shell/   AppShell.tsx  Sidebar.tsx  TopBar.tsx  BottomTabBar.tsx  Fab.tsx  nav.ts
    ui/      Button.tsx  Chip.tsx  ShareToggle.tsx  SegmentedControl.tsx  FilterChips.tsx
             SearchField.tsx  Tabs.tsx  Card.tsx  ListRow.tsx  Thumb.tsx  Avatar.tsx
             StatCard.tsx  UpdateCard.tsx  Composer.tsx  FileTile.tsx  TodoRow.tsx
             Banner.tsx  EmptyState.tsx  KeyValue.tsx  Note.tsx
  lib/
    supabase/{client,server}.ts     # exist
    auth.ts                         # getSessionRole() helper (see §5)
    database.types.ts               # `supabase gen types …` (next-steps.md #2)
```

The `(artisan)` and `(portal)` route groups each own a layout that wraps children in `<AppShell>`
with the right `world` — that single prop sets `data-world` and the nav set. **No other
per-world branching exists.**

---

## 4. Step 3 — shell components

The shell is responsive by Tailwind breakpoints, not by separate trees: the sidebar is
`hidden lg:flex`, the bottom tab bar is `lg:hidden`, the FAB is `lg:hidden`.

**`nav.ts`** — the one place destinations are declared:

```ts
import { LayoutDashboard, FolderKanban, Building2, Users, MoreHorizontal, FileText, User } from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{size?:number}> };

export const artisanNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects",  label: "Projects",  icon: FolderKanban },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/contacts",  label: "Contacts",  icon: Users },
  { href: "/settings",  label: "Settings",  icon: MoreHorizontal },
];
// Mobile bottom bar = 4 thumb targets; Customers moves under "More".
export const artisanTabs = ["/dashboard","/projects","/contacts","/settings"];

export const portalNav: NavItem[] = [
  { href: "/my-projects", label: "My Projects", icon: FileText },
  { href: "/account",     label: "Account",     icon: User },
];
export const portalTabs = ["/my-projects","/account"];
```

**`AppShell.tsx`** (server component is fine; nav highlight uses a client child):

```tsx
export default function AppShell({ world, children }:{ world:"artisan"|"portal"; children:React.ReactNode }) {
  return (
    <div data-world={world} className="min-h-dvh flex bg-bg">
      <Sidebar world={world} />                {/* hidden lg:flex, w-[236px] */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />                              {/* h-[60px], title + actions */}
        <main className="flex-1 overflow-y-auto px-6 py-5 lg:px-6">
          <div className="mx-auto w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
      <BottomTabBar world={world} />            {/* lg:hidden, h-16 fixed bottom */}
      <Fab />                                   {/* lg:hidden, context action */}
    </div>
  );
}
```

Build rules for the shell pieces:

- **Sidebar** — `w-[236px] bg-surface border-r border-line`, brand block (accent logo tile + org
  name + world label), nav links from `nav.ts`. Active link: `bg-accent-soft text-accent
  font-semibold`; inactive: `text-muted hover:bg-line-2`. Exactly one active (match by pathname
  prefix). Account footer pinned bottom.
- **TopBar** — `h-[60px] bg-surface border-b border-line`, page title `text-title font-semibold`,
  optional `text-sub` subtitle, right-aligned primary action slot, `‹` back on detail routes
  (`lg:hidden` back, since desktop uses the sidebar).
- **BottomTabBar** — `fixed bottom-0 inset-x-0 h-16 bg-surface border-t border-line lg:hidden`,
  tabs from `artisanTabs`/`portalTabs`, icon + label, active = `text-accent`. The Settings tab
  also lights when on `/customers*`.
- **Fab** — `fixed right-4 bottom-20 lg:hidden size-14 rounded-full bg-accent text-white
  shadow-float`. Context: camera on `/projects/[id]` Photos tab, `＋` on creatable lists, hidden
  elsewhere and in the portal.

Mark `Sidebar`/`BottomTabBar` (anything using `usePathname`) as `"use client"`.

---

## 5. Step 4 — route gating in proxy.ts

Extend the existing `src/proxy.ts` (renamed from `middleware.ts` in Next 16; keep its
cookie/session refresh exactly as-is) so that after `getUser()` it enforces the two worlds:

```
const PUBLIC = ["/login", "/invite"];
1. user = (await supabase.auth.getUser()).data.user
2. if (!user)  → if path is PUBLIC, allow; else redirect /login
3. role = resolveRole(user)            // see note below
   - artisan  → may visit (artisan) routes; visiting (portal) routes or "/" → redirect /dashboard
   - contact  → may visit (portal) routes; visiting (artisan) routes or "/" → redirect /my-projects
   - none     → signed in but unauthorized → /login (or a holding page)
```

**Resolving role cheaply.** Don't query Postgres on every request. At sign-in (or in a Supabase
Auth hook / DB trigger), stamp the role into the user's `app_metadata` (e.g.
`app_metadata.role = "artisan" | "contact"` and `organization_id`). Middleware then reads it from
the JWT with zero DB round-trips. Put the helper in `src/lib/auth.ts` (`getSessionRole(user)`),
and have it fall back to a one-time `organization_members` / `contacts.user_id` lookup that
writes the metadata if it's missing. This matches the RLS model in `setup.md` (artisan = row in
`organization_members`; contact = `contacts.user_id` set).

Update the `matcher` to keep ignoring static assets (current regex is fine).

---

## 6. Step 5 — primitive components (match the gallery exactly)

Each maps 1:1 to a block in `component-gallery.html`. Keep them dumb/presentational; data wiring
comes later. Two representative implementations to set the pattern:

```tsx
// ui/Button.tsx
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?:"primary"|"ghost"; size?:"md"|"sm" };
export function Button({ variant="primary", size="md", className="", ...p }: Props){
  const base="inline-flex items-center gap-2 font-semibold rounded-control border cursor-pointer";
  const v = variant==="ghost" ? "bg-surface text-text border-line" : "bg-accent text-white border-accent";
  const s = size==="sm" ? "text-[12px] px-[11px] py-[6px]" : "text-[13px] px-[15px] py-[9px]";
  return <button className={`${base} ${v} ${s} ${className}`} {...p} />;
}
```

```tsx
// ui/Chip.tsx — StageChip / TypeChip / LoginChip
const STAGE = {
  proposal:    ["Proposal","bg-proposal-soft text-proposal"],
  signed:      ["Signed","bg-signed-soft text-signed"],
  in_progress: ["In progress","bg-progress-soft text-progress"],
  completed:   ["Completed","bg-completed-soft text-completed"],
} as const;
export function StageChip({ stage }:{ stage:keyof typeof STAGE }){
  const [label, cls] = STAGE[stage];
  return <span className={`inline-flex items-center rounded-full text-chip font-semibold px-[9px] py-[3px] ${cls}`}>{label}</span>;
}
```

`ShareToggle` = two pill states (`on` → `bg-accent text-white`, `off` → `bg-surface text-muted
border border-line`), default **Private**, optimistic flip via local state. Build the rest
(`Card`, `ListRow`, `Thumb`, `Avatar`, `StatCard`, `Tabs`, `SegmentedControl`, `FilterChips`,
`SearchField`, `UpdateCard`, `Composer`, `FileTile`, `TodoRow`, `Banner`, `EmptyState`,
`KeyValue`, `Note`) to the same spec — geometry, colors, and sizes are all visible in the gallery
and defined in `design-system.md` §7.

---

## 7. Step 6 — placeholder screens

Scaffold every route from §3 with the shell + real components but **static placeholder content**
(reuse the gallery's sample rows). Goal: click through the entire IA — both worlds, desktop and
phone — before any Supabase reads exist. This is the "shell app" to reference while building the
real screens.

Acceptance for the shell milestone: `npm run dev` runs; you can navigate the full artisan IA and
the full portal IA; resizing across the `lg` breakpoint swaps sidebar ↔ bottom-tab-bar; the FAB
appears only where specified; and setting the portal layout visibly turns the accent blue with no
other change.

---

## 8. Build order (then hand back to the data work in `next-steps.md`)

1. Add `lucide-react`; apply Step 1 (`globals.css` + `layout.tsx`).
2. Build `nav.ts` + shell components (§4); verify responsive swap with empty `<main>`.
3. Add proxy gating (§5) + `src/lib/auth.ts`; wire `/login`. _(Built: gating logic is
   staged behind `ENFORCE_AUTH=false` so the shell stays walkable until auth is wired.)_
4. Build the UI primitives (§6) against the gallery.
5. Scaffold placeholder routes (§7) → **shell milestone done.**
6. Resume `docs/next-steps.md` from step 2 (gen types) and step 4 onward, now filling these
   on-system screens with real Supabase data.

Keep `design-system.md`, `design-tokens.css`, and `component-gallery.html` as the references; if a
screen needs something the system lacks, add it there first (Governance, §11 of the design system).
