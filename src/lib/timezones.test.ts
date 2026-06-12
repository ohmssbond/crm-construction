import { describe, expect, test } from "vitest";
import { isValidTimezone, DEFAULT_TIMEZONE, TIMEZONES } from "./timezones";

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
