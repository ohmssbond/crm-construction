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

### 5. Email notifications for project updates (with per-user opt-out)
- **Request:** email the project team when an update is posted to their project.
  Each user's account has a notifications flag; default **on** for project updates.
- **Trigger:** `postUpdate` (`src/app/(artisan)/projects/[id]/actions.ts:143`) inserts
  a `status_updates` row. Notify on a **shared** update (`is_shared` — don't notify on
  tenant-private updates); also consider firing when an existing update is toggled
  shared (`setUpdateShared`, same file `:187`).
- **Email infra ALREADY EXISTS (reuse it):** `src/lib/email.ts` — transactional email
  via **Resend**, gated by `RESEND_API_KEY` (`emailEnabled()`), already used for
  invites (`src/app/(artisan)/actions.ts:184`). Use `sendEmail({ to, subject, html })`
  + `appUrl` for the portal link. Best-effort / no-op when the key is unset, like
  invites. **Confirm `RESEND_API_KEY` is set in prod** (`vercel env`) or notifications
  silently do nothing.
- **Recipients:** the project's team with portal access + an email — the
  `project_contacts` customers/partners (decide whether reps/staff get them too).
  Query their `contacts.email` for the project; skip the update's author; filter by
  the notification flag below.
- **Per-user notification flag (net-new — no preferences model today):** a per-user
  preference defaulting **true**. Options: a `contacts.notify_project_updates boolean
  default true` column (simplest — recipients are contacts), a dedicated
  `notification_preferences` table keyed by `user_id`, or `user_metadata`. Edited on
  the **"Your Account"** page (portal `account/page.tsx` / artisan `settings/page.tsx`,
  beside the new `ProfileForm`) via a self-update action like `updateAccountName`.
  Needs a migration for the storage.
- **Open questions:** notify reps/staff too, or only customers/partners? One
  "project updates" flag or per-notification-type? Per-update vs a digest? Future
  notification types (task assigned/shared)?
- **Scope:** migration (preference storage) + notification send in `postUpdate` +
  account-page toggle. Reuses the Resend infra; larger than the other open items.

## Done

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
