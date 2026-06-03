# Post-MVP Backlog — Feature Enhancements

_Last updated: 2026-06-03._

Enhancements to pursue **after** the MVP loop (customer → project → shared artifacts →
portal) is proven. Sourced from the "Out (later)" column and conscious cuts in
[`mvp-spec.md`](mvp-spec.md), plus natural extensions.

**Priority:** P1 = first fast-follows · P2 = strengthens the core · P3 = later / opportunistic.
**Effort:** S (days) · M (1–2 wks) · L (multi-wk). Rough, pre-estimation.

---

## 1. Customer engagement (close the loop)

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 1.1 | **Comment / acknowledge on updates** (the planned fast-follow; `UpdateCard` portal slot already drawn) | The point of portal access is two-way closure | P1 | M |
| 1.2 | Proposal **accept / decline** in the portal → auto-advance project stage to `signed` | Customer write action that drives the workflow | P1 | M |
| 1.3 | Customer-initiated **requests / messages** ("ask a question," "request a quote") | Inbound demand capture | P2 | M |
| 1.4 | **Read receipts / "seen by"** on shared updates and files | Artisan knows the customer saw it | P3 | S |
| 1.5 | **Reviews / testimonials** capture at project completion | Marketing flywheel | P3 | M |

## 2. Documents & financials

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 2.1 | **Proposal builder** (line items → total, send, versions) | Replaces upload-a-PDF with structured quotes | P2 | L |
| 2.2 | **Invoice builder** + paid/unpaid tracking | Money in one place | P2 | L |
| 2.3 | **Online payments** (Stripe) — deposits, invoice pay | Get paid faster | P2 | L |
| 2.4 | **E-signature** on contracts/proposals | Legally bind acceptance | P2 | M |
| 2.5 | **File versioning** + replace-in-place | Plans/permits change | P3 | M |
| 2.6 | **Document templates** (proposal/contract boilerplate) | Speed + consistency | P3 | M |
| 2.7 | **PDF export** of a project summary / artifact bundle | Hand-off, records | P3 | S |

## 3. Field & mobile (job-site first)

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 3.1 | **PWA / installable** + offline read & queued capture | Weak signal on site | P1 | M |
| 3.2 | **Multi-photo capture & galleries**, before/after pairing | Core field workflow | P2 | M |
| 3.3 | **Image annotation / markup** (arrows, notes on photos) | Communicate on-site detail | P3 | M |
| 3.4 | **Voice-to-update** dictation for status posts | One-thumb, dusty-hands | P3 | S |
| 3.5 | **Map view** of job sites; tap-to-navigate | Plan the day's route | P3 | S |

## 4. Scheduling & operations

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 4.1 | **Calendar / scheduling** (visits, milestones) | Plan and show the timeline | P2 | L |
| 4.2 | **To-do due-date reminders** + assignment | Nothing slips | P2 | S |
| 4.3 | **Stage automation** (rules: accepted→signed, etc.) | Less manual bookkeeping | P3 | M |
| 4.4 | **Time tracking** per project | Job costing | P3 | M |
| 4.5 | **Expense / materials tracking** | Margin visibility | P3 | M |

## 5. Multi-user & tenancy

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 5.1 | **Self-serve signup & org provisioning** (replace manual seeding) | Onboard artisans without us | P2 | M |
| 5.2 | **Admin console** (manage tenants, suspend, support) | Was deferred from MVP | P2 | M |
| 5.3 | **Team members** — multiple artisans/helpers per org, roles | Crews, not just solos | P2 | L |
| 5.4 | **Subscription & billing** for the SaaS itself | Revenue | P3 | L |
| 5.5 | **Per-document / per-field permissions** beyond shared/private | Finer control | P3 | M |
| 5.6 | **Audit log** (who shared/changed what, when) | Trust, disputes | P3 | M |

## 6. Notifications & comms

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 6.1 | **Email on more events** (update shared, invoice sent, comment) | Pull people back to the portal | P1 | S |
| 6.2 | **SMS notifications** (Twilio) | Tradespeople live in texts | P2 | M |
| 6.3 | **In-app notification center** | Centralized activity | P3 | M |
| 6.4 | **Digest emails** (weekly project summary to customer) | Passive engagement | P3 | S |

## 7. Integrations

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 7.1 | **Accounting** (QuickBooks / Xero) sync for invoices | Stops double entry | P3 | L |
| 7.2 | **Google / Outlook Calendar** sync | One source of truth for time | P3 | M |
| 7.3 | **Cloud storage** import (Drive / Dropbox) for documents | Migrate existing files | P3 | M |
| 7.4 | **Public API / webhooks** | Power-user automation | P3 | L |

## 8. Insight & polish

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 8.1 | **Search across everything** (projects, contacts, files) at scale | List-only browsing breaks past ~50 | P2 | M |
| 8.2 | **Saved filters / views** on lists | Repeat workflows | P3 | S |
| 8.3 | **Dashboard analytics** (pipeline value, win rate, cycle time) | Run the business | P3 | M |
| 8.4 | **Tags / custom fields** on projects & contacts | Flex without schema changes | P3 | M |
| 8.5 | **Bulk actions** (archive, share, attach) | Efficiency at volume | P3 | S |
| 8.6 | **Accessibility & i18n** pass | Reach, compliance | P3 | M |

## 9. Tenant configuration & white-labeling

**✅ Promoted to MVP (2026-06-03)** — both verticals onboard at launch, so per-tenant config
is no longer "later." The **schema + seed landed** in migration `20260603000002`: org
`primary_color` / `member_noun` / `client_noun`, the `file_categories` table (seeded per
vertical), and `attachments.kind` + `url` for external links; the **theming mechanism** is in
`AppShell`. What remains is UI wiring (config in layouts, the data-driven Photos & Files
screen, the add-link flow) — tracked in [`next-steps.md`](next-steps.md). The table below is
kept for reference; only the deferred polish (management UIs, link previews) stays post-MVP.

| # | Feature | Why | P | Effort |
|---|---|---|---|---|
| 9.1 | **Tenant-defined primary color** — each org sets its accent; replaces the fixed green | Brand ownership | P2 | M |
| 9.2 | **Tenant-defined role noun** — "contractor / consultant / artisan" (and maybe "customer / client") is per-tenant copy | Speaks each vertical's language | P2 | S |
| 9.3 | **Tenant-configurable file categories** — category list is per-tenant, not a fixed enum (construction: plans/permits…; software: PRD/architecture…) | Files mean different things per trade | P2 | M |
| 9.4 | **External file links** — an attachment can be a Google Docs/Sheets/Drive link, not just an upload | Knowledge work lives in linked docs | P2 | M |
| 9.5 | **Full brand kit** — logo upload, optional custom domain | Complete white-label | P3 | S–L |

### Implementation notes & implications

- **9.1 → ⚠️ revisits design-system law.** Today the accent is a fixed token swapped only by
  `data-world` (design-system §2: "two worlds, one accent swap"). Per-tenant color means the
  accent comes from `organizations.primary_color`, injected as `--accent` on the shell root
  at runtime (inline style on `AppShell`). The portal then becomes a *derived* variant of the
  tenant color (e.g. a tint/shift) or its own configurable value — update design-system §2 and
  governance (§11) when built. Add `organizations.primary_color` (+ optional portal color).
- **9.2** is cheap: add `organizations.member_noun` (and `client_noun`), thread through the
  shell labels and microcopy. Mostly a copy-from-config pass.
- **9.3 → ⚠️ supersedes migration `20260603000001`.** Attachment `category` is currently a
  Postgres CHECK enum (we just added `plans`/`permits` to it). Per-tenant categories means
  dropping that CHECK in favor of a `file_categories` table (`org_id, key, label, icon, sort`)
  seeded with per-vertical defaults, with `attachments.category` referencing it. **Decide this
  before building the real Photos & Files UI** — `FilterChips` and `FileTile` categories become
  data-driven instead of hardcoded, so doing it after means a rebuild.
- **9.4** extends `attachments`: add `kind ∈ {file, link}` and `url` (+ provider, title);
  `storage_path` becomes nullable (null for links). `is_shared` / category still apply. Later:
  live preview/thumbnail and OAuth for private linked docs.

---

## Suggested first wave (after MVP ships)

The smallest set that makes the portal *sticky* and the artisan get paid:

1. **1.1 Comment / acknowledge** + **1.2 Proposal accept/decline** (turn read-only into a loop)
2. **6.1 Email on shared events** (so the portal gets visited)
3. **3.1 PWA / offline capture** (the field reality)
4. **2.2 Invoices + 2.3 payments** (the money)

Everything else slots behind these based on what early artisans ask for.

_(The earlier caveat about a non-construction tenant onboarding early is now resolved — both
tenants onboard at launch and §9.1–9.4 were pulled into MVP; see §9 above.)_
