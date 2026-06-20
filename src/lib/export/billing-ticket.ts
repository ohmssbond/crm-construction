import ExcelJS from "exceljs";
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
  workNotes: { dateLabel: string; body: string }[];
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
  workNotes: { dateLabel: string; body: string }[];
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
    workNotes: report.workNotes.map((n) => ({ dateLabel: n.dateLabel, body: n.body })),
  };
}

/** Render the prepared billing rows into an exceljs workbook (one "Billing" sheet).
 *  Pure formatting — no business logic. */
/** Estimate a wrapped row's height (points) for `text` in a merged cell `widthChars`
 *  wide. Excel does not auto-fit row height for merged cells, so we size it ourselves:
 *  count wrapped lines (honoring explicit newlines) at ~15pt each. */
export function estimateWrapHeight(text: string, widthChars: number): number {
  const w = Math.max(1, widthChars);
  const lines = (text || "").split("\n").reduce((sum, ln) => sum + Math.max(1, Math.ceil(ln.length / w)), 0);
  return Math.max(1, lines) * 15;
}

export function buildBillingWorkbook(rows: BillingRows): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Billing");
  ws.columns = [{ width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];

  const section = (title: string) => {
    const r = ws.addRow([title]);
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  };

  // Customer
  section("Customer");
  ws.addRow(["Name", rows.customer.name, "", "Phone", rows.customer.phone ?? ""]);
  ws.addRow(["Email", rows.customer.email ?? "", "", "Site address", rows.siteAddress || ""]);
  // Description: label in col A; value merged across B:G and wrapped.
  const descRow = ws.addRow(["Description of work", rows.description ?? ""]);
  ws.mergeCells(`B${descRow.number}:G${descRow.number}`);
  descRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
  descRow.height = estimateWrapHeight(rows.description ?? "", 74); // B:G ≈ 74 chars
  ws.addRow([]);

  // Time On Site
  section("Time On Site");
  const th = ws.addRow(["Tech", "Date", "In", "Out", "In", "Out", "Total Hours"]);
  th.font = { bold: true };
  for (const t of rows.timeRows) {
    ws.addRow([t.tech, t.date, t.in1, t.out1, t.in2, t.out2, t.totalHours]);
  }
  const tl = ws.addRow(["", "", "", "", "", "Total Labor", `${rows.totalLaborHours.toFixed(2)} h`]);
  tl.font = { bold: true };
  ws.addRow([]);

  // Materials
  section("Materials");
  const mh = ws.addRow(["Item", "Quantity", `Unit Cost (${rows.currency})`, `Cost (${rows.currency})`]);
  mh.font = { bold: true };
  for (const m of rows.materialRows) {
    const r = ws.addRow([m.item, m.qty, m.unitCost ?? "", m.cost]);
    r.getCell(3).numFmt = "#,##0.00";
    r.getCell(4).numFmt = "#,##0.00";
  }
  const mt = ws.addRow(["", "", "Total Material Cost", rows.totalMaterialCost]);
  mt.font = { bold: true };
  mt.getCell(4).numFmt = "#,##0.00";
  ws.addRow([]);

  // Notes of the Work Completed: admin notes (if any), then worker notes — each a row
  // merged A:G and wrapped, so all note lines share one consistent width.
  section("Notes of the Work Completed");
  const noteLines: string[] = [];
  if (rows.notes) noteLines.push(rows.notes);
  for (const n of rows.workNotes) noteLines.push(`${n.dateLabel} — ${n.body}`);
  for (const line of noteLines) {
    const r = ws.addRow([line]);
    ws.mergeCells(`A${r.number}:G${r.number}`);
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    r.height = estimateWrapHeight(line, 92); // A:G ≈ 92 chars
  }

  return wb;
}
