# T&B — Admins can log their own time (slice A)

**Date:** 2026-06-25
**Status:** Design — approved, plan to follow
**Surface:** Worker field app `/log` + T&B admin shell `/tb`

## Problem

In small trades shops the owner/admin is often also a field worker. Today the T&B
**admin** can run the office (`/tb`) but cannot log their own field time: time logging
lives only in the worker app `/log`, which the admin is bounced out of.

This is **slice A** of a larger requirement. Slice B (admins entering/correcting time
*on behalf of* the crew — needs worker + date pickers, ties into the historical-backfill
gap) is explicitly **out of scope here** and will be its own slice.

## Key finding (why this is small)

Time-logging is blocked for admins **only at the app layer**, not the database. The
`worker_rw` RLS policies on `work_days` / `job_time_entries` / `job_time_segments` (and
materials/notes) require `worker_user_id = auth.uid() AND is_tb_member(org)`, and
`is_tb_member` = *"has any timebilling membership"* — which already includes admins. So
an admin may own their own time rows as far as Postgres is concerned. The only blocks
are three app gates. **No migration; no RLS change.**

## Conceptual model

**Admin ⊇ worker** for the field surfaces: an admin can do everything a worker can.
We do NOT give the admin a second membership (the `memberships` PK `(org,user,product)`
allows one role per user per product; dual roles would be a schema change). Instead the
admin uses `/log` as themselves, with `worker_user_id` = the admin's own id. Anyone who
logs time is a "tech" in the report, labeled via `tb_workers` — so the admin becomes
nameable there too (see #5). This is the seam toward the deferred formal Worker/Employee
entity, but that entity is not built here.

## Design (reuse `/log`, don't duplicate in `/tb`)

The cross-navigation is already scaffolded: `Sidebar` renders a "Time logging → /log"
link when `showTimeLink` is true (the artisan layout already uses this for CRM users who
are also workers). Five small changes:

1. **Relax `requireTbWorker`** (`src/lib/auth-tb.ts`) — the gate on all `/log` server
   actions — to accept timebilling **worker OR admin** (was worker-only). Update its doc
   to state admins are included (admin ⊇ worker). Name kept.
2. **Relax the `/log` layout gate** (`src/app/(worker)/log/layout.tsx`) — currently
   redirects anyone whose timebilling role `!== "worker"`; change to redirect only when
   the role is neither `worker` nor `admin`.
3. **`/tb` layout passes `showTimeLink`** (`src/app/(timebilling)/tb/layout.tsx`) so the
   Sidebar shows "Time logging → /log" for admins (all `/tb` users are admins, who can
   now log time).
4. **`/log` header "T&B admin" link → `/tb`** when the signed-in user is a tb admin —
   mirrors the existing "Back to CRM" link, so the admin can get back to the office.
5. **Admin nameable for the report** — extend `listTbWorkers`
   (`src/lib/data/tb-workers.ts`), today filtered to `role='worker'`, to also include
   `role='admin'` timebilling members and return each row's `role`. The `/tb/workers`
   screen then lists the admin too (with an "(admin)" badge) so they can be named; the
   report/billing export already labels any tech via `tb_workers` name (email fallback),
   so once named, an admin's logged time shows by name.

## Out of scope

- Slice B: admin entering/editing time **on behalf of** other workers (needs worker +
  date pickers; absorbs the historical-backfill/date-picker gap).
- A formal Worker/Employee entity (QBO Employee mapping) — still deferred.
- Mobile surfacing of the `/tb`→`/log` link: `showTimeLink` renders in the desktop
  Sidebar only; an admin on a phone in `/tb` won't see it. Acceptable for A (matches the
  existing artisan pattern); a small follow-up.
- Giving admins a second `worker` membership / dual roles.

## Testing

These are layout/gate/routing changes, consistent with how the codebase treats shells
(no unit tests there). Verification is `npm run build` + `npm test` (existing suite stays
green) plus manual checks:

- Sign in as the Owl admin (`doug+owladmin@…`) → land on `/tb` → a "Time logging" link
  appears in the sidebar → it opens `/log` (not a redirect bounce).
- On `/log`, the admin can start a day, clock into a job, add materials/notes — their own
  rows persist (RLS allows; `worker_user_id` = admin id).
- A "T&B admin" link in the `/log` header returns to `/tb`.
- `/tb/workers` lists the admin (badged "(admin)"); naming them makes the job report /
  billing export label that admin's time by name instead of email.
- A worker (`doug+owlworker1@…`) still works exactly as before; non-T&B users are still
  redirected away from `/log`.

## Files touched

- `src/lib/auth-tb.ts` — broaden `requireTbWorker` (worker or admin).
- `src/app/(worker)/log/layout.tsx` — relax gate; add "T&B admin" link for admins.
- `src/app/(timebilling)/tb/layout.tsx` — pass `showTimeLink`.
- `src/lib/data/tb-workers.ts` — `listTbWorkers` includes admins + returns `role`.
- `src/app/(timebilling)/tb/workers/page.tsx` — render the role badge.
