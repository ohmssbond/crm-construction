import { describe, expect, test, vi } from "vitest";
import { groupAttachmentsByType, resolveCoverHrefs, resolveHeaderImages, withAttachmentUrls } from "./attachments";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// Minimal storage stub: batch returns signed[path]; single (transform) returns thumbs[path].
function fakeSupabase(signed: Record<string, string>, thumbs: Record<string, string>) {
  return {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: signed[p] ?? null })),
        }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: thumbs[path] ?? null },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("withAttachmentUrls", () => {
  const rows = [
    { id: "img", kind: "file", url: null, storage_path: "p/img.jpg", mime_type: "image/jpeg" },
    { id: "doc", kind: "file", url: null, storage_path: "p/doc.pdf", mime_type: "application/pdf" },
    { id: "lnk", kind: "link", url: "https://x.test/d", storage_path: null, mime_type: null },
  ];

  test("image files get both a full href and a thumbHref", async () => {
    const supa = fakeSupabase(
      { "p/img.jpg": "FULL_IMG", "p/doc.pdf": "FULL_DOC" },
      { "p/img.jpg": "THUMB_IMG" }
    );
    const out = await withAttachmentUrls(supa, rows);
    const img = out.find((r) => r.id === "img")!;
    expect(img.href).toBe("FULL_IMG");
    expect(img.thumbHref).toBe("THUMB_IMG");
  });

  test("non-image files get a full href but no thumbHref", async () => {
    const supa = fakeSupabase({ "p/img.jpg": "FULL_IMG", "p/doc.pdf": "FULL_DOC" }, { "p/img.jpg": "THUMB_IMG" });
    const out = await withAttachmentUrls(supa, rows);
    const doc = out.find((r) => r.id === "doc")!;
    expect(doc.href).toBe("FULL_DOC");
    expect(doc.thumbHref).toBeNull();
  });

  test("links keep their url as href and have no thumbHref", async () => {
    const supa = fakeSupabase({}, {});
    const out = await withAttachmentUrls(supa, rows);
    const lnk = out.find((r) => r.id === "lnk")!;
    expect(lnk.href).toBe("https://x.test/d");
    expect(lnk.thumbHref).toBeNull();
  });
});

// Minimal `.from("attachments").select(...).in(...)[.eq(...)]` stub, layered on the
// storage stub above so resolveCoverHrefs's internal withAttachmentUrls call resolves
// hrefs/thumbHrefs too. `fromSpy` lets tests assert whether a query was ever issued.
function fakeSupabaseWithAttachments(
  attachmentRows: { id: string; kind: string; mime_type: string | null; url: string | null; storage_path: string | null; is_shared: boolean }[],
  signed: Record<string, string> = {},
  thumbs: Record<string, string> = {}
) {
  const fromSpy = vi.fn((_table: string) => ({
    select: (_cols: string) => ({
      in: (_col: string, ids: string[]) => {
        let filtered = attachmentRows.filter((r) => ids.includes(r.id));
        const query = {
          eq: (col: "is_shared", val: boolean) => {
            filtered = filtered.filter((r) => r[col] === val);
            return query;
          },
          then: (resolve: (v: { data: typeof attachmentRows }) => void) =>
            resolve({ data: filtered }),
        };
        return query;
      },
    }),
  }));

  const storage = fakeSupabase(signed, thumbs).storage;
  return { from: fromSpy, storage } as unknown as SupabaseClient & { from: typeof fromSpy };
}

describe("resolveCoverHrefs", () => {
  const attachmentRows = [
    {
      id: "shared-img",
      kind: "file",
      mime_type: "image/jpeg",
      url: null,
      storage_path: "p/shared.jpg",
      is_shared: true,
    },
    {
      id: "unshared-img",
      kind: "file",
      mime_type: "image/jpeg",
      url: null,
      storage_path: "p/unshared.jpg",
      is_shared: false,
    },
  ];

  test("sharedOnly: true applies the is_shared filter, so an unshared cover resolves to nothing", async () => {
    const supa = fakeSupabaseWithAttachments(
      attachmentRows,
      { "p/unshared.jpg": "FULL_UNSHARED" },
      { "p/unshared.jpg": "THUMB_UNSHARED" }
    );
    const result = await resolveCoverHrefs(supa, ["unshared-img"], { sharedOnly: true });
    expect(result.has("unshared-img")).toBe(false);
  });

  test("sharedOnly: false returns that same id", async () => {
    const supa = fakeSupabaseWithAttachments(
      attachmentRows,
      { "p/unshared.jpg": "FULL_UNSHARED" },
      { "p/unshared.jpg": "THUMB_UNSHARED" }
    );
    const result = await resolveCoverHrefs(supa, ["unshared-img"], { sharedOnly: false });
    expect(result.get("unshared-img")).toEqual({ href: "FULL_UNSHARED", thumbHref: "THUMB_UNSHARED" });
  });

  test("an empty id list issues no query at all", async () => {
    const supa = fakeSupabaseWithAttachments(attachmentRows);
    const result = await resolveCoverHrefs(supa, [], { sharedOnly: false });
    expect(result.size).toBe(0);
    expect(supa.from).not.toHaveBeenCalled();
  });

  test("the returned map is keyed by attachment id with { href, thumbHref } values", async () => {
    const supa = fakeSupabaseWithAttachments(
      attachmentRows,
      { "p/shared.jpg": "FULL_SHARED" },
      { "p/shared.jpg": "THUMB_SHARED" }
    );
    const result = await resolveCoverHrefs(supa, ["shared-img"], { sharedOnly: true });
    expect(result.get("shared-img")).toEqual({ href: "FULL_SHARED", thumbHref: "THUMB_SHARED" });
  });
});

describe("resolveHeaderImages", () => {
  const shared = new Map([
    ["cover-id", { href: "COVER_FULL", thumbHref: "COVER_THUMB" }],
    ["hero-id", { href: "HERO_FULL", thumbHref: "HERO_THUMB" }],
  ]);
  const rows = [
    { id: "cover-id", storage_path: "p/cover.jpg" },
    { id: "hero-id", storage_path: "p/hero.jpg" },
  ];

  test("signs a header-size variant for each resolved slot", async () => {
    const supa = fakeSupabase({}, { "p/cover.jpg": "COVER_BIG", "p/hero.jpg": "HERO_BIG" });
    const out = await resolveHeaderImages(
      supa,
      { cover: "cover-id", hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.href)).toEqual(["COVER_BIG", "HERO_BIG"]);
    expect(out.startIndex).toBe(1);
  });

  test("falls back to the slot's own href when the variant sign fails", async () => {
    const supa = fakeSupabase({}, {});
    const out = await resolveHeaderImages(
      supa,
      { cover: null, hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.href)).toEqual(["HERO_FULL"]);
  });

  test("drops a slot whose id is not in the shared map", async () => {
    const supa = fakeSupabase({}, { "p/hero.jpg": "HERO_BIG" });
    const out = await resolveHeaderImages(
      supa,
      { cover: "not-shared", hero: "hero-id", before: null, after: null },
      shared,
      rows
    );
    expect(out.images.map((i) => i.slot)).toEqual(["hero"]);
  });

  test("returns an empty list when no slot is set", async () => {
    const supa = fakeSupabase({}, {});
    const out = await resolveHeaderImages(
      supa,
      { cover: null, hero: null, before: null, after: null },
      shared,
      rows
    );
    expect(out).toEqual({ images: [], startIndex: 0 });
  });
});
