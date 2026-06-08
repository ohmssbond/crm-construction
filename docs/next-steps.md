# Status & Next Steps

_Last updated: 2026-06-08._

## Done

- ✅ MVP spec finalized — [`docs/mvp-spec.md`](mvp-spec.md).
- ✅ Supabase schema, RLS, and `project-files` storage bucket **applied to the remote
  project** (`uwvvkekxropproqdzych`); two tenants seeded (Gargoyle Systems, J Huber
  Restorations). CLI installed + linked — see [`docs/setup.md`](setup.md).
- ✅ **App shell built & verified** (per [`shell-build-spec.md`](shell-build-spec.md)):
  - Tokens wired into Tailwind v4 (`globals.css`); root `layout.tsx` retitled.
  - Two-world `AppShell` (sidebar / top bar / mobile bottom-tabs / FAB) — artisan green,
    portal blue, swapped only by `data-world`.
  - `src/proxy.ts` (Next 16's renamed middleware) refreshes the session; gating logic is
    in place but **staged behind `ENFORCE_AUTH=false`** so the shell stays walkable.
  - All UI primitives from design-system §7, matched to `component-gallery.html`.
  - Placeholder screens for every route (artisan + portal, both breakpoints).
  - `npm run build` passes; all 14 routes serve 200; full IA is clickable.
- ✅ **Tenant white-label config (MVP)** — applied to remote (migration `20260603000002`):
  per-tenant `primary_color` / `member_noun` / `client_noun`; per-tenant `file_categories`
  (seeded for both verticals); `attachments.kind` + `url` for external doc links. Accent now
  themes from `AppShell`'s `accent` prop (auto-derives `--accent-soft`).

## Next steps (resume here)

1. ✅ **Artisan logins created + authorized.** Both tenants done via
   `scripts/authorize-artisans.mjs` (J Huber + Gargoyle, role `owner`).
2. ✅ **DB types generated** — `src/lib/supabase/database.types.ts`.
3. **Replace placeholder content with real Supabase reads** — _in progress._
   - ✅ **Login wired** — `(auth)/login` (`actions.ts` + client form). `signInWithPassword`
     via the server client; redirect resolved from membership (org member → `/dashboard`,
     else `/my-projects`). Inline error on failure.
   - ✅ **Tenant-aware artisan shell** — `(artisan)/layout.tsx` loads `getOrgContext()`
     (`src/lib/data/org.ts`, memoized w/ `React.cache`) and passes real `brand`/`user`/`accent`
     to `AppShell`. `Sidebar` now takes `brand`/`user` props (placeholder fallback for the
     not-yet-wired portal).
   - ✅ **Dashboard reads real data** — counts + active projects + cross-project todos, RLS-scoped.
   - ✅ **Projects list + detail read real data** — `src/lib/data/projects.ts`
     (`listProjects`, `getProjectDetail`). Detail covers all four tabs: Updates
     (`status_updates` w/ real `is_shared`), Photos & Files (`attachments` + category chips
     from `file_categories`), To-dos (project-scoped), Contacts (via `project_contacts`).
     Unknown/cross-org id → `notFound()` (404). Shared date helpers in `src/lib/data/format.ts`.
   - ✅ **Customers + Contacts read real data** (list + detail) — `src/lib/data/customers.ts`
     and `src/lib/data/contacts.ts`. Customer detail shows its projects (w/ contact counts);
     contact detail shows attached projects via `project_contacts` + the contact's customer.
     Shared name helpers (`contactName`/`contactInitials`) live in `contacts.ts` and are reused
     by the project detail page. Unknown/cross-org id → `notFound()`.
   - ✅ **Demo data** seeded for J Huber via `scripts/seed-demo-data.mjs` (script, not a
     migration — never ships to a real tenant; idempotent fixed-UUID upserts). Includes
     `kind=link` attachments (no Storage object needed). Gargoyle left empty on purpose,
     which is how tenant isolation was verified.
   - ✅ **Read-only portal reads real data** — `src/lib/data/portal.ts`
     (`getPortalContext`, `listPortalProjects`, `getPortalProject`). `(portal)` layout themes
     to the artisan's brand. List shows only attached projects; detail shows ONLY `is_shared`
     updates + attachments (Updates + Photos & Files tabs only — no todos/contacts); unattached
     or unknown id → 404. Account page reads the stamped identity.
     - **Portal login**: `scripts/seed-contact-login.mjs` provisions a contact auth user
       (`doug+sarahmarsh@…` → Sarah Marsh) and stamps `app_metadata` (`role:'contact'`,
       `full_name`, `org_name/color/nouns`). A contact can't read the `organizations`/`contacts`
       rows under RLS, so the portal **shell branding** comes from this metadata. The project/
       update/file reads still go through live `contact_read` RLS.
       **TODO(step 4):** replace the metadata branding with a `contact_read` policy on
       `organizations` (+ `contacts` self-read) once role stamping at login is set up — that
       migration was written conceptually but NOT applied (no DB creds available locally).
   - ✅ **Nouns wired** (`member_noun`/`client_noun`) — `nav.ts` gains `navLabel`/`pluralize`;
     threaded as `clientNoun` through `AppShell` → `Sidebar`/`TopBar`. Customers nav/title →
     client noun plural; workspace label → `${member_noun} workspace`; portal label →
     `${client_noun} portal`; customers list copy + dashboard StatCard + contact-detail field +
     the "…never shown in the {client} portal" banners all read from config. Verified live:
     J Huber = "Customers"/"Contractor workspace"; Gargoyle = "Clients"/"Consultant workspace".

   **✅ STEP 3 COMPLETE — every read screen (artisan + portal) is real and white-labeled.**
   - ✅ **Project-detail write paths wired** (`projects/[id]/actions.ts` Server Actions, all
     RLS-scoped, `revalidatePath`): **post update** (Composer, with share choice), **change
     stage** (`StageControl` wrapper), **toggle update share** + **toggle file share**
     (`ShareToggle` gained an optional persistence `action` + controlled mode), **toggle todo**
     (`TodoRow` `action`). Verified live persisting across reload: post / stage / update-share /
     todo-toggle (file-share uses the same ShareToggle→action path). File upload = step 5.
   - ✅ **Full artisan CRUD wired (no dead buttons)** — create flows on dedicated routes
     (`/projects/new`, `/customers/new`, `/contacts/new`, `/customers/[id]/edit`) via
     `(artisan)/actions.ts` (`createProject/Customer/Contact`, `updateCustomer`) + reusable
     forms; **attach/detach contact** (`ContactManager` → `attachContact`/`detachContact`,
     this is the portal-access control); **add-todo** (`TodoComposer`) + **add doc link**
     (`LinkForm`, `kind:'link'`); list **search + filters** now functional (`ProjectList`/
     `ContactList`/`CustomerList` client components; `SearchField`/`FilterChips` gained
     controlled modes). "New X" buttons + mobile FAB are now links; dead "Manage access"
     button replaced with guidance. Verified live: create project (→ real detail) + attach
     contact (grants Active portal user access) + stage filter.
     - **Not built (acceptable for now):** delete/archive UI; image thumbnails. The Photos &
       Files category filter chip was removed (was non-functional).

   > ⚠️ **Theming gotcha (fixed in `AppShell`):** Tailwind v4 declares `--color-accent: var(--accent)`
   > at `:root`, so that `var()` resolves **once at :root** (the green fallback) and the resolved
   > value is inherited — overriding `--accent` lower in the tree does nothing. `AppShell` therefore
   > sets the resolved tokens (`--color-accent`, `--color-accent-soft`) directly on the shell root.
   > Don't "simplify" it back to only setting `--accent`.
4. ✅ **Auth gating ENABLED.** `ENFORCE_AUTH = true` in `src/proxy.ts`:
   - Roles stamped into `app_metadata` at provisioning — artisans via
     `scripts/stamp-roles.mjs` (`role:'artisan'` + `organization_id`), contacts via
     `seed-contact-login.mjs` (`role:'contact'`). `getSessionRole` reads the JWT (no DB hit).
   - Proxy: unauthenticated → `/login`; authenticated on `/` or `/login` → role home;
     world separation (contact off artisan routes → `/my-projects`; artisan off portal routes
     → `/dashboard`). Login action redirects by `getSessionRole` (membership fallback).
   - **Sign-out** wired — `src/lib/auth-actions.ts` `signOut()` → settings (artisan) + account
     (portal), which are now real screens. Verified live: all 7 gating paths + sign-out clears cookie.
   - **MVP note:** role stamping is at provisioning (script), not a live Auth hook — fine for
     manual onboarding. Production upgrade: a Supabase custom access-token hook that derives the
     claim at token mint (needs project-level hook config). Portal branding stays metadata-backed
     (works; no `organizations` contact-RLS policy needed).
5. ✅ **Storage uploads wired.** Project detail → Photos & Files has an `UploadForm`
   (`src/app/(artisan)/projects/[id]/UploadForm.tsx`) → `uploadAttachment` Server Action
   (`actions.ts`): uploads to `project-files` at `{org}/{project}/{ts-filename}` (the path the
   storage RLS keys on), inserts the `attachments` row (`kind:'file'`, category, mime, size,
   `is_shared`), `revalidatePath`. Orphan object is removed if the row insert fails. File tiles
   are now clickable via short-lived **signed URLs** (`src/lib/data/attachments.ts`
   `withAttachmentUrls`, used by both artisan + portal detail loaders). `next.config.ts`
   raises `serverActions.bodySizeLimit` to 10mb (**requires `npm run dev` restart** to take
   effect for files >1MB). Verified live end-to-end: artisan upload → tile + working signed
   URL (200/image/png) → shared file appears in the contact's portal with its own working
   signed URL (storage contact-read policy).
   - ⏳ **Follow-ups:** "add doc link" (`kind:'link'`) create UI (links only display today);
     per-tile share-toggle persistence; image thumbnails (tiles show a category glyph for now).
6. **Invite flow.** Inserting `invitations` + creating a portal auth user needs elevated
   privileges → add a **service-role key** (server-side only). Then build invitation
   acceptance (set password → link `contacts.user_id`) behind `/invite/[token]`.
7. **Email notifications** on invite (and optionally when a status update is shared).

## Loose ends / decisions

- **Conscious cut:** the portal is read-only (no comment/acknowledge). A lightweight
  comment/acknowledge is the natural first fast-follow — the `UpdateCard` portal variant
  already renders the placeholder slot for it.
- Admin console deferred; tenants onboarded manually for now.
