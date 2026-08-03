import { describe, expect, test } from "vitest";
import { isValidTimezone, DEFAULT_TIMEZONE, TIMEZONES, noonInZone, todayInZone } from "./timezones";

describe("timezones", () => {
  test("isValidTimezone accepts a curated zone", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
  });

  test("isValidTimezone rejects unknown or empty values", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  test("the default zone is one of the offered options", () => {
    expect(TIMEZONES.some((t) => t.value === DEFAULT_TIMEZONE)).toBe(true);
  });
});

describe("noonInZone", () => {
  /** What wall-clock date+hour does this instant render as in that zone? */
  const shownIn = (iso: string, timeZone: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });

  test("lands on noon of the requested date in that zone", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/New_York"), "America/New_York")).toBe(
      "08/01/2026, 12"
    );
  });

  test("same date in different zones is a different instant", () => {
    const east = noonInZone("2026-08-01", "America/New_York");
    const west = noonInZone("2026-08-01", "America/Los_Angeles");
    expect(new Date(west).getTime() - new Date(east).getTime()).toBe(3 * 60 * 60 * 1000);
  });

  test("is correct on both sides of a DST transition", () => {
    // 2026: US DST starts Mar 8, ends Nov 1.
    expect(shownIn(noonInZone("2026-03-07", "America/New_York"), "America/New_York")).toBe(
      "03/07/2026, 12"
    );
    expect(shownIn(noonInZone("2026-03-09", "America/New_York"), "America/New_York")).toBe(
      "03/09/2026, 12"
    );
    expect(shownIn(noonInZone("2026-11-02", "America/New_York"), "America/New_York")).toBe(
      "11/02/2026, 12"
    );
  });

  test("is correct in a zone with no DST", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/Phoenix"), "America/Phoenix")).toBe(
      "08/01/2026, 12"
    );
    expect(shownIn(noonInZone("2026-01-15", "Pacific/Honolulu"), "Pacific/Honolulu")).toBe(
      "01/15/2026, 12"
    );
  });

  test("returns a parseable ISO instant", () => {
    expect(Number.isNaN(new Date(noonInZone("2026-08-01", "America/Denver")).getTime())).toBe(
      false
    );
  });
});

describe("todayInZone", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(todayInZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a zone behind UTC can still be on the previous date", () => {
    // Honolulu is UTC-10 year-round, so it is never ahead of UTC.
    const utc = todayInZone("UTC");
    const hono = todayInZone("Pacific/Honolulu");
    expect(hono <= utc).toBe(true);
  });

  test("round-trips through noonInZone to the same date", () => {
    const zone = "America/Chicago";
    const today = todayInZone(zone);
    const shown = new Date(noonInZone(today, zone)).toLocaleDateString("en-CA", {
      timeZone: zone,
    });
    expect(shown).toBe(today);
  });
});
