# Artisan Project Hub — Interface Design

*Companion to [`mvp-spec.md`](mvp-spec.md). Defines navigation, screen layouts, screen
contents, and the flows between them for both the artisan app and the read-only contact
portal. Desktop-first, but built to be worked one-handed on a phone at a job site.*

---

## 1. Design principles

The app is two experiences sharing one codebase: a **full-control artisan app** and a
**read-only contact portal**. They never blur together — a logged-in user lands in exactly
one of them based on their role, and the visual language signals which world they're in.

Five constraints shape every screen:

1. **Job-site mobile is a first-class case, not a shrink.** A contractor opens this in
   sunlight, with dusty hands, one thumb free, on a weak signal. Primary actions sit within
   thumb reach, tap targets are large (min 44px), contrast is high, and the camera is one
   tap from the project. Typing is minimized in favor of taps, toggles, and capture.
2. **The Project is the center of gravity.** Customers and Contacts exist to organize
   projects; the **Project Detail** screen is where real work happens and is the single
   most-used screen on the phone. It gets the most design attention.
3. **Shared vs. private is always visible.** Because `is_shared` decides what the customer
   sees, every status update and file shows its sharing state at a glance, and the toggle to
   change it is one tap — never buried in a menu.
4. **Nothing is destroyed.** "Delete" archives. The UI says *Archive*, archived items leave
   the main views but stay recoverable, and the language never implies permanent loss.
5. **Calm and professional.** Generous whitespace, one accent color, a restrained type
   scale. The artisan is showing this to paying customers; it should feel like a tool a
   trustworthy professional uses.

---

## 2. Navigation model

The same information architecture renders two ways depending on viewport.

### Desktop (≥ 1024px) — persistent left sidebar

A fixed 240px sidebar carries the primary destinations with the org name/logo at top and
the user/account menu at the bottom. The main content area uses a centered max-width column
(~1100px) so wide monitors don't stretch lines of text. List screens may use a two-pane
pattern (list on the left, detail on the right) where it helps.

```
┌────────────┬───────────────────────────────────────────┐
│ Org name   │  Page title                    [+ action]  │
│            │                                            │
│ ▸ Dashboard│   ┌──────────────────────────────────────┐ │
│ ▸ Projects │   │                                      │ │
│ ▸ Customers│   │            content                   │ │
│ ▸ Contacts │   │                                      │ │
│            │   └──────────────────────────────────────┘ │
│ ───────    │                                            │
│ ⚙ Settings │                                            │
│ ◯ Account  │                                            │
└────────────┴───────────────────────────────────────────┘
```

### Mobile (< 768px) — top bar + bottom tab bar

The sidebar collapses into a **fixed bottom tab bar** — the single most important mobile
decision, because it keeps navigation under the thumb instead of at the top of a tall
screen. A slim top bar carries the screen title, a back affordance on detail screens, and
context actions (search, filter). A floating **camera/＋ action button** sits above the tab
bar on screens where capture or creation is the main verb.

```
┌─────────────────────────────┐
│ ‹ Project title        ⋯    │  top bar (title + overflow)
├─────────────────────────────┤
│                             │
│         content             │
│         (scrolls)           │
│                        ┌──┐ │
│                        │📷│ │  floating action (context-dependent)
│                        └──┘ │
├─────────────────────────────┤
│  ▦      ▤       ◑      ◯    │  bottom tabs
│ Dash  Projects Custm  More  │
└─────────────────────────────┘
```

Tablet (768–1023px) uses the desktop sidebar in a collapsed icon-rail form, expanding on
tap.

### Tab set

| Tab | Artisan app | Contact portal |
| --- | --- | --- |
| 1 | Dashboard | My Projects |
| 2 | Projects | *(project detail is reached from the list)* |
| 3 | Contacts | — |
| 4 | **More** | Account |

On mobile the artisan app shows four tabs: **Dashboard · Projects · Contacts · More**.
**Contacts** earns a permanent spot on the bar because it's reached constantly on site —
calling or texting a customer or partner, checking who's attached — so it must be one thumb
tap away. *More* holds **Customers**, Settings, and Account; Customers is more of an
office/organizing task than a job-site one, so it trades places with Contacts on the phone
(it keeps its own top-level spot in the desktop sidebar). The portal stays deliberately
tiny: **My Projects** and **Account**.

---

## 3. Artisan screens

### 3.1 Dashboard

**Purpose.** The morning glance: what's active, what needs doing, what just happened.

**Layout.** Three stacked bands in the content column.

- **Entity cards** — a row of three count cards (*Projects · Customers · Contacts*), each
  showing how many exist and linking straight into that area of the app. They're the fast
  jump-off into the three core lists. On mobile they stay a single row of three compact
  tiles.
- **To-dos across all projects** — a combined, checkable list pulled from every active
  project, each item showing its project name and due date, soonest first. Checking an item
  completes it in place. This is the one place to-dos are aggregated.
- **Recent activity** — a reverse-chronological feed of status updates posted and files
  uploaded, each linking to its project. Gives a sense of momentum and a fast jump back into
  recent work.

**Primary action.** `+ New project` (top-right on desktop; in the More/＋ menu on mobile).

**Mobile.** Single column, the stage grid first so the numbers are visible without
scrolling, then to-dos, then activity.

### 3.2 Projects (list)

**Purpose.** Find and triage every project.

**Layout.** A search field and a stage filter (segmented control on desktop, a dropdown
chip on mobile) sit at the top. Below, projects are **grouped by stage** with a count per
group; within a group each project is a row/card showing project name (the site address),
customer name, stage chip, and start/end dates. A secondary filter narrows by customer.

**Row anatomy.** `Project name (site address)` · `customer` · `stage chip` · `dates` · a
faint count of attached contacts and unread-to-you nothing (no notifications in MVP).

**Actions.** Tap a row → Project Detail. `+ New project` opens a create form (name/site
address, pick customer, set stage, optional dates).

**Mobile.** Cards stack full-width; the stage filter is a horizontally scrollable chip row;
search is a tap on the top-bar magnifier that expands an input.

### 3.3 Project Detail — the workhorse

**Purpose.** Run one project end to end. This screen is the product. It must be excellent on
a phone in a driveway.

**Header (sticky).** Project name (site address) · customer (links to Customer Detail) ·
**stage control** (a segmented control / dropdown to move Proposal → Signed → In Progress →
Completed) · an overflow menu with *Edit* and *Archive*.

**Body — tabbed sections.** On desktop these can be a single scrolling page with anchored
sections; on mobile they become a swipeable/tap **tab strip** directly under the header so a
worker jumps straight to *Photos* without scrolling past everything else.

1. **Updates** — the status-update timeline, newest first. Each update shows body text,
   timestamp, and a clear **Shared / Private** indicator with a one-tap toggle. A composer at
   the top (or behind the ＋ button on mobile) posts a new update; a **Share with customer**
   switch sits right in the composer, defaulting to private.
2. **Photos & Files** — a unified attachments grid (thumbnails for images, typed icons for
   documents). Each tile carries its **category** badge (*before · after · plans · permits ·
   proposal · contract · invoice · other*) and a **share toggle**. The grid is filterable by
   category.
   The prominent action here is **capture/upload**:
   - On mobile, a large **camera button** (the floating action button) opens the device
     camera directly, then lets you pick category and share state before it saves. This is the
     single most-used mobile interaction — photographing before/after work — so it is one tap
     from the project.
   - On desktop, a drag-and-drop / file-picker zone with the same category + share controls.
   New uploads default to **private**.
3. **To-dos** — an internal checklist (text + due date + done). Never shown in the portal,
   and the UI labels the section *Internal* so the artisan trusts it's private. Quick-add
   field at the top; check to complete.
4. **Contacts** — the people attached to this project (the access grants). Each row shows
   name, type (*partner · prospect · customer*), and **login status** (No login · Invited ·
   Active). Actions: **Attach contact** (search existing contacts and link them — this is
   what grants portal access), **Detach**, and **Invite** (sends the portal invitation email
   to an attached contact). A short inline note reminds the artisan that attaching is what
   lets someone see the project.

**Why tabs on mobile, sections on desktop.** A job-site visit is usually about *one* of
these things — take photos, or post an update. Tabs put each one a single tap away. A desk
session is often a sweep across all of them, so a scroll page with a jump-to rail reads
better on a big screen.

### 3.4 Customers (list) → Customer Detail

**List.** Searchable list of customer accounts; each row shows name, address, and a count of
its projects. `+ New customer`.

**Detail.** Customer name and address up top with *Edit* / *Archive* in an overflow menu.
The body is **that customer's projects** (grouped by stage, same row style as the Projects
list) plus the customer's notes. `+ New project` here pre-fills the customer. This screen
answers "show me everything for this account."

### 3.5 Contacts (list) → Contact Detail

**List.** Searchable, **filterable by type** (partner / prospect / customer). Each row:
name, type chip, email/phone, and login status. `+ New contact`.

**Detail.** Contact's name, type, email, phone, and optional linked customer, with *Edit* /
*Archive*. Two informative blocks: **Attached projects** (which projects this person can see)
and **Login status** (No login · Invited · Active), with an **Invite** action when they're
attached to at least one project but have no login yet. This is the place to understand and
manage a single person's access across projects.

### 3.6 Settings / Account

Minimal in MVP: organization name, the signed-in user, sign out, and an **Archived items**
view (recover archived customers/contacts/projects). Lives under *More* on mobile.

---

## 4. Contact portal screens (read-only)

The portal is intentionally small, calm, and obviously *theirs* — a different accent tint
and no creation affordances anywhere, so a customer never sees a button they can't use.

### 4.1 My Projects

A simple list of the projects this contact is attached to, segmented into **Current ·
Proposal · Past**. Each card shows the project name (site address), the artisan/org, the
stage, and the date of the most recent shared update so they can tell at a glance what's
moving. Tapping opens the project.

### 4.2 Project Detail (portal)

A read-only view of one project with two sections:

- **Updates** — the timeline of **shared** status updates only, newest first, each with its
  date. No composer, no toggles.
- **Photos & Files** — a grid of **shared** attachments only, each openable/downloadable.
  Image tiles show thumbnails; documents show a typed icon and filename.

To-dos and anything marked private simply do not exist in this view. There are no edit,
post, or share controls anywhere.

**Conscious cut, made visible-friendly.** The portal is view-only — no comment or
acknowledge. The layout leaves an obvious slot beneath each update where a lightweight
*acknowledge / comment* control would later land, so the planned fast-follow drops in
without a redesign.

### 4.3 Account (portal)

Name, email, password change, sign out. Nothing else.

---

## 5. Cross-cutting patterns

**Share toggle.** One consistent control everywhere `is_shared` applies (status updates,
attachments). Visual states: a filled "Shared" pill (with the accent) vs. an outline
"Private" pill. One tap flips it, with an instant optimistic update. Default on creation is
always **Private**.

**Attach-to-grant.** Granting access is always the same gesture: open a project's *Contacts*
tab → **Attach contact** → search/select. The UI consistently frames attaching as "give this
person access," and detaching as "remove access," so the mental model matches the RLS
reality.

**Invite flow.** From a project's Contacts tab or from Contact Detail: **Invite** → confirm
email → status moves to *Invited*. When the contact accepts and sets a password, status
becomes *Active*. The artisan never handles tokens; they just see the status progress.

**Capture/upload.** The same category + share-state mini-form follows every new attachment,
whether it came from the phone camera, a photo library, or a desktop file drop — so the
saving step is identical and predictable.

**Archive (not delete).** Destructive-looking actions read *Archive*, are confirmed once,
and move the item out of the main lists into the Settings → Archived view, recoverable. Copy
never says "delete permanently."

**Empty states.** Every list has a friendly empty state with the single relevant primary
action (e.g., an empty Projects list shows "No projects yet — *Create your first
project*"). This is especially important for a newly onboarded artisan staring at a blank
app.

**Search & filter.** Lists share one pattern: a search field plus context filters (stage for
projects, type for contacts). On mobile, search is a top-bar icon that expands; filters are a
scrollable chip row.

---

## 6. Navigation map

```
ARTISAN APP
  Dashboard
    ├─ stage card ─────────────► Projects (filtered by stage)
    ├─ to-do item ────────────► (completes in place)
    └─ activity item ─────────► Project Detail

  Projects (list, grouped by stage)
    └─ project ───────────────► Project Detail
                                  ├─ Updates  (post + share toggle)
                                  ├─ Photos & Files (capture/upload + share)
                                  ├─ To-dos   (internal)
                                  └─ Contacts (attach/detach + invite)
                                        └─ customer link ─► Customer Detail

  Customers (list)
    └─ customer ──────────────► Customer Detail
                                  └─ project ─► Project Detail

  Contacts (list, filter by type)
    └─ contact ───────────────► Contact Detail
                                  ├─ attached projects ─► Project Detail
                                  └─ Invite

  More → Settings / Account / Archived items


CONTACT PORTAL  (read-only)
  My Projects (Current · Proposal · Past)
    └─ project ───────────────► Project Detail (portal)
                                  ├─ shared Updates
                                  └─ shared Photos & Files (open/download)
  Account
```

**Entry routing.** On login, `middleware` sends the user to the artisan app if they have an
`organization_members` row, or to the portal if they're a contact with a login — the two
worlds never cross-link, and an unauthenticated user is bounced to sign-in.

---

## 7. Visual system (lightweight)

Enough to keep the mockup and the eventual build consistent; not a full brand system.

- **Color.** A neutral gray canvas (white surfaces, gray-50/100 backgrounds, slate text)
  with **one accent** for primary actions, active nav, and the "Shared" state. The portal
  uses a distinct accent tint so customers always know they're in their window, not the
  artisan's tool.
- **Stage chips.** A consistent muted color per stage (e.g., proposal = slate, signed =
  indigo, in progress = amber, completed = green) reused everywhere a stage appears.
- **Type.** One sans-serif, ~4 sizes (page title, section title, body, caption). Generous
  line height for readability in sunlight.
- **Components.** Cards with soft shadows and rounded corners; pill chips for stage, type,
  and share state; 44px+ tap targets; sticky headers on detail screens; a floating action
  button on mobile capture/create screens.
- **Touch ergonomics.** Primary actions bottom-anchored within thumb reach on mobile;
  confirm dialogs reachable one-handed; toggles and checkboxes oversized.

---

## 8. Responsive breakpoints

| Range | Layout |
| --- | --- |
| < 768px (phone) | Top bar + bottom tab bar; single column; project sections become tabs; floating camera/＋ action; expand-on-tap search. |
| 768–1023px (tablet) | Collapsible icon sidebar; single or comfortable two-column content; project detail as a scroll page with a tab strip. |
| ≥ 1024px (desktop) | Persistent 240px sidebar; centered ~1100px content; optional two-pane list+detail; project detail as anchored scrolling sections with a jump rail. |

The phone and desktop layouts are designed in parallel, not derived one from the other — the
job-site phone case is too important to treat as a fallback.
