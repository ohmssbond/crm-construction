# Artisan Project Hub — MVP Spec v2

*Next.js 16 + Supabase (Auth · Postgres + RLS · Storage). A shared workspace where an
artisan runs a project's documents, photos, status, and to-dos — and attached contacts
get a read-only window into theirs.*

## Thesis

Give an independent artisan (consultant / contractor / tradesperson) one place to run a
customer's project end-to-end — documents, photos, status updates, and to-dos — and give
the people attached to that project a clean, **read-only** window into what's shared with
them.

## Roles

- **Artisan** — paying user; full control of their Organization's data.
- **Contact (portal)** — any contact granted a login; **read-only** access to the
  **shared** content of **projects they're attached to**.
- ~~Admin~~ — deferred; two tenants seeded manually.

**Terminology & brand are tenant-configured (white-label).** Each Organization sets its
own `member_noun` (*Contractor* for J Huber, *Consultant* for Gargoyle), `client_noun`, and
brand `primary_color`; the UI reads these so each vertical feels native. Two verticals
onboard at launch (construction + software consultancy), so this is MVP, not later.

## Entity Model

```
Organization (tenant)         → primary_color, member_noun, client_noun (white-label)
   ├─ FileCategory             (per-tenant attachment categories; plans/permits vs PRD/arch)
   ├─ Customer                 (account; a Project lives under exactly 1)
   ├─ Contact                  (person; type: partner|prospect|customer; optional login)
   └─ Project                  (name = site address; stage; dates; → 1 Customer)
        ├─ ProjectContact      (M:N: which contacts are attached → drives access)
        ├─ StatusUpdate        (body, posted_at, is_shared)
        ├─ Todo                (text, due, done)            ── internal only
        └─ Attachment          (kind: file|link; category → FileCategory; is_shared)
User ↔ Contact | Organization  (auth identity + role)
Invitation                     (email, token, status)       ── grants a Contact a login
```

### Key fields

- **Organization (tenant):** name, `primary_color`, `member_noun`, `client_noun`.
- **FileCategory:** per-Organization `key`, `label`, `sort`. Seeded per vertical
  (construction: plans/permits/…; software: PRD/tech-architecture/…), editable later.
- **Customer:** name, address, notes, archived_at.
- **Contact:** first/last name, email, phone, `type ∈ {partner, prospect, customer}`,
  optional Customer link, archived_at.
- **Project:** name (may be a site address),
  `stage ∈ {proposal, signed, in_progress, completed}` *(manual labels — no signing
  feature)*, start/end date, → Customer, archived_at.
- **ProjectContact:** project_id, contact_id. *(This row is the access grant.)*
- **StatusUpdate:** body, posted_at, **is_shared**.
- **Todo:** text, due_date, done. *Internal — never shown in portal.*
- **Attachment:** `kind ∈ {file, link}` — an uploaded file *or* an external link (Google
  Docs/Sheets/Drive). Storage ref *or* `url`, `category` → one of the tenant's
  **FileCategory** rows, filename, size, mime, uploaded_by, uploaded_at, **is_shared**.
- **Invitation:** email, contact_id, token, `status ∈ {pending, accepted, expired}`.

### Two rules that carry the whole design

1. **Access = attachment.** A logged-in contact sees a project only if a `ProjectContact`
   row links them — *not* by customer ownership. Attaching is an explicit artisan action.
2. **`is_shared` gates the portal.** Contacts see only `is_shared = true` status updates
   and attachments. To-dos are never shared. Default new uploads to **private**; sharing
   is a deliberate toggle.

**Delete = archive** (`archived_at`) — preserves project records and uploaded documents.

## Screens

**Artisan**

- Dashboard: projects by stage, combined to-do list, recent activity.
- Customers (searchable) → Customer detail (its projects).
- Contacts (searchable, filter by type) → Contact detail (attached projects, login
  status).
- Projects, grouped by stage and filterable by customer.
- **Project detail:** stage control · attached contacts (attach/detach + invite) · status
  updates (with share toggle) · to-dos · attachments grid (mobile photo capture, per-file
  share toggle).

**Contact portal (read-only)**

- My Projects (current / past / proposal).
- Project detail: shared status-update timeline + shared documents/photos.
- Open/download an artifact.

## Workflows

**Artisan**

1. Create/edit/**archive** Customer.
2. Create/edit/**archive** Contact (set type); link to a Customer.
3. Create/edit/**archive** Project under a Customer; set its name (site address); set
   stage manually.
4. **Attach/detach** contacts to a project → controls who can access it.
5. Post a status update; toggle shared.
6. Upload/capture an attachment (any category); toggle shared.
7. Create/complete to-dos (internal).
8. **Invite** an attached contact to the portal (email → token).

**Contact**

1. Accept invitation → set password → portal.
2. View attached projects + their shared status updates and documents.
3. Open/download a shared artifact.

**System**

- Email on: invitation, and (optionally) when a status update is shared.
- RLS: artisans see only their Organization; contacts see only projects they're attached
  to, and within those only `is_shared` rows.

## Scope — In vs. Out

| In (MVP)                                       | Out (later)                                              |
| ---------------------------------------------- | ------------------------------------------------------- |
| 2 seeded tenants, manual onboarding            | Admin console, self-serve signup, billing               |
| Contacts w/ type + login; access by attachment | Per-document permissions beyond shared/private          |
| Projects under a Customer; manual stages       | Stage automation, proposal/contract/invoice **builders**, e-signature |
| Status updates, to-dos, unified attachments    | Two-way comments, customer write actions                |
| Shared/private toggle; mobile photo capture    | Online payments, scheduling/calendar                    |
| Email on invite                                | Native app, offline                                     |
| Per-tenant brand color + nouns; per-tenant file categories | Self-serve color picker / category-management UI |
| Attachments as upload **or** external doc link | Link preview/thumbnail, OAuth for private linked docs   |

## Conscious cut

The portal is **read-only**: a contact can view but can't acknowledge, comment, or
approve. A lightweight **"comment / acknowledge"** is the natural first fast-follow, since
the point of giving customers access is to close the loop with them.
