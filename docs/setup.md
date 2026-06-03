# Setup & Database Operations

## Supabase CLI

Installed globally via Homebrew (location-independent):

```bash
brew install supabase/tap/supabase   # currently 2.104.0
supabase --version
```

## Linking the repo to the hosted project

Linking is **per-directory** — it must be run from the project root, and it writes the
project ref to `supabase/.temp/project-ref` (gitignored). If `supabase migration list
--linked` says *"Cannot find project ref"*, you're either in the wrong directory or not
linked here.

```bash
supabase login                                      # token stored in macOS Keychain
supabase link --project-ref uwvvkekxropproqdzych    # prompts for the DB password
```

Project ref: **`uwvvkekxropproqdzych`** (derived from `NEXT_PUBLIC_SUPABASE_URL`).

## Applying migrations & seed

```bash
supabase db push --include-seed     # applies pending migrations, then runs supabase/seed.sql
supabase migration list --linked    # verify: Local and Remote columns should match
```

Current state (already applied to remote):

| Migration | Contents |
| --- | --- |
| `20260602000001_init.sql` | 10 tables + indexes |
| `20260602000002_rls.sql` | helper functions, RLS policies, `project-files` storage bucket |
| `20260603000001_add_attachment_categories.sql` | (superseded by config below) |
| `20260603000002_tenant_config_and_files.sql` | org white-label cols, `file_categories`, attachment `kind`/`url` |
| `20260603000003_seed_tenants.sql` | tenant baseline: orgs + config + categories (idempotent) |

> **Why the tenant baseline is a migration, not `seed.sql`:** on a linked remote the CLI runs
> `seed.sql` only **once**, silently skipping later changes. Reference data that must stay in
> sync (the two tenants, their config, their categories) therefore lives in
> `20260603000003_seed_tenants.sql` with idempotent `on conflict` upserts. `seed.sql` is now
> empty except for the artisan-member-link note.

## Tenants

| Organization | id |
| --- | --- |
| Gargoyle Systems | `11111111-1111-1111-1111-111111111111` |
| J Huber Restorations | `22222222-2222-2222-2222-222222222222` |

### Per-tenant config (white-label)

Each org carries `primary_color`, `member_noun`, `client_noun`, and its own `file_categories`
(seeded per vertical — construction vs software). `attachments` can be an upload
(`kind='file'`, `storage_path`) or an external link (`kind='link'`, `url`), and
`attachments.category` is a composite FK into `file_categories(organization_id, key)` — so a
category must exist for the org before a file can use it. To retune a tenant, `update
organizations …` and edit its `file_categories` rows.

## RLS: why your queries return nothing

Every table denies access until the requesting user is authorized:

- **Artisan** access requires a row in `organization_members` linking the auth user to an
  org. Auth users can't be created from SQL — sign up through Supabase Auth first, then:

  ```sql
  insert into organization_members (organization_id, user_id, role)
  values ('22222222-2222-2222-2222-222222222222', '<your-auth-user-uuid>', 'owner');
  ```

  (`<your-auth-user-uuid>`: Dashboard → Authentication → Users.)

- **Contact (portal)** access requires `contacts.user_id` set and a `project_contacts` row
  attaching that contact to a project. Portal users see only attached projects, and within
  them only `is_shared` status updates / attachments. To-dos are never exposed.

## Regenerating TypeScript types (for the app, later)

```bash
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
