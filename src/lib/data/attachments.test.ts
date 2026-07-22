import { describe, expect, test } from "vitest";
import { groupAttachmentsByType, withAttachmentUrls } from "./attachments";
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
