# Brand & Positioning Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the "Build It Together" platform brand — retire "Artisan" from the UI, add a logo mark, rebrand the login/auth screens, and add a restrained "powered by" footer inside every tenant workspace.

**Architecture:** Pure presentation pass. A small set of reusable brand components (`BrandMark`, `BrandLockup`, `PoweredByFooter`) plus one pure label helper (`productLabel`), wired into the root metadata, the auth layout, and the two shell layouts (main `Sidebar` + worker `/log`). No migration, no data-layer change, no RLS change, no new dependency. Tenant theming (per-org `--accent`) is untouched; the platform green appears only on pre-auth CTAs and the logo roofline.

**Tech Stack:** Next.js 16 (App Router, **modified — read `node_modules/next/dist/docs/` before app-icon/metadata work**, per AGENTS.md), React, Tailwind v4 (token-based accent), Vitest (node environment).

## Global Constraints

Every task's requirements implicitly include these (copied verbatim from the spec):

- **Brand architecture:** Platform = **Build It Together**; products = **Project Hub** (CRM) + **Time & Billing** (field app); each tenant keeps its own name/color/monogram. The platform never overrides tenant theming.
- **Colors:** logo-mark roofline = **`#00A651`** (Signal Go); pre-auth CTA/buttons = **`#009344`** (deeper, contrast-safe); mark columns = **`#1b2430`**. Green appears **only** on CTAs and the logo roofline — everything else stays neutral ink.
- **Tagline (meta description):** "Run your projects, your crew, and your customers — together."
- **World → product label:** `artisan` → "Project Hub", `portal` → "Customer portal", `timebilling` → "Time & Billing".
- **No new dependency. No migration. No RLS or data-layer change.**
- **"Artisan" internals stay:** the `(artisan)/` route group, `ARTISAN_PREFIXES` (`src/proxy.ts`), `artisanNav`/`artisanTabs`/`World="artisan"` (`src/components/shell/nav.ts`) are invisible to users and are **out of scope** — do not rename.
- **Testing convention:** the repo tests pure logic only (Vitest, `environment: node`) and has no component-render harness. Presentational components are verified by `npm run build` + manual check — do **not** add jsdom/testing-library. Only extractable pure logic gets a Vitest test.
- **Gates:** `npm test` and `npm run build` must be green before each commit.

---

## File Structure

**New files:**
- `src/components/brand/BrandMark.tsx` — the "Under One Roof" SVG mark as a React component. One job: draw the mark at a given size.
- `src/components/brand/BrandLockup.tsx` — mark + "Build It Together" wordmark (text), optional product sublabel. Composes `BrandMark`. Used by the auth layout.
- `src/components/brand/PoweredByFooter.tsx` — "powered by · [mark] · Build It Together" strip. Composes `BrandMark`. Used by both shell layouts.
- `src/app/icon.svg` — the favicon/app-icon (Next file convention).

**Modified files:**
- `src/components/shell/nav.ts` — add the pure `productLabel(world)` helper (+ its test lives in `nav.test.ts`).
- `src/components/shell/nav.test.ts` — **new** test file for `productLabel`.
- `src/app/layout.tsx` — root metadata (title template + tagline).
- `src/app/(auth)/layout.tsx` — add `BrandLockup` header + set the deeper-green accent for pre-auth CTAs.
- `src/app/(auth)/login/page.tsx` — remove the hardcoded `JH` tile + "Artisan Project Hub" subtitle.
- `src/components/shell/Sidebar.tsx` — update `FALLBACK_BRAND`, source labels from `productLabel`, add `PoweredByFooter`.
- `src/app/(artisan)/layout.tsx` — brand `label` → `productLabel("artisan")`.
- `src/app/(portal)/layout.tsx`, `src/app/(timebilling)/tb/layout.tsx` — source `label` from `productLabel` (single source of truth).
- `src/app/(worker)/log/layout.tsx` — add `PoweredByFooter`.
- `src/app/favicon.ico` — deleted (replaced by `icon.svg`).

---

## Task 1: Brand components + mark asset

**Files:**
- Create: `src/components/brand/BrandMark.tsx`
- Create: `src/components/brand/BrandLockup.tsx`
- Create: `src/components/brand/PoweredByFooter.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BrandMark({ size?: number; className?: string })` — default `size` 28; renders inline `<svg viewBox="0 0 48 48">`, roofline `#00A651`, columns `#1b2430`, `aria-hidden`.
  - `BrandLockup({ sublabel?: string; size?: number; className?: string })` — default `size` 40; renders `BrandMark` + a "Build It Together" wordmark and, when `sublabel` is passed, a muted sub-line.
  - `PoweredByFooter({ className?: string })` — renders a muted "powered by" label + a 16px `BrandMark` + "Build It Together".

These are presentational (static SVG/JSX). Per the testing convention there is **no automated render test** — verification is `npm run build` (typecheck/compile) + a manual glance later. The task deliverable is "the three components compile and are importable."

- [ ] **Step 1: Create `BrandMark.tsx`**

```tsx
// src/components/brand/BrandMark.tsx
export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="8" y="26" width="8" height="14" rx="2.5" fill="#1b2430" />
      <rect x="20" y="20" width="8" height="20" rx="2.5" fill="#1b2430" />
      <rect x="32" y="26" width="8" height="14" rx="2.5" fill="#1b2430" />
      <path
        d="M6 21 L24 8 L42 21"
        stroke="#00A651"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Create `BrandLockup.tsx`**

```tsx
// src/components/brand/BrandLockup.tsx
import { BrandMark } from "./BrandMark";

export function BrandLockup({
  sublabel,
  size = 40,
  className,
}: {
  sublabel?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <BrandMark size={size} />
      <div className="min-w-0">
        <div className="text-title font-bold tracking-[-0.02em] text-text leading-none">
          Build It Together
        </div>
        {sublabel && (
          <div className="text-meta text-muted mt-1">{sublabel}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `PoweredByFooter.tsx`**

```tsx
// src/components/brand/PoweredByFooter.tsx
import { BrandMark } from "./BrandMark";

export function PoweredByFooter({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-[6px] text-meta text-faint ${className ?? ""}`}
    >
      <span className="uppercase tracking-[0.05em]">powered by</span>
      <BrandMark size={16} />
      <span className="font-semibold text-muted tracking-[-0.01em]">
        Build It Together
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Verify compile**

Run: `npm run build`
Expected: build succeeds (no type errors from the new files). Unused-import warnings for components not yet wired are acceptable at this stage since they're referenced only by name; if the build fails because a component is unused, proceed — later tasks import them. (Next/TS does not error on unused exports.)

- [ ] **Step 5: Commit**

```bash
git add src/components/brand/BrandMark.tsx src/components/brand/BrandLockup.tsx src/components/brand/PoweredByFooter.tsx
git commit -m "Add Build It Together brand components (mark, lockup, powered-by footer)"
```

---

## Task 2: `productLabel(world)` helper (TDD)

**Files:**
- Modify: `src/components/shell/nav.ts`
- Test: `src/components/shell/nav.test.ts` (new)

**Interfaces:**
- Consumes: the `World` type already exported from `nav.ts` (`"artisan" | "portal" | "timebilling"`).
- Produces: `productLabel(world: World): string` — the single source of truth for the sidebar product label. `artisan` → `"Project Hub"`, `portal` → `"Customer portal"`, `timebilling` → `"Time & Billing"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shell/nav.test.ts
import { describe, it, expect } from "vitest";
import { productLabel } from "./nav";

describe("productLabel", () => {
  it("labels the artisan world as the Project Hub product", () => {
    expect(productLabel("artisan")).toBe("Project Hub");
  });

  it("labels the portal world as the customer portal", () => {
    expect(productLabel("portal")).toBe("Customer portal");
  });

  it("labels the timebilling world as Time & Billing", () => {
    expect(productLabel("timebilling")).toBe("Time & Billing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shell/nav.test.ts`
Expected: FAIL — `productLabel` is not exported from `./nav`.

- [ ] **Step 3: Add the helper to `nav.ts`**

Append to `src/components/shell/nav.ts` (after the existing `World` type / exports):

```ts
/** The product name shown as the sidebar's world label. Single source of truth. */
export function productLabel(world: World): string {
  switch (world) {
    case "portal":
      return "Customer portal";
    case "timebilling":
      return "Time & Billing";
    default:
      return "Project Hub"; // artisan
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shell/nav.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/nav.ts src/components/shell/nav.test.ts
git commit -m "Add productLabel(world) helper — single source for sidebar world labels"
```

---

## Task 3: Root metadata (title + tagline)

**Files:**
- Modify: `src/app/layout.tsx:5-8`

**Interfaces:**
- Consumes: nothing.
- Produces: browser tab title "Build It Together" and the tagline meta description.

- [ ] **Step 1: Replace the `metadata` export**

In `src/app/layout.tsx`, replace:

```tsx
export const metadata: Metadata = {
  title: "Artisan Project Hub",
  description: "A shared workspace for independent artisans and their customers.",
};
```

with:

```tsx
export const metadata: Metadata = {
  title: {
    default: "Build It Together",
    template: "%s · Build It Together",
  },
  description:
    "Run your projects, your crew, and your customers — together.",
};
```

- [ ] **Step 2: Verify build + title**

Run: `npm run build`
Expected: build succeeds.
Manual (optional, at verify time): `npm run dev`, open the app, confirm the browser tab reads "Build It Together".

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "Retire 'Artisan Project Hub' from metadata → Build It Together + tagline"
```

---

## Task 4: App icon (favicon)

**Files:**
- Create: `src/app/icon.svg`
- Delete: `src/app/favicon.ico`

**Interfaces:**
- Consumes: nothing.
- Produces: the browser-tab favicon = the brand mark.

- [ ] **Step 1: Confirm the Next app-icon convention**

Read the metadata-files doc to confirm `icon.svg` in the app directory is the current convention for this (modified) Next:

Run: `ls node_modules/next/dist/docs/ && grep -rl "icon" node_modules/next/dist/docs/ | head`
Then read the relevant metadata-files / app-icons doc. Expected: `app/icon.(svg|png|ico)` is auto-detected and emitted as `<link rel="icon">`. If this Next build does **not** support `icon.svg`, fall back to `src/app/icon.png` (export the same mark at 32×32) — but prefer SVG.

- [ ] **Step 2: Create `src/app/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="10" fill="#ffffff"/>
  <rect x="8" y="26" width="8" height="14" rx="2.5" fill="#1b2430"/>
  <rect x="20" y="20" width="8" height="20" rx="2.5" fill="#1b2430"/>
  <rect x="32" y="26" width="8" height="14" rx="2.5" fill="#1b2430"/>
  <path d="M6 21 L24 8 L42 21" stroke="#00A651" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

(A white rounded-rect background is added so the mark is legible on dark browser chrome.)

- [ ] **Step 3: Remove the old default favicon**

```bash
git rm src/app/favicon.ico
```

- [ ] **Step 4: Verify the icon is emitted**

Run: `npm run build`
Expected: build succeeds and the build output/manifest references the app icon (Next emits `/icon.svg` or a hashed icon route). Manual at verify time: open the app, confirm the tab shows the roofline mark, not the old ▲.

- [ ] **Step 5: Commit**

```bash
git add src/app/icon.svg
git commit -m "Replace default favicon with the Build It Together mark"
```

---

## Task 5: Rebrand the auth screens

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx:16-24`

**Interfaces:**
- Consumes: `BrandLockup` (Task 1).
- Produces: every `(auth)` screen (login, forgot-password, reset-password, invite-accept) shows the Build It Together lockup; pre-auth CTAs render in the deeper brand green `#009344`.

- [ ] **Step 1: Rewrite `(auth)/layout.tsx`**

Replace the whole file with:

```tsx
// src/app/(auth)/layout.tsx
import type { CSSProperties, ReactNode } from "react";
import { BrandLockup } from "@/components/brand/BrandLockup";

// Pre-auth surfaces have no tenant, so the platform green drives CTAs.
// Mirror the runtime accent-override pattern used by the worker shell:
// set both the raw token and the Tailwind-mapped color token.
const soft = "color-mix(in srgb, #009344 14%, #fff)";
const brandAccent = {
  "--accent": "#009344",
  "--accent-soft": soft,
  "--color-accent": "#009344",
  "--color-accent-soft": soft,
} as CSSProperties;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={brandAccent}
      className="min-h-dvh grid place-items-center bg-bg px-4"
    >
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <BrandLockup sublabel="Project Hub · Time & Billing" />
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the in-card brand block from `login/page.tsx`**

In `src/app/(auth)/login/page.tsx`, replace this block (the `<div className="mb-5">…</div>`):

```tsx
      <div className="mb-5">
        <div className="size-10 rounded-control bg-accent text-white grid place-items-center font-bold mb-3">
          JH
        </div>
        <h1 className="text-title font-semibold">Sign in</h1>
        <p className="text-sub text-muted mt-1">Artisan Project Hub</p>
      </div>
```

with:

```tsx
      <div className="mb-5">
        <h1 className="text-title font-semibold">Sign in</h1>
      </div>
```

(The mark + brand now come from the layout lockup above the card; the card keeps a clean "Sign in" heading.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.
Manual (verify time): `npm run dev` → `/login` shows the lockup header, no `JH` tile, and the "Sign in" button is the deeper green. Check `/forgot-password` also shows the lockup.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/layout.tsx" "src/app/(auth)/login/page.tsx"
git commit -m "Rebrand auth screens with Build It Together lockup + brand-green CTA"
```

---

## Task 6: Sidebar world labels + powered-by footer

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/app/(artisan)/layout.tsx:38-42`
- Modify: `src/app/(portal)/layout.tsx`
- Modify: `src/app/(timebilling)/tb/layout.tsx:22`

**Interfaces:**
- Consumes: `productLabel` (Task 2), `PoweredByFooter` (Task 1).
- Produces: the main shell sidebar shows the product name as the world label and a "powered by Build It Together" strip at the bottom, across Project Hub / portal / Time & Billing.

- [ ] **Step 1: Update `Sidebar.tsx` — imports, fallback, footer**

In `src/components/shell/Sidebar.tsx`:

(a) Extend the imports:

```tsx
import { navFor, navLabel, productLabel, type World } from "./nav";
import { signOut } from "@/lib/auth-actions";
import { PoweredByFooter } from "@/components/brand/PoweredByFooter";
```

(b) Replace `FALLBACK_BRAND` with neutral platform fallbacks sourced from `productLabel`:

```tsx
// Fallback for worlds whose layout hasn't been wired to real org data yet.
// Neutral platform placeholders (no tenant identity here).
const FALLBACK_BRAND: Record<World, Brand> = {
  artisan: { tile: "BIT", name: "Workspace", label: productLabel("artisan") },
  portal: { tile: "BIT", name: "Workspace", label: productLabel("portal") },
  timebilling: { tile: "BIT", name: "Workspace", label: productLabel("timebilling") },
};
```

(c) Add the footer as the **last child** of the `<aside>`, immediately after the closing `</div>` of the "Account footer" block and before `</aside>`:

```tsx
      {/* Platform footer */}
      <div className="px-4 py-3 border-t border-line">
        <PoweredByFooter />
      </div>
    </aside>
```

- [ ] **Step 2: Point the artisan layout label at `productLabel`**

In `src/app/(artisan)/layout.tsx`, the `AppShell` `brand` prop currently reads:

```tsx
      brand={{
        tile: org.initials,
        name: org.name,
        label: `${org.member_noun} workspace`,
      }}
```

Change the `label` line (and add the import). Add near the other imports:

```tsx
import { productLabel } from "@/components/shell/nav";
```

and set:

```tsx
      brand={{
        tile: org.initials,
        name: org.name,
        label: productLabel("artisan"),
      }}
```

- [ ] **Step 3: Point the portal + timebilling layouts at `productLabel`**

In `src/app/(timebilling)/tb/layout.tsx`, add the import:

```tsx
import { productLabel } from "@/components/shell/nav";
```

and change the brand label:

```tsx
      brand={{ tile: org.initials, name: org.name, label: productLabel("timebilling") }}
```

In `src/app/(portal)/layout.tsx`, add the same import and set the portal brand's `label` to `productLabel("portal")` (replace the literal `"Customer portal"` string wherever the `brand={{ … label: … }}` is constructed).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.
Manual (verify time): the Project Hub sidebar shows the tenant name on top with "Project Hub" beneath it, and a "powered by Build It Together" strip at the very bottom; the tenant monogram/color still lead.

- [ ] **Step 5: Commit**

```bash
git add "src/components/shell/Sidebar.tsx" "src/app/(artisan)/layout.tsx" "src/app/(portal)/layout.tsx" "src/app/(timebilling)/tb/layout.tsx"
git commit -m "Sidebar: product-name world labels + 'powered by Build It Together' footer"
```

---

## Task 7: Worker `/log` shell footer

**Files:**
- Modify: `src/app/(worker)/log/layout.tsx`

**Interfaces:**
- Consumes: `PoweredByFooter` (Task 1).
- Produces: the worker field-app shell shows the same "powered by Build It Together" strip at the bottom.

- [ ] **Step 1: Add the footer to the worker layout**

In `src/app/(worker)/log/layout.tsx`:

(a) Add the import near the top:

```tsx
import { PoweredByFooter } from "@/components/brand/PoweredByFooter";
```

(b) Insert a footer after the `</main>` closing tag and before the outer `</div>`:

```tsx
      </main>
      <footer className="px-4 py-3 border-t border-line bg-surface flex justify-center">
        <PoweredByFooter />
      </footer>
    </div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.
Manual (verify time): the `/log` worker screen shows the powered-by strip at the bottom.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(worker)/log/layout.tsx"
git commit -m "Worker /log shell: add 'powered by Build It Together' footer"
```

---

## Task 8: Full gate + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `productLabel` tests (should be 86 total — the prior 83 plus the 3 new).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual smoke (at verify/cutover time, not required to close the plan)**

Run `npm run dev` and confirm:
- Browser tab: "Build It Together" + roofline favicon.
- `/login`: lockup header, no `JH` tile, deeper-green "Sign in" button; `/forgot-password` also branded.
- Project Hub sidebar (sign in as an existing CRM tenant): tenant name + color lead; "Project Hub" world label; "powered by Build It Together" footer.
- `/tb` (Time & Billing) and `/log` (worker) both show the powered-by footer; tenant theming intact.

There is **no migration and no RLS change**, so cutover is a Vercel deploy only (no `supabase db push`).

---

## Self-Review Notes (checked against the spec)

- **Spec §1 naming / retire Artisan** → Task 3 (metadata), Task 5 (login subtitle), Task 6 (world label `${member_noun} workspace` → "Project Hub"). Internals left per Global Constraints. ✓
- **Spec §2 logo assets** → Task 1 (`BrandMark`/`BrandLockup`), Task 4 (`icon.svg`). The spec's `public/brand/mark.svg` is intentionally **not** created: the mark is realized where it's consumed (inline in `BrandMark`, and as `src/app/icon.svg` for the favicon); an unreferenced `public/` copy would be dead weight (YAGNI). ✓
- **Spec §3 auth screens** → Task 5 (lockup in layout, `--accent` override, login cleanup). ✓
- **Spec §4 labels + footer** → Task 2 (`productLabel`), Task 6 (Sidebar + main-app layouts), Task 7 (worker shell). ✓
- **Spec §5 metadata/tagline** → Task 3. ✓
- **Spec testing** → the spec listed component-render assertions for `BrandMark`/`BrandLockup`/`Sidebar`; realized instead as a pure `productLabel` Vitest test (Task 2) + build/manual verification, because the repo has no render harness and the spec forbids new deps (Global Constraints). This is the faithful adaptation, not a gap. ✓
- **Colors** — `#00A651` roofline appears in `BrandMark` + `icon.svg`; `#009344` CTA appears in the auth layout accent override. ✓
- **Type consistency** — `productLabel(world: World)` defined in Task 2 and consumed with the same signature in Task 6; `PoweredByFooter`/`BrandLockup` prop names match between Task 1 and Tasks 5–7. ✓
