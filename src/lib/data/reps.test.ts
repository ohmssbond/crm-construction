import { describe, test, expect } from "vitest";
import { partitionContacts, availableStaff } from "./reps";

describe("partitionContacts", () => {
  test("splits reps from everyone else by type", () => {
    const input = [
      { id: "a", type: "customer" },
      { id: "b", type: "rep" },
      { id: "c", type: "partner" },
      { id: "d", type: "rep" },
    ];
    const { customers, reps } = partitionContacts(input);
    expect(customers.map((c) => c.id)).toEqual(["a", "c"]);
    expect(reps.map((c) => c.id)).toEqual(["b", "d"]);
  });

  test("handles an empty list", () => {
    expect(partitionContacts([])).toEqual({ customers: [], reps: [] });
  });
});

describe("availableStaff", () => {
  const staff = [
    { user_id: "u1", full_name: "Doug", email: "doug@x.com" },
    { user_id: "u2", full_name: "Jesse", email: "jesse@x.com" },
  ];

  test("drops staff already assigned as a rep (matched by user_id)", () => {
    const reps = [{ id: "c1", user_id: "u2" }];
    expect(availableStaff(staff, reps).map((s) => s.user_id)).toEqual(["u1"]);
  });

  test("keeps all staff when none are reps yet", () => {
    expect(availableStaff(staff, []).map((s) => s.user_id)).toEqual(["u1", "u2"]);
  });

  test("ignores rep rows with a null user_id", () => {
    const reps = [{ id: "c1", user_id: null }];
    expect(availableStaff(staff, reps)).toHaveLength(2);
  });
});
