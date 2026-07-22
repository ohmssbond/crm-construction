# Enhancements backlog

Small, low-risk polish items to batch into a future build. Each item notes the
exact location and change so it can be picked up cold.

## Open

### 1. Portal: turn the rep card into a grouped "Your Project Team" list
- **Heading:** `src/app/(portal)/my-projects/[id]/page.tsx:45` — rename
  `Your point of contact` → **`Your Project Team`**.
- **List membership:** today the card shows only reps (`type='rep'`). Change it to
  show **everyone linked to this project** — i.e. **all `project_contacts` rows**
  for the project (regardless of whether they've logged in yet; consistent with how
  reps already show despite having no portal login) — grouped into **3 sections**:
  1. **`<Tenant>`** — header is the tenant org name (e.g. "J Huber Restorations",
     from `PortalContext.orgName`); members are the tenant's own staff/reps
     (`contacts.type = 'rep'`).
  2. **Partners** — `contacts.type = 'partner'`.
  3. **Customer / Homeowner** — `contacts.type = 'customer'`.
  (`type = 'prospect'` is excluded — not a project-team member.)
- **Data layer:** the current `portal_project_reps` RPC
  (`supabase/migrations/20260717000001_company_reps.sql:36`, called at
  `src/lib/data/portal.ts:151`) hard-filters `c.type = 'rep'` and returns only
  name+email. Needs a broadened SECURITY DEFINER function (e.g.
  `portal_project_team(p_project)`) that returns **name, email, and `type`** for
  every `project_contacts` row on the project, still gated by the existing
  `contact_can_see_project(p_project)` guard so the `contacts` table itself stays
  unreadable to portal users. Reshape `getPortalProject` to return the grouped set
  instead of the flat `reps` array.
- **UI:** replace the single `{reps.length > 0 && (...)}` card block
  (`page.tsx:41-58`) with the three-section rendering; show **name + email** per
  person (same as today's rep card); hide any section that has no members (same
  spirit as today's `reps.length > 0` guard).
- **Resolved decisions (2026-07-22):**
  - **Membership** = every `project_contacts` row for the project, grouped by
    `type` — *not* filtered by login state. (Reps have no portal login yet are
    shown, so no `user_id IS NOT NULL` filter.)
  - **Privacy** = show **name + email** for everyone, matching the current
    point-of-contact card. Accepted that one customer contact's email is now
    visible to others on the same project.
  - **Partner** = simply `contacts.type = 'partner'` — there is no partner-org /
    company entity. `contacts` has no company/firm field, so partners render as a
    flat list of individual people; they **cannot** be sub-grouped by company.
- **Scope:** DB (new RPC) + data layer reshape + portal UI; not a text change.

### 2. Split "Photos & Files" into two separate nav tabs
- **File:** `src/app/(artisan)/projects/[id]/page.tsx:129`
- **Change:** replace the single `Photos & Files` tab with two tabs — `Photos`
  and `Files` — in the `Updates | Photos & Files | Tasks | Contacts` nav.
- **Why:** photos and files are distinct enough that combining them clutters one
  tab; separating them makes each easier to scan.
- **Scope:** more than text — the current tab's content mixes photo UI
  (`PortfolioSlots` / `imagePhotos`) with file UI (`UploadForm`, `LinkForm`, and
  the type-grouped `attachments` list). Splitting means partitioning that content
  into two tab entries (photos vs. non-photo attachments) rather than one.

### 3. Revise the file-type list (Plans, Permits, …) and sort it alphabetically
- **Requested changes to the type list:**
  - Add **Surveys**
  - Add **Designs**
  - Pluralize **Contract** → **Contracts**
  - Remove the **Before photo** / **After photo** options
  - Make the type dropdown sorted **alphabetically**
- **Where the list lives:** file types are per-org rows in the `file_categories`
  table (`key`, `label`, `sort`), **not** a constant. Seeded in
  `supabase/migrations/20260603000003_seed_tenants.sql:15+` (and
  `20260612000001_consultant_product_doc_category.sql`). Because existing orgs
  already have their rows seeded, this needs a **new migration** that inserts
  `surveys` + `designs`, relabels `contract` → "Contracts", and removes/hides
  `before_photo` + `after_photo` — applied to all existing org rows, not just the
  seed file (which only affects fresh tenants).
- **Also update:**
  - The `attachments.category` CHECK constraint that whitelists slugs
    (`supabase/migrations/20260603000001_add_attachment_categories.sql:7-8`) — add
    `surveys`/`designs`; decide whether to keep `before_photo`/`after_photo`
    allowed for legacy rows.
  - The `FILE_STYLE` glyph/color map at
    `src/app/(artisan)/projects/[id]/page.tsx:48` — add entries for the new
    `surveys` / `designs` keys.
- **Alphabetical sort:** the dropdown currently renders in DB `sort` order
  (`src/app/(artisan)/projects/[id]/UploadForm.tsx:89` `<select>`, same in
  `LinkForm.tsx`). Either order the query by `label` or sort the `categories`
  array by `label` before mapping.
- **Watch out:** `before_photo` / `after_photo` are file-type *labels* only — the
  portal Before/After strip and portfolio slots run off image `phase`/`slot`, a
  separate mechanism — but confirm no existing attachments rely on those two
  categories before dropping them, and how legacy rows should display.
- **Scope:** DB migration + constraint + small UI edits; not a pure-text change.

### 4. Add a company/firm field to contacts (esp. partners)
- **Why:** `contacts` today has no company/firm field — only first/last/email/phone
  — so a partner (an outside firm's person, e.g. an electrician from "ABC Electric")
  can't record which company they belong to. This blocks labelling/sub-grouping
  partners by firm in the portal "Your Project Team" list (see item 1, which
  currently must render partners as a flat list of individual names).
- **DB:** new migration adding a nullable `company text` column to `contacts`
  (defined in `supabase/migrations/20260602000001_init.sql:42`); regenerate
  `src/lib/supabase/database.types.ts` afterward.
- **Form:** add a "Company" input to `ContactForm`
  (`src/app/(artisan)/contacts/ContactForm.tsx:37+`) and its `Defaults` type
  (line 11). Decide whether the field shows for all contact types or only when
  `type = 'partner'` (probably most useful for partners, but harmless to allow on
  any type).
- **Write path:** parse + persist `company` in the create/update contact actions
  (`src/app/(artisan)/actions.ts` — createContact ~L115, updateContact ~L86,
  alongside the existing `first_name`/`last_name`/`phone` handling).
- **Reads:** add `company` to the contact selects in `src/lib/data/contacts.ts`
  (edit defaults) so the edit form round-trips it.
- **Ties into item 1:** once the column exists, have `portal_project_team` return
  `company` too, and show the firm under/after the partner's name (and optionally
  sub-group the Partners section by company).
- **Scope:** DB migration + types regen + contact form/action/read edits; small but
  multi-file.

## Done

_(none yet)_
