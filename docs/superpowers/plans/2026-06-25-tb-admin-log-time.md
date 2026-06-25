# Admins Can Log Their Own Time (slice A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Time & Billing admin log their own field time by reusing the existing `/log` worker app, surfaced from `/tb`, and make that admin nameable in the report.

**Architecture:** App-layer only — no schema/RLS change (the `worker_rw` policies already admit admins via `is_tb_member`). Relax the two app gates that bounce admins out of `/log`, add cross-navigation using the existing `showTimeLink` Sidebar mechanism, and broaden `listTbWorkers` so an admin who logs time can be named for the report/billing export.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + RLS), Tailwind v4, Vitest.

## Global Constraints

- **Modified Next.js** — read `node_modules/next/dist/docs/` before app code; heed deprecation notices (per `AGENTS.md`).
- **No migration / no RLS change** — this slice is purely app-layer.
- **Conceptual model: admin ⊇ worker.** Do NOT add a second membership or dual roles; the admin logs time as themselves (`worker_user_id` = admin id).
- **Scope is slice A only** (admin logs their OWN time). Admin-on-behalf-of-crew entry, worker/date pickers, and a formal Employee entity are OUT of scope.
- **Cost isolation unchanged** — `/log` is already cost-free; admins seeing cost happens only in `/tb`. Add nothing that surfaces cost in `/log`.
- **Gates:** `npm run build` and `npm test` (existing 83 tests stay green) before commit/merge.

---

### Task 1: Open the `/log` field app to admins (gates + cross-navigation)

**Files:**
- Modify: `src/lib/auth-tb.ts` (broaden `requireTbWorker`)
- Modify: `src/app/(worker)/log/layout.tsx` (relax gate; add "T&B admin" link)
- Modify: `src/app/(timebilling)/tb/layout.tsx` (pass `showTimeLink`)

**Interfaces:**
- Consumes: existing `productRole(claims, product)` / `resolveHome(claims)` from `@/lib/auth`; the `AppShell` `showTimeLink?: boolean` prop (already wired to render a "Time logging → /log" Sidebar link).
- Produces: no new exported symbols; behavioral change — timebilling **admin or worker** may use `/log`, and `/tb` shows a link to it.

- [ ] **Step 1: Broaden `requireTbWorker` to accept admin or worker**

In `src/lib/auth-tb.ts`, replace the `requireTbWorker` function (its doc comment and body) with:

```ts
/**
 * Gate for the field time-logging surface (/log): returns the user if they're a
 * `timebilling` worker OR admin, else redirects to their role-home. Admins can log
 * their own time too (admin ⊇ worker). Used by the worker time-tracking actions.
 */
export async function requireTbWorker(): Promise<User> {
  const { createClient } = await import("@/lib/supabase/server");
  const { redirect } = await import("next/navigation");
  const { productRole, resolveHome } = await import("@/lib/auth");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const role = productRole(claims, "timebilling");
  if (!user || (role !== "worker" && role !== "admin")) redirect(resolveHome(claims));
  return user as User;
}
```

- [ ] **Step 2: Relax the `/log` layout gate and compute admin flag**

In `src/app/(worker)/log/layout.tsx`, the gate line currently reads:

```tsx
  if (productRole(claims, "timebilling") !== "worker") redirect(resolveHome(claims));
```

Replace it with:

```tsx
  const tbRole = productRole(claims, "timebilling");
  if (tbRole !== "worker" && tbRole !== "admin") redirect(resolveHome(claims));
```

Then find the existing line:

```tsx
  const hasCrm = !!productRole(claims, "crm");
```

and add directly after it:

```tsx
  const isTbAdmin = tbRole === "admin";
```

- [ ] **Step 3: Add the "T&B admin" link in the `/log` header**

In the same file, the header's right-hand link group currently is:

```tsx
        <div className="flex items-center gap-3 text-meta shrink-0">
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">Back to CRM</Link>
          )}
          <form action={signOut}>
```

Insert the admin link before the `hasCrm` link:

```tsx
        <div className="flex items-center gap-3 text-meta shrink-0">
          {isTbAdmin && (
            <Link href="/tb" className="text-muted hover:text-text">T&amp;B admin</Link>
          )}
          {hasCrm && (
            <Link href="/dashboard" className="text-muted hover:text-text">Back to CRM</Link>
          )}
          <form action={signOut}>
```

- [ ] **Step 4: Surface the "Time logging" link in `/tb`**

In `src/app/(timebilling)/tb/layout.tsx`, the `AppShell` is rendered as:

```tsx
    <AppShell
      world="timebilling"
      accent={org.primary_color}
      brand={{ tile: org.initials, name: org.name, label: "Time & Billing" }}
      user={{ tile: user.initials, name: user.name, email: user.email }}
    >
      {children}
    </AppShell>
```

Add the `showTimeLink` prop (every `/tb` user is an admin — the layout is gated by
`requireTbAdmin()` above — and admins can now log time, so it is always on here):

```tsx
    <AppShell
      world="timebilling"
      accent={org.primary_color}
      brand={{ tile: org.initials, name: org.name, label: "Time & Billing" }}
      user={{ tile: user.initials, name: user.name, email: user.email }}
      showTimeLink
    >
      {children}
    </AppShell>
```

- [ ] **Step 5: Build and run the suite**

Run: `npm run build && npm test`
Expected: build succeeds; all 83 existing tests pass (no tests added — these are gate/layout changes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-tb.ts "src/app/(worker)/log/layout.tsx" "src/app/(timebilling)/tb/layout.tsx"
git commit -m "Let T&B admins log their own time in /log (gates + cross-nav)"
```

---

### Task 2: Make a time-logging admin nameable for the report (#5)

**Files:**
- Modify: `src/lib/data/tb-workers.ts` (`listTbWorkers` includes admins + returns `role`)
- Modify: `src/app/(timebilling)/tb/workers/page.tsx` (render an "(admin)" badge)

**Interfaces:**
- Consumes: existing `createAdminClient`, `getWorkspaceContext`, `workerLabel`.
- Produces: `listTbWorkers()` now returns `{ userId: string; email: string | null; name: string | null; role: string }[]` (added `role`), and includes `timebilling` members whose role is `worker` **or** `admin`.

- [ ] **Step 1: Broaden `listTbWorkers` to include admins and return role**

In `src/lib/data/tb-workers.ts`, the membership query currently reads:

```ts
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("product", "timebilling")
    .eq("role", "worker");
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];
```

Replace it with (select `role`, include both roles, keep the rows for later):

```ts
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .eq("product", "timebilling")
    .in("role", ["worker", "admin"]);
  const memberRows = (members ?? []) as { user_id: string; role: string }[];
  if (memberRows.length === 0) return [];
```

Then the output mapping currently reads:

```ts
  const out = await Promise.all(
    ids.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      return { userId: uid, email: data.user?.email ?? null, name: names[uid] ?? null };
    })
  );
```

Replace it with (map over `memberRows`, carry `role` through):

```ts
  const out = await Promise.all(
    memberRows.map(async (m) => {
      const uid = m.user_id;
      const { data } = await admin.auth.admin.getUserById(uid);
      return { userId: uid, email: data.user?.email ?? null, name: names[uid] ?? null, role: m.role };
    })
  );
```

(The `tb_workers` name query and the final `workerLabel`-based `.sort(...)` are unchanged
and still compile — they don't reference `ids`.)

- [ ] **Step 2: Render an "(admin)" badge on the workers screen**

In `src/app/(timebilling)/tb/workers/page.tsx`, the row's email cell currently reads:

```tsx
              <div className="flex-1 min-w-0 text-meta text-faint truncate">
                {w.email ?? w.userId.slice(0, 8)}
              </div>
```

Replace it with:

```tsx
              <div className="flex-1 min-w-0 text-meta text-faint truncate">
                {w.email ?? w.userId.slice(0, 8)}
                {w.role === "admin" && <span className="ml-2 text-faint">(admin)</span>}
              </div>
```

- [ ] **Step 3: Build and run the suite**

Run: `npm run build && npm test`
Expected: build succeeds (the new `role` field typechecks through `listTbWorkers` →
the page); all 83 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/tb-workers.ts "src/app/(timebilling)/tb/workers/page.tsx"
git commit -m "Include admins in the T&B workers list so they're nameable for the report"
```

---

## Manual verification (after both tasks)

Against dev or prod, using the Owl Electric demo tenant:

1. Sign in as the admin (`doug+owladmin@myotherbrain.com`) → lands on `/tb`. A "Time
   logging" link is present in the sidebar.
2. Click it → `/log` opens (no redirect bounce). Start a day, clock into a job, add a
   material/note — the rows persist (they're the admin's own, `worker_user_id` = admin).
3. The `/log` header shows a "T&B admin" link → returns to `/tb`.
4. `/tb/workers` lists the admin with an "(admin)" badge; set a name for them.
5. Open the job the admin logged on → the report and "Export billing ticket" label the
   admin's time by that name (not their email).
6. Regression: a worker (`doug+owlworker1@…`) still reaches `/log` and works as before; a
   non-T&B user is still redirected away from `/log`.

## Out of scope (do not implement)

- Slice B: admin entering/editing time on behalf of other workers (worker + date pickers).
- A formal Worker/Employee entity.
- Mobile surfacing of the `/tb`→`/log` link (desktop Sidebar only for now).
- Dual-role memberships.
