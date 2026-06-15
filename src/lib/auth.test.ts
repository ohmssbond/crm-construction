import { describe, expect, test } from "vitest";
import { productRole, isContact, resolveHome } from "./auth";

const staff = { org_id: "o1", roles: { crm: "artisan" } };
const worker = { org_id: "o1", roles: { timebilling: "worker" } };
const both = { org_id: "o1", roles: { crm: "owner", timebilling: "worker" } };
const contact = { org_id: "o1", contact_id: "c1" };

describe("productRole", () => {
  test("returns the role for a product present in the roles claim", () => {
    expect(productRole(staff, "crm")).toBe("artisan");
    expect(productRole(both, "timebilling")).toBe("worker");
  });
  test("returns null when the product or roles claim is absent", () => {
    expect(productRole(staff, "timebilling")).toBeNull();
    expect(productRole(contact, "crm")).toBeNull();
    expect(productRole(undefined, "crm")).toBeNull();
  });
});

describe("isContact", () => {
  test("true only when contact_id is present", () => {
    expect(isContact(contact)).toBe(true);
    expect(isContact(staff)).toBe(false);
    expect(isContact(undefined)).toBe(false);
  });
});

describe("resolveHome", () => {
  test("crm role wins → dashboard", () => {
    expect(resolveHome(staff)).toBe("/dashboard");
    expect(resolveHome(both)).toBe("/dashboard");
  });
  test("worker (no crm) → /log", () => {
    expect(resolveHome(worker)).toBe("/log");
  });
  test("contact → /my-projects", () => {
    expect(resolveHome(contact)).toBe("/my-projects");
  });
  test("nothing → /login", () => {
    expect(resolveHome(undefined)).toBe("/login");
    expect(resolveHome({ org_id: "o1" })).toBe("/login");
  });
});
