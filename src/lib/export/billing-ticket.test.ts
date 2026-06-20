import { describe, expect, test } from "vitest";
import { jobBillingRows, type BillingReport } from "./billing-ticket";

function baseReport(over: Partial<BillingReport> = {}): BillingReport {
  return {
    job: { name: "Job A", siteAddress: "1 Main St", description: "Fix it", notes: "be careful" },
    customer: { name: "Acme", email: "a@acme.com", phone: "555-1212" },
    time: { workers: [], grandTotalHours: 0 },
    materials: { lines: [], subtotal: 0, currency: "USD" },
    ...over,
  };
}

describe("jobBillingRows — time pivot", () => {
  test("a day with two segments → one row with both In/Out pairs", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 7,
          workers: [
            {
              label: "Jose",
              totalHours: 7,
              days: [
                {
                  date: "2026-06-20",
                  total: 7,
                  segments: [
                    { in: "08:00:00", out: "12:00:00" },
                    { in: "13:00:00", out: "16:00:00" },
                  ],
                },
              ],
            },
          ],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "12:00 PM", in2: "1:00 PM", out2: "4:00 PM", totalHours: "7.00" },
    ]);
  });

  test("a day with one segment → In/Out second pair blank", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 4,
          workers: [{ label: "Jose", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "08:00:00", out: "12:00:00" }] }] }],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "12:00 PM", in2: "", out2: "", totalHours: "4.00" },
    ]);
  });

  test("a day with three segments → overflow continuation row (tech/date/total blank)", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 8,
          workers: [
            {
              label: "Jose",
              totalHours: 8,
              days: [
                {
                  date: "2026-06-20",
                  total: 8,
                  segments: [
                    { in: "08:00:00", out: "10:00:00" },
                    { in: "10:30:00", out: "12:00:00" },
                    { in: "13:00:00", out: "17:30:00" },
                  ],
                },
              ],
            },
          ],
        },
      })
    );
    expect(r.timeRows).toEqual([
      { tech: "Jose", date: "Jun 20", in1: "8:00 AM", out1: "10:00 AM", in2: "10:30 AM", out2: "12:00 PM", totalHours: "8.00" },
      { tech: "", date: "", in1: "1:00 PM", out1: "5:30 PM", in2: "", out2: "", totalHours: "" },
    ]);
  });

  test("a day with zero closed segments contributes no rows", () => {
    const r = jobBillingRows(
      baseReport({
        time: { grandTotalHours: 0, workers: [{ label: "Jose", totalHours: 0, days: [{ date: "2026-06-20", total: 0, segments: [] }] }] },
      })
    );
    expect(r.timeRows).toEqual([]);
  });

  test("two techs each start their own row", () => {
    const r = jobBillingRows(
      baseReport({
        time: {
          grandTotalHours: 8,
          workers: [
            { label: "Jose", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "08:00:00", out: "12:00:00" }] }] },
            { label: "Mia", totalHours: 4, days: [{ date: "2026-06-20", total: 4, segments: [{ in: "09:00:00", out: "13:00:00" }] }] },
          ],
        },
      })
    );
    expect(r.timeRows.map((t) => t.tech)).toEqual(["Jose", "Mia"]);
  });
});

describe("jobBillingRows — header, materials, totals", () => {
  test("maps customer/site/description/notes and totals", () => {
    const r = jobBillingRows(
      baseReport({
        time: { grandTotalHours: 7.5, workers: [] },
        materials: {
          subtotal: 42.5,
          currency: "USD",
          lines: [
            { item: "Pipe", qty: "3", unitCost: "4.50", extended: 13.5, currency: "USD" },
            { item: "Glue", qty: "1", unitCost: null, extended: 0, currency: "USD" },
          ],
        },
      })
    );
    expect(r.customer).toEqual({ name: "Acme", email: "a@acme.com", phone: "555-1212" });
    expect(r.siteAddress).toBe("1 Main St");
    expect(r.description).toBe("Fix it");
    expect(r.notes).toBe("be careful");
    expect(r.totalLaborHours).toBe(7.5);
    expect(r.totalMaterialCost).toBe(42.5);
    expect(r.currency).toBe("USD");
    expect(r.materialRows).toEqual([
      { item: "Pipe", qty: "3", unitCost: 4.5, cost: 13.5 },
      { item: "Glue", qty: "1", unitCost: null, cost: 0 },
    ]);
  });
});
