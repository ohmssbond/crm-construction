# Notify When an Update Is Shared Later — Design

_Date: 2026-09-04_

Posting a shared update emails the project team. Posting one **private** and flipping
the Shared toggle later emails nobody — the customer sees it in their portal only if
they happen to look. A contractor who drafts privately and shares when ready has no way
to reach them.

## Goal

An update reaches the project team by email **exactly once — the first time it becomes
visible to the customer**, whether that happens at post time or a week later.

## Decisions (settled)

- **One email per update, ever.** The Shared toggle can be flipped off and on
  repeatedly; without state, each flip would send another "New update" email for the
  same post, and a contractor un-sharing to revise would spam the customer.
- **State lives in `status_updates.notified_at timestamptz`** (nullable). Set when the
  emails go out; checked before sending.
- **The backfill matters more than the column.** The migration sets
  `notified_at = created_at` for every **currently shared** update. Without it,
  un-sharing and re-sharing a months-old update would email "New update on…" about it
  today. This assumes every currently-shared update was already announced — true for
  those posted shared; false for any shared later under today's silent behavior, whose
  recipients never got an email and now never will. Accepted: emailing about old updates
  now would be worse than the gap.
- **`postUpdate` must stamp `notified_at` too.** Otherwise an update posted shared —
  already emailed — fires a second time the first time someone toggles it off and on,
  which is precisely what "once ever" exists to prevent.
- **Same recipients as posting.** The existing `project_notification_recipients` RPC is
  reused unchanged: everyone attached as `rep` / `partner` / `customer`, minus anyone
  opted out, minus the acting user. No new SQL, and a partner who would have been
  emailed on a direct post is not silently skipped here.
- **"The acting user" is whoever flips the toggle**, who may not be the update's author.
  That is correct — you do not email yourself for an action you just took.
- **`notified_at` is stamped only when there was at least one recipient.** A contractor
  who shares an update before attaching the customer would otherwise burn the single
  notification on an empty send; this way, attaching the customer and toggling still
  reaches them.
- **The email is unchanged** — same `projectUpdateEmailHtml`, same "New update on
  {project}" subject, same per-type link (`/projects/{id}` for reps, `/my-projects/{id}`
  for everyone else). For an update shared weeks after posting, or backdated, "New
  update" is loose — but it is new to the person receiving it.

## Non-goals

- Retrying failed sends, or any delivery guarantee. Sends stay best-effort
  (`Promise.allSettled`), matching `postUpdate` today. Making this reliable means a
  queue — a far larger change.
- Notifying on an **edit** to an already-shared update. `updateStatusUpdate` has never
  emailed and must not start.
- Notifying when an update is **un**-shared.
- Any UI change. The Shared toggle already exists and looks identical.
- Backfilling notifications for updates shared silently in the past.
- Extending this to shared *attachments*, *tasks*, or *schedule* rows.

---

## Components

### 1. Migration — `supabase/migrations/20260904000001_update_notified_at.sql`

```sql
alter table status_updates add column notified_at timestamptz;

update status_updates set notified_at = created_at where is_shared;
```

No index: the column is only ever read for a single row already fetched by primary key.

### 2. `shouldNotifyOnShare` — pure, in `src/lib/data/notifications.ts`

The whole feature is one predicate, so it gets extracted and tested rather than inlined:

```ts
export function shouldNotifyOnShare(
  wasShared: boolean,
  nextShared: boolean,
  notifiedAt: string | null
): boolean;
```

True only when all three hold: the update has never been notified (`notifiedAt === null`),
it was not already shared, and it is becoming shared. Every other combination — already
notified, already shared, being un-shared, a no-op re-share — is false.

A new module rather than an addition to an existing one: `notifications.ts` is where the
next notification rule belongs, and none of the current data modules is about this.

### 3. `setUpdateShared` — `src/app/(artisan)/projects/[id]/actions.ts`

Today it writes blind:

```ts
await supabase.from("status_updates").update({ is_shared: shared }).eq("id", updateId);
```

It gains a read first (current `is_shared` and `notified_at`, scoped by `id` **and**
`project_id`), then the write, then — when `shouldNotifyOnShare` says so — the same
notification block `postUpdate` uses, followed by stamping `notified_at` if at least one
recipient was found.

The `project_id` scoping is a small hardening folded in while touching this action,
matching what the attachment actions do; it closes the mismatched-id gap a reviewer
flagged on `updateStatusUpdate`.

### 4. `postUpdate` — same file

Two changes:

- Its insert currently discards the new row. It needs `.select("id").single()` so the
  new update's id is available to stamp.
- After the sends, stamp `notified_at` when there was at least one recipient.

### 5. Shared notification helper

`postUpdate` and `setUpdateShared` would otherwise carry two copies of the same
twenty-line block (resolve the project name and acting user, call the RPC, map recipients
to emails, stamp). It is extracted to one function in the same actions file:

```ts
async function notifyProjectUpdate(
  supabase: SupabaseClient,
  projectId: string,
  updateId: string,
  title: string | null,
  body: string
): Promise<void>;
```

It resolves recipients, sends, and stamps `notified_at` when at least one was found. Both
callers reduce to a single guarded call. This is deliberate: two hand-maintained copies of
a notification rule is exactly how the two paths drift apart later.

---

## Testing

Unit tests for `shouldNotifyOnShare` in `src/lib/data/notifications.test.ts`, covering
each combination that matters:

- never notified, private → shared: **true** (the feature)
- never notified, shared → private: false (un-sharing)
- never notified, shared → shared: false (no-op)
- already notified, private → shared: **false** (the re-share guard)
- already notified, shared → private: false
- never notified, private → private: false

`notifyProjectUpdate` does I/O and gets no unit test, matching the repo's convention for
client-taking functions in an actions file.

Gates: `npx tsc --noEmit`, `npm test` (177 passing today), `npm run build`.

Manual verification, since none of the email path is reachable by the automated gates:

- Post a **private** update → nobody is emailed.
- Flip it to Shared → the project team is emailed, and the sender is not.
- Flip it back to Private and Shared again → **no second email**.
- Post a **shared** update → emailed once, as today. Toggle it off and on → **no second
  email** (this is the `postUpdate` stamp doing its job).
- An update that was already shared before this shipped → toggle off and on → **no
  email** (this is the backfill doing its job).
- Share an update on a project with **no contacts attached**, then attach a customer and
  toggle off/on → they **are** emailed (the empty-recipient rule).
- Editing a shared update still emails nobody.

## Risks

- **Best-effort sends.** If every send fails, `notified_at` is stamped anyway and there
  is no retry. Unchanged from today's `postUpdate`, and accepted.
- **The backfill is a one-way judgment.** Updates shared silently in the past are marked
  as notified and will never email. Deliberate.
- **Two paths must stay in step.** The extracted `notifyProjectUpdate` is what keeps
  them there; splitting it again later would reintroduce the drift risk.
