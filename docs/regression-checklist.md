# Regression Checklist

_Run after any build that touches CRUD, auth, or RLS. Last updated: 2026-06-10
(for the project-edit + archive/restore build)._

Run as **Test Tenant** (has demo data), **J Huber Restorations** (new/empty real tenant),
**Gargoyle** (real), and the **Sarah Marsh** portal login. Logins are in `rotated-passwords.txt`.
✅ = expected pass.

## A. Auth & gating
- [ ] Login each role → lands on correct home (artisan `/dashboard`, contact `/my-projects`)
- [ ] Artisan visits `/my-projects` → redirected to `/dashboard`
- [ ] Contact visits `/dashboard` → redirected to `/my-projects`
- [ ] Logged-out visits any app route → `/login`
- [ ] `/login` while authed → home
- [ ] Sign out (settings / account) → `/login`, session cleared
- [ ] Public sign-up is disabled (Supabase setting)

## B. White-label
- [ ] Test Tenant: green, "Customers", "Contractor workspace"
- [ ] J Huber Restorations: **teal `#199DB7`**, "Customers", "Builder workspace"
- [ ] Gargoyle: purple, "Clients", "Consultant workspace"
- [ ] Portal brand label uses client noun ("Customer portal" / "Client portal")

## C. Reads
- [ ] Dashboard: counts, active-projects list (excludes completed/archived), to-do **table** (Task/Project/Due)
- [ ] Projects list: search + stage filter chips work
- [ ] Project detail: Updates / Photos & Files / To-dos / Contacts all render real data
- [ ] Customers list + detail (its projects with contact counts)
- [ ] Contacts list (search + type filter) + detail (attached projects)
- [ ] Empty states render on the new/empty tenant

## D. Create
- [ ] New customer → opens its detail
- [ ] New contact (assigned to a customer) → detail
- [ ] New project (customer chosen, stage, dates) → detail
- [ ] Required-field asterisks shown; validation blocks empty required fields

## E. Edit
- [ ] Edit a customer (name/address/notes) → persists across reload
- [ ] Edit a contact (name/type/customer/email/phone) → persists
- [ ] **Edit a project (name / customer / stage / start+end dates) → persists** ← new
- [ ] Edit forms are prefilled with current values

## F. Archive / restore ← new
- [ ] Archive a project → confirm step → gone from list + dashboard; detail → 404
- [ ] Archived project is **hidden from Sarah's portal**
- [ ] List "Show archived" → archived project listed → **Restore** → back in list + dashboard + portal
- [ ] After restore, the project's updates/files/todos/contacts are intact
- [ ] Archive + restore a **customer** (gone from / back to customers list)
- [ ] Archive + restore a **contact** (gone from / back to contacts list)
- [ ] Archive is reversible (no data destroyed); confirm step prevents accidental archive

## G. Project-detail writes
- [ ] Post update (+ toggle its share) — persists
- [ ] Change stage — header chip + persists
- [ ] Upload file (<4.5MB) → tile + signed URL opens
- [ ] Add doc link (kind=link)
- [ ] Toggle a file's share
- [ ] Add a to-do; toggle a to-do done — persists
- [ ] Attach a contact (grants portal access) / detach

## H. Portal (read-only)
- [ ] Sarah sees only her attached, non-archived projects
- [ ] Only `is_shared` updates + files; private ones hidden
- [ ] No To-dos / Contacts tabs; Account page correct
- [ ] Direct URL to an unattached/archived project → 404

## I. Invites & security
- [ ] Invite a contact → copy-link (+ "✓ emailed" if Resend configured)
- [ ] Accept → sets password → portal
- [ ] Expired invite (>7d) → "Invitation not found"
- [ ] Invite with an existing account's email → **refused**, that account untouched (no password reset)

## J. Tenant isolation
- [ ] Each tenant sees only its own customers/projects/contacts
- [ ] Cross-org / unknown id → 404

## K. Build health
- [ ] `npx tsc --noEmit` clean
- [ ] `npx eslint src` clean
- [ ] `npm run build` succeeds
