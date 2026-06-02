# Artisan Project Hub

A mini-CRM / shared workspace for independent artisans (consultants, contractors,
tradespeople). An artisan runs a customer's project — documents, photos, status updates,
to-dos — and the contacts attached to that project get a **read-only** portal into what's
shared with them.

- **Product spec:** [`docs/mvp-spec.md`](docs/mvp-spec.md)
- **Setup / database ops:** [`docs/setup.md`](docs/setup.md)
- **Where we are + what's next:** [`docs/next-steps.md`](docs/next-steps.md)

## Stack

- **Next.js 16** (App Router, TypeScript) — ⚠️ see [`AGENTS.md`](AGENTS.md): this is a
  modified Next.js; read `node_modules/next/dist/docs/` before writing app code.
- **Tailwind CSS v4**
- **Supabase** — Auth, Postgres (with Row-Level Security), Storage. Clients live in
  `src/lib/supabase/` (`client.ts` browser, `server.ts` server components) and
  `src/middleware.ts` (session refresh).

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

Environment variables (already in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Database

Schema, RLS policies, the `project-files` storage bucket, and the two seed tenants are
**already applied to the linked remote project** (`uwvvkekxropproqdzych`). Migrations are
in `supabase/migrations/`. See [`docs/setup.md`](docs/setup.md) for how to link, push, and
seed from a fresh machine.

> **Note:** RLS denies all access until your auth user is linked to a tenant via
> `organization_members`. See `docs/setup.md`.
