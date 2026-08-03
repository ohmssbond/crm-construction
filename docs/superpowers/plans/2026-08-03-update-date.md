# Editable Update Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contractor set the date when posting a project update, and correct it when editing one.

**Architecture:** Two pure timezone helpers do the only real logic; the actions and components are thin wiring over them. The date overwrites `created_at` — no migration — and is written **only when the picker actually moved**, so posting today and rewording a body both behave exactly as they do now.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), Supabase Postgres, TypeScript, Tailwind, Vitest.

Spec: `docs/superpowers/specs/2026-08-03-update-date-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **No migration, no schema change.** The date overwrites the existing `status_updates.created_at`. Never run `supabase db push`.
- **`date: string | null`, where `null` means "unchanged — do not touch `created_at`".** This is the load-bearing rule of the whole change:
  - Posting with the picker left on today → `null` → the insert omits `created_at`, so Postgres' `now()` applies and posting behaves exactly as it does today, down to the minute.
  - Editing with the picker left alone → `null` → `created_at` is not in the update patch, so an update you only reworded keeps its original time.
  - A non-null date → `noonInZone(date, tz)`.
- **"Today" and "noon" resolve in the ORG's timezone**, never the server's and never the browser's.
- **Past and today only.** The input's `max` is a convenience; the server-side check against `todayInZone(tz)` is the guard.
- **Editing never re-sends the notification email**, backdated or not. Do not touch that path.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (146 passing today). `npm run build` before the final task is called done.

---

### Task 1: `noonInZone` and `todayInZone`

**Files:**
- Modify: `src/lib/timezones.ts`
- Modify: `src/lib/timezones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — Tasks 2 and 3 depend on these exact names:
  - `noonInZone(date: string, timeZone: string): string` — `"2026-08-01"` + IANA zone → the UTC ISO instant of noon that day in that zone.
  - `todayInZone(timeZone: string): string` — today's calendar date in that zone, `"YYYY-MM-DD"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/timezones.test.ts`. Add the two new names to the existing `import { … } from "./timezones"` statement rather than adding a second import line:

```ts
describe("noonInZone", () => {
  /** What wall-clock date+hour does this instant render as in that zone? */
  const shownIn = (iso: string, timeZone: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });

  test("lands on noon of the requested date in that zone", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/New_York"), "America/New_York")).toBe(
      "08/01/2026, 12"
    );
  });

  test("same date in different zones is a different instant", () => {
    const east = noonInZone("2026-08-01", "America/New_York");
    const west = noonInZone("2026-08-01", "America/Los_Angeles");
    expect(new Date(west).getTime() - new Date(east).getTime()).toBe(3 * 60 * 60 * 1000);
  });

  test("is correct on both sides of a DST transition", () => {
    // 2026: US DST starts Mar 8, ends Nov 1.
    expect(shownIn(noonInZone("2026-03-07", "America/New_York"), "America/New_York")).toBe(
      "03/07/2026, 12"
    );
    expect(shownIn(noonInZone("2026-03-09", "America/New_York"), "America/New_York")).toBe(
      "03/09/2026, 12"
    );
    expect(shownIn(noonInZone("2026-11-02", "America/New_York"), "America/New_York")).toBe(
      "11/02/2026, 12"
    );
  });

  test("is correct in a zone with no DST", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/Phoenix"), "America/Phoenix")).toBe(
      "08/01/2026, 12"
    );
    expect(shownIn(noonInZone("2026-01-15", "Pacific/Honolulu"), "Pacific/Honolulu")).toBe(
      "01/15/2026, 12"
    );
  });

  test("returns a parseable ISO instant", () => {
    expect(Number.isNaN(new Date(noonInZone("2026-08-01", "America/Denver")).getTime())).toBe(
      false
    );
  });
});

describe("todayInZone", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(todayInZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a zone behind UTC can still be on the previous date", () => {
    // Honolulu is UTC-10 year-round, so it is never ahead of UTC.
    const utc = todayInZone("UTC");
    const hono = todayInZone("Pacific/Honolulu");
    expect(hono <= utc).toBe(true);
  });

  test("round-trips through noonInZone to the same date", () => {
    const zone = "America/Chicago";
    const today = todayInZone(zone);
    const shown = new Date(noonInZone(today, zone)).toLocaleDateString("en-CA", {
      timeZone: zone,
    });
    expect(shown).toBe(today);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/timezones.test.ts`

Expected: FAIL — `noonInZone is not a function` (or an import error).

- [ ] **Step 3: Implement**

Append to `src/lib/timezones.ts`:

```ts
/**
 * "2026-08-01" + an IANA zone → the UTC ISO instant of NOON that day in that zone.
 *
 * Noon is deliberate. It sits far from both midnight and any DST transition, so the
 * single offset correction below is always right and the rendered date can never slip
 * a day for a viewer in a neighbouring zone. Anchoring at midnight would be fragile on
 * both counts.
 */
export function noonInZone(date: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // How far the target zone runs from UTC at that instant.
  const asZone = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (asZone.getTime() - asUtc.getTime())).toISOString();
}

/** Today's calendar date in that zone, as "YYYY-MM-DD" (en-CA renders ISO order). */
export function todayInZone(timeZone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/timezones.test.ts`

Expected: PASS — 8 new tests.

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 154 tests pass (146 + 8).

```bash
git add src/lib/timezones.ts src/lib/timezones.test.ts
git commit -m "feat(timezones): noonInZone and todayInZone helpers"
```

---

### Task 2: The post side

Action and component ship together: adding the parameter to `postUpdate` changes the type `Composer`'s `action` prop must satisfy, so there is no point between them where the branch compiles.

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts` (`postUpdate`)
- Modify: `src/components/ui/Composer.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (the Composer call site)

**Interfaces:**
- Consumes: `noonInZone`, `todayInZone` (Task 1).
- Produces: `postUpdate(projectId, title, body, isShared, photoAttachmentId, date: string | null)`; `Composer` gains a required `defaultDate: string` prop and its `action` gains a trailing `date: string | null`.

- [ ] **Step 1: Add the date to `postUpdate`**

In `src/app/(artisan)/projects/[id]/actions.ts`, add the parameter and the guard. `postUpdate` already calls `getOrgContext()`, so `ctx.org.timezone` is in scope.

Add to the imports:

```ts
import { noonInZone, todayInZone, DEFAULT_TIMEZONE } from "@/lib/timezones";
```

Change the signature to add a trailing parameter:

```ts
export async function postUpdate(
  projectId: string,
  title: string,
  body: string,
  isShared: boolean,
  photoAttachmentId: string | null,
  date: string | null
) {
```

Then, immediately before the `await supabase.from("status_updates").insert({…})` call, add:

```ts
  // `date` is null when the composer's picker was left on today — then we omit
  // created_at entirely and let Postgres' now() default apply, so a same-day post is
  // stamped to the minute exactly as it always was. A picked date lands at noon in the
  // ORG's zone (never the server's), and a future date is refused outright.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  if (date && date > todayInZone(tz)) return;
  const postedAt = date ? { created_at: noonInZone(date, tz) } : {};
```

and spread it into the insert:

```ts
  await supabase.from("status_updates").insert({
    organization_id: ctx.org.id,
    project_id: projectId,
    title: title.trim() || null,
    body: text,
    is_shared: isShared,
    photo_attachment_id: photoId,
    ...postedAt,
  });
```

Leave the notification-email block below it exactly as it is.

- [ ] **Step 2: Add the date input to `Composer`**

In `src/components/ui/Composer.tsx`:

Add `defaultDate` to the props and extend the `action` type:

```tsx
export function Composer({
  placeholder = "Post an update…",
  photos,
  defaultDate,
  action,
}: {
  placeholder?: string;
  photos?: ComposerPhoto[];
  defaultDate: string;
  action?: (
    title: string,
    body: string,
    shared: boolean,
    photoAttachmentId: string | null,
    date: string | null
  ) => void | Promise<void>;
}) {
```

Add state beside the existing `useState` calls:

```tsx
  const [date, setDate] = useState(defaultDate);
```

In `submit`, send `null` when the picker never moved, and reset the field afterwards alongside the other resets:

```tsx
    start(async () => {
      await action(title, text, shared, photoId, date === defaultDate ? null : date);
      setTitle("");
      setBody("");
      setShared(false);
      setPhotoId(null);
      setDate(defaultDate);
    });
```

Render the input in the control row that holds the share toggle and photo picker, following that row's existing classes:

```tsx
      <input
        type="date"
        value={date}
        max={defaultDate}
        onChange={(e) => setDate(e.target.value)}
        disabled={pending}
        aria-label="Update date"
        className={`${fieldInput} w-auto text-meta py-[5px]`}
      />
```

`fieldInput` comes from `@/components/ui/Field` — add the import if the file does not already have it.

- [ ] **Step 3: Wire the page**

In `src/app/(artisan)/projects/[id]/page.tsx`, add `todayInZone` to the existing `@/lib/timezones` import (it already imports `DEFAULT_TIMEZONE`), compute the date once near where `timezone` is resolved:

```ts
  const today = todayInZone(timezone);
```

and pass it to the Composer in the Updates tab:

```tsx
                <Composer
                  action={postUpdate.bind(null, project.id)}
                  photos={imagePhotos.map((p) => ({ id: p.id, filename: p.filename }))}
                  defaultDate={today}
                />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 154 tests pass. A type error on `Composer`'s `action` means the signatures disagree — fix the action or the prop type, not by loosening either to `any`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts" src/components/ui/Composer.tsx "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(updates): choose the date when posting an update"
```

---

### Task 3: The edit side

Same coupling as Task 2 — the action's new parameter changes the type `UpdateCard`'s `editAction` must satisfy.

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts` (`updateStatusUpdate`)
- Modify: `src/components/ui/UpdateCard.tsx`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (the UpdateCard call site)

**Interfaces:**
- Consumes: `noonInZone`, `todayInZone` (Task 1).
- Produces: `updateStatusUpdate(projectId, updateId, title, body, photoAttachmentId, date: string | null)`; `UpdateCard` gains required `date: string` and `maxDate: string` props and its `editAction` gains a trailing `date: string | null`.

- [ ] **Step 1: Add the date to `updateStatusUpdate`**

In `src/app/(artisan)/projects/[id]/actions.ts`, add the trailing parameter:

```ts
export async function updateStatusUpdate(
  projectId: string,
  updateId: string,
  title: string,
  body: string,
  photoAttachmentId: string | null,
  date: string | null
) {
```

**This action does not currently call `getOrgContext()`** — it relies on RLS alone, matching `updateTodo`. It now needs the org's timezone, so add the lookup near the top, after the empty-body guard:

```ts
  const ctx = await getOrgContext();
  if (!ctx) return;
```

Then, immediately before the `await supabase.from("status_updates").update({…})` call:

```ts
  // Null date = the picker was untouched, so created_at stays out of the patch and the
  // update keeps its original time — rewording a body must never silently move a
  // 4:10pm update to noon. A picked date lands at noon in the ORG's zone; a future
  // date is refused.
  const tz = ctx.org.timezone || DEFAULT_TIMEZONE;
  if (date && date > todayInZone(tz)) return;
  const postedAt = date ? { created_at: noonInZone(date, tz) } : {};
```

and spread it into the patch:

```ts
  await supabase
    .from("status_updates")
    .update({ title: title.trim() || null, body: text, photo_attachment_id: photoId, ...postedAt })
    .eq("id", updateId);
```

Do not add or touch any notification-email path here — editing has never re-notified and must not start.

- [ ] **Step 2: Add the date input to `UpdateCard`'s edit mode**

In `src/components/ui/UpdateCard.tsx`, add the two props and extend `editAction`:

```tsx
  date,
  maxDate,
```

```tsx
  date: string;
  maxDate: string;
  editAction?: (
    title: string,
    body: string,
    photoAttachmentId: string | null,
    date: string | null
  ) => void | Promise<void>;
```

Add state alongside the existing edit state:

```tsx
  const [dateV, setDateV] = useState(date);
```

Re-seed it in `startEdit` next to the other fields it re-seeds from props — the existing `useState` initializers are first-mount defaults only, and `startEdit` is what makes a second edit start from current values:

```tsx
    setDateV(date);
```

Send `null` when unchanged:

```tsx
      await editAction(titleV, bodyV, photoV, dateV === date ? null : dateV);
```

Render the input inside the edit form, beside the existing title/body/photo controls:

```tsx
        <input
          type="date"
          value={dateV}
          max={maxDate}
          onChange={(e) => setDateV(e.target.value)}
          disabled={pending}
          aria-label="Update date"
          className={`${fieldInput} w-auto text-meta py-[5px]`}
        />
```

The card's read mode is untouched — it still renders the `when` string it is handed.

- [ ] **Step 3: Wire the page**

In `src/app/(artisan)/projects/[id]/page.tsx`, pass the two new props to `UpdateCard`. The update's own date must be rendered **in the org's zone**, matching how `when` is produced — use `toLocaleDateString("en-CA", { timeZone: timezone })` on `u.created_at` so it yields `YYYY-MM-DD`:

```tsx
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at, timezone)}
                      date={new Date(u.created_at).toLocaleDateString("en-CA", { timeZone: timezone })}
                      maxDate={today}
                      …
```

`today` is already computed in Task 2. Leave every other prop as it is.

- [ ] **Step 4: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green, 154 tests.

`UpdateCard` has exactly one call site — the artisan page (verified: `grep -rn "UpdateCard" src --include='*.tsx'` returns only that page and the component itself). The portal renders its updates with its own inline markup, so nothing else needs the new props. If `tsc` reports a missing prop somewhere unexpected, supply it from that surface's own `timezone` — do NOT make the props optional to dodge the error, since a missing date would silently seed the picker wrong.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts" src/components/ui/UpdateCard.tsx "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "feat(updates): edit an update's date"
```

---

## Manual verification (before merge)

The automated gates prove the helpers are correct and that it compiles — not that the flow works.

- [ ] Post an update leaving the date alone → it appears with the **current time**, exactly as before (not noon).
- [ ] Post with an earlier date → it appears under that date, sorted into position rather than at the top.
- [ ] Edit an update's body only → its original time is **unchanged**.
- [ ] Edit an update's date → it moves to the new date and re-sorts.
- [ ] The date input offers no future date, and the action refuses one if the client is forced.
- [ ] A backdated update appears in the same relative order in the customer portal.
- [ ] Editing a backdated update does **not** send a notification email.
