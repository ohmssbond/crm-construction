import { describe, expect, test } from "vitest";
import {
  nestSchedule,
  normalizeScheduleFields,
  type DbScheduleRow,
  type DbScheduleTaskRow,
} from "./schedule";

const phase = (id: string, position: number, created_at = "2026-07-01T00:00:00Z"): DbScheduleRow => ({
  id,
  name: id,
  position,
  projected_date: null,
  projected_note: null,
  start_date: null,
  complete_date: null,
  created_at,
});

const task = (
  id: string,
  phase_id: string,
  position: number,
  created_at = "2026-07-01T00:00:00Z"
): DbScheduleTaskRow => ({ ...phase(id, position, created_at), phase_id });

describe("nestSchedule", () => {
  test("nests each task under its own phase", () => {
    const result = nestSchedule(
      [phase("permitting", 0), phase("construction", 1)],
      [task("zoning", "permitting", 0), task("foundation", "construction", 0)]
    );
    expect(result.map((p) => p.name)).toEqual(["permitting", "construction"]);
    expect(result[0].tasks.map((t) => t.name)).toEqual(["zoning"]);
    expect(result[1].tasks.map((t) => t.name)).toEqual(["foundation"]);
  });

  test("orders phases and tasks by position, ascending", () => {
    const result = nestSchedule(
      [phase("second", 1), phase("first", 0)],
      [task("b", "first", 1), task("a", "first", 0)]
    );
    expect(result.map((p) => p.name)).toEqual(["first", "second"]);
    expect(result[0].tasks.map((t) => t.name)).toEqual(["a", "b"]);
  });

  test("breaks a position tie with created_at", () => {
    const result = nestSchedule(
      [phase("later", 0, "2026-07-02T00:00:00Z"), phase("earlier", 0, "2026-07-01T00:00:00Z")],
      []
    );
    expect(result.map((p) => p.name)).toEqual(["earlier", "later"]);
  });

  test("maps snake_case columns to camelCase fields", () => {
    const row: DbScheduleRow = {
      id: "p1",
      name: "Permitting",
      position: 0,
      projected_date: "2026-11-15",
      projected_note: "pending survey",
      start_date: "2026-09-01",
      complete_date: null,
      created_at: "2026-07-01T00:00:00Z",
    };
    expect(nestSchedule([row], [])[0]).toEqual({
      id: "p1",
      name: "Permitting",
      position: 0,
      projectedDate: "2026-11-15",
      projectedNote: "pending survey",
      startDate: "2026-09-01",
      completeDate: null,
      tasks: [],
    });
  });

  test("drops orphan tasks whose phase is not in the list", () => {
    const result = nestSchedule([phase("a", 0)], [task("orphan", "missing-phase", 0)]);
    expect(result[0].tasks).toEqual([]);
  });

  test("returns an empty array for an empty schedule", () => {
    expect(nestSchedule([], [])).toEqual([]);
  });
});

describe("normalizeScheduleFields", () => {
  test("trims the name and passes dates through as DB columns", () => {
    expect(
      normalizeScheduleFields({
        name: "  Framing  ",
        projectedDate: "2026-12-01",
        projectedNote: "after inspection",
        startDate: "2026-11-01",
        completeDate: null,
      })
    ).toEqual({
      name: "Framing",
      projected_date: "2026-12-01",
      projected_note: "after inspection",
      start_date: "2026-11-01",
      complete_date: null,
    });
  });

  test("converts empty strings to null", () => {
    expect(
      normalizeScheduleFields({
        name: "Framing",
        projectedDate: "",
        projectedNote: "   ",
        startDate: "",
        completeDate: "",
      })
    ).toEqual({
      name: "Framing",
      projected_date: null,
      projected_note: null,
      start_date: null,
      complete_date: null,
    });
  });

  test("returns null when the name is blank, so callers can no-op", () => {
    const blank = {
      name: "   ",
      projectedDate: null,
      projectedNote: null,
      startDate: null,
      completeDate: null,
    };
    expect(normalizeScheduleFields(blank)).toBeNull();
  });
});
