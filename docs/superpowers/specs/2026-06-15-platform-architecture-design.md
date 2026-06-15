# Platform architecture — CRM + Time & Billing on a shared core

_Architecture direction · 2026-06-15_

> This is a **direction record (ADR-style)**, not a buildable plan. It locks the
> cross-cutting decisions for running two products on one foundation. Each numbered
> slice in §9 gets its own brainstorm → spec → plan. The Time & Billing product
> requirements live in [`docs/timeandbilling~PRD.md`](../../timeandbilling~PRD.md).

## Context

Two products will share customers and a tenant: the existing **CRM** ("Artisan
Project Hub") and a new **Time & Billing** field app (the PRD). They must be
**purchasable separately** yet **lightly connected** when a business uses both. The
operator will also dogfood Time & Billing for their own consulting org (already the
Gargoyle tenant in the CRM). Usage is currently very low (2 tenants), so invasive
foundational changes are cheapest to make now.

## Decisions

| Topic | Decision |
|---|---|
| Product architecture | **One repo, one Supabase project.** Shared core + two product modules gated by per-org entitlements. Separate deploys only if later justified. |
| Customer sharing | **One shared org-level `customers` entity.** CRM projects and T&B jobs both reference the same customer row — that *is* the connection. No sync. |
| Entitlements | **Per-org `organization_products`**, toggled in the existing `/admin` console. Real self-serve billing is post-MVP. |
| Roles | **Per-product roles, single org per account (for now)** — within one org an account can hold any mix of product roles (e.g. `crm:artisan` + `timebilling:admin` in the same org). Multi-org-per-account is deferred. |
| Worker UX | A **dedicated worker path** (`/log`, subdomain later) into a **minimal shell** — no product nav. A product switcher appears only on admin surfaces for multi-product accounts. |
| Role-model migration | **Unify now.** Replace CRM's `organization_members` with a unified `memberships(organization_id, user_id, product, role)`. Done while usage is low. |
| First build | **Time & Billing MVP on the shared core**, starting with the Foundation slice (§9.1). |

## Platform shape

Keep the current Next.js app and Supabase project. Introduce **product modules** as
route groups over a shared core:

- Existing: `(artisan)`, `(portal)`, `(auth)`, `(admin)`.
- New (T&B): an admin/management surface for company admins, and a **dedicated
  worker path** (`/log`) with a stripped shell.
- Shared core libs (`src/lib/...`): tenancy, identity/roles, entitlements,
  customers, and the `/admin` console.

"Purchasable separately" is modeled by **entitlements**, not separate codebases.

## Shared core

### Tenant
The existing `organizations` row **is** the PRD's `Company`. The QBO realm id +
OAuth tokens become **nullable** columns on it (null until a company connects QBO).

### Entitlements
`organization_products(organization_id, product, status)` where
`product ∈ {'crm','timebilling'}` and `status ∈ {'active','inactive'}`. Read
server-side to gate routes and navigation. Managed by the super-admin `/admin`
console (extend it with per-product toggles).

### Unified memberships & roles (unify-now migration)
Replace `organization_members(organization_id, user_id, role)` with
**`memberships(organization_id, user_id, product, role)`** — staff access to a
product within an org, with product-scoped roles:

- `crm`: `owner` | `artisan`
- `timebilling`: `admin` | `worker`

An account may hold several membership rows **within a single org** (one per
product); multi-org-per-account is deferred (see Out of scope), so all of an
account's memberships share one `organization_id` for now.
**Portal contacts stay as they are** — `contacts.user_id` + the `contact` role is a
customer-side concept, not org staff, and is out of scope for the `memberships`
table. The Supabase **access-token hook** and `proxy.ts` are updated to derive
product + role(s) from `memberships` and route accordingly. The detailed schema,
RLS, hook changes, and routing are designed in the Foundation slice (§9.1); this
record only fixes the direction (unify, per-product roles, contacts unchanged).

### Shared customers
Extend the existing `customers` table to be T&B/QBO-ready (all additive, nullable
where the CRM doesn't need them): structured `email`/`phone`/billing address,
per-org-unique `display_name`, `active`, and the QBO mapping fields (`qbo_id`,
`qbo_sync_token`, `last_synced_at`, `sync_status`, `source`). CRM keeps using the
fields it already uses. **T&B jobs and CRM projects both FK to the same customer
row** — a customer can have projects and jobs side by side. This is the entire
"lightweight connection"; no cross-product sync is built.

## Worker experience (key constraint)

Workers must have the smallest possible interface. A **dedicated short path**
(`/log`; a subdomain is a later option) lands a worker directly in a **minimal
shell**: start-of-day bookend prompt → today's jobs → log time / materials /
photos. No sidebar, no product switcher. Because the worker surface is reached by
**where you go**, not **who you are**, it stays minimal even for an account that
also has admin access elsewhere. The product switcher appears only on admin
surfaces, and only for accounts entitled to more than one product.

## Time & Billing module-owned data

Per the PRD (§8), all org-scoped with RLS and carrying nullable QBO mapping fields:
`jobs`, `workdays`, `job_time_entries` + `job_time_segments`, `materials`,
`material_lines`, job-level `attachments` (offline upload queue), and the derived
**pre-invoice / completed-job report** (the core output). Accounting integration
sits behind an `AccountingProvider` adapter; **QuickBooks Online is the only
implementation, read-only (import) in MVP** — write/sync deferred. A no-accounting
`.xlsx` export is the standalone fallback.

## Build sequencing

Each slice is its own spec → plan → build:

1. **Foundation** — `organization_products` entitlements + `/admin` toggle;
   unified `memberships` + the CRM role-model migration; access-token hook + proxy
   made product/role-aware; the worker `/log` path + minimal shell skeleton.
2. **Shared customers** — evolve the `customers` table; T&B customer admin CRUD.
3. **Jobs + materials catalog** — customer→jobs, billing type, lifecycle; materials catalog.
4. **Time tracking** — WorkDay bookend prompt, JobTimeEntry/segments, 0.25h rounding, no-charge toggle.
5. **Materials used + attachments** — catalog/ad-hoc material lines; offline photo/receipt queue.
6. **Pre-invoice / completed-job report** — the core MVP output.
7. **Export (.xlsx)** — standalone fallback.
8. **QBO import (read) + adapter** — optional, last.

## Out of scope / deferred

- Self-serve billing/subscriptions (entitlements are admin-toggled for now).
- QBO write direction, webhooks/continuous sync, QBO Desktop, other accounting providers.
- Payroll / pay rates (T&B captures hours only).
- Worker-app PWA/offline beyond the photo upload queue.
- Separate per-product deployments/subdomains (single app for now).
- **Multi-org per account** — an account belongs to one org for now (a person
  serving multiple businesses uses separate logins); revisit when needed.

## Risks & mitigations

- **Role-model migration touches live auth.** Mitigated by low usage (2 tenants),
  doing it now, and designing/verifying it as its own slice with the existing
  three-gate discipline. Contacts/portal path left untouched to shrink blast radius.
- **Customer table evolution** must not break the live CRM — all changes additive
  and nullable; CRM continues using its current fields.
- **Two products in one app** could blur boundaries — mitigated by route-group
  modules, entitlement gating, and a shared-core/`lib` separation.
