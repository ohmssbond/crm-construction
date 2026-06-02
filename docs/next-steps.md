# Status & Next Steps

_Last updated: 2026-06-02._

## Done

- ✅ MVP spec finalized — [`docs/mvp-spec.md`](mvp-spec.md).
- ✅ Supabase schema, RLS, and `project-files` storage bucket designed and **applied to
  the remote project** (`uwvvkekxropproqdzych`).
- ✅ Two tenants seeded: Gargoyle Systems, J Huber Restorations.
- ✅ Supabase CLI installed and repo linked (see [`docs/setup.md`](setup.md)).

## Next steps (resume here)

1. **Create an artisan login and authorize it.** Sign up a user via Supabase Auth, then
   add the `organization_members` row (see `docs/setup.md`). Without this, the app reads
   nothing — RLS is working as designed.
2. **Generate DB types** for type-safe queries:
   `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
3. **Route gating in `src/middleware.ts`.** It currently only refreshes the session; add
   redirects to separate the artisan area from the contact portal and bounce
   unauthenticated users. ⚠️ Read `node_modules/next/dist/docs/` first (modified Next.js).
4. **Scaffold the artisan area:** customers, contacts (typed), projects under a customer,
   and project detail (stage control, attach/detach contacts, status updates with share
   toggle, to-dos, attachments grid with mobile photo capture).
5. **Scaffold the read-only contact portal:** my projects → project detail showing only
   shared status updates and attachments.
6. **Wire Storage uploads** to the `project-files` bucket using the path convention
   `{organization_id}/{project_id}/{filename}` (the storage RLS policies depend on it).
7. **Invite flow.** Inserting `invitations` + creating a portal auth user needs elevated
   privileges → add a **service-role key** (server-side only) for this action. Then build
   invitation acceptance (set password → link `contacts.user_id`).
8. **Email notifications** on invite (and optionally when a status update is shared).

## Loose ends / decisions

- `src/app/layout.tsx` metadata still says **"Create Next App"** — rename when UI starts.
- **Conscious cut:** the portal is read-only (no comment/acknowledge). A lightweight
  comment/acknowledge is the natural first fast-follow — keep it on the radar.
- Admin console deferred; tenants onboarded manually for now.
