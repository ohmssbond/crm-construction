# Project-Update Email Notifications — Design

_Date: 2026-07-23_

Backlog #5. Email the project team when a **shared** update is posted, with a
per-user opt-out (default **on**).

## Goals

- When an artisan posts a shared status update, email everyone on that project's
  team (customers, partners, and staff/reps) — except the author and anyone opted
  out — a link to the update.
- Each user has a "project updates" notification flag, default **on**, editable on
  their "Your Account" page.

## Decisions (from brainstorming)

- **Recipients:** the whole project team — `project_contacts` of type
  `customer`/`partner`/`rep`. Skip the **author** and anyone **opted out**.
- **Trigger:** on `postUpdate` when the update is **shared** (`isShared=true`). Not
  on tenant-private updates. (Notifying when an existing update is *toggled* shared
  via `setUpdateShared` is a deferred follow-up.)
- **Preference:** per **auth user** (staff and contacts both), default on.
- **Email:** reuse the existing Resend integration (`src/lib/email.ts`), best-effort
  (no-op without `RESEND_API_KEY`) — never blocks or fails the update.
- **Link:** role-appropriate — customers/partners → `/my-projects/{id}`, staff →
  `/projects/{id}`.

## Non-goals

- Notifying on toggle-to-shared (`setUpdateShared`) — deferred.
- Notification types beyond project updates (tasks, etc.) — the schema leaves room
  but only `project_updates` ships now.
- Digest/batching — one email per shared update.
- In-app notifications — email only.

---

## Data model

### `notification_preferences` (new table)

```sql
create table notification_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  project_updates boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table notification_preferences enable row level security;

-- A user reads/writes only their own row.
create policy own_prefs on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**Default on = absent row.** No row means "notify" (`coalesce(project_updates, true)`),
so we never need to backfill a row for every existing user.

### `project_notification_recipients(p_project, p_exclude_user)` (new SECURITY DEFINER function)

Recipient resolution must read *other* users' preference rows, which normal RLS
forbids — so it lives in a `security definer` function (like `portal_project_team`).

```sql
create or replace function public.project_notification_recipients(
  p_project uuid,
  p_exclude_user uuid
)
returns table (email text, type text)
language sql stable security definer set search_path = public as $$
  select distinct coalesce(u.email, c.email)::text as email, c.type
  from project_contacts pc
  join contacts c on c.id = pc.contact_id
  left join auth.users u on u.id = c.user_id
  left join notification_preferences np on np.user_id = c.user_id
  where pc.project_id = p_project
    and c.type in ('rep', 'partner', 'customer')
    and coalesce(np.project_updates, true) = true       -- opted in (default true)
    and (c.user_id is distinct from p_exclude_user)      -- skip the author
    and coalesce(u.email, c.email) is not null
    -- Guard: only a CRM staff member of the project's org can list recipients, so
    -- this SECURITY DEFINER fn can't leak team emails to an arbitrary caller.
    and exists (
      select 1 from projects p
      join memberships m on m.organization_id = p.organization_id
      where p.id = p_project and m.user_id = auth.uid() and m.product = 'crm'
    );
$$;
grant execute on function public.project_notification_recipients(uuid, uuid) to authenticated;
```

- Recipient email prefers the **live** auth login email (`u.email`), falling back to
  the contact's CRM email (`c.email`) for contacts without a login yet — avoids the
  stale-snapshot problem for reps.
- `type` drives the role-appropriate link (`rep` → artisan; else portal).
- Only callable by an authenticated org member in practice (it's invoked from
  `postUpdate`, itself gated); it returns nothing meaningful to a random caller
  without the project id, and reveals only team emails for a project — acceptable,
  matching the existing `portal_project_team` exposure posture.

---

## Send flow — `postUpdate`

In `src/app/(artisan)/projects/[id]/actions.ts`, after the `status_updates` insert,
**only when `isShared`**, notify:

```ts
if (isShared) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: recipients } = await supabase.rpc("project_notification_recipients", {
    p_project: projectId,
    p_exclude_user: user?.id ?? null,
  });
  const base = appUrl();
  const projectName = /* fetched with the project, or a short query */;
  await Promise.allSettled(
    (recipients ?? []).map((r) =>
      sendEmail({
        to: r.email,
        subject: `New update on ${projectName}`,
        html: projectUpdateEmailHtml({
          projectName,
          title: title.trim() || null,
          body: text,
          link: r.type === "rep" ? `${base}/projects/${projectId}` : `${base}/my-projects/${projectId}`,
        }),
      })
    )
  );
}
```

- Runs **after** the update is inserted, so a send failure never loses the update.
- `Promise.allSettled` — best-effort, never throws.
- `sendEmail` is a no-op when `RESEND_API_KEY` is unset, so dev/unconfigured envs
  just skip silently (like invites).
- `projectName`: `postUpdate` doesn't currently load the project; add a tiny
  `select name` (or fetch once) for the subject/body.

### `email.ts` — new `projectUpdateEmailHtml`

Mirror `inviteEmailHtml` (escape tenant/user text; the `link` is system-built and
safe):

```ts
export function projectUpdateEmailHtml({
  projectName, title, body, link,
}: { projectName: string; title: string | null; body: string; link: string }): string {
  const p = escapeHtml(projectName);
  const t = title ? escapeHtml(title) : null;
  const snippet = escapeHtml(body.length > 240 ? body.slice(0, 240) + "…" : body);
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1d2939">
    <h2 style="font-size:18px">New update on ${p}</h2>
    ${t ? `<p style="font-weight:600;font-size:15px">${t}</p>` : ""}
    <p style="color:#475467;font-size:14px;line-height:1.5;white-space:pre-wrap">${snippet}</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#2f6f5e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">
        View the update
      </a>
    </p>
  </div>`;
}
```

---

## Preference toggle — both account pages

A shared, small client component (like `ProfileForm`) — e.g.
`src/components/account/NotificationToggle.tsx` — with one checkbox: **"Email me
when a project I'm on is updated"** (checked = on). On change it calls a self-update
action that **upserts** the current user's row:

```ts
// in src/lib/auth-actions.ts
export async function setProjectUpdateNotifications(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, project_updates: enabled, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}
```

- Reading the current value for the toggle's initial state: a small query for the
  signed-in user's row (RLS own-row), defaulting to **true** when absent. Add a
  `getProjectUpdateNotifications()` helper (or fetch inline on each account page).
- Rendered on both `src/app/(portal)/account/page.tsx` and
  `src/app/(artisan)/settings/page.tsx`, beside `ProfileForm`.

---

## Testing

- No pure unit logic beyond the email-HTML builder; the send path is I/O. Rely on
  `tsc`/build + live verification. (Optionally unit-test `projectUpdateEmailHtml`
  for escaping + the snippet truncation — cheap and worthwhile.)
- **Live (Chrome + a real send):** with `RESEND_API_KEY` set, post a **shared**
  update on a project that has a customer with an email → confirm the customer
  receives the email with a working portal link, and the author does **not**. Toggle
  the flag off on the account page → post another shared update → confirm no email.
  Post a **private** update → no email.

## Rollout

- One migration (`notification_preferences` + the recipient function) → **cutover**
  (`supabase db push` + regen types + deploy). Additive — no tight window.
- **Prod dependency:** `RESEND_API_KEY` must be set in Vercel prod (`vercel env`),
  else notifications silently no-op. Verify at cutover.

## Resolved decisions

| Decision | Choice |
|---|---|
| Recipients | Whole team (customers + partners + reps), minus author + opted-out |
| Trigger | Shared update posted (`postUpdate`, `isShared`); toggle-to-shared deferred |
| Preference | Per-auth-user `notification_preferences.project_updates`, default true (absent = on) |
| Recipient filtering | `security definer` function (cross-user pref read) |
| Recipient email | Prefer live `auth.users.email`, fallback `contacts.email` |
| Link | Role-appropriate (`rep` → `/projects/{id}`, else `/my-projects/{id}`) |
| Send | Best-effort `Promise.allSettled`, after the insert; no-op without `RESEND_API_KEY` |
| Toggle UI | Both account pages, default checked |
