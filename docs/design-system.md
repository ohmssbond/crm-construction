# Artisan Project Hub — Design System

*The single visual contract for the app. Every screen, present and future, is built from
the tokens, layout rules, and components defined here so the product always looks like one
app. Companion files: machine-readable tokens in [`design-tokens.css`](design-tokens.css);
the worked reference implementation in [`interface-mockup.html`](interface-mockup.html);
screen-level intent in [`interface-design.md`](interface-design.md).*

---

## 0. How to use this system

This document is the source of truth. When you design or build a new page:

1. **Theme from tokens only.** Never hard-code a hex value, radius, shadow, or font size.
   Use the variables in `design-tokens.css`. If a value isn't a token, it doesn't belong on
   the screen until it's added here.
2. **Reach for an existing component before inventing one.** The component library in §6
   covers almost everything. Compose those rather than introducing a one-off.
3. **If the system lacks something, extend the system first, then use it.** Add the token or
   component here (and to `design-tokens.css`), then build with it — see §11 Governance. This
   is how we keep twenty screens looking like one app.
4. **Honor the two worlds.** The artisan app is green; the customer portal is blue. The only
   difference is the accent — set `data-world="portal"` and everything else stays identical.

A page is "on-system" when every color is a token, every interactive target meets the touch
minimum, every status/stage uses the standard chip, and nothing introduces a new pattern
that an existing component already covers.

---

## 1. Design principles

The rules below all serve these five principles. When a judgment call isn't covered by a
specific rule, decide in their favor.

1. **Job-site mobile is first-class.** Designed for sunlight, dusty hands, one thumb, weak
   signal. Primary actions sit in thumb reach; targets are large; contrast is high; capture
   and toggles beat typing.
2. **The Project is the center of gravity.** The Project Detail screen is the product; it
   gets the most care, especially on phone.
3. **Shared vs. private is always visible.** Because `is_shared` decides what the customer
   sees, the sharing state shows on every update and file, and the toggle is one tap.
4. **Nothing is destroyed.** "Delete" archives. Language never implies permanent loss.
5. **Calm and professional.** Generous whitespace, one accent, a restrained type scale. This
   is a tool a trusted professional shows to paying customers.

---

## 2. Color

One neutral palette plus a single accent per world. Color carries meaning here — it is never
decorative.

### Neutrals & text

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#f4f5f7` | App canvas behind cards |
| `--surface` | `#ffffff` | Cards, bars, sheets, inputs |
| `--line` | `#e4e7ec` | Default borders & dividers |
| `--line-2` | `#eef0f3` | Subtle row dividers, hover fills |
| `--text` | `#1b2430` | Primary text |
| `--muted` | `#667085` | Secondary text, labels, section headers |
| `--faint` | `#98a2b3` | Timestamps, captions, placeholders |

### Brand accent (two worlds)

| Token | Hex | Use |
| --- | --- | --- |
| `--accent` | `#2f6f5e` (green) | **Artisan** primary actions, active nav, "Shared" state, focus |
| `--accent-soft` | `#e7f1ee` | Active-nav fill, soft accent backgrounds |
| `--portal` | `#2563a8` (blue) | **Customer portal** accent (swaps in via `data-world="portal"`) |
| `--portal-soft` | `#e6eef7` | Portal soft backgrounds |

The portal is intentionally a different accent so a customer always knows they're in *their*
view, not the artisan's tool. Switching worlds changes **only** the accent — never the
layout, components, or neutrals.

### Stage & status colors

Each project stage and status has one fixed pairing (solid text on a soft background), reused
everywhere the value appears so a stage always reads the same.

| Meaning | Text token | Soft bg | Used by |
| --- | --- | --- | --- |
| Proposal | `--proposal` `#475467` | `#eef1f4` | stage chip, contact `type` chip, "No login" |
| Signed | `--signed` `#4f46e5` | `#eceafe` | stage chip |
| In progress | `--progress` `#b54708` | `#fdf0e6` | stage chip, "Invited" status |
| Completed | `--completed` `#157347` | `#e6f4ec` | stage chip, "Active" login status |

**Rule:** never represent stage or status with a free-chosen color or with text alone in a
neutral — always use the standard chip (§6) so the mapping stays learnable.

---

## 3. Typography

One sans-serif family (`--sans`, the system stack) and a tight scale. Resist adding sizes.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Page title | `17px` (`--fs-title`) | 650 | In the top bar; 16px on phone |
| Section label | `13px` (`--fs-section`) | 700 | UPPERCASE, `letter-spacing:.5px`, color `--muted` |
| Body / row title | `13.5px` (`--fs-body`) | 600 (titles) / 400–550 (text) | Default reading size |
| Secondary line | `12.5px` (`--fs-sub`) | 500 | Sub-text under a title, color `--muted` |
| Meta / timestamp | `11.5px` (`--fs-meta`) | 500 | Color `--faint` |
| Chip / pill | `11px` (`--fs-chip`) | 650 | All chips, share pills |
| Big stat | `26px` (`--fs-stat`) | 700 | Dashboard counts |

Line-height is comfortable (~1.45 body) for legibility in bright light. Use **sentence
case** for everything except section labels (which are uppercase). No all-caps buttons.

---

## 4. Spacing, radius & sizing

- **Spacing scale (px):** `4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 22 · 24`. Card padding is
  `13–16px`; the standard gap between cards/tiles is `12px`; content gutters are `24px`
  desktop / `14px` phone. Don't invent in-between values.
- **Radius:** `--r` `14px` for cards and large containers; `--r-sm` `9px` for tiles,
  buttons, inputs, and nav items; `--r-pill` `99px` for all chips, pills, and toggles.
- **Touch targets:** minimum `44px` (`--tap-min`) hit area for anything tappable. A control
  may *look* smaller (e.g. a checkbox), but its tappable area must not be.
- **Borders:** `1px solid --line`; use `--line-2` for the quieter dividers between list rows.

---

## 5. Elevation

Two levels only.

- **`--shadow`** — resting elevation for cards, stat cards, tiles, update cards, composers.
  Soft and barely-there.
- **`--shadow-lg`** — floating elevation for the mobile FAB, popovers/sheets, and the device
  frame itself.

Borders do most of the separation work; shadows are a gentle lift, never a drop-shadow
flourish.

---

## 6. Layout system

The same information architecture renders two ways. Build both deliberately — the phone is
not a fallback.

### Desktop (≥ 1024px)

- **Sidebar:** fixed `--sidebar-w` `236px`, `--surface`, right border `--line`. Brand block
  (logo tile + org name + world label) top; nav links middle; user/account footer bottom.
- **Nav link:** `9px 11px`, radius `--r-sm`, `--muted` text; active state uses
  `--accent-soft` fill + `--accent` text + heavier weight. Exactly one active item.
- **Top bar:** height `--topbar-h` `60px`, `--surface`, bottom border `--line`; holds the
  page title (+ optional sub), a right-aligned primary action on list screens, and a back
  affordance on detail screens.
- **Content:** scrolls; centered column capped at `--content-max` `1000px` so text lines
  don't stretch on wide monitors.

### Phone (< 768px)

- **No sidebar.** A fixed **bottom tab bar** (`--tabbar-h` `64px`, `--surface`, top border)
  keeps navigation under the thumb. Four tabs max; active tab uses the accent.
- **Top bar** shrinks to `54px` with a `‹` back control on detail screens.
- **Floating action button (FAB):** `56px` circle, accent fill, `--shadow-lg`, bottom-right
  above the tab bar. Context-aware — it's the **camera** on the project Photos tab, a **＋**
  on creatable list screens, and absent where there's no primary create/capture verb.
- **Project sections become tabs** so a worker taps straight to Photos or Updates.

### Tablet (768–1023px)

Collapsible icon-rail sidebar that expands on tap; project detail as a scroll page with a tab
strip.

### Standard tab sets

| | Artisan (mobile) | Portal (mobile) |
| --- | --- | --- |
| Bottom tabs | Dashboard · Projects · Contacts · More | My Projects · Account |

Contacts holds a permanent mobile tab (reached constantly on site); Customers lives under
*More* on phone but keeps a top-level sidebar slot on desktop.

---

## 7. Component library

Each component below is canonical. Use it as specified; compose, don't fork.

**Buttons.** Primary = accent fill, white text, `9px 15px`, radius `--r-sm`, 13px/600. Ghost
= white fill, `--text`, `--line` border. `.sm` = `6px 11px`, 12px. One primary action per
view, top-right (desktop) or as the FAB (phone). Portal buttons use the portal accent
automatically.

**Stage chip.** Pill, 11px/650, soft-bg + solid-text per the §2 stage pairing. The only way
to show a stage. Reused on project rows, detail headers, dashboard, and portal.

**Type chip.** Pill for contact `type` (partner / prospect / customer) — neutral
`#eef1f4` / `#475467`.

**Login-status chip.** `○ No login` (faint neutral), `● Invited` (progress/amber),
`● Active` (completed/green). Shows portal access state on contacts.

**Share toggle (pill).** The one control for `is_shared`. Two states: **Shared** = filled
accent pill (`◉ Shared`); **Private** = outline neutral pill (`○ Private`). One tap flips it
with an optimistic update. **New content defaults to Private.** Appears on every status
update and every attachment.

**Segmented control.** White, `--line` border, radius `10px`; the selected segment uses
`--accent-soft` / `--accent`. For small mutually-exclusive switches (e.g. stage control).

**Filter chip row.** Horizontally scrollable pills; the selected pill is solid `--text` on
white others. For list filters (stage, category, contact type) — scrolls on phone.

**Search field.** White, `--line` border, radius `10px`, leading `🔍`, `--faint`
placeholder. Top of every list. On phone it may collapse to a top-bar icon that expands.

**Tabs (underline).** Row of text tabs with a 2px accent underline on the active one; used
inside Project Detail. Horizontally scrollable on phone.

**Card.** `--surface`, `--line` border, radius `--r`, `--shadow`. The universal container.
Lists are a single card with divided rows.

**List row.** `13px 16px`, leading 38px thumb or avatar, title (13.5/600) + sub (12/muted),
right-aligned meta (chip and/or timestamp), `--line-2` divider, hover `--line-2`. The
standard row for projects, customers, contacts, files-as-list, activity. Whole row is the tap
target.

**Thumb / avatar.** 38px rounded-9 thumb for entities/files (emoji or type icon on
`--line-2`); round avatar with initials for people.

**Stat card.** `--surface` card with a 26px count and a labeled, icon-led caption; tappable,
links into its area. Dashboard uses three: Projects · Customers · Contacts.

**Update card.** Card holding a share toggle + timestamp header and body text. The portal
variant drops the toggle and leaves a dashed "acknowledge / comment" slot for the planned
fast-follow.

**Composer.** Card with a placeholder input and a footer row carrying the **Share with
customer** toggle (default off) and a Post button. On phone, posting may sit behind the FAB.

**File tile & grid.** Responsive grid (4-up desktop, 2-up phone) of tiles: a colored
preview area (thumbnail or typed icon) + a caption row with filename and share toggle. Each
tile carries a **category**: `before · after · plans · permits · proposal · contract ·
invoice · other`. New uploads default to Private.

**To-do row.** Oversized checkbox + text + due date; checking strikes through in place.
Always labeled **Internal** in context — never shown in the portal.

**Banner.** Soft accent-tinted info strip with an icon, for one-line context (e.g. "To-dos
are internal," portal welcome). Portal banners use the portal tint.

**Empty state.** Centered, a large glyph + a short line + the single relevant primary action
(e.g. "No projects yet — Create your first project"). Every list has one.

**Key–value rows.** Label (`--muted`, fixed ~108px) + value, divided by `--line-2`. For
detail facts (email, phone, org).

**Note / hint.** Dashed-border `#fafbfc` block, 12px `--muted`, for inline guidance (e.g. the
"attaching grants access" reminder).

---

## 8. Iconography

The mockup uses emoji as placeholders so the system reads without an icon dependency.
**Production should use one icon set** (recommend `lucide-react`, already available) at a
consistent stroke weight, swapped 1:1 for the placeholders. Rules: one set only; icons are
`--muted` by default and accent when active; an icon never appears without a text label in
navigation; file-type and category glyphs stay consistent (e.g. plans = ruler/📐, permits =
clipboard/📋).

---

## 9. Content & voice

- **Sentence case** everywhere except UPPERCASE section labels.
- **Archive, never delete.** Destructive-looking actions read "Archive," confirm once, and
  remain recoverable. Never "delete permanently."
- **Sharing language is consistent:** "Shared" / "Private," "Share with customer," "Attach
  contact" = grant access, "Detach" = remove access.
- **Access is framed plainly:** attaching a contact "gives this person access"; the UI says
  so near the action.
- Keep microcopy short and concrete; prefer a verb ("Invite," "Attach," "Post") over a noun.

---

## 10. Interaction & accessibility

- **Optimistic toggles.** Share pills and checkboxes flip instantly; reconcile in the
  background.
- **One primary action per screen**, always reachable one-handed on phone (top-right on
  desktop, FAB on phone).
- **Targets ≥ 44px**, generous spacing between adjacent tappable items.
- **Contrast:** body text and chips meet WCAG AA on their backgrounds; don't place `--faint`
  on anything but white/`--bg`.
- **Focus:** every interactive element needs a visible focus ring (accent) for keyboard use
  on desktop.
- **State legibility in sunlight:** rely on shape + label + color together for status, never
  color alone (chips pair a fill with text; toggles pair a fill with a word).

---

## 11. Governance — extending the system

The system is allowed to grow; it is not allowed to fork.

1. **Need a value that doesn't exist?** Add a token to `design-tokens.css` and document it in
   §2–§5 here. Then use the token. Don't hard-code "just this once."
2. **Need a UI pattern not in §7?** First confirm no existing component composes to it. If
   it's genuinely new, add it to §7 with its anatomy, variants, and states, then build it.
3. **Reference implementation stays current.** When a component changes, update
   `interface-mockup.html` so the live reference and this doc never disagree.
4. **Two-world check.** Any new component must work in both the artisan (green) and portal
   (blue) worlds with no change beyond the accent.
5. **Review against §0's "on-system" checklist** before shipping a screen.

Keeping these three files in lockstep — `design-system.md` (the rules),
`design-tokens.css` (the values), and `interface-mockup.html` (the proof) — is what makes
every future page belong to the same app.
