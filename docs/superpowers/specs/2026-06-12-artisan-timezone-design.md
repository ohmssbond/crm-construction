# Artisan timezone for displayed times

_Design spec · 2026-06-12_

## Goal

Times shown in the app currently render in the server's zone (UTC). Make the
**artisan's timezone** a configurable workspace attribute and render all displayed
**timestamps** in that zone — on both the artisan pages and the customer portal.

## Decisions

| Question | Decision |
|----------|----------|
| Where the timezone lives | **Org-level** — one column on `organizations`, like the existing branding attributes. |
| How it is set | **Editable in Settings now**, alongside branding, via the existing update action. |
| Portal display | **Yes** — the customer portal also renders times in the artisan's zone. |
| Default timezone | `America/New_York` (Eastern) for new and existing workspaces. |
| Zone picker | **Curated US-zone dropdown** (not the full IANA list). |

## Root cause (what's actually wrong today)

Timestamps are stored correctly as `timestamptz` (UTC point-in-time). The defect
is display-only:

- `fmtDateTime(iso)` in `src/lib/data/format.ts` calls
  `new Date(iso).toLocaleString(...)` with **no `timeZone` option**, so it renders
  in the server's zone (UTC in production). This is the "everything is UTC" symptom.
- `completed_at` is shown via `fmtDate(String(completed_at).slice(0, 10))` — slicing
  the UTC date string. Near midnight this lands on the wrong calendar day for any
  non-UTC viewer.

Calendar-date fields (`date` type: `start_date`, `end_date`, `due_date`) are
zone-independent and already render correctly via `fmtDate`. They must **not** shift.

## Current state

- `organizations` has `primary_color`, `member_noun`, `client_noun` (migration
  `20260603000002_tenant_config_and_files.sql`), editable via **Settings → Branding**
  (`src/app/(artisan)/settings/page.tsx` + `BrandingForm.tsx`) and the `updateBranding`
  server action in `src/app/(artisan)/actions.ts`.
- `getOrgContext()` (`src/lib/data/org.ts`) selects the org branding columns and
  exposes them as `OrgContext.org`. Used by artisan pages.
- `getPortalProject()` (`src/lib/data/portal.ts`) selects the org branding
  (`name, primary_color, client_noun`) for the portal.
- Timestamp display sites (only two):
  - `src/app/(artisan)/projects/[id]/page.tsx` — status-update `created_at`
    (`fmtDateTime`), task `completed_at` (sliced `fmtDate`).
  - `src/app/(portal)/my-projects/[id]/page.tsx` — same two.
  - The dashboard shows only `due_date` (a `date` field) — no change.

## Changes

### 1. Database

New migration `supabase/migrations/20260612000002_organization_timezone.sql`:

```sql
alter table organizations
  add column timezone text not null default 'America/New_York';
```

Existing rows inherit Eastern via the default.

Update `src/lib/supabase/database.types.ts` so `organizations` Row/Insert/Update
include `timezone: string` (regenerate with `supabase gen types`, or hand-edit to
match the generated shape).

### 2. Shared timezone list — `src/lib/timezones.ts` (new)

A single source of truth used by both the settings dropdown and action validation:

- `TIMEZONES`: ordered list of `{ value: string; label: string }` for the curated
  US zones — `America/New_York` (Eastern), `America/Chicago` (Central),
  `America/Denver` (Mountain), `America/Phoenix` (Mountain, no DST),
  `America/Los_Angeles` (Pacific), `America/Anchorage` (Alaska),
  `Pacific/Honolulu` (Hawaii).
- `DEFAULT_TIMEZONE = "America/New_York"`.
- `isValidTimezone(value: string): boolean` — true iff `value` is one of `TIMEZONES`.

### 3. Formatters — `src/lib/data/format.ts`

- `fmtDateTime(iso: string, timeZone: string)`: add the `timeZone` parameter and
  pass it into both `toLocaleString` calls (date part and time part). Intl applies
  the correct DST offset automatically.
- New `fmtZonedDate(iso: string, timeZone: string): string`: format a `timestamptz`
  to a short calendar date (e.g. `"Jun 12"`) computed **in `timeZone`**. Replaces the
  `.slice(0, 10)` approach for `completed_at`.
- `fmtDate(iso)` (for `date`-type columns) stays UTC-safe and unchanged.

**Unit tests** (`src/lib/data/format.test.ts`, Vitest):

- `fmtDateTime("2026-06-02T20:10:00Z", "America/New_York")` → `"Jun 2 · 4:10pm"`
  (UTC 20:10 → EDT 16:10).
- A near-midnight UTC timestamp shifts to the previous local day in Eastern:
  `fmtZonedDate("2026-06-13T02:00:00Z", "America/New_York")` → `"Jun 12"`.
- A winter timestamp uses EST not EDT:
  `fmtDateTime("2026-01-15T20:10:00Z", "America/New_York")` → `"Jan 15 · 3:10pm"`
  (UTC 20:10 → EST 15:10).

### 4. Thread the zone in

- `src/lib/data/org.ts`: add `timezone` to the `organizations` select and to the
  `OrgContext.org` object.
- `src/lib/data/portal.ts`: add `timezone` to the org-branding select and return it
  on the project's org data so the portal page can read it.

### 5. Settings UI + action

- `src/app/(artisan)/settings/BrandingForm.tsx`: add a timezone `<select>` populated
  from `TIMEZONES`, defaulting to the org's current `timezone`.
- `src/app/(artisan)/settings/page.tsx`: include `timezone: ctx.org.timezone` in the
  form `defaults`.
- `updateBranding` in `src/app/(artisan)/actions.ts`: read `timezone` from the form
  data; if `isValidTimezone()` is false, fall back to `DEFAULT_TIMEZONE`; include
  `timezone` in the `organizations` update.

### 6. Apply at the display sites

- `src/app/(artisan)/projects/[id]/page.tsx`: pass `ctx.org.timezone` into
  `fmtDateTime(...)` for status-update times and `fmtZonedDate(...)` for
  `completed_at`.
- `src/app/(portal)/my-projects/[id]/page.tsx`: pass the org `timezone` from
  `getPortalProject()` into the same two call-sites.

## What does not change

- Storage: timestamps remain UTC `timestamptz`; nothing about how times are written
  changes.
- Calendar-date fields (`due_date`, `start_date`, `end_date`) keep rendering via the
  unchanged UTC-safe `fmtDate` — they must not shift by zone.
- The dashboard (due dates only).

## Testing

- Unit tests for the formatters (section 3) — the core logic.
- `npm run build` succeeds.
- Manual: set the workspace timezone in Settings; confirm a status update posted at
  a known UTC instant shows the correct local time on both the artisan page and the
  portal; confirm a due date does not shift.

## Out of scope

- Per-user (per-member) timezones.
- A full IANA timezone list or auto-detecting the browser's zone.
- Shifting calendar-date fields, or any change to stored values.
