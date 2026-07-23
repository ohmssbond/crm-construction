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

### 4. Editable tasks (owner + admin)
- **Request:** tasks should be editable. When the person who **owns** a task (the
  contact `todos.owner_contact_id` points to) is looking at it, they get an **Edit**
  ability; **admins** (tenant staff) can always edit.
- **Today:** `todos` (`body`, `due_date`, `done`, `owner_contact_id`, `is_shared`)
  can be toggled done / reassigned / shared via actions in
  `src/app/(artisan)/projects/[id]/actions.ts` (`toggleTodo:206`, `setTodoOwner:216`,
  `setTodoShared:227`), but **`body` and `due_date` are not editable after
  creation** — there is no `updateTodo` action. Tasks render via `TaskRow`
  (`src/app/(artisan)/projects/[id]/TaskRow.tsx`) on the artisan Tasks tab, and
  **read-only** on the portal Tasks tab (`src/app/(portal)/my-projects/[id]/page.tsx`
  — no write path; the portal todos select at `portal.ts:139` doesn't even fetch
  `owner_contact_id`).
- **Needs:**
  - A new `updateTodo(projectId, todoId, { body, due_date })` server action
    (artisan side; RLS `is_org_member` covers admins).
  - An **Edit** affordance in `TaskRow` (inline edit / small form for body + due).
  - **Portal owner edit** (net-new): the portal Tasks tab is read-only. For a
    customer contact to edit a task they own, add a portal-scoped write action + an
    RLS **UPDATE** policy allowing a contact to update todos where
    `owner_contact_id` = their contact id (mirrors the existing owner/shared read
    gating), and add `owner_contact_id` to the portal todos select.
- **Open questions (settle at pickup):**
  - Which fields are editable — just `body` + `due_date`, or also owner/shared
    (already separately settable on the artisan side)?
  - "Owner viewing the task" spans both surfaces (an artisan rep owner AND a portal
    customer owner) — confirm edit is wanted on both, and scope the portal RLS to
    match.
  - Can a portal owner change `due_date`, or only `body` / mark done?
- **Scope:** new action + `TaskRow` edit UI (artisan); + portal write action & RLS
  policy if portal-owner editing is in scope. Multi-surface.

### 5. Sort task lists by due date (sooner → later)
- **Request:** when tasks are listed, sort by date, sooner to later.
- **Today:** both project task lists order by `done` **asc** then `due_date` **asc**
  (nulls last):
  - Artisan: `src/lib/data/projects.ts:84-85`.
  - Portal: `src/lib/data/portal.ts:141-142`.
  So within each done-group it's already sooner→later, but the `done` key separates
  completed tasks, and tasks with **no `due_date`** sort last.
- **Change:** make `due_date` ascending drive the order so the list reads
  sooner→later.
- **Open questions:** keep completed tasks pushed to the bottom (retain `done` as a
  sort key) or sort purely by date? Where should **no-due-date** tasks go (today:
  last)?
- **Scope:** the `.order(...)` on both `todos` queries; tiny, but confirm the
  done/null behavior first.

### 6. Self-service name + email editing under "Your Account"
- **Request:** users should be able to change their own **name** and **email** on
  the "Your Account" page. Example: an account name shows as lowercase "doug" (in the
  J Huber Restorations org) with no way to capitalize it; and a user may want to
  switch the email they log in with.
- **Where "Your Account" lives:** portal `src/app/(portal)/account/page.tsx` and
  artisan `src/app/(artisan)/settings/page.tsx` (both reached from the Account nav —
  `src/components/shell/nav.ts` / `Sidebar.tsx`). No self-edit today.
- **Name** = `auth.users.user_metadata.full_name` (read in `portal.ts:50`,
  `org.ts:61/99`; set once at invite time in
  `src/app/(auth)/invite/[token]/actions.ts:49`). Change it with a self-update action
  calling `supabase.auth.updateUser({ data: { full_name } })` — the same `updateUser`
  pattern already used for password (`src/app/(auth)/reset-password/actions.ts:23`).
  Updating `user_metadata.full_name` propagates to all staff/portal displays
  (incl. the `org_crm_staff()` RPC, which reads `raw_user_meta_data->>'full_name'`).
- **Email** = `auth.users.email`. `supabase.auth.updateUser({ email })` starts
  Supabase's **email-change confirmation flow** (a confirmation link is emailed) — a
  sensitive, identity-changing action. **Verify the email-change email template** the
  same way the password-recovery one had to be fixed (see
  `password-reset-template-gotcha`: default `{{ .ConfirmationURL }}` vs. the custom
  `/auth/callback?token_hash=` link) — same template family, a likely trap.
- **Nuance — two name sources for customer contacts:** a portal customer's name also
  lives in `contacts.first_name/last_name`, which is what the portal **"Your Project
  Team"** roster shows (via `portal_project_team`). Editing `user_metadata.full_name`
  would NOT sync that. Decide whether the account-name edit also updates the
  `contacts` row, or whether the two stay separate (staff can already edit a
  contact's name via the artisan contact form).
- **Open questions:** require re-auth / current-password confirmation for email
  change? Edit a single "full name" or first/last? For contacts, sync to the
  `contacts` row or not?
- **Scope:** both account pages + a profile-update action; email change also needs
  the confirmation-email template verified. Sensitive (identity) — handle email
  change carefully.

## Done

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
