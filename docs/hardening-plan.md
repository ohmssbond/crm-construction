# Hardening & Security Plan

_Last updated: 2026-06-09._

Engineering-debt and security work for the production app. Companion to
[`next-steps.md`](next-steps.md) (build status) and [`post-mvp-backlog.md`](post-mvp-backlog.md)
(product roadmap). Priorities: **P0** = security-critical, do before untrusted tenants ·
**P1/P2** = debt & hardening. Size: XS/S/M/L.

The app reuses one Supabase project as production (no separate dev DB), runs on Vercel at
`app.build-it-together.com`, and provisions users via service-role + the invite flow (public
self-signup is disabled).

---

## Phase 0 — Security-critical ✅ DONE (deployed)

Commits `eb4bc55`, `b2e2e80`.

| # | Issue | Fix | Verified |
|---|---|---|---|
| 0.1 | **Invite accept could reset an existing account's password** — `acceptInvite` fell back to `updateUserById({password})` when the invited email already had an account. Exploit: invite a contact with a victim's email, hold the token, claim it → reset their password (account takeover). | Provision a NEW user only; if the email exists, refuse ("sign in instead") and never touch the existing account. | ✅ takeover refused; target account `updated_at` unchanged |
| 0.2 | **Invites never expired** — a leaked/forwarded link was valid forever. | 7-day TTL enforced in code off `created_at` (no migration): `isInviteExpired` in `src/lib/data/invitations.ts`, checked in `getInvitationByToken` / `getPendingInvitation` / `acceptInvite`. | ✅ 8-day-old invite → "not found" |
| 0.3 | **HTML injection in invite email** — `inviteEmailHtml` interpolated the tenant org name into raw HTML. | Escape `orgName` (and any user-controlled value) before interpolation. | ✅ `<script>` escaped |
| 0.4 | **Weak password floor** — Supabase `minimum_password_length = 6`. | Bumped to 8 in `config.toml`. | n/a (config) |

**⚠️ 0.4 still needs a live dashboard action** — `config.toml` is not auto-applied to the
running project. In **Supabase → Authentication → Password security**: set **min length = 8**
and enable **"Prevent use of leaked passwords"** (HaveIBeenPwned). The app already enforces 8
for invite passwords; this closes it for all Supabase-side flows.

---

## Phase 1 — Engineering debt (P1, sequenced by leverage)

1. **Prod-grade auth** `(M)` — replace the provisioning-script role stamping with a Supabase
   **custom access-token Auth hook** (derives `role`/`organization_id` at token mint), and add
   an `organizations` `contact_read` **RLS policy** so portal branding reads from the DB
   instead of stale `app_metadata`. Do this together with the Phase 2 RLS/authz audit.
2. **Large uploads (>4.5MB)** `(M)` — Vercel serverless bodies cap ~4.5MB, so big photos/PDFs
   fail through the upload Server Action. Switch to **direct browser→Supabase Storage** upload
   (signed upload URL), then record the `attachments` row.
3. **Password reset flow** `(S–M)` — none today. Needs Supabase auth email → point its SMTP at
   Resend (also improves auth-email deliverability generally).
4. **Delete / archive UI** `(S)` — can create/edit but not delete projects/customers/contacts
   (`archived_at` columns exist; no UI).
5. **Image thumbnails** `(S)` — file tiles show a category glyph; render real photo previews.
6. **Housekeeping** `(XS)` — delete `rotated-passwords.txt` after saving logins; optional root
   `build-it-together.com` → `app.` redirect.

---

## Phase 2 — Broader hardening (P2, ongoing)

- **RLS audit** — every `public` table has RLS enabled with correct policies; run Supabase's
  linter. Confirm the `SECURITY DEFINER` helpers (`is_org_member`, `current_contact_id`,
  `contact_can_see_project`) all pin `search_path` (they do).
- **Server-Action authz audit** — server actions are directly-callable POST endpoints; confirm
  each verifies auth/authz. Most rely on the session-scoped RLS client (valid); admin-client
  paths need explicit checks (that's what 0.1 was).
- **Security headers + CSP** — add frame-ancestors/X-Frame-Options (clickjacking), CSP, HSTS
  via `next.config`/Vercel.
- **Dependency scanning** — `npm audit` + enable Dependabot on the repo.
- **Secret hygiene** — `SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` confirmed server-only;
  rotate the service-role key if exposure is ever suspected.
- **Rate limiting** — basic limits on the public invite-accept endpoint (token is 192-bit, so
  brute force is infeasible, but cheap insurance).
- **Observability** — error monitoring (e.g. Sentry) + an **audit log** (who shared/changed
  what; also a product-backlog item) for trust/disputes.
- **Supabase project review** — RLS-enabled everywhere, enable **PITR/backups**, consider
  **MFA** for artisan logins.

---

## Suggested order

1. **Now:** Phase 0 ✅ (done) + flip the 0.4 dashboard toggles.
2. **Next:** Phase 1 #1 (prod auth) **with** the Phase 2 RLS + server-action audits — one
   coherent auth/authz sweep.
3. **Then:** rest of Phase 1 by user value; Phase 2 as continuous hardening.
