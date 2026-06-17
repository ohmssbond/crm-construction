import { describe, expect, test } from "vitest";
import {
  timeToMinutes,
  sumSegmentHours,
  roundQuarterHours,
  fmtTimeOfDay,
  nowTimeInZone,
  todayInZone,
} from "./worktime";

describe("timeToMinutes", () => {
  test("parses HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("08:05")).toBe(485);
    expect(timeToMinutes("16:30:00")).toBe(990);
  });
});

describe("sumSegmentHours", () => {
  test("sums closed segments only", () => {
    expect(
      sumSegmentHours([
        { time_in: "08:05", time_out: "09:40" },
        { time_in: "10:00", time_out: null },
      ])
    ).toBeCloseTo(1.5833, 3);
  });
  test("empty → 0", () => {
    expect(sumSegmentHours([])).toBe(0);
  });
  test("clamps an out-before-in (cross-midnight) segment to 0", () => {
    expect(sumSegmentHours([{ time_in: "22:00", time_out: "01:00" }])).toBe(0);
  });
});

describe("roundQuarterHours", () => {
  test("rounds to nearest 0.25", () => {
    expect(roundQuarterHours(1.5833)).toBe(1.5);
    expect(roundQuarterHours(1.63)).toBe(1.75);
    expect(roundQuarterHours(0)).toBe(0);
  });
});

describe("fmtTimeOfDay", () => {
  test("formats 12-hour", () => {
    expect(fmtTimeOfDay("08:05:00")).toBe("8:05 AM");
    expect(fmtTimeOfDay("16:30")).toBe("4:30 PM");
    expect(fmtTimeOfDay("00:00")).toBe("12:00 AM");
    expect(fmtTimeOfDay(null)).toBe("");
  });
});

describe("zone helpers", () => {
  test("nowTimeInZone is HH:MM", () => {
    expect(nowTimeInZone("America/New_York")).toMatch(/^\d{2}:\d{2}$/);
  });
  test("todayInZone is YYYY-MM-DD", () => {
    expect(todayInZone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
