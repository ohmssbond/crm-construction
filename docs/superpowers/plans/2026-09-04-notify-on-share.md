# Notify On Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An update emails the project team **exactly once** — the first time it becomes visible to the customer, whether at post time or when the Shared toggle is flipped later.

**Architecture:** A `notified_at` column records that an update has announced itself, backfilled so nothing already live can retroactively fire. One pure predicate decides whether a toggle should notify. The notification block, currently inline in `postUpdate`, is extracted so both paths run identical code.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), Supabase Postgres, Resend, TypeScript, Vitest.

Spec: `docs/superpowers/specs/2026-09-04-notify-on-share-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `AGENTS.md`, this Next.js version has breaking changes vs. training data.
- **One email per update, ever.** The toggle can be flipped repeatedly; the whole point of `notified_at` is that the second, third, and fourth flips send nothing.
- **`postUpdate` must stamp `notified_at` too.** An update posted shared has already emailed; without the stamp it emails again the first time someone toggles it off and on — the exact case this feature exists to prevent. This is the easiest requirement in the plan to skip, because `postUpdate`'s email path *looks* finished.
- **Stamp only when there was at least one recipient.** Sharing an update before attaching the customer must not burn the single notification on an empty send.
- **Never notify on un-share, on a no-op re-share, or on an edit.** `updateStatusUpdate` has never emailed and must not start.
- **Sends stay best-effort** (`Promise.allSettled`). Do not add retries, queues, or error surfacing — out of scope.
- **Never run `supabase db push` without `--dry-run`** — it writes the production database. The migration ships in a separate, deliberate step.
- **Gates before every commit:** `npx tsc --noEmit` and `npm test` (177 passing today). `npm run build` before the final task is called done.

---

### Task 1: `notified_at` column and backfill

**Files:**
- Create: `supabase/migrations/20260904000001_update_notified_at.sql`

**Interfaces:**
- Produces: `status_updates.notified_at timestamptz` (nullable), backfilled for currently-shared rows.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904000001_update_notified_at.sql`:

```sql
-- An update announces itself by email exactly once — the first time it becomes visible
-- to the customer, whether that is at post time or when the Shared toggle is flipped
-- later. notified_at is what makes "once" hold across repeated toggling.
--
-- THE BACKFILL IS THE POINT: every currently-shared update is marked as already
-- announced. Without it, un-sharing and re-sharing a months-old update would email
-- "New update on ..." about it today. This assumes anything already shared was already
-- announced — true for updates posted shared; false for any shared later under the
-- previous silent behavior, whose recipients never got an email and now never will.
-- Accepted deliberately: emailing about old updates now would be worse.
--
-- No index: the column is only ever read for a single row already fetched by id.
alter table status_updates add column notified_at timestamptz;

update status_updates set notified_at = created_at where is_shared;
```

- [ ] **Step 2: Verify it parses and is pending — WITHOUT applying it**

Run: `supabase db push --dry-run`

Expected: the output lists `20260904000001_update_notified_at.sql` as a migration that *would* be applied. Nothing is written. **Do not run `supabase db push` without `--dry-run`** — applying to production is a separate, explicitly confirmed step at ship time.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904000001_update_notified_at.sql
git commit -m "feat(updates): notified_at column, backfilled for shared updates"
```

---

### Task 2: `shouldNotifyOnShare`

**Files:**
- Create: `src/lib/data/notifications.ts`
- Create: `src/lib/data/notifications.test.ts`

**Interfaces:**
- Consumes: nothing. This module must stay pure — no imports.
- Produces — Task 3 depends on this exact name:
  `shouldNotifyOnShare(wasShared: boolean, nextShared: boolean, notifiedAt: string | null): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/notifications.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { shouldNotifyOnShare } from "./notifications";

describe("shouldNotifyOnShare", () => {
  test("notifies when a never-announced update is first shared", () => {
    expect(shouldNotifyOnShare(false, true, null)).toBe(true);
  });

  test("does not notify when an already-announced update is re-shared", () => {
    expect(shouldNotifyOnShare(false, true, "2026-09-01T12:00:00Z")).toBe(false);
  });

  test("does not notify when an update is un-shared", () => {
    expect(shouldNotifyOnShare(true, false, null)).toBe(false);
    expect(shouldNotifyOnShare(true, false, "2026-09-01T12:00:00Z")).toBe(false);
  });

  test("does not notify on a no-op re-share of an already-shared update", () => {
    expect(shouldNotifyOnShare(true, true, null)).toBe(false);
  });

  test("does not notify when a private update stays private", () => {
    expect(shouldNotifyOnShare(false, false, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/notifications.test.ts`

Expected: FAIL — cannot resolve `./notifications` (the module does not exist yet).

- [ ] **Step 3: Implement**

Create `src/lib/data/notifications.ts`:

```ts
// Whether flipping an update's Shared toggle should send the project team an email.
//
// An update announces itself exactly ONCE — the first time it becomes visible to the
// customer. `notified_at` is what carries that across repeated toggling: a contractor
// who un-shares to revise and re-shares must not send a second "New update" email for
// the same post.

export function shouldNotifyOnShare(
  wasShared: boolean,
  nextShared: boolean,
  notifiedAt: string | null
): boolean {
  if (notifiedAt !== null) return false; // already announced, ever
  return !wasShared && nextShared; // only the private → shared transition
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/notifications.test.ts`

Expected: PASS — 5 new tests (6 assertions).

- [ ] **Step 5: Run the gates and commit**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; 182 tests pass (177 + 5).

```bash
git add src/lib/data/notifications.ts src/lib/data/notifications.test.ts
git commit -m "feat(updates): shouldNotifyOnShare decides when a toggle notifies"
```

---

### Task 3: Extract the notifier and wire both paths

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/actions.ts` (`postUpdate` and `setUpdateShared`)

**Interfaces:**
- Consumes: `shouldNotifyOnShare` (Task 2); `notified_at` (Task 1).
- Produces: a module-private `notifyProjectUpdate` helper. Neither action's exported signature changes.

- [ ] **Step 1: Extract the notification block into a helper**

`postUpdate` currently ends with an inline block: resolve the acting user and project name, call the `project_notification_recipients` RPC, and `Promise.allSettled` a `sendEmail` per recipient. Lift that into a module-private function placed just above `postUpdate`:

```ts
/**
 * Best-effort: email the project team (minus the acting user and anyone opted out) a
 * link to an update that has just become visible to the customer, then record that it
 * announced itself.
 *
 * Shared by BOTH paths — posting as shared, and flipping the Shared toggle later — so
 * the two cannot drift apart. `notified_at` is what makes an update announce exactly
 * once across repeated toggling.
 *
 * The stamp is skipped when there were no recipients, so sharing an update before the
 * customer is attached does not burn the single notification on an empty send.
 * Sends are best-effort: a failure is swallowed and never retried, matching the
 * behavior this replaces.
 */
async function notifyProjectUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  updateId: string,
  title: string | null,
  body: string
): Promise<void> {
  const [{ data: authData }, { data: proj }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
  ]);
  const projectName = proj?.name ?? "your project";
  const { data: recipients } = await supabase.rpc("project_notification_recipients", {
    p_project: projectId,
    p_exclude_user: authData?.user?.id ?? null,
  });

  const list = (recipients ?? []) as { email: string; type: string }[];
  if (list.length === 0) return; // nobody to tell — leave notified_at null so a later share can

  const base = appUrl();
  await Promise.allSettled(
    list.map((r) =>
      sendEmail({
        to: r.email,
        subject: `New update on ${projectName}`,
        html: projectUpdateEmailHtml({
          projectName,
          title,
          body,
          link:
            r.type === "rep"
              ? `${base}/projects/${projectId}`
              : `${base}/my-projects/${projectId}`,
        }),
      })
    )
  );

  await supabase
    .from("status_updates")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", updateId)
    .eq("project_id", projectId);
}
```

Note the helper takes an already-trimmed `title` and `body` — the callers do their own trimming today and must keep doing it.

- [ ] **Step 2: Rewrite `postUpdate`'s tail to use it**

`postUpdate`'s insert currently discards the new row:

```ts
  await supabase.from("status_updates").insert({ … });
```

It needs the new id in order to stamp, so change it to capture one:

```ts
  const { data: inserted } = await supabase
    .from("status_updates")
    .insert({ … })
    .select("id")
    .single();
```

Leave the inserted object's fields exactly as they are. Then replace everything from `if (!isShared) return;` to the end of the function with:

```ts
  // Best-effort, after the insert so a send failure never loses the post. A private
  // update announces nothing now; flipping its Shared toggle later will.
  if (!isShared || !inserted?.id) return;
  await notifyProjectUpdate(supabase, projectId, inserted.id, title.trim() || null, text);
```

The `revalidatePath` call that sits between the insert and the old email block stays exactly where it is.

- [ ] **Step 3: Rewrite `setUpdateShared`**

It is currently a blind write:

```ts
export async function setUpdateShared(projectId: string, updateId: string, shared: boolean) {
  const supabase = await createClient();
  await supabase.from("status_updates").update({ is_shared: shared }).eq("id", updateId);
  revalidatePath(`/projects/${projectId}`);
}
```

Replace it with:

```ts
/**
 * Toggle a status update's portal visibility, and — the first time it becomes visible —
 * email the project team, exactly as posting it shared would have.
 */
export async function setUpdateShared(projectId: string, updateId: string, shared: boolean) {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("status_updates")
    .select("is_shared, notified_at, title, body")
    .eq("id", updateId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return;

  await supabase
    .from("status_updates")
    .update({ is_shared: shared })
    .eq("id", updateId)
    .eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`);

  if (shouldNotifyOnShare(row.is_shared, shared, row.notified_at)) {
    await notifyProjectUpdate(supabase, projectId, updateId, row.title, row.body);
  }
}
```

The `.eq("project_id", projectId)` on both queries is a small hardening folded in while touching this action — it matches what the attachment actions do and closes the mismatched-id gap a reviewer flagged on `updateStatusUpdate`.

Add the import: `import { shouldNotifyOnShare } from "@/lib/data/notifications";`

- [ ] **Step 4: Confirm no second copy of the notification block survives**

Run: `grep -n "project_notification_recipients\|projectUpdateEmailHtml" "src/app/(artisan)/projects/[id]/actions.ts"`

Expected: each name appears exactly **once**, both inside `notifyProjectUpdate`. Two occurrences of either means the block was copied rather than extracted, which is the drift this task exists to prevent.

- [ ] **Step 5: Confirm editing still notifies nobody**

Run: `grep -n "notifyProjectUpdate\|sendEmail" "src/app/(artisan)/projects/[id]/actions.ts"`

Expected: `sendEmail` appears once (in the helper); `notifyProjectUpdate` appears three times (its definition and two call sites — `postUpdate` and `setUpdateShared`). **`updateStatusUpdate` must not appear as a caller.** Editing an update has never emailed and must not start.

- [ ] **Step 6: Verify the gates**

Run: `npx tsc --noEmit && npm test && npm run build`

Expected: all green, 182 tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/actions.ts"
git commit -m "feat(updates): email the team when an update is shared later"
```

---

## Manual verification (after `supabase db push`, before merge)

**The migration must be applied first.** Until it is, `notified_at` doesn't exist: `postUpdate` still inserts and still emails (the stamp write 404s and is swallowed), so posting looks fine. But `setUpdateShared`'s read of `notified_at` errors, `data` comes back null, and `if (!row) return;` makes the Shared toggle a **silent no-op** for every update — the optimistic UI shows the flip working until the next refresh, nothing throws or logs. If the deploy happens in the other order (migration applied, old code still live), an update posted shared in that window emails but is never stamped, so its first off/on flip after the new code ships sends a second email.

Nothing below is reachable by the automated gates — they prove the predicate is right and that it compiles, not that any email was sent.

- [ ] Post a **private** update → nobody is emailed.
- [ ] Flip it to **Shared** → the project team is emailed; the person who flipped it is not.
- [ ] Flip it back to Private, then Shared again → **no second email**.
- [ ] Post a **shared** update → emailed once, exactly as before. Then toggle it off and on → **no second email** (this is `postUpdate`'s stamp working).
- [ ] Take an update that was already shared **before this shipped** → toggle off and on → **no email** (this is the backfill working).
- [ ] Share an update on a project with **no contacts attached** → no email, and `notified_at` stays null. Attach a customer, toggle off and on → they **are** emailed.
- [ ] **Edit** a shared update's body → nobody is emailed.
- [ ] The email's link still points at `/projects/{id}` for a rep and `/my-projects/{id}` for a customer.
