import type { NextRequest } from "next/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getJobReport } from "@/lib/data/tb-report";
import { jobBillingRows, buildBillingWorkbook } from "@/lib/export/billing-ticket";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireTbAdmin();
  const { id } = await params;

  const report = await getJobReport(id);
  if (!report) return new Response("Job not found", { status: 404 });

  const workbook = buildBillingWorkbook(jobBillingRows(report));
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = report.job.name.replace(/[^A-Za-z0-9._-]+/g, "_") || "job";

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${safeName}-billing.xlsx"`,
    },
  });
}
