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

### 5. `project_in_org` guard is missing on the older insert paths
- **Why:** the Schedule build (2026-07-31) found that `artisan_all`'s `with check` validates
  `is_org_member(organization_id)` but **not** that the client-supplied `project_id`
  belongs to that org — so a row can be written with org A's `organization_id` and org
  B's `project_id`. Fixed for `schedule_phases`/`schedule_tasks` in
  `20260731000002_schedule_integrity.sql`, and `project_contacts` was already fixed in
  `20260717000001`. **The same gap remains on `attachments` and `status_updates`.**
- **Where:** `recordAttachment`, `postUpdate`, `attachContact`
  (`src/app/(artisan)/projects/[id]/actions.ts`) all take `project_id` from the caller
  while setting `organization_id` from the session.
- **Change:** one migration extending those tables' `artisan_all` `with check` with
  `public.project_in_org(project_id, organization_id)` — the helper exists
  (`20260717000001_company_reps.sql:58`) and is already granted to `authenticated`.
  `alter policy … with check (…)` leaves `using` intact (proven against the live
  `project_contacts` policy).
- **Note:** exploitability is low — server-action args are sealed by Next, and these
  tables gate portal reads on `is_shared`, unlike the schedule. Defense-in-depth.
- **Scope:** one migration, no app changes.

### 6. No component test for the read-only `ScheduleTable` invariant
- **Why:** `ScheduleTable` renders read-only **only** when its `actions` prop is omitted,
  and that single mechanism is what keeps Edit/Delete/move/add controls out of the
  customer portal. It is currently guarded by human review alone.
- **Blocker:** the repo has no component-test infrastructure — all 13 suites are pure
  functions under `src/lib/data/`. This is infra work (jsdom + React Testing Library),
  not a one-liner.
- **Change:** render `<ScheduleTable phases={fixture} />` with no `actions` and assert no
  button matches `/Edit|Delete|Move|\+ Phase|\+ Task/`.
- **Scope:** test infra + one test; would also unlock component tests generally.

### 7. `getProjectSchedule` swallows query errors
- **Why:** `src/lib/data/schedule.ts` ignores `phases.error`/`tasks.error` and falls back
  to `[]`, so a transient failure renders **"No schedule yet."** to a *customer*, who
  reasonably concludes their contractor has no plan. Plausible-but-wrong is a worse
  failure mode than obviously-broken.
- **Context:** this matches the existing convention — no module under `src/lib/data/`
  checks `.error` — so it is not a regression, and a one-off error path here would be
  inconsistent. Recorded as the first call site to adopt any future error-surfacing
  convention.
- **Scope:** convention decision first.

### 8. Schedule UI polish (all Minor, from the 2026-07-31 review)
- Move ↑/↓ render active on the first/last row even though `reorder()` no-ops there — no
  `isFirst`/`isLast` is threaded into `ScheduleRow`. Clicking does nothing, with no feedback.
- The decorative `✓` on completed rows (`ScheduleRow.tsx`) lacks `aria-hidden="true"`.
- No schedule control uses the `Button` primitive — each is a hand-styled `<button>`.
  (Mixed precedent: `ArchiveButton` uses `Button`; `TaskRow`'s inline row controls don't.)
- `getProjectSchedule` is awaited inside the returned object literal in all three loaders
  rather than joining the surrounding `Promise.all`, adding one serial round trip per page
  load. It only needs the project id. (`attachments:` on the adjacent line does the same.)
- `contact_read` on the schedule tables omits the `archived_at is null` clause that
  `contact_read on projects` carries — unreachable through the app, and
  `status_updates`/`attachments` share the gap.
- No `updated_at` on either schedule table; stale JSDoc on `addTodo` (`actions.ts:412`)
  still says "Add a task".

## Done

- **Bound the thumbnail-signing concurrency** — `withAttachmentUrls`
  (`src/lib/data/attachments.ts`) signed thumbnails via an unbounded `Promise.all`,
  one Storage round-trip per image; it became load-bearing when `listProjects`
  started resolving a cover thumbnail per project with no `.limit()`. Now chunks
  the image list into batches of 10 (`THUMB_BATCH_SIZE`) and awaits each batch in
  turn, so a large gallery or a tenant with many covered projects can't fire
  hundreds of simultaneous Storage requests. Same thumbnails for the same inputs,
  just throttled. Applied from a final code review on `project-ui-polish`; no
  migration.

- **Edit a project update** — inline edit-in-place on the artisan Updates tab (reuses
  the task-edit pattern `TaskRow`+`updateTodo`): `UpdateCard` became a client component
  with Edit → title input + body `<textarea>` + photo `<select>` + Save/Cancel; new
  `updateStatusUpdate(projectId, updateId, title, body, photoAttachmentId)` mirrors
  `postUpdate`'s photo validate+auto-share but writes only title/body/photo —
  **no `is_shared` change, no notification email** on edit (scope grew to include the
  photo during brainstorming). `getProjectDetail` updates select gained
  `title, photo_attachment_id`. No migration (columns existed). Subagent-driven (2
  tasks, task-reviewed clean; final opus review = Ready to merge). Shipped PR #14
  (merge `3732732`). Live-verified in prod by Doug.

- **Tenant preview of the customer/partner portal view** — a 👁 Preview link on the
  artisan project header opens `/preview/[id]` in a new tab: a read-only, portal-styled
  render of the project as a customer/partner sees it (shared updates/attachments,
  roster, shared tasks), with a Customer/Partner role switcher. NOT impersonation —
  `getProjectPreview(id, role)` shapes the shared view from the tenant's own staff
  access (RLS `is_org_member`), mirroring `getPortalProject`; both render the extracted
  `PortalProjectView` so they can't drift. Staff-gated (proxy CRM-prefix + `getOrgContext`).
  `role` is a live seam in the task filter for future customer/partner divergence. No DB.
  Shipped PR #13 (merge `2e97cae`). Verified live (role switcher + leak test: only
  shared tasks surface, all private tasks absent).
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
