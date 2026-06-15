@AGENTS.md

# Pre-session checklist

Before starting substantive work, confirm the environment is ready. Surface any
blocker before investing time — most past stalls were environmental, not logical.

- **Supabase reachable** — `supabase migration list` connects (CLI is installed and
  linked to project `uwvvkekxropproqdzych`). It also shows whether local migrations
  are applied to remote.
- **`.env.local` present** — needed for the dev server and seed scripts.
- **Tooling on PATH** — `node`/`npm`, `supabase`, `gh` (authed: `gh auth status`),
  `vercel` (linked: `.vercel/` present). Install/auth only what the task needs.
- **Chrome MCP** — only required for live-UI verification (`/verify`, `/run`); connect
  via `/chrome` if a task needs it. Not needed for code/test/build work.
- **macOS** — the project lives under `~/Documents`; the terminal/Claude needs Full
  Disk Access or sandboxed file reads/writes (e.g. `.env.local`) hit EPERM.

# Working conventions

- **Permissions:** routine dev commands (npm/test/build, local git, read-only
  supabase, localhost curl) are pre-allowed in `.claude/settings.json`. Outward or
  irreversible commands — `git push`, `supabase db push` — intentionally still
  prompt; treat each as a deliberate confirmation, not a blocker to allowlist.
- **Migrations:** add SQL under `supabase/migrations/`; apply to remote with
  `supabase db push` only when the change is explicitly meant to ship (it writes the
  production DB).
- **Tests/build:** `npm test` (Vitest) and `npm run build` are the gates before
  committing or merging.
