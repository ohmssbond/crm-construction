# Enhancements backlog

Small feature enhancements surfaced from real-world dogfooding. Add new items at
the bottom with the next number — keep each short, enough to capture the intent.

**Status key:** 💡 idea · 🔨 building · ✅ shipped

---

## 1. Tasks should have owners ✅ shipped
  Completed: Jun 11, 2026
To-dos (tasks) should have an **owner**.

- **Default** the owner to the **person entering the task** (the team member creating it).
- Allow **changing** it to a **different contact associated with the project**.

_Open questions / notes:_
- To-dos are currently **internal-only** (never shown in the customer portal). Decide
  whether assigning a task to a *contact* should surface it to that contact in their
  portal, or whether "owner" stays a purely internal field.
- Owner can be a team member **or** a project contact → `todos` likely needs an owner
  reference (e.g. `owner_contact_id`, plus a way to denote "me/team").

## 2. Sign-in should have a generic branding.  Right now it is always defaulting to JH 💡

## 3. Owners can set their colors ✅ shipped
  Completed: Jun 11, 2026

## 4. New contact type - employee or team member.  This is an employee of the artisan who is not a partner or customer.  

## 5. Tasks/To-dos records: ✅ shipped
	 - display the date they were completed
         - public (can be seen all in project) or private (not just for the person making the "to-do")
         - change name from "to-dos" to "tasks"
   Completed: June 12th 2026
          - add the consultant owner to the pull down list of people to assign tasks ✅ shipped
     Completed: Jun 12, 2026 — artisan replaces "Unassigned" as the first/default task owner option.

## 6. Photos & Files listed by type, ordered by date uploaded ✅ shipped
  Completed: Jun 12, 2026
  Group attachments into type sections (artisan + portal), ordered alphabetically
  by category label, newest upload first within each group.

## 7. Time in the app.  Currently all time is tracked at UT.  But, it should be an attribute of the artisan what time zone they are in and then all the dates recorded should reflect that time zone. ✅ shipped
  Completed: Jun 12, 2026
  Per-workspace (org-level) timezone, editable in Settings (curated US zones).
  Timestamps render in that zone on artisan + portal; storage stays UTC; calendar
  dates (due/start/end) don't shift.

## 8. Admin console for tenant management ✅ shipped
  Completed: Jun 15, 2026
  Gated /admin surface (super-admin email allowlist via SUPER_ADMIN_EMAILS) to
  list tenants, change a tenant's login email, and reset a tenant password (temp
  shown once). Service-role ops are server-only; every action re-checks the
  allowlist. Smallest first cut — create/delete/branding/audit deferred.
  Follow-ups: generic action error messages; paginate listUsers beyond 200.

## 9. Multi-product platform foundation (CRM + Time & Billing) — Foundation ✅ shipped
  Completed: Jun 15, 2026
  Shared core for running two products on one tenant/login. Direction:
  `docs/superpowers/specs/2026-06-15-platform-architecture-design.md`;
  T&B PRD: `docs/timeandbilling~PRD.md`.
  - 1a: unified per-product `memberships` + `organization_products` entitlements;
    migrated the access-token hook + `is_org_member` (CRM behavior preserved).
  - 1b: product-aware routing by the `roles` claim; org-entitlement gates with a
    friendly "not enabled" page; dedicated minimal worker `/log` shell + CRM
    cross-link; per-tenant product toggles in `/admin`; dropped the `user_role` claim.
  Live-verified: worker -> /log, artisan/contact unchanged, admin toggles work.
  - Shared customers ✅ shipped (Jun 16, 2026): `customers` made shared + QBO-ready
    (structured billing address, email/phone, nullable qbo_* fields, unique active
    name); `member_read` RLS via `is_org_member_any`; CRM still the editor.
  - T&B admin shell (3a) ✅ shipped (Jun 16, 2026): third AppShell `timebilling`
    world at `/tb`, gated to `timebilling:admin`; resolveHome/proxy routing; org
    `member_read` RLS + `getWorkspaceContext`; placeholder home. Routing regression
    live-verified (CRM/portal/worker unchanged).
  - Jobs CRUD (3b) ✅ shipped (Jun 16, 2026): `jobs` table (customer-scoped, structured
    site address, billing type, status lifecycle, nullable qbo_* fields) + `is_tb_member`
    /`is_tb_admin` RLS; admin CRUD under `/tb/jobs` with a customer picker that prefills
    the site address. Live-verified.
  - Materials catalog (slice 4) ✅ shipped (Jun 17, 2026): `materials` table (per-org,
    name/sku/type/unit_price, QBO-ready core fields, unique active+SKU) reusing
    is_tb_member/is_tb_admin RLS; admin CRUD under `/tb/materials`.
  - Time tracking (slice 5a) ✅ shipped (Jun 17, 2026): worker app at `/log` (org-branded
    shell, start-of-day WorkDay bookend, today's job list) + job-detail Time tab (live
    clock in/out, 0.25h-rounded total, no-charge toggle). Tables work_days/
    job_time_entries/job_time_segments (time-of-day) + worker-self/admin-read RLS;
    worktime helpers; built per the operator's worker prototype. Materials/Photos tabs
    stubbed. Worker = logged-in user_id; cross-midnight & manual edits deferred.
  - Worker clock-out follow-ups ✅ shipped (Jun 17, 2026): "End my day" same-day
    workday clock-out on the Today screen (next-morning bookend stays the fallback;
    resume-day undo); and retrospective (pick-a-time) clock in/out on the job Time
    tab — one-tap "now" stays default, opt-in time field back-dates a segment.
    Validated by `validateSegmentTime` (no future times; clock-out after clock-in);
    actions return an inline error string. No migration. Overlap repair & full
    segment edit/delete stay in the later admin-CRUD slice.
  - Materials-used (slice 5b) ✅ shipped (Jun 17, 2026): worker Materials tab on the
    job detail — pick a catalog item + qty (cost hidden), add/edit-qty/remove. New
    `job_material_lines` table (per-worker, worker_rw/admin_read RLS mirroring time
    tracking; `material_id` on delete restrict). Lines snapshot item name + unit_cost
    ("your cost") + currency at add time; cost never reaches the worker client
    (cost-free picker + line reads). `validateQty` helper (qty > 0). Catalog-only —
    ad-hoc free-text lines & crew-shared visibility deferred.
  - Photos/attachments (slice 5c) ✅ shipped (Jun 18, 2026): worker Photos tab on the
    job detail — capture/upload a labeled photo/receipt, see it with its added
    timestamp + upload status, remove your own. New `job_attachments` table (per-worker,
    worker_rw/admin_read RLS mirroring 5b) + new private `job-files` Storage bucket with
    a T&B-membership storage policy (mirrors the CRM `project-files` pattern). Direct
    browser→Storage upload then record-after-upload (orphan object cleaned on record
    failure); signed-URL thumbnails (glyph for non-images). `validateLabel` helper.
    Store-only (no OCR). Offline queue deferred but schema-ready (status queued/uploaded,
    added_at vs uploaded_at); relabel & crew-shared visibility deferred.
  - Pre-invoice / completed-job report (slice 6) ✅ shipped (Jun 18, 2026): read-only
    admin report at `/tb/jobs/[id]/report` (+ "View report" link on the job detail, any
    status) assembling the PRD §8.2b staging record — customer + contact, site address,
    time per tech (grouped worker→date, 0.25h daily totals + grand total, no_charge
    flagged not subtracted), materials (extended cost + your-cost subtotal), signed-URL
    photos, description/notes. `getJobReport` in `src/lib/data/tb-report.ts` reads across
    all workers via the `admin_read` RLS; tech labels resolved to login emails via the
    service-role admin client. `materialExtended` (round-half-up to cents) + `fmtMoney`
    helpers. NO migration. Captured quantities only — no priced invoice total (no labor
    rate/markup in MVP); fixed-price shows contract price. On-screen only.
  - Worker names (slice 7a) ✅ shipped (Jun 19, 2026): surfaced from dogfooding the
    slice-6 report (techs were labeled by email). New `tb_workers(org,user_id,name)`
    table (admin_rw + worker_read_own RLS) + a `/tb/workers` admin screen (with a Workers
    nav item) to name existing workers — list built via the service-role client scoped to
    the admin's org (memberships aren't admin-readable under RLS). `workerLabel` helper
    (name > email > id). The completed-job report now labels each tech by name (email
    fallback; `getJobReport` field `email`→`label`), and the worker is greeted by name
    (worker-reads-own). Naming existing workers only — net-new onboarding out of scope.
    Migration `20260619000001`. Deferred: getWorkerName org-scope hardening (only matters
    once a worker is in 2 T&B orgs; single-org for now).
    UX tweak (Jun 19): moved the worker greeting out of the `/log` header into the
    start-of-day screen heading — "Good morning, {name}".
  - Collapse job detail + report (slice 7b) ✅ shipped (Jun 19, 2026): admin asked "why a
    separate report button?" — folded the completed-job report into `/tb/jobs/[id]`. The
    job detail is rebuilt on `getJobReport`: info Card (now incl. Email/Phone, fmtMoney for
    fixed price) + Status/Edit/Archive controls + the Time/Materials/Photos sections inline
    (extracted verbatim into a `ReportSections` component). Deleted the `/tb/jobs/[id]/report`
    route + "View report" button. NO migration; `getJobDetail`/edit page unchanged.
  - Per-job billing-ticket .xlsx export (slice 8) ✅ shipped (Jun 20, 2026): scoped from a
    photo of the customer's handwritten billing form. An "Export billing ticket" button on
    `/tb/jobs/[id]` (GET route handler `/tb/jobs/[id]/export`, admin-gated, streams a
    download) produces an .xlsx mirroring that form: Customer header + site address +
    description; Time On Site (Tech·Date·In·Out·In·Out·Total, two pairs/row, >2 segments
    overflow to a continuation row) + Total Labor (hours); Materials (Item·Qty·Unit Cost·Cost)
    + Total Material Cost; Notes. Reuses `getJobReport` (no new queries, NO migration). New
    `exceljs` dep; pure `jobBillingRows` transform (unit-tested) + thin `buildBillingWorkbook`
    writer in `src/lib/export/billing-ticket.ts`. Billing only — payroll/reported-hours is a
    SEPARATE future report; the full multi-entity PRD §8.6 company dump is also deferred.
  - Worker work-notes → Description of Work (slice 9) ✅ shipped (Jun 20, 2026): workers
    append short work-performed notes on a job (e.g. "Primary Bedroom - Rough wired") via a
    new **Notes** tab on `/log/[jobId]` (add / inline-edit / remove their own). New
    `job_work_notes` table (per-worker; worker_rw + admin_read RLS). `getJobReport` reads
    all the job's notes (worker-id union → labeled by tech name + date); they show under
    **Description of Work** beneath the admin `job.description` — date·tech on the admin
    report/job page, date-prefixed body rows in the `.xlsx` export. `validateLabel` reused
    for the non-empty body. Migration `20260620000001`. Per-worker visibility (admin
    aggregates all); admin `job.description` unchanged.
  - Description vs Notes layout (slice 10) ✅ shipped (Jun 20, 2026): per operator feedback,
    **Description** stays the admin-only `job.description`; worker work-notes moved out of it
    into a relabeled **"Notes of the Work Completed"** area, merged with the admin `job.notes`
    (admin notes first, then the worker notes). Applies to the admin job page + the `.xlsx`
    export. Presentation-only — no schema, no `getJobReport`/`jobBillingRows` change.
  Remaining slices (later): QBO import (OAuth connect; import customers + materials).
  Deferred follow-ups: customer-clean work-order variant + print/PDF of the report;
  ad-hoc material lines; offline photo upload queue; crew-shared visibility; a formal
  Worker entity (display names instead of emails); mixed-currency + batched email lookup
  refinements in getJobReport.

