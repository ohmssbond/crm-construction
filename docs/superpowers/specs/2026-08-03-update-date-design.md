# Editable Update Date — Design

_Date: 2026-08-03_

A project update is stamped with the moment it was posted, and that stamp cannot be
changed. A contractor who writes up Friday's progress on Monday has no way to date it
Friday. This makes the date editable both when posting and when editing.

## Goal

- Posting an update: the date defaults to today and can be changed to any earlier day.
- Editing an update: the date can be corrected.
- Nothing changes for the common case — posting today's update behaves exactly as it
  does now.

## Decisions (settled)

- **The date overwrites `created_at`.** No migration. This app already treats
  `created_at` as "when the update happened": it is what the card displays
  (`fmtDateTime(u.created_at, timezone)`) and what all three surfaces order by, and
  nothing else reads it for updates. The accepted cost is that the audit trail is gone —
  a backdated update is indistinguishable from one posted that day.
- **Date only, not time. A changed date lands at noon in the org's timezone.**
- **`created_at` is written ONLY when the chosen date differs from the date already in
  effect.** The control sends `date: string | null`, where **null means "unchanged — do
  not touch the timestamp"**:
  - *Posting*, picker left on today → `null` → the action omits `created_at` entirely,
    so Postgres' `now()` default applies. Posting today's update is byte-for-byte the
    behavior that ships today, down to the minute.
  - *Editing*, picker left alone → `null` → `created_at` untouched, so rewording a body
    never silently moves a 4:10pm update to noon.
  - Any other date → noon on that date.

  This needs no extra database read: the client knows whether its own picker moved.
- **Past and today only.** The input caps at today and the action rejects a later date.
  A future-dated update would pin itself above everything else in both the staff list
  and the customer's portal until that date passed, which reads as a bug.
- **"Today" and "noon" are both resolved in the ORG's timezone**, never the server's or
  the browser's. The org zone is already in scope on the page — it is what renders every
  update's timestamp.

### Why noon

Noon sits far from both midnight and any DST transition. Converting "this date at noon
in zone Z" to a UTC instant is therefore safe with a single offset correction, and the
rendered date cannot slip a day for a viewer in a neighbouring zone. Midnight is fragile
on both counts.

## Non-goals

- Editing the time of day.
- Any audit trail of the original post time (explicitly traded away).
- Backdating anything other than status updates.
- Re-sending the notification email when a date changes.
- Portal-side editing — the portal remains read-only for updates.

---

## Components

### 1. Two pure helpers in `src/lib/timezones.ts`

That module holds only `TIMEZONES`, `DEFAULT_TIMEZONE`, and `isValidTimezone` today, and
already has a test file. It gains:

```ts
/** "2026-08-01" + IANA zone → the UTC ISO instant of noon that day in that zone. */
export function noonInZone(date: string, timeZone: string): string;

/** Today's calendar date in that zone, as "YYYY-MM-DD". */
export function todayInZone(timeZone: string): string;
```

`todayInZone` is what makes the future-date rule correct: the cap must be today *in the
org's zone*. A tenant in Honolulu posting at 9pm local is still on "today" while the
server's UTC clock has already rolled over.

`noonInZone` computes the offset by comparing the same instant formatted in the target
zone and in UTC, then corrects. Because the anchor is noon, one pass is always right.

### 2. Server actions — `src/app/(artisan)/projects/[id]/actions.ts`

Both actions gain a trailing `date: string | null` parameter and share one rule:

```ts
// Only stamp created_at when the caller actually picked a different date; null means
// "leave it alone" (a new post then gets the DB's now(), an edit keeps its own time).
```

- `postUpdate(projectId, title, body, isShared, photoAttachmentId, date)` — when `date`
  is non-null, add `created_at: noonInZone(date, tz)` to the insert.
- `updateStatusUpdate(projectId, updateId, title, body, photoAttachmentId, date)` — when
  `date` is non-null, add `created_at: noonInZone(date, tz)` to the update patch.

Both **reject a future date** by comparing it to `todayInZone(tz)` and returning without
writing. The input's `max` attribute is a convenience; this is the guard.

The org timezone comes from the organization row the actions already fetch via
`getOrgContext`, falling back to `DEFAULT_TIMEZONE`.

Editing still never re-sends the notification email, backdated or not.

### 3. `Composer` — `src/components/ui/Composer.tsx`

Gains `defaultDate: string` (today in the org zone, supplied by the page) and renders a
`<input type="date">` alongside the existing title/body/photo/share controls, with
`max={defaultDate}`. Its `action` signature gains the trailing date, and it sends `null`
whenever the field still equals `defaultDate`. The field resets to `defaultDate` after a
successful post, alongside the existing resets.

### 4. `UpdateCard` — `src/components/ui/UpdateCard.tsx`

Its edit mode gains the same date input, seeded from a new `date: string` prop (the
update's own date in the org zone) and capped at a new `maxDate: string` prop (today in
the org zone). `editAction` gains the trailing date, and sends `null` when the field is
unchanged from `date`.

The card's read mode is untouched — it still renders the `when` string it is given.

### 5. Page wiring — `src/app/(artisan)/projects/[id]/page.tsx`

Computes `todayInZone(timezone)` once and passes it to `Composer` as `defaultDate` and to
each `UpdateCard` as `maxDate`; passes each update's own date as `date`. The page already
has `timezone` in scope for `fmtDateTime`.

---

## Testing

Real unit tests for the two helpers in `src/lib/timezones.test.ts`:

- `noonInZone` returns an instant that renders as noon on the requested date in that zone
- it differs correctly across zones (Eastern vs Pacific vs Honolulu) for the same date
- it is correct on both sides of a DST transition (March and November) in a DST zone, and
  in `America/Phoenix`, which has no DST
- `todayInZone` can return a different calendar date than UTC's for a zone behind UTC late
  in the day

The actions and components are thin wiring over these helpers and get no new tests, matching
the repo's convention.

Gates: `npx tsc --noEmit`, `npm test` (146 passing today), `npm run build`.

Manual verification, since the interaction is not reachable by the automated gates:

- Post an update leaving the date alone → it appears with the current time, exactly as before.
- Post with an earlier date → it appears under that date, positioned by date in the list.
- Edit an update's body only → its original time is unchanged.
- Edit an update's date → it moves to the new date and re-sorts.
- The date input will not offer a future date, and the action refuses one if forced.
- The backdated update appears in the correct order in the customer portal too.

## Risks

- **Backdating reorders the customer's feed.** All three surfaces order by
  `created_at desc`, so a backdated update drops down the customer's list rather than
  appearing at the top. That is correct, but it means a customer may not notice a
  backdated post.
- **The audit trail is gone**, by decision. If "posted Monday, dated Friday" ever needs
  answering, it will need a new column and this design will have to be revisited.
- **Timezone correctness rests on the two helpers**, which is exactly why they are pure
  and tested rather than inlined into the actions.
