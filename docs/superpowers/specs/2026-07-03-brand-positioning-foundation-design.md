# Brand & Positioning Foundation — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Scope:** Piece #1 of a 4-part branding/positioning effort. Establishes the platform brand ("Build It Together"), retires "Artisan", fixes the login/auth screens, and gives the platform a restrained presence inside every tenant workspace.

## Context

The app is a multi-tenant platform, live in prod at app.build-it-together.com, but "Build It Together" appears **nowhere on screen**. The login screen is hardcoded to a generic `JH` tile + "Artisan Project Hub", and the browser title is still "Artisan Project Hub". Inside the app, branding is per-tenant (`org.name` / `primary_color` / derived monogram, resolved in `src/lib/data/org.ts`), which is correct — but the platform itself is invisible, and the word "Artisan" leaks into the UI via the workspace label.

This is the first of four independent pieces (brand foundation → public landing page → per-project imagery → generic app imagery). It is the linchpin: it settles the platform-vs-tenant brand relationship that the other three depend on.

## Brand architecture (decided)

- **Platform:** Build It Together.
- **Products:** **Project Hub** (the CRM/workspace) and **Time & Billing** (the field app).
- **Tenants:** each organization keeps its own name, `primary_color`, monogram, and nouns as their *workspace* brand. The platform never overrides tenant theming.
- **Spirit:** "platform brand, tenant workspaces." Build It Together is present but restrained — it leads pre-auth (login/landing) and sits quietly in a footer post-auth.

### Product → world mapping

| Product | Worlds (route groups) | Sidebar label |
|---|---|---|
| Project Hub | `artisan` (business user), `portal` (customer-facing) | "Project Hub" / "Customer portal" |
| Time & Billing | `timebilling` (`/tb` admin), `worker` (`/log` field app) | "Time & Billing" |

## Visual identity (decided)

- **Logo mark — "Under One Roof":** three ink columns (`#1b2430`) standing under a roofline chevron. The roofline carries the accent. Connotes "the whole crew + the customer, under one roof" = together.
- **Palette:** neutral ink on light surfaces; the green accent appears **only on CTAs and the logo roofline** (tenants bring their own colors, so the platform stays brand-agnostic otherwise).
- **Greens (traffic-signal "go"):**
  - **Logo mark roofline:** vivid **Signal Go `#00A651`**.
  - **Buttons / CTAs (pre-auth):** deeper **`#009344`** — same hue, higher white-text contrast for legibility.

### Mark SVG (canonical)

```svg
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8"  y="26" width="8" height="14" rx="2.5" fill="#1b2430"/>
  <rect x="20" y="20" width="8" height="20" rx="2.5" fill="#1b2430"/>
  <rect x="32" y="26" width="8" height="14" rx="2.5" fill="#1b2430"/>
  <path d="M6 21 L24 8 L42 21" stroke="#00A651" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

The columns use `#1b2430` (the `--text` token value) so the mark reads correctly on light surfaces (login, sidebar footer). A reversed variant for dark surfaces is **not required** for this piece (all placements are on light backgrounds); defer until the landing page needs it.

## Components (new)

Under `src/components/brand/`:

- **`BrandMark`** — renders the mark SVG at a given size. Props: `size?` (px, default ~28), `className?`. Roofline color fixed at `#00A651`. Single responsibility: draw the mark.
- **`BrandLockup`** — the mark + the "Build It Together" wordmark set as **text** (not baked into SVG, so it stays crisp, weightable, and localizable). Optional `sublabel?` prop for the "Project Hub · Time & Billing" product line. Composes `BrandMark`. Used by the auth layout.

Wordmark type: the existing system sans stack (`--sans`), weight 700, tight letter-spacing (`-0.02em`) — matching what we previewed. No web-font dependency introduced in this piece.

## Changes by area

### 1. Logo assets
- Add `public/brand/mark.svg` (the canonical SVG above).
- Replace the favicon using **Next 16's app-icon file convention** (an `icon.svg` in `src/app/`, per the App Router metadata-files docs). **Read `node_modules/next/dist/docs/` before wiring** (AGENTS.md: this is a modified Next — verify the current convention rather than assuming). Remove/replace the existing `src/app/favicon.ico` only after the new icon is confirmed working.

### 2. Metadata — `src/app/layout.tsx`
- `title`: `"Artisan Project Hub"` → a title template `{ default: "Build It Together", template: "%s · Build It Together" }`.
- `description`: → the platform positioning line: **"Run your projects, your crew, and your customers — together."**

### 3. Auth screens — `src/app/(auth)/layout.tsx` + `login/page.tsx`
- **`(auth)/layout.tsx`:** add the `BrandLockup` as a header above the card (centered, with the "Project Hub · Time & Billing" sublabel), so **all** auth screens (login, forgot-password, reset-password, invite-accept) are consistently branded. Set `--accent: #009344` on the auth layout root element so the shared `Button`/`buttonClasses` (`bg-accent`) renders CTAs in the deeper brand green — **no change to the `Button` component itself.**
- **`login/page.tsx`:** delete the hardcoded `JH` tile block (lines ~18–24) and the "Artisan Project Hub" subtitle. The heading stays "Sign in"; brand identity now comes from the layout lockup. (Removing the in-card brand block avoids double-branding under the layout header.)

### 4. In-app world labels + "powered by" footer
- **`src/components/shell/Sidebar.tsx`:**
  - Update `FALLBACK_BRAND`: replace the `JH` / "J Huber Restorations" / "Artisan workspace" placeholders with neutral platform fallbacks (`artisan` label → "Project Hub"; keep "Customer portal" and "Time & Billing"; name fallback → a neutral "Workspace"). The `Brand.tile` field is a `string` monogram rendered in a colored box, so the fallback tile stays a plain monogram (e.g. "BIT") — the SVG mark is **not** used for the tile; it appears only in the footer.
  - Add a **"powered by Build It Together" footer** at the bottom of the sidebar: small `BrandMark` (~16px, vivid `#00A651`) + "Build It Together" wordmark + a muted "powered by" label. Pinned below the nav. The footer mark color is independent of the tenant `--accent`, so tenant theming is untouched.
- **`src/app/(artisan)/layout.tsx`:** change the brand `label` from "Artisan workspace" to **"Project Hub"**. (Portal and Time & Billing layouts already pass "Customer portal" / "Time & Billing" — no change.)
- **`src/app/(worker)/log/layout.tsx`:** this shell is separate from `AppShell`. Add the same "powered by Build It Together" footer for consistency (reusing `BrandMark`/the footer markup).

### 5. Out of scope (explicit)
- Internal identifiers keep "artisan": the `(artisan)/` route group folder, `ARTISAN_PREFIXES` (`src/proxy.ts`), `artisanNav`/`artisanTabs` (`src/components/shell/nav.ts`), and `World = "artisan"`. These never surface to users; renaming is churn with breakage risk and zero user benefit.
- No reversed/dark logo variant (not needed until the landing page).
- The public landing page, per-project imagery, and generic app imagery are **the other three pieces** — not this spec.

## Data / schema / security

**None.** This is a pure presentation/branding pass: no migration, no data-layer change, no RLS change, no new dependency. Tenant branding resolution (`org.ts`) is unchanged.

## Testing

- **Unit (Vitest):**
  - `BrandMark` renders an SVG at the requested size; `BrandLockup` renders the wordmark text and the mark, and conditionally renders the sublabel.
  - `Sidebar` renders the correct product label per world (`artisan` → "Project Hub", `portal` → "Customer portal", `timebilling` → "Time & Billing") and includes the "powered by Build It Together" footer.
- **Manual (post-merge, prod-verify):** login/auth screens show the lockup + deeper-green CTA; sidebar footer shows in Project Hub, portal, Time & Billing, and the worker `/log` shell; tenant monogram/color still lead inside a tenant workspace (spot-check with an existing tenant); browser tab title reads "Build It Together"; favicon updated.
- **Gates:** `npm test` and `npm run build` green before commit/merge.

## Open items the operator can still tweak
- Tagline wording ("Run your projects, your crew, and your customers — together.").
- Whether the powered-by footer belongs in the worker `/log` shell (currently: yes).
