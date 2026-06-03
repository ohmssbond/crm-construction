# Status & Next Steps

_Last updated: 2026-06-03._

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

1. **Create an artisan login and authorize it.** Sign up a user via Supabase Auth, then
   add the `organization_members` row (see `docs/setup.md`). Until then RLS returns nothing.
2. **Generate DB types:**
   `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
3. **Replace placeholder content with real Supabase reads** — artisan screens first
   (dashboard, projects, project detail, customers, contacts), then the read-only portal
   (only `is_shared` rows). The components and routes already exist; swap the sample data.
   **Wire tenant config here too:** the `(artisan)`/`(portal)` layouts read the signed-in
   org's `primary_color` + nouns and pass `accent` to `AppShell`; the Photos & Files screen
   reads `file_categories` instead of hardcoded chips; add the "add doc link" (`kind=link`)
   path alongside upload.
4. **Enable auth gating.** Stamp `app_metadata.role` (+ `organization_id`) at sign-in via a
   Supabase Auth hook / DB trigger, fill in `getSessionRole` usage, then flip
   `ENFORCE_AUTH` on in `src/proxy.ts` (artisan → `/dashboard`, contact → `/my-projects`).
5. **Wire Storage uploads** to the `project-files` bucket using the path convention
   `{organization_id}/{project_id}/{filename}` (the storage RLS policies depend on it).
6. **Invite flow.** Inserting `invitations` + creating a portal auth user needs elevated
   privileges → add a **service-role key** (server-side only). Then build invitation
   acceptance (set password → link `contacts.user_id`) behind `/invite/[token]`.
7. **Email notifications** on invite (and optionally when a status update is shared).

## Loose ends / decisions

- **Conscious cut:** the portal is read-only (no comment/acknowledge). A lightweight
  comment/acknowledge is the natural first fast-follow — the `UpdateCard` portal variant
  already renders the placeholder slot for it.
- Admin console deferred; tenants onboarded manually for now.
