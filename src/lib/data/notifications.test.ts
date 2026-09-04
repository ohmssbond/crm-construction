import { describe, expect, test } from "vitest";
import { shouldNotifyOnShare } from "./notifications";

describe("shouldNotifyOnShare", () => {
  test("notifies when a never-announced update is first shared", () => {
    expect(shouldNotifyOnShare(false, true, null)).toBe(true);
  });

  test("does not notify when an already-announced update is re-shared", () => {
    expect(shouldNotifyOnShare(false, true, "2026-09-01T12:00:00Z")).toBe(false);
  });

  test("does not notify when an update is un-shared", () => {
    expect(shouldNotifyOnShare(true, false, null)).toBe(false);
    expect(shouldNotifyOnShare(true, false, "2026-09-01T12:00:00Z")).toBe(false);
  });

  test("does not notify on a no-op re-share of an already-shared update", () => {
    expect(shouldNotifyOnShare(true, true, null)).toBe(false);
  });

  test("does not notify when a private update stays private", () => {
    expect(shouldNotifyOnShare(false, false, null)).toBe(false);
  });
});
