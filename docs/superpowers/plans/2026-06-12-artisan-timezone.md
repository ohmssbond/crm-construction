# Artisan Timezone For Displayed Times — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-workspace (org-level) timezone, editable in Settings, and render all displayed timestamps (status-update times, task completion dates) in that zone on both the artisan pages and the customer portal.

**Architecture:** Storage stays UTC `timestamptz`; only display changes. A new `organizations.timezone` column feeds `getOrgContext()` and `getPortalProject()`. The formatters in `format.ts` gain a `timeZone` argument so `Intl`/`toLocaleString` renders in the artisan's zone (with automatic DST). A shared curated US-zone list (`src/lib/timezones.ts`) drives both the Settings dropdown and server-side validation.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase, Vitest.

---

## File Structure

- **Create** `supabase/migrations/20260612000002_organization_timezone.sql` — add the `timezone` column.
- **Modify** `src/lib/supabase/database.types.ts` — add `timezone` to the `organizations` Row/Insert/Update.
- **Create** `src/lib/timezones.ts` — curated zone list, `DEFAULT_TIMEZONE`, `isValidTimezone`.
- **Create** `src/lib/timezones.test.ts` — tests for the guard.
- **Modify** `src/lib/data/org.ts` — select + expose `timezone` on `OrgContext.org`.
- **Modify** `src/lib/data/portal.ts` — read + return the org `timezone` from `getPortalProject`.
- **Modify** `src/app/(artisan)/settings/BrandingForm.tsx` — timezone `<select>`.
- **Modify** `src/app/(artisan)/settings/page.tsx` — pass `timezone` into form defaults.
- **Modify** `src/app/(artisan)/actions.ts` — validate + persist `timezone` in `updateBranding`.
- **Modify** `src/lib/data/format.ts` — `fmtDateTime(iso, timeZone)` + new `fmtZonedDate(iso, timeZone)`.
- **Create** `src/lib/data/format.test.ts` — formatter tests.
- **Modify** `src/app/(artisan)/projects/[id]/page.tsx` and `src/app/(portal)/my-projects/[id]/page.tsx` — pass the zone into the formatters.

**Sequencing keeps every commit green:** the loaders expose `timezone` (additive) *before* the `fmtDateTime` signature change, and that signature change is committed together with its two call-sites.

---

## Task 1: Timezone column + generated types

**Files:**
- Create: `supabase/migrations/20260612000002_organization_timezone.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260612000002_organization_timezone.sql`:

```sql
-- Per-tenant display timezone. Stored timestamps stay UTC (timestamptz); this only
-- controls how timestamps are rendered in the artisan app and the customer portal.
alter table organizations
  add column timezone text not null default 'America/New_York';
```

- [ ] **Step 2: Add `timezone` to the `organizations` Row type**

In `src/lib/supabase/database.types.ts`, find (the Row block — note `primary_color: string` with no `?`):

```ts
          primary_color: string
        }
```

Replace with:

```ts
          primary_color: string
          timezone: string
        }
```

- [ ] **Step 3: Add `timezone` to the `organizations` Insert and Update types**

In the same file, the Insert and Update blocks both end with `primary_color?: string` followed by `}`. Replace **all** occurrences. Find:

```ts
          primary_color?: string
        }
```

Replace with (use replace-all — there are exactly two occurrences, Insert and Update):

```ts
          primary_color?: string
          timezone?: string
        }
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (types are valid TypeScript).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260612000002_organization_timezone.sql src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
Add organizations.timezone column

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

> Note: this migration is **not** pushed to the remote DB in this task. Applying it to remote is a controller step in Task 7.

---

## Task 2: Shared curated timezone list (TDD)

**Files:**
- Create: `src/lib/timezones.test.ts`
- Create: `src/lib/timezones.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/timezones.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { isValidTimezone, DEFAULT_TIMEZONE, TIMEZONES } from "./timezones";

describe("timezones", () => {
  test("isValidTimezone accepts a curated zone", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
  });

  test("isValidTimezone rejects unknown or empty values", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  test("the default zone is one of the offered options", () => {
    expect(TIMEZONES.some((t) => t.value === DEFAULT_TIMEZONE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- timezones`
Expected: FAIL — cannot import from `./timezones` (module does not exist yet).

- [ ] **Step 3: Create the timezone list**

Create `src/lib/timezones.ts`:

```ts
export type TimezoneOption = { value: string; label: string };

/** Curated US timezones offered in Settings. `value` is an IANA zone id. */
export const TIMEZONES: TimezoneOption[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain – no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export const DEFAULT_TIMEZONE = "America/New_York";

export function isValidTimezone(value: string): boolean {
  return TIMEZONES.some((t) => t.value === value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- timezones`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timezones.ts src/lib/timezones.test.ts
git commit -m "$(cat <<'EOF'
Add curated timezone list and validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Expose `timezone` from the data loaders

**Files:**
- Modify: `src/lib/data/org.ts`
- Modify: `src/lib/data/portal.ts`

- [ ] **Step 1: Add `timezone` to `OrgContext` and its select**

In `src/lib/data/org.ts`:

(a) In the `OrgContext` type, find:

```ts
    member_noun: string;
    client_noun: string;
```

Replace with:

```ts
    member_noun: string;
    client_noun: string;
    timezone: string;
```

(b) Find the select:

```ts
    .select("organizations(id, name, primary_color, member_noun, client_noun)")
```

Replace with:

```ts
    .select("organizations(id, name, primary_color, member_noun, client_noun, timezone)")
```

(The `org` object is built as `{ ...orgRow, initials }`, so the selected `timezone` flows through automatically.)

- [ ] **Step 2: Return the org `timezone` from `getPortalProject`**

In `src/lib/data/portal.ts`:

(a) Add an import near the other imports at the top of the file:

```ts
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
```

(b) In `getPortalProject`, find the `Promise.all` destructure and its final query:

```ts
  const [updates, attachments, tasks, fileCategories] = await Promise.all([
```

Replace with:

```ts
  const [updates, attachments, tasks, fileCategories, org] = await Promise.all([
```

(c) Find the last query in that `Promise.all` (the `file_categories` query) and the closing `]);`:

```ts
    // Category labels for grouping the files view; contact_read RLS permits this.
    supabase
      .from("file_categories")
      .select("key, label")
      .eq("organization_id", project.organization_id),
  ]);
```

Replace with:

```ts
    // Category labels for grouping the files view; contact_read RLS permits this.
    supabase
      .from("file_categories")
      .select("key, label")
      .eq("organization_id", project.organization_id),
    // Org display timezone; contact_read RLS permits reading the org row.
    supabase
      .from("organizations")
      .select("timezone")
      .eq("id", project.organization_id)
      .maybeSingle(),
  ]);
```

(d) Find the return object:

```ts
  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    tasks: tasks.data ?? [],
    fileCategories: fileCategories.data ?? [],
  };
```

Replace with:

```ts
  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    tasks: tasks.data ?? [],
    fileCategories: fileCategories.data ?? [],
    timezone: org.data?.timezone ?? DEFAULT_TIMEZONE,
  };
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (both changes are additive; no call-site consumes `timezone` yet).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/org.ts src/lib/data/portal.ts
git commit -m "$(cat <<'EOF'
Expose org timezone from org + portal loaders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Settings UI + persist the timezone

**Files:**
- Modify: `src/app/(artisan)/settings/BrandingForm.tsx`
- Modify: `src/app/(artisan)/settings/page.tsx`
- Modify: `src/app/(artisan)/actions.ts`

- [ ] **Step 1: Add the timezone select to `BrandingForm`**

In `src/app/(artisan)/settings/BrandingForm.tsx`:

(a) Add an import below the existing imports:

```ts
import { TIMEZONES } from "@/lib/timezones";
```

(b) In the `defaults` prop type, find:

```ts
  defaults: {
    name: string;
    primary_color: string;
    member_noun: string;
    client_noun: string;
  };
```

Replace with:

```ts
  defaults: {
    name: string;
    primary_color: string;
    member_noun: string;
    client_noun: string;
    timezone: string;
  };
```

(c) Find the nouns row and the `</Card>` that follows it:

```tsx
        <div className="flex gap-3">
          <Field label="Role noun (e.g. Builder)" required>
            <input name="member_noun" required defaultValue={defaults.member_noun} className={fieldInput} />
          </Field>
          <Field label="Client noun (e.g. Customer)" required>
            <input name="client_noun" required defaultValue={defaults.client_noun} className={fieldInput} />
          </Field>
        </div>
      </Card>
```

Replace with:

```tsx
        <div className="flex gap-3">
          <Field label="Role noun (e.g. Builder)" required>
            <input name="member_noun" required defaultValue={defaults.member_noun} className={fieldInput} />
          </Field>
          <Field label="Client noun (e.g. Customer)" required>
            <input name="client_noun" required defaultValue={defaults.client_noun} className={fieldInput} />
          </Field>
        </div>

        <Field label="Timezone" required>
          <select name="timezone" defaultValue={defaults.timezone} className={fieldInput}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>
```

- [ ] **Step 2: Pass the current timezone into the form defaults**

In `src/app/(artisan)/settings/page.tsx`, find:

```tsx
            defaults={{
              name: ctx.org.name,
              primary_color: ctx.org.primary_color,
              member_noun: ctx.org.member_noun,
              client_noun: ctx.org.client_noun,
            }}
```

Replace with:

```tsx
            defaults={{
              name: ctx.org.name,
              primary_color: ctx.org.primary_color,
              member_noun: ctx.org.member_noun,
              client_noun: ctx.org.client_noun,
              timezone: ctx.org.timezone,
            }}
```

- [ ] **Step 3: Validate + persist `timezone` in `updateBranding`**

In `src/app/(artisan)/actions.ts`:

(a) Add an import near the top with the other imports:

```ts
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/timezones";
```

(b) In `updateBranding`, find:

```ts
  const name = str(fd, "name");
  const color = str(fd, "primary_color");
  const memberNoun = str(fd, "member_noun");
  const clientNoun = str(fd, "client_noun");
```

Replace with:

```ts
  const name = str(fd, "name");
  const color = str(fd, "primary_color");
  const memberNoun = str(fd, "member_noun");
  const clientNoun = str(fd, "client_noun");
  const tzRaw = str(fd, "timezone");
  const timezone = isValidTimezone(tzRaw) ? tzRaw : DEFAULT_TIMEZONE;
```

(c) Find the update call:

```ts
    .from("organizations")
    .update({ name, primary_color: color, member_noun: memberNoun, client_noun: clientNoun })
    .eq("id", ctx.org.id);
```

Replace with:

```ts
    .from("organizations")
    .update({ name, primary_color: color, member_noun: memberNoun, client_noun: clientNoun, timezone })
    .eq("id", ctx.org.id);
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(artisan)/settings/BrandingForm.tsx" "src/app/(artisan)/settings/page.tsx" "src/app/(artisan)/actions.ts"
git commit -m "$(cat <<'EOF'
Add timezone to workspace settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Timezone-aware formatters + apply at display sites (TDD)

The `fmtDateTime` signature changes (a required `timeZone` arg), so this task updates the formatter **and** both call-sites in one commit to keep the build green.

**Files:**
- Create: `src/lib/data/format.test.ts`
- Modify: `src/lib/data/format.ts`
- Modify: `src/app/(artisan)/projects/[id]/page.tsx`
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx`

- [ ] **Step 1: Write the failing formatter tests**

Create `src/lib/data/format.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { fmtDateTime, fmtZonedDate } from "./format";

describe("fmtDateTime", () => {
  test("renders a UTC instant in Eastern daylight time (summer)", () => {
    expect(fmtDateTime("2026-06-02T20:10:00Z", "America/New_York")).toBe("Jun 2 · 4:10pm");
  });

  test("renders Eastern standard time (winter)", () => {
    expect(fmtDateTime("2026-01-15T20:10:00Z", "America/New_York")).toBe("Jan 15 · 3:10pm");
  });

  test("renders a different zone (Pacific)", () => {
    expect(fmtDateTime("2026-06-02T20:10:00Z", "America/Los_Angeles")).toBe("Jun 2 · 1:10pm");
  });
});

describe("fmtZonedDate", () => {
  test("uses the calendar date in the zone, shifting across midnight", () => {
    // 02:00 UTC on Jun 13 is 22:00 EDT on Jun 12.
    expect(fmtZonedDate("2026-06-13T02:00:00Z", "America/New_York")).toBe("Jun 12");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- format`
Expected: FAIL — `fmtZonedDate` is not exported (and `fmtDateTime` ignores the zone).

- [ ] **Step 3: Update the formatters**

In `src/lib/data/format.ts`, find:

```ts
/** ISO timestamp → "Jun 2 · 4:10pm". */
export function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleString("en-US", { month: "short", day: "numeric" });
  const time = dt
    .toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")
    .toLowerCase();
  return `${date} · ${time}`;
}
```

Replace with:

```ts
/** ISO timestamp → "Jun 2 · 4:10pm", rendered in `timeZone` (IANA id). */
export function fmtDateTime(iso: string, timeZone: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleString("en-US", { month: "short", day: "numeric", timeZone });
  const time = dt
    .toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${date} · ${time}`;
}

/** ISO timestamp → "Jun 12": the calendar date in `timeZone` (for completed-at). */
export function fmtZonedDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", timeZone });
}
```

(The `.replace(/\s/g, "")` — broadened from `.replace(" ", "")` — strips the AM/PM separator robustly, including the narrow no-break space modern ICU may emit.)

- [ ] **Step 4: Run the formatter tests to verify they pass**

Run: `npm test -- format`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply the zone on the artisan project page**

In `src/app/(artisan)/projects/[id]/page.tsx`:

(a) Find the format import:

```ts
import { fmtDate, fmtDateTime, contactName } from "@/lib/data/format";
```

Replace with:

```ts
import { fmtDate, fmtDateTime, fmtZonedDate, contactName } from "@/lib/data/format";
```

(b) Add a timezone import below it:

```ts
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
```

(c) Find:

```tsx
  const artisanLabel = `${ctx?.user.name ?? "Artisan"} (you)`;
```

Add directly below it:

```tsx
  const timezone = ctx?.org.timezone ?? DEFAULT_TIMEZONE;
```

(d) Find:

```tsx
                      when={fmtDateTime(u.created_at)}
```

Replace with:

```tsx
                      when={fmtDateTime(u.created_at, timezone)}
```

(e) Find:

```tsx
                        completed={
                          t.completed_at
                            ? fmtDate(String(t.completed_at).slice(0, 10)) ?? undefined
                            : undefined
                        }
```

Replace with:

```tsx
                        completed={
                          t.completed_at ? fmtZonedDate(String(t.completed_at), timezone) : undefined
                        }
```

- [ ] **Step 6: Apply the zone on the portal project page**

In `src/app/(portal)/my-projects/[id]/page.tsx`:

(a) Find the format import:

```ts
import { fmtDate, fmtDateTime } from "@/lib/data/format";
```

Replace with:

```ts
import { fmtDate, fmtDateTime, fmtZonedDate } from "@/lib/data/format";
```

(b) Find:

```tsx
  const { project, updates, attachments, tasks, fileCategories } = detail;
```

Replace with:

```tsx
  const { project, updates, attachments, tasks, fileCategories, timezone } = detail;
```

(c) Find:

```tsx
                      when={fmtDateTime(u.created_at)}
```

Replace with:

```tsx
                      when={fmtDateTime(u.created_at, timezone)}
```

(d) Find:

```tsx
                          ? t.completed_at
                            ? `done ${fmtDate(String(t.completed_at).slice(0, 10))}`
                            : "done"
```

Replace with:

```tsx
                          ? t.completed_at
                            ? `done ${fmtZonedDate(String(t.completed_at), timezone)}`
                            : "done"
```

- [ ] **Step 7: Verify the build passes**

Run: `npm run build`
Expected: build succeeds — all `fmtDateTime` call-sites now pass a `timeZone`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/format.ts src/lib/data/format.test.ts "src/app/(artisan)/projects/[id]/page.tsx" "src/app/(portal)/my-projects/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Render timestamps in the artisan's timezone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the grouping helper, the timezone guard, and the formatters).

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds; all routes compile.

- [ ] **Step 3: Apply the migration to the remote DB** _(controller/user step — outward-facing)_

Run: `supabase db push`
Expected: migration `20260612000002_organization_timezone.sql` applies; `supabase migration list` shows it on both Local and Remote. (The app reads `organizations.timezone` live, so the column must exist on remote before the manual smoke check.)

- [ ] **Step 4: Manual smoke check (recommended)**

Run `npm run dev`. In Settings, confirm the Timezone dropdown shows the curated US zones and saves. Then on a project:
- A status update shows its time in the selected zone (change the zone and confirm the displayed time shifts) on both the artisan page and the customer portal.
- A `due_date` does **not** shift when the zone changes (it's a calendar date).
- A completed task's "done <date>" reflects the zone.

---

## Notes for the implementer

- Only `fmtDateTime` and the new `fmtZonedDate` take a timezone. `fmtDate` (used for `date`-type `due_date`/`start_date`/`end_date`) stays UTC-safe and unchanged — those are zone-independent calendar dates and must not shift.
- `getPortalProject` already runs `if (!project) return null;` before the `Promise.all`, and the portal page calls `if (!detail) notFound();` before destructuring, so `timezone` is always a non-null string at the call-site (the loader defaults it via `?? DEFAULT_TIMEZONE`).
- The artisan page guards with `ctx?.org.timezone ?? DEFAULT_TIMEZONE` because `getOrgContext()` can return null.
- Do not push to the remote DB except in Task 6 Step 3.
