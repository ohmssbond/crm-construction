import { describe, expect, test } from "vitest";
import { fmtDateTime, fmtZonedDate, fmtAddress, fmtJobLocation } from "./format";

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

describe("fmtAddress", () => {
  test("joins all structured parts in order", () => {
    expect(
      fmtAddress({
        bill_line1: "123 Main St",
        bill_line2: "Unit 4",
        bill_city: "Boston",
        bill_state: "MA",
        bill_postal_code: "02118",
        bill_country: "USA",
      })
    ).toBe("123 Main St, Unit 4, Boston, MA 02118, USA");
  });

  test("skips blank/missing parts", () => {
    expect(fmtAddress({ bill_line1: "123 Main St", bill_city: "Boston" })).toBe(
      "123 Main St, Boston"
    );
  });

  test("all empty → empty string", () => {
    expect(fmtAddress({})).toBe("");
    expect(fmtAddress({ bill_line1: "  ", bill_city: null })).toBe("");
  });
});

describe("fmtJobLocation", () => {
  test("joins job_* parts in order", () => {
    expect(
      fmtJobLocation({
        job_line1: "9 Site Rd",
        job_city: "Providence",
        job_state: "RI",
        job_postal_code: "02903",
      })
    ).toBe("9 Site Rd, Providence, RI 02903");
  });
  test("empty → empty string", () => {
    expect(fmtJobLocation({})).toBe("");
  });
});
