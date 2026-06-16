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
  Remaining slices (later): materials catalog -> time tracking ->
  materials/attachments -> pre-invoice -> export -> QBO import.

