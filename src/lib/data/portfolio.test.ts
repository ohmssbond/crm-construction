import { describe, expect, test } from "vitest";
import {
  stageToStatus,
  isImageAttachment,
  resolveSlot,
  beforeAfterVisible,
  groupPhotosByPhase,
  validatePhotoAssignment,
} from "./portfolio";

describe("stageToStatus", () => {
  test("maps the four real stages", () => {
    expect(stageToStatus("proposal")).toEqual({ label: "Proposal", tone: "proposal" });
    expect(stageToStatus("signed")).toEqual({ label: "Signed", tone: "signed" });
    expect(stageToStatus("in_progress")).toEqual({ label: "Active", tone: "active" });
    expect(stageToStatus("completed")).toEqual({ label: "Completed", tone: "completed" });
  });
  test("falls back to Proposal for an unknown stage", () => {
    expect(stageToStatus("whatever")).toEqual({ label: "Proposal", tone: "proposal" });
  });
});

describe("isImageAttachment", () => {
  test("true only for file kind with an image/* mime", () => {
    expect(isImageAttachment({ kind: "file", mime_type: "image/jpeg" })).toBe(true);
    expect(isImageAttachment({ kind: "file", mime_type: "application/pdf" })).toBe(false);
    expect(isImageAttachment({ kind: "file", mime_type: null })).toBe(false);
    expect(isImageAttachment({ kind: "link", mime_type: "image/png" })).toBe(false);
  });
});

describe("resolveSlot", () => {
  const map = new Map([
    ["a", { href: "https://signed/a", thumbHref: "https://signed/a-thumb" }],
    ["b", { href: null, thumbHref: null }],
  ]);
  test("resolves a shared image with an href", () => {
    expect(resolveSlot("a", map)).toEqual({ href: "https://signed/a", thumbHref: "https://signed/a-thumb" });
  });
  test("returns null for missing id, null href, or null slot", () => {
    expect(resolveSlot(null, map)).toBeNull();
    expect(resolveSlot("missing", map)).toBeNull();
    expect(resolveSlot("b", map)).toBeNull();
  });
});

describe("beforeAfterVisible", () => {
  test("true only when both resolve", () => {
    expect(beforeAfterVisible({ href: "x", thumbHref: null }, { href: "y", thumbHref: null })).toBe(true);
    expect(beforeAfterVisible({ href: "x", thumbHref: null }, null)).toBe(false);
    expect(beforeAfterVisible(null, null)).toBe(false);
  });
});

describe("groupPhotosByPhase", () => {
  test("buckets into before/during/after/general in fixed order, omitting empty groups", () => {
    const groups = groupPhotosByPhase([
      { id: "1", href: "h1", thumbHref: null, phase: "after" },
      { id: "2", href: "h2", thumbHref: null, phase: "before" },
      { id: "3", href: "h3", thumbHref: null, phase: null },
      { id: "4", href: "h4", thumbHref: null, phase: "before" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["before", "after", "general"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["2", "4"]);
    expect(groups.find((g) => g.key === "general")!.label).toBe("Photos");
  });
  test("empty input → empty array", () => {
    expect(groupPhotosByPhase([])).toEqual([]);
  });
});

describe("validatePhotoAssignment", () => {
  const img = { project_id: "p1", kind: "file", mime_type: "image/png" };
  test("passes for a same-project image", () => {
    expect(validatePhotoAssignment(img, "p1")).toBeNull();
  });
  test("rejects missing, cross-project, and non-image", () => {
    expect(validatePhotoAssignment(null, "p1")).toBe("Photo not found.");
    expect(validatePhotoAssignment({ ...img, project_id: "other" }, "p1")).toBe(
      "Photo belongs to another project."
    );
    expect(validatePhotoAssignment({ ...img, mime_type: "application/pdf" }, "p1")).toBe(
      "Only photos can be tagged."
    );
  });
});
