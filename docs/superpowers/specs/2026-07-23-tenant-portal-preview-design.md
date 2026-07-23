# Tenant Preview of the Customer/Partner Portal View — Design

_Date: 2026-07-23_

Backlog #5 (preview). Let a tenant see a project exactly as their customer/partner
sees it in the portal — a **read-only render** (not impersonation), opened in a **new
tab**, with a **role switcher**.

## Goals

- From an artisan project page, open a **portal-styled** preview of that project in a
  **new tab**.
- A **role switcher** (Customer / Partner) — the views are identical today but the
  data path is role-parameterized so the tenant/customer/partner views can diverge
  later.
- Read-only, live (renders current shared state). No auth/session changes, no
  impersonation, no new DB.

## Decisions (from brainstorming)

- **Read-only render**, not impersonation (see backlog #5 rationale).
- **Role picker**, not person picker — `role: "customer" | "partner"`. Same output
  today; the parameter is the seam for future divergence.
- **Portal-styled**, its own preview chrome (see Chrome below).
- **New browser tab** — a plain `target="_blank"` link (user-clicked, so no
  popup-blocker issue); "exit" = close the tab.
- **Generic shared view per role** — shared updates/attachments, the team roster, and
  **shared tasks** (a portal user's owned-but-private tasks are per-person and out of
  scope; that's the impersonation-fidelity we set aside).

## Non-goals

- Impersonation / acting as a specific person.
- Per-person task visibility (owned-but-unshared tasks).
- Editing from the preview (read-only).

---

## Components

### 1. Extract `PortalProjectView` (reuse the real portal view)

Today the portal project page (`src/app/(portal)/my-projects/[id]/page.tsx`) inlines
the whole view — `ProjectHero`, the "Your Project Team" card, `BeforeAfterStrip`, and
the `Tabs` (Updates / Photos=`PhotoGallery` / Files=`FilesList` / Tasks). Extract that
body into a shared client-safe component:

- **`src/components/portal/PortalProjectView.tsx`** — props are the shaped view data
  (project/status/hero/before/after/beforeAfter/gallery/files/updates/tasks/team/
  orgName/clientNoun/timezone), i.e. exactly what `getPortalProject` returns.
- The **real portal page** renders `<PortalProjectView {...data} />` (behavior
  unchanged — pure refactor).
- The **preview page** renders the same component with `getProjectPreview` data →
  guaranteed visual parity.

### 2. `getProjectPreview(projectId, role)` — staff-side shared-view shaper

New `src/lib/data/preview.ts`. Produces the **same output shape** as
`getPortalProject`, but built from the **tenant's own access** (RLS `is_org_member`),
filtered to what a portal viewer sees, using the existing helpers.

- **Shared attachments/updates:** query the project's `attachments` and
  `status_updates` where `is_shared = true`; sign via `withAttachmentUrls` (thumbs);
  split images/files via `isImageAttachment`; resolve cover/hero/before/after slots
  (`resolveSlot`, hero re-signed 1400 via `signImageVariant`); gallery via
  `groupPhotosByPhase`. (Mirrors `getPortalProject` lines around the image handling.)
- **Team roster:** build team rows `{ id, name, email, type, company }` from the
  project's `project_contacts` → `contacts` (types rep/partner/customer), using the
  **live rep name** (join `org_crm_staff` by `user_id`, as `getProjectDetail` now
  does), then `groupProjectTeam(rows)`. (No `portal_project_team` RPC — that's
  portal-contact gated; staff read their own org's contacts directly.)
- **Tasks:** the project's `todos` where `is_shared = true`, shaped like the portal's
  tasks (id/body/due_date/done/completed_at) + `ownerName` (reuse the owner→name map
  from the team, null owner → org name), same as `getPortalProject`.
- **org/branding:** `name`, `client_noun`, `timezone`, accent — from the org row
  (the tenant's own org).
- **`role`** currently does not change the output (customer == partner shared view);
  it threads through for the banner and future divergence.
- **Optional refactor:** if the shaping duplicates `getPortalProject` too closely,
  extract a shared `shapePortalView(...)` the two data functions both call. Judge at
  implementation time; not required.

### 3. Preview route + chrome — `/preview/[id]`

A **top-level** route `src/app/preview/[id]/page.tsx` (path `/preview/{id}` — a route
group `(preview)` would collide with `/projects/[id]`, since groups don't change the
URL).

- **Staff-gated in-page:** call `getOrgContext()`; if null / not a CRM member,
  `redirect("/login")` (or `notFound()`). Confirm `proxy.ts` treats `/preview` as an
  authenticated route (like other app routes; ENFORCE_AUTH redirect coverage).
- **Role from the URL:** `?role=partner` (default `customer`) — the role switcher is
  just links that change the param; the page server-renders per role (no client
  state).
- **Chrome:** a preview-specific wrapper (NOT the portal `AppShell` sidebar — its
  "My Projects/Account" nav is meaningless for a staff user). Renders, portal-branded
  (the tenant's org accent):
  - a **banner**: "Preview — this is what your **{role}** sees" + a **role switcher**
    (Customer / Partner links) + a "Back to project" link (to `/projects/{id}`),
  - then `<PortalProjectView {...getProjectPreview(id, role)} />`.

### 4. Entry point — a "Preview" link on the artisan project page

On `src/app/(artisan)/projects/[id]/page.tsx` header (near Edit / Archive), add:

```tsx
<a href={`/preview/${project.id}`} target="_blank" rel="noopener noreferrer"
   className={buttonClasses("ghost", "sm")}>
  Preview
</a>
```

Opens the preview in a new tab.

---

## Security

- **No new visibility surface:** the preview only renders data the tenant already
  reads (staff RLS `is_org_member` on their own org's project). It never uses a
  portal/contact identity.
- **Staff-gated:** the route redirects non-CRM-members; a customer/partner hitting
  `/preview/{id}` is bounced (they use their real portal).
- Read-only — no writes from the preview.

## Testing

- **Unit:** `getProjectPreview`'s shaping has little pure logic beyond reused,
  already-tested helpers (`groupProjectTeam`, `groupPhotosByPhase`, `isImageAttachment`).
  The `PortalProjectView` extraction is a pure refactor — the existing portal render
  must be unchanged (build + a portal render check).
- **Live (Chrome):** from an artisan project, click **Preview** → a new tab opens,
  portal-styled, showing only **shared** content + the roster + **shared** tasks;
  toggle the **role** switcher; confirm a private update/photo/file does **not** appear
  and a shared one does; confirm a non-staff user can't reach `/preview/{id}`.

## Rollout

- **No DB migration, no cutover** — pure app code. Normal PR → merge → deploy.
- Gates: `tsc --noEmit` + `npm test` + `npm run build`.

## Resolved decisions

| Decision | Choice |
|---|---|
| Approach | Read-only render (not impersonation) |
| Switcher | Role (Customer / Partner), URL `?role=`, role-parameterized data fn |
| Content per role | Generic shared view (shared updates/attachments/tasks + roster) |
| Presentation | Portal-styled, own preview chrome (banner + switcher), not the portal sidebar |
| Window | New tab (`target="_blank"`) |
| Reuse | Extract `PortalProjectView`; `getProjectPreview` mirrors `getPortalProject` via shared helpers |
| Route | `/preview/[id]` (top-level path), staff-gated in-page |
| DB | None |
