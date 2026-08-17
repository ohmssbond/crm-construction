import { describe, expect, test } from "vitest";
import {
  CONTACT_TYPES,
  typeHasCompany,
  isSelectableContactType,
} from "./contactTypes";

describe("CONTACT_TYPES", () => {
  test("lists the five selectable types in presentation order", () => {
    expect(CONTACT_TYPES.map((t) => t.value)).toEqual([
      "customer",
      "partner",
      "prospect",
      "government",
      "other",
    ]);
  });

  test("never offers rep — it is a bridge row created only by assignRep", () => {
    expect(CONTACT_TYPES.some((t) => (t.value as string) === "rep")).toBe(false);
  });

  test("gives every type a human label", () => {
    expect(CONTACT_TYPES.map((t) => t.label)).toEqual([
      "Customer",
      "Partner",
      "Prospect",
      "Government",
      "Other",
    ]);
  });
});

describe("typeHasCompany", () => {
  test("is true for the organizational types", () => {
    expect(typeHasCompany("partner")).toBe(true);
    expect(typeHasCompany("government")).toBe(true);
    expect(typeHasCompany("other")).toBe(true);
  });

  test("is false for people and for the tenant's own staff", () => {
    expect(typeHasCompany("customer")).toBe(false);
    expect(typeHasCompany("prospect")).toBe(false);
    expect(typeHasCompany("rep")).toBe(false);
  });

  test("is false for an unknown string", () => {
    expect(typeHasCompany("")).toBe(false);
    expect(typeHasCompany("nonsense")).toBe(false);
  });
});

describe("isSelectableContactType", () => {
  test("accepts every type the form offers", () => {
    for (const t of CONTACT_TYPES) {
      expect(isSelectableContactType(t.value)).toBe(true);
    }
  });

  test("rejects rep, so the contact form can never set one", () => {
    expect(isSelectableContactType("rep")).toBe(false);
  });

  test("rejects unknown strings", () => {
    expect(isSelectableContactType("")).toBe(false);
    expect(isSelectableContactType("admin")).toBe(false);
  });
});
