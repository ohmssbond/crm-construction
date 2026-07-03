import { describe, it, expect } from "vitest";
import { productLabel } from "./nav";

describe("productLabel", () => {
  it("labels the artisan world as the Project Hub product", () => {
    expect(productLabel("artisan")).toBe("Project Hub");
  });

  it("labels the portal world as the customer portal", () => {
    expect(productLabel("portal")).toBe("Customer portal");
  });

  it("labels the timebilling world as Time & Billing", () => {
    expect(productLabel("timebilling")).toBe("Time & Billing");
  });
});
