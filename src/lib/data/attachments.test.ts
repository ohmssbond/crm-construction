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
