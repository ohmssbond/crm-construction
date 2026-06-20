import { fmtTimeOfDay } from "@/lib/data/worktime";
import { fmtDate } from "@/lib/data/format";

/** The subset of the getJobReport return that the billing ticket needs. The full
 *  report (which has more fields) is structurally assignable to this. */
export type BillingReport = {
  job: { name: string; siteAddress: string; description: string | null; notes: string | null };
  customer: { name: string; email: string | null; phone: string | null };
  time: {
    workers: {
      label: string;
      totalHours: number;
      days: { date: string; total: number; segments: { in: string; out: string }[] }[];
    }[];
    grandTotalHours: number;
  };
  materials: {
    lines: { item: string; qty: string; unitCost: string | null; extended: number; currency: string }[];
    subtotal: number;
    currency: string;
  };
};

export type BillingRows = {
  customer: { name: string; phone: string | null; email: string | null };
  siteAddress: string;
  description: string | null;
  timeRows: {
    tech: string;
    date: string;
    in1: string;
    out1: string;
    in2: string;
    out2: string;
    totalHours: string;
  }[];
  totalLaborHours: number;
  materialRows: { item: string; qty: string; unitCost: number | null; cost: number }[];
  totalMaterialCost: number;
  currency: string;
  notes: string | null;
};

/** Transform a completed-job report into the billing-ticket row structures. Pivots
 *  each tech-day's clock segments into two In/Out pairs per row; >2 segments overflow
 *  onto continuation rows (tech/date/total blank), with the day total on the first. */
export function jobBillingRows(report: BillingReport): BillingRows {
  const timeRows: BillingRows["timeRows"] = [];
  for (const w of report.time.workers) {
    for (const d of w.days) {
      const segs = d.segments;
      if (segs.length === 0) continue;
      const rowCount = Math.ceil(segs.length / 2);
      for (let row = 0; row < rowCount; row++) {
        const a = segs[row * 2];
        const b = segs[row * 2 + 1];
        timeRows.push({
          tech: row === 0 ? w.label : "",
          date: row === 0 ? (fmtDate(d.date) ?? d.date) : "",
          in1: fmtTimeOfDay(a.in),
          out1: fmtTimeOfDay(a.out),
          in2: b ? fmtTimeOfDay(b.in) : "",
          out2: b ? fmtTimeOfDay(b.out) : "",
          totalHours: row === 0 ? d.total.toFixed(2) : "",
        });
      }
    }
  }

  const materialRows = report.materials.lines.map((l) => ({
    item: l.item,
    qty: l.qty,
    unitCost: l.unitCost != null ? Number(l.unitCost) : null,
    cost: l.extended,
  }));

  return {
    customer: { name: report.customer.name, phone: report.customer.phone, email: report.customer.email },
    siteAddress: report.job.siteAddress,
    description: report.job.description,
    timeRows,
    totalLaborHours: report.time.grandTotalHours,
    materialRows,
    totalMaterialCost: report.materials.subtotal,
    currency: report.materials.currency,
    notes: report.job.notes,
  };
}
