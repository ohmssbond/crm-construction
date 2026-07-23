# Enhancements backlog

Small, low-risk polish items to batch into a future build. Each item notes the
exact location and change so it can be picked up cold.

## Open

### 1. Thumbnails for worker + T&B photos
- **Why:** Cycle C added transformed thumbnails (`/render/image/`, 600px,
  `resize:contain`) for portal + artisan photos via `withAttachmentUrls`, but the
  **worker** and **Time & Billing** photo views were deliberately out of scope —
  they sign their own URLs from a *different* bucket (`job-files`) and still serve
  full-resolution originals.
- **Where the signing lives (no transform today):**
  - `src/lib/data/worker.ts:120` — `createSignedUrls("job-files", …)`.
  - `src/lib/data/tb-report.ts:56` — `createSignedUrls("job-files", …)`.
- **Where they render (raw `<img>`, already `loading="lazy"`):**
  - `src/app/(worker)/log/PhotosControl.tsx:125`, `WorkerHistory.tsx:87`.
  - `src/app/(timebilling)/tb/jobs/[id]/ReportSections.tsx:106`.
- **Change:** apply the Cycle C pattern — sign a per-image 600px thumbnail
  (`resize:"contain"`, quality 60) for the grid tiles and keep the full-res URL for
  the click-through `<a>`. NOTE: `signImageVariant` (`src/lib/data/attachments.ts`)
  is hardcoded to `BUCKET = "project-files"`; generalize it to take a bucket arg (or
  add a `job-files` sibling) since worker/T&B use `job-files`.
- **Scope:** two signing functions + three render sites; mirrors Cycle C.

### 2. Real image thumbnails in the artisan Photos tab
- **Why:** the artisan project **Photos** tab still shows **glyph tiles**
  (`FileTile` — a colored box with 🖼), not actual image previews — a deliberate
  scope boundary from Cycle B. The thumbnail infra now exists, so it can show real
  previews.
- **Where:** `src/app/(artisan)/projects/[id]/page.tsx` — the Photos tab's image
  grid maps `imageAttachments` to `<FileTile glyph="🖼" …>`. The attachments already
  carry `a.thumbHref` (Cycle C). Swap the glyph tile for an actual
  `<img loading="lazy" src={a.thumbHref ?? a.href} className="object-cover">`
  (keeping the share toggle + `PhaseControl`). Likely a small dedicated photo-tile,
  or extend `FileTile` (`src/components/ui/FileTile.tsx`) to render an image preview
  when handed one.
- **Scope:** artisan-only UI; no data/DB change (thumbHref already flows through).

### 3. Bound the thumbnail-signing concurrency
- **Why:** `withAttachmentUrls` (`src/lib/data/attachments.ts`) signs thumbnails
  with an **unbounded** `Promise.all(files.filter(isImageAttachment).map(…))` — one
  Storage round-trip per image. Fine for today's modest galleries (a handful to a
  few dozen), but a 100+-image gallery fires 100+ simultaneous requests on one
  render (rate-limit / tail-latency risk). A code comment already flags this.
- **Change:** cap concurrency (chunk into batches of ~10, or a small `p-limit`).
  **Do this before** galleries grow large or before item 1 copies the technique to
  worker/T&B.
- **Scope:** one helper; no behavior change beyond throttling.

### 4. Customer account ↔ contact record sync (deferred decision)
- **Context:** self-service account editing (shipped) changes only the user's **login
  identity** — `user_metadata.full_name` and `auth.users.email`. It deliberately does
  NOT touch the customer's **contact record** (`contacts.first_name/last_name/email`),
  which is what the tenant sees and what the portal roster + task-owner names display
  (via `portal_project_team`). So a customer who edits their account name/email won't
  see it reflected in the roster; the tenant's CRM record stays as the tenant set it.
- **Decision (2026-07-23):** keep them **separate for now** — the contractor owns
  their record of the customer; a customer shouldn't silently rewrite the tenant's
  CRM data.
- **If revisited:** syncing would have a customer's account edit also update their
  `contacts` row — needs a **security-definer write** (the portal can't write
  `contacts` directly), splitting a single full name into first/last, and accepting
  that a customer overwrites the tenant's label. Recorded so the detail isn't lost.
- **Scope:** portal write action + RLS/function; product decision first.

### 5. Tenant preview of the customer/partner portal view of a project
- **Request:** let a tenant "see" what their partners and customers see for a project.
- **Recommended path — read-only render (NOT impersonation):** the tenant already
  reads all of a project's data (`getProjectDetail`, RLS `is_org_member`); a portal
  viewer just sees that data **filtered to what's shared** (shared updates + shared
  attachments, the team roster, shared tasks). So a preview is derivable **entirely
  from data the tenant can already read** — no auth/session changes, no new RLS, no
  new RPC.
- **Reuse the existing portal components** (`src/components/portal/`: `ProjectHero`,
  `PhotoGallery`, `FilesList`, `ProjectTeamCard`, `BeforeAfterStrip`) — the same ones
  the real portal page (`src/app/(portal)/my-projects/[id]/page.tsx`) assembles.
- **Sketch:** a "Preview as customer" button on the artisan project page →
  `/projects/{id}/preview` that renders the portal layout from a new
  `getProjectPreview(projectId)` (mirrors `getPortalProject`'s filters — `is_shared`
  updates/attachments, `groupPhotosByPhase`, the roster, shared tasks — but runs with
  the tenant's own access). Add a "Preview — this is what your customer sees" banner.
- **Why not impersonation:** assuming the customer's session (token minting /
  service-role admin session + session juggling) is a heavy, security-sensitive auth
  feature (audit, accidental writes as the customer, session management, review). Its
  only gain over the render is **per-person fidelity** (one specific customer's exact
  visibility, incl. their private tasks) — rarely the need here.
- **Open questions:** a generic "shared view", or a person/role selector (customer vs
  partner — they differ mainly in which tasks are *theirs*)? Live-updating or a static
  snapshot? Any tenant-only chrome to hide in the preview?
- **Scope:** artisan preview route + `getProjectPreview` (filter to shared) + reuse
  portal components. No auth changes. Moderate.

## Done

- **Email notifications for project updates (per-user opt-out)** — a shared status
  update emails the project team (customers, partners, reps) minus the author +
  opted-out, via the existing Resend infra, with role-appropriate links. New
  `notification_preferences` table (per-user, default on) + org-guarded
  security-definer `project_notification_recipients`; opt-out toggle on both account
  pages. Shipped PR #12 (merge `6bc4ff6`, migration `20260723000003`). Verified live
  (toggle persistence + real email send).
- **Live-derive rep names (fix frozen snapshot)** — renaming a staff member now
  updates their name on the tasks they own and in the portal roster. Rep names
  resolve from the staff's current `auth.users` `full_name` instead of the
  assignment-time snapshot: `portal_project_team` left-joins `auth.users` (migration
  `20260723000002`); `getProjectDetail` maps rep `user_id` → `org_crm_staff`
  full_name for `taskContacts` + `RepPanel`. Self-healing (no backfill). Shipped PR
  #11 (merge `3e23dc4`).
- **Portal "Your Project Team" grouped roster** — replaced the rep-only
  point-of-contact card with a Tenant / Partners / Customer roster via a new
  `portal_project_team` RPC. Shipped **Cycle A**, PR #2 (merge `10732cb`). Later laid
  out in 3 columns (PR #3, merge `538b881`).
- **Company field on contacts** — partners-only `contacts.company`. Shipped
  **Cycle A**, PR #2.
- **Split "Photos & Files" into two tabs** — artisan project view now has separate
  Photos + Files tabs (mirrors the portal's `isImageAttachment` split). Shipped
  **Cycle B**, PR #4 (merge `9bddf25`).
- **Revise the file-type list** — added Surveys/Designs, Contract→Contracts, retired
  Before/After from the dropdown (soft-delete via `archived_at`), alpha-sorted;
  construction-orgs-only. Shipped **Cycle B**, PR #4. (Category validity is a per-org
  FK to `file_categories`, not a table-wide CHECK.)
- **Faster photo loading** — lazy-loading (PR #5) + Supabase-transform thumbnails
  (600px grids / 1400px hero, `resize:contain`) for portal + artisan. Shipped
  **Cycle C**, PRs #5/#6/#7.
- **Editable task body + due date** — inline Edit in the admin Tasks tab
  (`updateTodo` action, RLS `is_org_member`; body + due date). Admin-only; portal
  read-only deferred. Shipped PR #8 (merge `7feb8fe`).
- **Sort task lists by due date** — was **already implemented** across all three task
  lists (`done` asc → `due_date` asc, nulls last = incomplete soonest-first,
  completed at bottom). No change needed; confirmed 2026-07-23.
- **Show task owner on the portal Tasks tab** — added the contact `id` to
  `portal_project_team` so `getPortalProject` maps `owner_contact_id` → owner name
  (null owner → contractor org name). Shipped PR #9 (merge `01b4845`, migration
  `20260723000001`).
- **Self-service name + email editing** — Name (`user_metadata.full_name`,
  live-verified) + Email (`updateUser` → confirmation flow) on both account pages via
  a shared `ProfileForm`. Shipped PR #10 (merge `5de5a9d`). Email required turning OFF
  Supabase "Secure email change" (dual-confirmation blocked users without old-email
  access) and pointing the email-change template at
  `/auth/callback?...&type=email_change`. NOTE: edits the login identity only — see
  Open #5 (does not sync the customer's contact record).
