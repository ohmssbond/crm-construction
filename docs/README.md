# docs/ — index & reading order

Orientation for anyone (human or Claude Code) working on this app. Read this first, then the
file you need. **These docs are the source of truth; the running code follows them, not the
reverse.**

## What's here

| File | What it is | Read it when |
| --- | --- | --- |
| [`mvp-spec.md`](mvp-spec.md) | The feature set, entity model, roles, and scope (in/out). | You need to know *what* the app does or *why* a rule exists. |
| [`interface-design.md`](interface-design.md) | Screen-by-screen UX: navigation, every screen's layout/contents, and the flows between them. | You're designing or building a specific screen. |
| [`design-system.md`](design-system.md) | The visual contract: principles, color/type/spacing rules, the component library (§7), and governance (§11). | **Before any UI work.** This is the law. |
| [`design-tokens.css`](design-tokens.css) | Machine-readable single source of truth for every color, radius, shadow, and size. | You're writing styles. Import it; never hard-code a value. |
| [`component-gallery.html`](component-gallery.html) | Live reference rendering every component from the real tokens (open in a browser; toggle artisan/portal). | You need to see what a component should look like. |
| [`interface-mockup.html`](interface-mockup.html) | Clickable prototype of the full IA, both worlds, desktop + phone. | You want to click through screens and flows. |
| [`shell-build-spec.md`](shell-build-spec.md) | Step-by-step instructions to scaffold the runnable app shell in `src/`. | **You're starting the build.** Start here. |
| [`setup.md`](setup.md) | Supabase CLI, migrations, tenant IDs, and why RLS returns nothing until a user is authorized. | You're touching the database or auth. |
| [`next-steps.md`](next-steps.md) | Current status and the ordered backlog of remaining build work. | You want to know what to do next. |

## Source-of-truth hierarchy (resolve conflicts top-down)

1. `mvp-spec.md` — product truth (what & why).
2. `design-system.md` + `design-tokens.css` — visual truth (how it looks/behaves).
3. `component-gallery.html` — the rendered proof of #2; keep it in sync when components change.
4. `interface-design.md` / `interface-mockup.html` — screen-level intent and a clickable model.
5. `shell-build-spec.md` / `setup.md` / `next-steps.md` — how to build and what's next.

If two docs disagree, the higher one wins — and fix the lower one.

## Working rules

- **Theme from tokens only.** Every color/radius/shadow/size comes from `design-tokens.css`
  (exposed as Tailwind utilities per `shell-build-spec.md` §2). No hard-coded values.
- **Reuse components before inventing.** The library is `design-system.md` §7, shown live in
  `component-gallery.html`.
- **Extend the system, don't fork it.** If something's missing, add the token/component to the
  design system *first* (and update the gallery), then build with it. See `design-system.md` §11.
- **Two worlds, one accent swap.** Artisan = green, customer portal = blue; `data-world="portal"`
  is the only difference. Nothing else branches.
- **Cowork writes `docs/` only.** Design/spec changes land here; the runnable app is built in
  `src/` at the CLI. Keep this folder the canonical reference.

## Where to start building

New here and ready to write code? Go to **[`shell-build-spec.md`](shell-build-spec.md)** and
execute Steps 1–7 to stand up the on-system shell, then resume the backlog in
[`next-steps.md`](next-steps.md).
