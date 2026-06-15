import { afterEach, describe, expect, test } from "vitest";
import { isSuperAdmin } from "./auth-admin";

const original = process.env.SUPER_ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = original;
});

describe("isSuperAdmin", () => {
  test("matches an allowlisted email case-insensitively", () => {
    process.env.SUPER_ADMIN_EMAILS = "Doug@MyOtherBrain.com, ops@x.com";
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(true);
    expect(isSuperAdmin("OPS@X.COM")).toBe(true);
  });

  test("trims whitespace in both the allowlist and the input", () => {
    process.env.SUPER_ADMIN_EMAILS = "  doug@myotherbrain.com  ";
    expect(isSuperAdmin("  doug@myotherbrain.com ")).toBe(true);
  });

  test("rejects an email not in the list", () => {
    process.env.SUPER_ADMIN_EMAILS = "doug@myotherbrain.com";
    expect(isSuperAdmin("intruder@evil.com")).toBe(false);
  });

  test("returns false when the var is empty or unset", () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(false);
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(isSuperAdmin("doug@myotherbrain.com")).toBe(false);
  });

  test("returns false for null or empty email", () => {
    process.env.SUPER_ADMIN_EMAILS = "doug@myotherbrain.com";
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });
});
