import { describe, expect, test } from "vitest";
import {
  isValidTimezone,
  DEFAULT_TIMEZONE,
  TIMEZONES,
  noonInZone,
  todayInZone,
  dateInZone,
} from "./timezones";

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
  const shownIn = (iso: string | null, timeZone: string) => {
    expect(iso).not.toBeNull();
    return new Date(iso as string).toLocaleString("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
  };

  test("lands on noon of the requested date in that zone", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/New_York"), "America/New_York")).toBe(
      "08/01/2026, 12"
    );
  });

  test("same date in different zones is a different instant", () => {
    const east = noonInZone("2026-08-01", "America/New_York");
    const west = noonInZone("2026-08-01", "America/Los_Angeles");
    expect(east).not.toBeNull();
    expect(west).not.toBeNull();
    expect(new Date(west as string).getTime() - new Date(east as string).getTime()).toBe(
      3 * 60 * 60 * 1000
    );
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
    const instant = noonInZone("2026-08-01", "America/Denver");
    expect(instant).not.toBeNull();
    expect(Number.isNaN(new Date(instant as string).getTime())).toBe(false);
  });

  // Regression: the previous implementation derived the target zone's offset via
  // `new Date(x.toLocaleString("en-US", { timeZone }))`, which round-trips through
  // the HOST runtime's own default timezone. That cancels out correctly only when
  // the host zone isn't itself mid-transition. On a host running America/New_York,
  // requesting Pacific/Honolulu for 2026-03-08 (the US spring-forward date) lands
  // the intermediate wall-clock parse in New York's skipped hour, and the old code
  // returned 2026-03-08T21:00:00.000Z (11:00 AM in Honolulu, not noon).
  //
  // A per-case `TZ=` env var can't be set from inside a single Vitest run, so this
  // instead asserts the property the old code violated — "renders as noon in the
  // target zone" — for every US spring-forward date across a range of years,
  // including the exact date from the reviewer's repro. This passes today
  // (process TZ is whatever CI/dev happens to run under) and would have failed
  // under the old implementation specifically when run with TZ=America/New_York
  // (or any other zone whose spring-forward falls on the same date).
  test("lands on noon in the target zone even across a host-zone spring-forward", () => {
    const usSpringForwardDates = [
      "2024-03-10",
      "2025-03-09",
      "2026-03-08",
      "2027-03-14",
      "2028-03-12",
    ];
    const targets = ["Pacific/Honolulu", "America/Los_Angeles", "America/Denver", "America/Chicago"];
    for (const date of usSpringForwardDates) {
      for (const tz of targets) {
        expect(shownIn(noonInZone(date, tz), tz)).toBe(
          `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}, 12`
        );
      }
    }
  });

  test("the reviewer's specific repro renders as noon in Honolulu", () => {
    expect(shownIn(noonInZone("2026-03-08", "Pacific/Honolulu"), "Pacific/Honolulu")).toBe(
      "03/08/2026, 12"
    );
  });

  // Server Action arguments are client-controlled, so noonInZone must be total: it
  // validates rather than trusting the shape, and returns null instead of throwing or
  // silently writing a corrupted instant.
  test("returns null for a malformed date string", () => {
    expect(noonInZone("2026-01-99999999999", "America/New_York")).toBeNull();
    expect(noonInZone("1999-999999999-01", "America/New_York")).toBeNull();
    expect(noonInZone("not-a-date", "America/New_York")).toBeNull();
  });

  test("returns null for a rolled-over calendar date", () => {
    expect(noonInZone("2026-02-30", "America/New_York")).toBeNull();
    expect(noonInZone("2026-13-01", "America/New_York")).toBeNull();
    expect(noonInZone("2026-04-31", "America/New_York")).toBeNull();
  });

  test("returns null for a non-4-digit year", () => {
    expect(noonInZone("26-08-01", "America/New_York")).toBeNull();
    expect(noonInZone("999-08-01", "America/New_York")).toBeNull();
    expect(noonInZone("99999-08-01", "America/New_York")).toBeNull();
  });

  test("valid dates are unaffected", () => {
    expect(shownIn(noonInZone("2026-08-01", "America/New_York"), "America/New_York")).toBe(
      "08/01/2026, 12"
    );
    expect(shownIn(noonInZone("2024-02-29", "America/New_York"), "America/New_York")).toBe(
      "02/29/2024, 12"
    );
  });
});

describe("dateInZone", () => {
  test("renders a fixed instant as different calendar dates in two zones", () => {
    // 2026-08-01T02:00:00Z is still July 31 evening on the US west coast but already
    // August 1 morning in a zone far ahead of UTC.
    const instant = new Date("2026-08-01T02:00:00.000Z");
    expect(dateInZone(instant, "America/Los_Angeles")).toBe("2026-07-31");
    expect(dateInZone(instant, "Pacific/Kiritimati")).toBe("2026-08-01");
  });
});

describe("todayInZone", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(todayInZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Replaces a prior version of this test that only asserted `hono <= utc`,
  // which also passes against a zone-blind implementation that ignores its
  // argument and returns the same string for every zone (hono === utc
  // satisfies `<=` too). To discriminate without mocking the clock, this picks
  // two real zones whose UTC offsets are so far apart (+14 and -12, a 26-hour
  // span) that their calendar dates can NEVER coincide at any real instant:
  // walking through every possible UTC hour of day, the +14 zone's date is
  // "today" or "tomorrow" (relative to UTC) while the -12 zone's is "yesterday"
  // or "today" — the two ranges never overlap on the same value. So `ahead >
  // behind` is a fixed, always-true property of the real calendar, but a
  // zone-blind implementation returns the same string for both and fails `>`.
  test("a zone far ahead of UTC is never on the same date as a zone far behind", () => {
    const ahead = todayInZone("Pacific/Kiritimati"); // UTC+14
    const behind = todayInZone("Etc/GMT+12"); // UTC-12 (Etc/GMT sign is inverted)
    expect(ahead > behind).toBe(true);
  });

  test("round-trips through noonInZone to the same date", () => {
    const zone = "America/Chicago";
    const today = todayInZone(zone);
    const noon = noonInZone(today, zone);
    expect(noon).not.toBeNull();
    const shown = new Date(noon as string).toLocaleDateString("en-CA", {
      timeZone: zone,
    });
    expect(shown).toBe(today);
  });
});
