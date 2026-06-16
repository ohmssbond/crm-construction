# PRD — Field Time, Materials & Billing App (working title)

**Status:** Draft v0.4
**Last updated:** 2026-06-14
**Owner:** Doug

---

## 1. Summary

A lightweight, mobile-first web application that lets trade contractors — general contractors, electricians, plumbers, and similar — capture **time worked** and **materials used** on the job, then assemble that into a **pre-invoice / billing summary** with minimal friction. Final invoicing happens elsewhere (QuickBooks or manual); the app's job is to capture the field data cleanly and stage it. The app stands on its own, but is architected so a contractor who uses QuickBooks Online can connect it and have customers, materials, and time flow cleanly between the two.

## 2. Problem

Trade contractors lose billable hours and material costs because capturing them is tedious and happens away from a desk. Existing tools are either heavyweight accounting suites or generic time trackers that don't understand jobs, materials, and billing together. The result is delayed invoicing, under-billing, and manual re-entry into accounting software.

## 3. Goals

- Make logging time and materials on a phone, on-site, take seconds.
- Turn captured time + materials into a customer-ready **pre-invoice / billing summary** with minimal manual steps.
- Be useful **standalone**, with no accounting software required.
- Be **"QuickBooks-ready"** — a QuickBooks Online user can connect and sync without re-architecting anything.

## 4. Non-Goals (MVP)

- Full accounting / general ledger functionality. We are not replacing QuickBooks.
- QuickBooks Desktop support (Online only for MVP).
- Payroll processing.
- Other accounting integrations (Xero, FreshBooks) — designed for, not built, in MVP.
- Requiring any QuickBooks connection to use the app.

## 5. Target Users

Owner-operators and small crews in the trades (general contracting, electrical, plumbing, HVAC, etc.) who bill customers for labor and materials and want less paperwork. Often the person logging the work is the same person who sends the invoice.

## 6. MVP Scope

Core flows for v1:

0. **Company & admin** — each tenant is a **Company** (maps to a QuickBooks company). Admin accounts use an admin interface to CRUD workers, customers, jobs, and materials, and to manage the QuickBooks connection/permissions. Workers have lighter-weight accounts focused on logging time.
1. **Manage customers** — create customers locally; optionally import existing customers from QuickBooks Online. A customer can have many jobs.
2. **Manage jobs** — create a job under a customer, with a start and end time, a billing type (time & materials, or fixed contracted price), and a lifecycle status (`open` → `in_progress` → `completed`). A **tech taps `completed`** when work is done; **only an admin can re-open** a completed job.
3. **Manage materials** — maintain a materials/items list locally; optionally import existing items from QuickBooks Online.
4. **Log time (two tracks)** — captures both (a) hours a worker wants to be **paid** for and (b) time spent on a specific customer **job**. Each tech **self-logs their own time** from their own login via live clock-in/out; the per-job daily total rounds to the nearest **0.25 h**. A **"No charge / warranty"** toggle (default chargeable) sits on each entry. The pay track is captured by a brief **start-of-day prompt** (see 8.2a) before the worker can touch any jobs. See Section 8.2.
5. **Log materials used** — a job shows the list of materials already added plus a **pull-down picker** to add one from the Company catalog. The catalog is listed **alphabetically** with **"Add a material to job" pinned as the top item** (MVP uses simple alpha order — no recent/frequent ranking). "Add a material to job" is the ad-hoc path where the worker types a description, price per unit, and quantity (job-only; not added to the catalog). For catalog items, the worker only picks the item and enters quantity (cost is hidden).
6. **Attach photos / receipts** — a worker can capture or upload images to the job (e.g. a materials receipt) and gives each a **label** (e.g. "Home Depot"). Each photo shows its **added timestamp** and an upload **status** (`queued` / `uploaded`). **No limits** on count/size/type. MVP **stores them as attachments only — no OCR**; uploads queue and retry on reconnect (see 8.8).
7. **Assemble the pre-invoice / completed-job report** — when a job is marked `completed`, the app assembles the staging report (customer, location, work description, time-on-site per tech, materials, attachments, notes) that supports invoicing done elsewhere. This is the core MVP output. See 8.2b.
8. **(Optional) Connect QuickBooks Online** — a Company admin makes a one-time OAuth connection enabling import of customers/materials (read direction).
9. **Export (no-QuickBooks fallback)** — an admin can export the Company's data (workers, customers, jobs, materials, time/billing) as an `.xlsx` spreadsheet, so the app is useful with no accounting integration at all.

## 7. QuickBooks Integration Strategy & Decisions

**Decision: QuickBooks is an optional sync adapter, never the source of truth.** The app must be fully functional with no accounting connection. QuickBooks Online is the only integration targeted for MVP, and only the parts needed to (a) import existing customers and materials and (b) lay groundwork for pushing invoices later.

Key decisions captured to date:

- **QuickBooks Online Accounting API** is the integration surface (REST, OAuth 2.0). Not QuickBooks Time / TSheets — building our own mobile time capture is a core feature, so we use the Accounting API's `TimeActivity` rather than integrating a competing time product.
- **Read + write capable.** The Accounting API supports read and write (create/update) on the entities we care about. MVP uses the **read** direction (import customers and materials); the **write** direction (push invoices, time) is designed for but deferred.
- **Entity mapping:** our **Company ↔ QBO company (realm)** — one tenant connects to one QBO company, and the OAuth connection/permissions are managed by a Company admin; our Customer ↔ QBO `Customer`; our **Job ↔ QBO sub-customer** (QBO models jobs as a `Customer` with a parent customer — our customer→jobs hierarchy maps to this directly); our Worker ↔ QBO `Employee` (employees) or `Vendor` (contractors); our Material/Item ↔ QBO `Item`; our **JobTimeEntry ↔ QBO `TimeActivity`** (carries the employee/vendor, the customer/job, a service item, hours, and a billable status); our **WorkDay** is an internal payroll/pay-track concept (no direct QBO accounting object — it feeds labor cost, and would map to payroll if/when that's in scope); our Invoice ↔ QBO `Invoice`.
- **Billing type lives on the job.** T&M jobs invoice from billable time + materials; fixed-price jobs invoice the contract amount. On a fixed-price job, time still syncs as `TimeActivity` but marked not-billable-to-customer so it informs payroll and margin without double-billing.
- **One OAuth connection per QuickBooks company.** Once connected, both sync directions are available without re-auth.
- **Deactivate, not delete.** QBO does not hard-delete name-list records (Customers, Items); it deactivates them. We mirror this with an `active` flag so reconciliation stays clean.
- **Tiered API pricing (introduced by Intuit in 2025)** and rate limits (~500 req/min, 60-minute access tokens) are constraints to design the sync layer around — favoring batched/background sync over inline calls.

See Section 8 for how the data model supports this without depending on it.

## 8. Data Architecture — "QuickBooks-Ready, Not QuickBooks-Dependent"

**Principle:** the app owns a canonical data model. QuickBooks is one optional sync adapter hanging off the side. If QuickBooks is never connected, every QuickBooks-related field simply stays null and nothing breaks.

### 8.1 Own our IDs, map theirs

Every entity uses our own UUID primary key. We never use a QuickBooks ID as a primary key. Syncable entities carry an optional set of external-mapping fields:

| Field | Purpose |
|---|---|
| `qbo_id` (nullable) | The QuickBooks ID once the record is linked |
| `qbo_sync_token` (nullable) | QBO's optimistic-locking token, required on every update to a QBO record |
| `last_synced_at` (nullable) | When this record last reconciled with QBO |
| `sync_status` | `unsynced` / `synced` / `dirty` / `error` |
| `source` | `local` / `quickbooks` — where the record originated |

With no QuickBooks connection, these fields stay null/`unsynced` and are ignored.

### 8.1a Multi-tenancy: everything belongs to a Company

The **Company** is the primary entity and the tenant boundary. Every other record (Account, Worker, Customer, Job, Material, WorkDay, JobTimeEntry, Invoice) carries a `company_id` and is scoped to it — no data is ever shared across companies. The Company maps to a single QuickBooks company (realm), which is why the QuickBooks connection (realm ID, OAuth tokens, sync settings) lives on the Company record and a connection authorizes exactly that one tenant. Admin accounts operate within their Company only.

### 8.2 Shape core entities so mapping is trivial later

We do **not** copy QuickBooks' schema. We do make sure our fields map cleanly to it.

- **Company / Owner** — the **root tenant entity**; everything else belongs to exactly one Company. Maps 1:1 to a QuickBooks company (QBO realm). Holds the QuickBooks connection (realm ID, OAuth tokens) and company-level settings. A Company has many admin accounts and many workers, customers, jobs, and materials.
- **Account** — a login belonging to a Company, with a **role** (`admin` / `worker`, extensible). Admins use the admin interface to CRUD workers, customers, jobs, and materials, and to manage the QuickBooks connection and permissions. Workers primarily log time. An Account is linked to a Worker record where applicable.
- **Customer** — unique `display_name` (QBO enforces a unique DisplayName), plus structured `email`, `phone`, and a structured billing address (discrete fields, not one freeform blob). `active` boolean. A customer **has many jobs**. When QuickBooks is connected, customers are **read-only in the app** (QBO is the source of truth — see 8.7).
- **Job** — belongs to one customer; a customer has many. Fields: `name`, `customer_id`, `job_location` (the **site address**, structured, distinct from the customer's billing address — a customer may have jobs at many addresses), `description` (free-text narrative of the work performed), `notes` (free-text), `start_time`, `end_time`, `status` (`open` → `in_progress` → `completed`), and `billing_type` (`time_and_materials` | `fixed_price`). When `fixed_price`, a `contract_price` (decimal). Maps to a QBO sub-customer; `job_location` maps to the invoice ship-to / service address.
- **Worker** — an employee or a contractor (`worker_type`), with a role. Maps to QBO `Employee` or `Vendor`. Workers are who logs time, each from their own login. (Pay rate is **out of MVP scope** — the app captures hours, not dollars.)
- **Material / Item** — `name`, `description`, `sku`, `unit_price`, and a `type` concept (service / non-inventory / inventory) to match QBO Item types. Nullable slots reserved for income/expense account references needed only at sync time. `active` boolean. When QuickBooks is connected, materials are **read-only in the app** (QBO is the source of truth — see 8.7).
- **WorkDay** (pay track) — one record per worker per worked day: `worker_id`, `work_date`, `start_time`, `end_time`, `status` (`open` / `closed`). The `end_time` is captured the next morning (see 8.2a), so a day stays `open` until the worker next starts. Paid hours = `end_time − start_time` (less any breaks). Drives payroll/labor cost.
- **JobTimeEntry** (job track, UI label "On the job today" — a job can span multiple days) — one worker's time on one job on one `date`: `worker_id`, `job_id`, `date`, a **`no_charge`** flag, and an optional service item reference. Each tech **self-logs their own** entry, and a job can have **up to three techs**, so a completed job typically has several JobTimeEntries (one per worker per date). `no_charge` **defaults to false (chargeable)** and is a worker-facing toggle shown on every job (labeled "No charge / warranty"); it is advisory — final billing is decided downstream. `total_hours` is **rounded to the nearest 0.25 h** (the minimum increment) at this per-worker-per-job-per-day level. Mirrors QBO `TimeActivity`.
- **JobTimeSegment** — a single `time_in` / `time_out` pair belonging to a JobTimeEntry. An entry has **one or more** segments (a worker may leave and return — lunch, supply run — within the same day). We store the **precise** in/out times. The entry's `total_hours` is **derived and then rounded to 0.25 h on the daily total**, i.e. round(Σ(`time_out` − `time_in`)) — rounding is applied once to the day's total, not per segment, so quarter-hour error doesn't compound. (Consequence: displayed segment durations may not visibly sum to the rounded total; the raw times remain the audit record.)
- **MaterialLine** — a material used on a job: `job_id`, `qty`, and `unit_cost` (**your cost** — what the material cost the company, not a customer sell price). Two sources:
  - **Catalog** — `material_id` references a Material; `unit_cost` comes from the catalog and is **not shown to the worker** (worker only picks the item and enters `qty`).
  - **Ad-hoc** — `material_id` is null; the worker types a free-text `item` description, a `unit_cost` (price per unit they paid), and `qty`. Ad-hoc lines are **job-only** — they are not added to the Company materials catalog in MVP (an admin can promote one later).
  Extended cost = `qty × unit_cost`. Feeds the pre-invoice material lines; sell price / markup is applied downstream during actual invoicing.
- **Attachment** — a photo/image attached at the **job level**: `job_id`, `file_ref` (object storage), `label` (**required**, worker-entered, e.g. "Home Depot"), `added_at` (timestamp of when the worker **added** it — this is the timestamp the UI displays, independent of when the bytes actually upload), `uploaded_at` (nullable; set when the upload completes), `status` (`queued` / `uploaded`; extensible to `uploading` / `failed`), `uploaded_by`. **No limits** on count, size, or type in MVP. MVP **captures and stores only — no OCR**; it's documentation a contractor adds (e.g. a materials receipt) for later use. Uploads **queue locally and retry** on reconnect — see 8.8. Post-MVP: extract cost/line data from receipts; maps to QBO `Attachable` if/when pushed.
- **Pre-Invoice / Completed Job** — header (customer, job, date) + line items. For a T&M job, lines reference billable time entries and materials; for a fixed-price job, a single contract-amount line. Maps to QBO `Invoice`.
- **Money** — stored as decimal with a `currency` field. Never floats.

### 8.2a The two time tracks: pay vs. job

Time tracking serves **two separate but related purposes**:

- **Pay track (`WorkDay`)** — the daily span a worker is paid for: when they started and ended the day. This drives payroll/labor cost. It is captured at the day level, independent of any job.
- **Job track (`JobTimeEntry`)** — time spent on a specific customer **job**, which drives **billing** on T&M jobs and **margin/cost** on fixed-price jobs.

**Start-of-day capture flow (the bookend).** Workers reliably forget to clock *out*, but they reliably show up the next day. So the pay track is captured with up to two questions when a worker opens the app to begin a day, **before** they can access any jobs:

1. *"What time did you finish your last workday?"* — only asked if the worker has a still-`open` WorkDay from a prior day (the last day they started). The answer sets that day's `end_time` and marks it `closed`.
2. *"What time did you start today?"* — sets `start_time` on a new `open` WorkDay for today.

Only after this is answered does the worker proceed to job logging. The previous day is closed retroactively the moment the next day begins, so no end-of-day clock-out is required.

**How the tracks relate.** A worker's paid hours for a day come from the WorkDay span. Their JobTimeEntry records allocate (most of) that day across jobs; the remainder is overhead (travel, shop, admin) with no job. The two won't always reconcile exactly, and that's expected.

The **`no_charge`** flag **defaults to false (chargeable)** and is advisory — the worker can flip it ("No charge / warranty"), but it does not by itself decide billing; the actual invoice is produced downstream using this as a signal. It is shown on every job (the label reads sensibly on both T&M and fixed-price).

| Situation | Pay track (`WorkDay`) | Job track (`JobTimeEntry`) | `no_charge` (default false) |
|---|---|---|---|
| Hours on a T&M job | within the day's span | entry on that job | false (chargeable) |
| Hours on a fixed-price job | within the day's span | entry on that job | false; time also informs margin |
| Travel / shop / admin time | within the day's span | no entry (overhead) | — |
| Warranty / no-charge work | within the day's span | entry on that job | worker sets true |

Payroll Report = sum of WorkDay paid hours per worker (hours only; no pay rates in MVP). 

### 8.2b Composition of a completed job

A completed job is the assembled record that drives both the printable work order and the invoice. It pulls together:

- **Customer** — name, `phone`, `email` (from the Customer record).
- **Job location** — the site address (on the Job).
- **Description of work** — the narrative of what was done (on the Job).
- **Time on the job** (UI: "On the job today", since a job can span multiple days) — for each tech (up to three): `date`, the `time_in` / `time_out` segments, and the derived `total_hours` (rounded to 0.25 h on the daily total), plus the `no_charge` flag where set.
- **Materials** — line items of `item`, `qty`, and `cost` (your cost; catalog or ad-hoc MaterialLines).
- **Attachments** — job-level photos/receipts captured in the field (no OCR in MVP).
- **Notes** — free-text notes on the Job.

This composition is the single source for: the **Pre-invoice** (T&M = billable time + materials; fixed-price = contract price all determine down the line.  This report gives all the potential items added to an invoice.), the **customer-facing work order**, and the export. Nothing here is re-keyed — the invoice and ticket are views over the same captured data.

### 8.3 Deactivate, don't delete

Customers and Materials carry an `active` boolean rather than relying on hard deletion, mirroring QuickBooks' behavior for name-list records and keeping future reconciliation clean. Transactional records (invoices) may be truly deletable.

### 8.4 Integration behind an adapter interface

Accounting integration sits behind an `AccountingProvider` interface (e.g. `importCustomers`, `importItems`, `pushInvoice`, `pushTime`). QuickBooks Online is the first and only implementation in MVP. Non-QuickBooks users simply never enable a provider. This keeps the door open for Xero/FreshBooks later without touching core logic.

### 8.5 Outbox / background sync, not inline calls

Record changes are marked `dirty` and reconciled with QuickBooks by a background sync process rather than synchronous API calls in the request path. This keeps the app fast and fully functional when QuickBooks is disconnected, slow, or rate-limited — and respects Intuit's rate limits and tiered pricing.

### 8.6 Standalone fallback: spreadsheet export

A Company that does not connect QuickBooks must still be able to get its data out. From the admin interface, an admin can **export the Company's data as a spreadsheet (`.xlsx`)** — worker list, customers, jobs, materials, and time/billing records — each as its own sheet or file. This is the non-integrated path to feed an accountant or any other system, and it reinforces the "QuickBooks-ready, not dependent" principle: the integration is a convenience, never a lock-in. The export reads the same canonical model the QuickBooks adapter reads, so the two stay consistent.

### 8.7 Source of truth when QuickBooks is connected

When a Company connects QuickBooks, **QuickBooks becomes the source of truth for Customers and Materials**. Concretely for MVP:

- These records are **read-only in the app** — admins edit them in QuickBooks, and the app refreshes them on an **on-demand import** (no continuous/webhook sync in MVP).
- A **brand-new** customer or material created in the app before/without a QBO match is the one exception — it originates locally (`source = local`). Since the **write direction is deferred** (Section 7), in MVP these brand-new local records are not pushed to QBO automatically; pushing them is post-MVP. Until then they live locally and can be created in QBO by the admin if desired.
- Jobs, WorkDays, JobTimeEntries, and MaterialLines are **always owned by the app** — QuickBooks has no competing copy in MVP, so there is no source-of-truth conflict for them.

This keeps the connected experience predictable: the accounting system owns the name lists, the field app owns the field data.

### 8.8 Offline media queue (photo uploads)

Photos are captured where signal is unreliable, so the app never blocks on the network. When a worker adds a photo:

1. The image and its metadata (`label`, `added_at`, `job_id`, a client-generated `id`) are written immediately to **on-device storage (IndexedDB)**; the attachment shows `status = queued`. `added_at` is fixed at this moment and is what the UI displays — regardless of when the bytes actually leave the phone.
2. A **background uploader** drains the queue. Where the browser supports the **Background Sync API** (Chromium / Android, via a service worker), the upload can complete even after the worker closes the tab. On **iOS / Safari, which lacks Background Sync**, the app falls back to a **foreground retry**: it drains the queue on app launch and whenever the `online` event fires while the app is open. Practically, an iPhone user's queued photos send the next time they open the app with a connection — surfaced honestly in the UI ("will upload when you're back online").
3. Uploads are **idempotent** — the client `id` (or a pre-signed key) dedupes retries, so a flaky connection can't create duplicate attachments. On success, `status → uploaded` and `uploaded_at` is set.

This is the same outbox philosophy as QuickBooks sync (8.5), applied to binary media. **Known limitation:** fully background (tab-closed) upload is not possible on iOS web; accepted for MVP.

## 9. Open Questions

- Sync direction of truth on conflict: if a customer is edited in both systems, who wins?
A: if Quickbooks connection is added, Quickbooks becomes the source of truth for customer data except in the case of a brand new customer.
- Do we sync continuously (webhooks) or only on user-triggered import / at billing time? (MVP leans toward on-demand import.)
A: on demand. Sync
- How do we de-duplicate when importing customers/materials that may already exist locally? (Match on `display_name` / email / SKU?)
A: if Quickbooks connection is added, Quickbooks becomes the source of truth for materials data except in the case of a brand new material.
- ~~Jobs vs. customers: is "job" a first-class entity in MVP?~~ **Decided:** Job is a first-class entity; customer has many jobs; job carries start/end and billing type.
- ~~Pay track: clock in/out vs. daily totals?~~ **Decided:** daily start/end span (`WorkDay`), with the end captured the next morning via the start-of-day bookend prompt.
- **Breaks / lunch:** does the WorkDay span subtract an unpaid break, and how is it captured (a third question, a setting, or ignored in MVP)?
A: ignored for MVP
- **First day & multi-day gaps:** on a worker's very first day there's no prior day to close; after a multi-day gap the "last workday" may be days ago. Confirm the prompt keys off the last `open` WorkDay regardless of how long ago.
A:confirmed
- **Corrections:** how does a worker (or admin) fix a wrong start/end time after the fact?
A: this needs to be a CRUD function for admin
- **Overnight / cross-midnight shifts:** can a WorkDay's end_time fall on a different calendar date than start_time?
a: not for MVP
- On a fixed-price job, do we still let workers mark individual entries billable, or force all job time to not-billable-to-customer?
A: we default to billable, worker can change.  Actual invoices generated elsewhere and will use the app's reported data to support final invoicing choices
- How is a worker's pay rate stored and versioned (changes over time, overtime rules)? In scope for MVP, or just capture hours and handle pay elsewhere?
A: worker pay rate not captured/managed in the MVP
- Invoice delivery: does MVP send/print invoices itself, or only stage them for QuickBooks?
a: staging of pre-invoices.

**Resolved in v0.2:**
- **Crew time entry** — each tech self-logs their own time-on-site from their own login.
- **Material line amount** — captured as **your cost** (company cost), not customer sell price; markup applied downstream.
- **Job lifecycle** — `open` → `in_progress` → `completed`; marking a job `completed` makes its pre-invoice/report available.
- **QBO-connected editing** — Customers and Materials are **read-only in the app** when QuickBooks is connected (edit in QBO, refresh via on-demand import). See 8.7.

**Resolved in v0.3:**
- **Time rounding** — live clock-in/out stores precise times; the per-job **daily total** rounds to the nearest **0.25 h** (rounding applied once to the day's total, not per segment).
- **Billable toggle** — replaced with a **"No charge / warranty"** flag (default chargeable), shown on every job; advisory only.
- **Ad-hoc materials** — a worker can add a material not in the catalog (description + price/unit + qty); it is **job-only** and not promoted to the catalog in MVP.
- **Attachments** — photos/receipts attach at the **job level**; capture/store only (no OCR) in MVP; uploads queue and retry offline.

**Resolved in v0.4:**
- **Materials ordering** — alphabetical, with "Add a material to job" pinned as the top item; no recent/frequent ranking in MVP.
- **Attachment limits** — none (count/size/type) in MVP.
- **Job completion** — a **tech taps `completed`**; **only an admin can re-open** a completed job.
- **Photo metadata** — each attachment has a required `label` (e.g. "Home Depot"), an `added_at` timestamp (shown in UI, = when added, not when uploaded), and a `status` (`queued` / `uploaded`).
- **Offline retry mechanism** — IndexedDB queue + Background Sync (Android/Chromium) with foreground-retry fallback (iOS/Safari); idempotent uploads. See 8.8.
- **"On site" → "On the job today"** — relabeled since a job can span multiple days.

**Still open:**
- `no_charge` grain — should the flag live on each time entry, on the visit, or on the whole job? (Per-entry risks inconsistent values within one job/day; "no charge" is arguably a judgment about the work, not a clock segment.)

## 10. Future / Post-MVP

- **Generate an invoice** — for a T&M job, roll the job's billable time + materials into an invoice; for a fixed-price job, invoice the contracted price (with time/materials tracked for cost and margin, not billed line-by-line).
- **Apply sell prices / markup** — turn captured material cost and labor hours into customer-facing amounts.
- Push invoices, time entries, and locally-created customers/materials to QuickBooks Online (write direction).
- Webhook-based continuous sync.
- QuickBooks Desktop support (SDK / Web Connector — meaningfully different effort).
- Additional accounting providers (Xero, FreshBooks) via the same adapter interface.
- Distribution via the QuickBooks App Store.
