# Photos & Files Grouped By Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the project Photos & Files tab (artisan page and customer portal), render attachments grouped into type sections — groups ordered alphabetically by category label, newest upload first within each group.

**Architecture:** A single pure helper `groupAttachmentsByType` (in `src/lib/data/attachments.ts`) turns the flat, newest-first attachment list plus the tenant's file-category list into an ordered array of `{ key, label, items }` groups. Both page components map over those groups, reusing the existing `FileTile` rendering inside each group. The portal data loader is extended to also fetch the tenant's file-category labels (RLS already permits it).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase JS, Vitest (added in Task 1 — no test runner exists yet).

---

## File Structure

- **Create** `vitest.config.ts` — minimal Vitest config (node env, `@/` alias).
- **Modify** `package.json` — add `vitest` devDependency + `test` scripts.
- **Modify** `src/lib/data/attachments.ts` — add pure `groupAttachmentsByType` helper next to `withAttachmentUrls`.
- **Create** `src/lib/data/attachments.test.ts` — unit tests for the helper.
- **Modify** `src/lib/data/projects.ts` — add `created_at` to the attachments select.
- **Modify** `src/lib/data/portal.ts` — add `created_at` to attachments select; add `organization_id` to the project select; load `file_categories` for the project's org; return `fileCategories`.
- **Modify** `src/app/(artisan)/projects/[id]/page.tsx` — render grouped sections.
- **Modify** `src/app/(portal)/my-projects/[id]/page.tsx` — render grouped sections.

---

## Task 1: Set up Vitest

No test runner exists in the repo. This task adds the minimal Vitest setup so later TDD tasks can run.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json`, add to the `"scripts"` block (alongside `dev`/`build`/`start`/`lint`):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner works with no tests yet**

Run: `npx vitest run --passWithNoTests`
Expected: exits 0 with "No test files found, exiting with code 0".

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "$(cat <<'EOF'
Add Vitest for unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `groupAttachmentsByType` helper (TDD)

**Files:**
- Create: `src/lib/data/attachments.test.ts`
- Modify: `src/lib/data/attachments.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/attachments.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { groupAttachmentsByType } from "./attachments";

type Att = { id: string; category: string; kind: string };

const cats = [
  { key: "before_photo", label: "Before photo" },
  { key: "invoice", label: "Invoice" },
  { key: "plans", label: "Plans" },
  { key: "permits", label: "Permits" },
  { key: "proposal", label: "Proposal" },
];

describe("groupAttachmentsByType", () => {
  test("orders groups alphabetically by label", () => {
    const items: Att[] = [
      { id: "1", category: "plans", kind: "file" },
      { id: "2", category: "before_photo", kind: "file" },
      { id: "3", category: "invoice", kind: "file" },
    ];
    const groups = groupAttachmentsByType(items, cats);
    expect(groups.map((g) => g.label)).toEqual(["Before photo", "Invoice", "Plans"]);
  });

  test("preserves input (newest-first) order within a group", () => {
    const items: Att[] = [
      { id: "newer", category: "plans", kind: "file" },
      { id: "older", category: "plans", kind: "file" },
    ];
    const [group] = groupAttachmentsByType(items, cats);
    expect(group.items.map((i) => i.id)).toEqual(["newer", "older"]);
  });

  test("excludes categories with no attachments", () => {
    const items: Att[] = [{ id: "1", category: "plans", kind: "file" }];
    const groups = groupAttachmentsByType(items, cats);
    expect(groups.map((g) => g.key)).toEqual(["plans"]);
  });

  test("falls back to the raw key when the category is unknown", () => {
    const items: Att[] = [{ id: "1", category: "legacy_x", kind: "file" }];
    const [group] = groupAttachmentsByType(items, cats);
    expect(group.key).toBe("legacy_x");
    expect(group.label).toBe("legacy_x");
  });

  test("places a link in its category's group alongside files", () => {
    const items: Att[] = [
      { id: "doc", category: "proposal", kind: "file" },
      { id: "gdoc", category: "proposal", kind: "link" },
    ];
    const [group] = groupAttachmentsByType(items, cats);
    expect(group.label).toBe("Proposal");
    expect(group.items.map((i) => i.id)).toEqual(["doc", "gdoc"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- attachments`
Expected: FAIL — `groupAttachmentsByType` is not exported from `./attachments`.

- [ ] **Step 3: Implement the helper**

In `src/lib/data/attachments.ts`, append this exported function (keep `withAttachmentUrls` as-is):

```ts
type Categorized = { category: string };
type CategoryRef = { key: string; label: string };

/**
 * Groups attachments by their category for display. Builds a group only for
 * categories present in `attachments` (empty categories are omitted), resolves
 * each group's display `label` from `categories` (falling back to the raw key),
 * and returns the groups ordered alphabetically by label. Item order within a
 * group is preserved from the input — callers pass attachments already sorted
 * newest-first, so groups inherit that order.
 */
export function groupAttachmentsByType<T extends Categorized>(
  attachments: T[],
  categories: CategoryRef[]
): { key: string; label: string; items: T[] }[] {
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const order: string[] = [];
  const byKey = new Map<string, T[]>();

  for (const a of attachments) {
    let bucket = byKey.get(a.category);
    if (!bucket) {
      bucket = [];
      byKey.set(a.category, bucket);
      order.push(a.category);
    }
    bucket.push(a);
  }

  return order
    .map((key) => ({
      key,
      label: labelByKey.get(key) ?? key,
      items: byKey.get(key) as T[],
    }))
    .sort((x, y) =>
      x.label.localeCompare(y.label, undefined, { sensitivity: "base" })
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- attachments`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/attachments.ts src/lib/data/attachments.test.ts
git commit -m "$(cat <<'EOF'
Add groupAttachmentsByType helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `created_at` to the artisan attachments query

**Files:**
- Modify: `src/lib/data/projects.ts:85-88`

- [ ] **Step 1: Add `created_at` to the select**

In `src/lib/data/projects.ts`, change the attachments query select. Find:

```ts
      supabase
        .from("attachments")
        .select("id, filename, category, kind, url, is_shared, storage_path")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
```

Replace with:

```ts
      supabase
        .from("attachments")
        .select("id, filename, category, kind, url, is_shared, storage_path, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
```

- [ ] **Step 2: Verify the type-check / build passes**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/projects.ts
git commit -m "$(cat <<'EOF'
Select created_at on project attachments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Load file-category labels in the portal loader

The portal page needs category labels to render group headers, and `organization_id` to scope the category read to the right tenant.

**Files:**
- Modify: `src/lib/data/portal.ts` (project select ~line 81; attachments select ~line 93-98; `Promise.all` destructure + return ~line 86-115)

- [ ] **Step 1: Add `organization_id` to the project select**

In `getPortalProject`, find:

```ts
    .from("projects")
    .select("id, name, stage, customer:customers(name)")
    .eq("id", id)
    .maybeSingle();
```

Replace with:

```ts
    .from("projects")
    .select("id, name, stage, organization_id, customer:customers(name)")
    .eq("id", id)
    .maybeSingle();
```

- [ ] **Step 2: Add `created_at` to the attachments select and add the file_categories query**

Find the `Promise.all` block:

```ts
  const [updates, attachments, tasks] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, body, created_at, is_shared")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, filename, category, kind, url, is_shared, storage_path")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    // No is_shared filter — RLS returns only tasks this contact owns or that are shared.
    supabase
      .from("todos")
      .select("id, body, due_date, done, completed_at")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);
```

Replace with:

```ts
  const [updates, attachments, tasks, fileCategories] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, body, created_at, is_shared")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("id, filename, category, kind, url, is_shared, storage_path, created_at")
      .eq("project_id", id)
      .eq("is_shared", true)
      .order("created_at", { ascending: false }),
    // No is_shared filter — RLS returns only tasks this contact owns or that are shared.
    supabase
      .from("todos")
      .select("id, body, due_date, done, completed_at")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false }),
    // Category labels for grouping the files view; contact_read RLS permits this.
    supabase
      .from("file_categories")
      .select("key, label")
      .eq("organization_id", project.organization_id),
  ]);
```

- [ ] **Step 3: Return `fileCategories`**

Find the return object:

```ts
  return {
    project: { ...project, customer: one(project.customer) },
    updates: updates.data ?? [],
    attachments: await withAttachmentUrls(supabase, attachments.data ?? []),
    tasks: tasks.data ?? [],
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
  };
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/portal.ts
git commit -m "$(cat <<'EOF'
Load file-category labels in portal project loader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Grouped rendering on the artisan project page

**Files:**
- Modify: `src/app/(artisan)/projects/[id]/page.tsx` (imports ~line 15; render block ~line 116-139)

- [ ] **Step 1: Import the helper**

In `src/app/(artisan)/projects/[id]/page.tsx`, find:

```ts
import { getProjectDetail } from "@/lib/data/projects";
```

Add directly below it:

```ts
import { groupAttachmentsByType } from "@/lib/data/attachments";
```

- [ ] **Step 2: Replace the flat grid with grouped sections**

Find the Photos & Files content block:

```tsx
                {attachments.length === 0 ? (
                  <EmptyState glyph="🗂" title="No files yet." />
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {attachments.map((a) => {
                      const style =
                        a.kind === "link"
                          ? { glyph: "🔗", bg: "#6a7c8a" }
                          : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                      return (
                        <FileTile
                          key={a.id}
                          name={a.filename ?? a.url ?? "Link"}
                          glyph={style.glyph}
                          bg={style.bg}
                          shared={a.is_shared}
                          href={a.href}
                          shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                        />
                      );
                    })}
                  </div>
                )}
```

Replace with:

```tsx
                {attachments.length === 0 ? (
                  <EmptyState glyph="🗂" title="No files yet." />
                ) : (
                  <div className="flex flex-col gap-4">
                    {groupAttachmentsByType(attachments, fileCategories).map((group) => (
                      <div key={group.key} className="flex flex-col gap-2">
                        <h4 className="text-meta font-semibold text-faint">
                          {group.label} ({group.items.length})
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {group.items.map((a) => {
                            const style =
                              a.kind === "link"
                                ? { glyph: "🔗", bg: "#6a7c8a" }
                                : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                            return (
                              <FileTile
                                key={a.id}
                                name={a.filename ?? a.url ?? "Link"}
                                glyph={style.glyph}
                                bg={style.bg}
                                shared={a.is_shared}
                                href={a.href}
                                shareAction={setAttachmentShared.bind(null, project.id, a.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(artisan)/projects/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Group Photos & Files by type on artisan project page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Grouped rendering on the portal project page

**Files:**
- Modify: `src/app/(portal)/my-projects/[id]/page.tsx` (imports ~line 8; destructure ~line 32; render block ~line 64-86)

- [ ] **Step 1: Import the helper**

In `src/app/(portal)/my-projects/[id]/page.tsx`, find:

```ts
import { getPortalProject } from "@/lib/data/portal";
```

Add directly below it:

```ts
import { groupAttachmentsByType } from "@/lib/data/attachments";
```

- [ ] **Step 2: Destructure `fileCategories`**

Find:

```ts
  const { project, updates, attachments, tasks } = detail;
```

Replace with:

```ts
  const { project, updates, attachments, tasks, fileCategories } = detail;
```

- [ ] **Step 3: Replace the flat grid with grouped sections**

Find the Photos & Files content block:

```tsx
            content:
              attachments.length === 0 ? (
                <EmptyState glyph="🗂" title="No files shared yet." />
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {attachments.map((a) => {
                    const style =
                      a.kind === "link"
                        ? { glyph: "🔗", bg: "#6a7c8a" }
                        : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                    return (
                      <FileTile
                        key={a.id}
                        name={a.filename ?? a.url ?? "Link"}
                        glyph={style.glyph}
                        bg={style.bg}
                        readOnly
                        href={a.href}
                      />
                    );
                  })}
                </div>
              ),
```

Replace with:

```tsx
            content:
              attachments.length === 0 ? (
                <EmptyState glyph="🗂" title="No files shared yet." />
              ) : (
                <div className="flex flex-col gap-4">
                  {groupAttachmentsByType(attachments, fileCategories).map((group) => (
                    <div key={group.key} className="flex flex-col gap-2">
                      <h4 className="text-meta font-semibold text-faint">
                        {group.label} ({group.items.length})
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {group.items.map((a) => {
                          const style =
                            a.kind === "link"
                              ? { glyph: "🔗", bg: "#6a7c8a" }
                              : FILE_STYLE[a.category] ?? FILE_FALLBACK;
                          return (
                            <FileTile
                              key={a.id}
                              name={a.filename ?? a.url ?? "Link"}
                              glyph={style.glyph}
                              bg={style.bg}
                              readOnly
                              href={a.href}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ),
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/my-projects/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Group Photos & Files by type on portal project page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the `groupAttachmentsByType` suite).

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds; all routes compile with no TypeScript or lint errors.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

Run: `npm run dev`, open a project with files in several categories (both the artisan view and the customer portal). Confirm:
- Files appear under type headers ordered alphabetically by label.
- Within a type, the newest upload is first.
- A category with no files shows no section.
- An external link appears inside its category's group with the 🔗 glyph.

---

## Notes for the implementer

- `groupAttachmentsByType` is pure and Supabase-free; it composes with the output of `withAttachmentUrls` (which only adds an `href` field — the helper's `T extends { category: string }` constraint is unaffected).
- The query-level `.order("created_at", { ascending: false })` already produces newest-first input, and the helper preserves input order within each group — so no extra sort is needed for the within-group ordering.
- `text-meta`, `text-faint`, and `font-semibold` are existing utility classes already used on these pages; the group header reuses them for visual consistency.
- This plan does not touch upload, link, sharing, or category-management flows.
