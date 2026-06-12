import { describe, expect, test } from "vitest";
import { fmtDateTime, fmtZonedDate } from "./format";

describe("fmtDateTime", () => {
  test("renders a UTC instant in Eastern daylight time (summer)", () => {
    expect(fmtDateTime("2026-06-02T20:10:00Z", "America/New_York")).toBe("Jun 2 · 4:10pm");
  });

  test("renders Eastern standard time (winter)", () => {
    expect(fmtDateTime("2026-01-15T20:10:00Z", "America/New_York")).toBe("Jan 15 · 3:10pm");
  });

  test("renders a different zone (Pacific)", () => {
    expect(fmtDateTime("2026-06-02T20:10:00Z", "America/Los_Angeles")).toBe("Jun 2 · 1:10pm");
  });
});

describe("fmtZonedDate", () => {
  test("uses the calendar date in the zone, shifting across midnight", () => {
    // 02:00 UTC on Jun 13 is 22:00 EDT on Jun 12.
    expect(fmtZonedDate("2026-06-13T02:00:00Z", "America/New_York")).toBe("Jun 12");
  });
});
